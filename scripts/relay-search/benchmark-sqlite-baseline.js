/**
 * Author: Kris Sherbondy
 * Date: 2026-05-22
 * Purpose:
 *   Benchmark SQLite against the same relationship-aware query used by
 *   RelayDB reader benchmarks.
 *
 *   Tests:
 *     1. SQLite unindexed query
 *     2. SQLite indexed query
 *
 *   Query:
 *     active agriculture people under 40
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const { performance } = require("perf_hooks");
const Database = require("better-sqlite3");

const warmupIterations = Number(process.argv[2] || 1000);
const measuredIterations = Number(process.argv[3] || 10000);
const datasetArg = process.argv[4];

const filePath = datasetArg
  ? path.resolve(process.cwd(), datasetArg)
  : path.join(
      process.cwd(),
      "datasets",
      "generated",
      "merged",
      "people-companies.10000x100000.4tag.merged.jsonl",
    );

const question = "active agriculture people under 40";

main();

function main() {
  if (!fs.existsSync(filePath)) {
    console.error(`Missing file: ${filePath}`);
    process.exit(1);
  }

  console.log("SQLite Baseline Benchmark");
  console.log("=========================");
  console.log(`Dataset: ${filePath}`);
  console.log(`Question: ${question}`);
  console.log(`Warmup iterations: ${warmupIterations}`);
  console.log(`Measured iterations: ${measuredIterations}`);
  console.log("");

  const dbPath = path.join(
    os.tmpdir(),
    `relaydb-sqlite-baseline-${Date.now()}.sqlite`,
  );

  forceGcIfAvailable();

  const beforeBuildMemory = process.memoryUsage();
  const buildStart = performance.now();

  const db = new Database(dbPath);
  db.pragma("journal_mode = OFF");
  db.pragma("synchronous = OFF");
  db.pragma("temp_store = MEMORY");
  db.pragma("cache_size = -200000");

  buildSchema(db);
  loadSqlite(db, filePath);

  const buildEnd = performance.now();
  const afterBuildMemory = process.memoryUsage();

  console.log("Build / Import");
  console.log("--------------");
  console.log(`SQLite file: ${dbPath}`);
  console.log(`Build time:  ${formatMs(buildEnd - buildStart)}`);
  console.log("");

  console.log("Memory Delta During Build");
  console.log("-------------------------");
  printMemoryDelta(getMemoryDelta(beforeBuildMemory, afterBuildMemory));
  console.log("");

  console.log("Counts");
  console.log("------");
  console.log(`People:    ${db.prepare("SELECT COUNT(*) AS count FROM people").get().count.toLocaleString()}`);
  console.log(`Companies: ${db.prepare("SELECT COUNT(*) AS count FROM companies").get().count.toLocaleString()}`);
  console.log("");

  runPhase({
    label: "SQLite unindexed",
    db,
    createIndexes: false,
  });

  console.log("");

  const indexStart = performance.now();
  createIndexes(db);
  const indexEnd = performance.now();

  console.log("Index Build");
  console.log("-----------");
  console.log(`Index time: ${formatMs(indexEnd - indexStart)}`);
  console.log("");

  runPhase({
    label: "SQLite indexed",
    db,
    createIndexes: true,
  });

  db.close();

  try {
    fs.unlinkSync(dbPath);
  } catch {
    // ignore cleanup failure
  }
}

function buildSchema(db) {
  db.exec(`
    DROP TABLE IF EXISTS people;
    DROP TABLE IF EXISTS companies;

    CREATE TABLE companies (
      anchor TEXT PRIMARY KEY,
      name TEXT,
      industry TEXT,
      founded INTEGER,
      city TEXT,
      state TEXT,
      country TEXT
    );

    CREATE TABLE people (
      anchor TEXT PRIMARY KEY,
      name TEXT,
      age INTEGER,
      status TEXT,
      salary INTEGER,
      company_anchor TEXT,
      city TEXT,
      state TEXT,
      country TEXT
    );
  `);
}

function loadSqlite(db, inputPath) {
  const text = fs.readFileSync(inputPath, "utf8");
  const lines = text.split(/\r?\n/).filter(Boolean);

  const insertCompany = db.prepare(`
    INSERT INTO companies (
      anchor,
      name,
      industry,
      founded,
      city,
      state,
      country
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const insertPerson = db.prepare(`
    INSERT INTO people (
      anchor,
      name,
      age,
      status,
      salary,
      company_anchor,
      city,
      state,
      country
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMany = db.transaction(() => {
    for (const line of lines) {
      const node = JSON.parse(line);
      const topic = node["^"];

      if (topic === "company") {
        insertCompany.run(
          node["#"],
          node["~name"] || null,
          node["~industry"] || null,
          toNumberOrNull(node["~founded"]),
          node["~city"] || null,
          node["~state"] || null,
          node["~country"] || null,
        );

        continue;
      }

      if (topic === "person") {
        insertPerson.run(
          node["#"],
          getPersonDisplayName(node),
          toNumberOrNull(node["~age"]),
          node["~status"] || null,
          toNumberOrNull(node["~salary"]),
          node["@company"] || null,
          node["~city"] || null,
          node["~state"] || null,
          node["~country"] || null,
        );
      }
    }
  });

  insertMany();
}

function createIndexes(db) {
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_people_status_age_company
      ON people(status, age, company_anchor);

    CREATE INDEX IF NOT EXISTS idx_companies_industry_anchor
      ON companies(industry, anchor);
  `);
}

function runPhase({ label, db }) {
  console.log(label);
  console.log("=".repeat(label.length));
  console.log("");

  const sql = `
    SELECT
      p.anchor AS person_anchor,
      p.name AS person_name,
      p.age AS person_age,
      p.status AS person_status,
      p.salary AS person_salary,
      p.city AS person_city,
      p.state AS person_state,
      p.country AS person_country,
      c.anchor AS company_anchor,
      c.name AS company_name,
      c.industry AS company_industry,
      c.founded AS company_founded,
      c.city AS company_city,
      c.state AS company_state,
      c.country AS company_country
    FROM people p
    JOIN companies c
      ON p.company_anchor = c.anchor
    WHERE p.status = ?
      AND p.age < ?
      AND c.industry = ?
    LIMIT 1
  `;

  const countSql = `
    SELECT
      (SELECT COUNT(*) FROM people) AS topicMatches,
      (SELECT COUNT(*) FROM people WHERE status = ?) AS statusMatches,
      (SELECT COUNT(*) FROM people WHERE status = ? AND age < ?) AS ageMatches,
      (
        SELECT COUNT(*)
        FROM people p
        JOIN companies c
          ON p.company_anchor = c.anchor
        WHERE p.status = ?
          AND p.age < ?
          AND c.industry = ?
      ) AS finalMatches
  `;

  const statement = db.prepare(sql);
  const countStatement = db.prepare(countSql);

  const correctnessRow = statement.get("active", 40, "Agriculture");
  const counts = countStatement.get(
    "active",
    "active",
    40,
    "active",
    40,
    "Agriculture",
  );

  const result = hydrateSqliteResult(correctnessRow, counts);

  console.log("Correctness");
  console.log("-----------");
  console.log(`Answer:   ${result.answer}`);
  console.log(`Company:  ${result.data?.company?.name || null}`);
  console.log(`Industry: ${result.data?.company?.industry || null}`);
  console.log("");

  console.log("Candidate Counts");
  console.log("----------------");
  console.log(result.candidateCounts);
  console.log("");

  console.log("Warmup");
  console.log("------");
  warmup(label, warmupIterations, () => {
    const row = statement.get("active", 40, "Agriculture");
    return hydrateSqliteResult(row, counts);
  });
  console.log("");

  console.log("Benchmark");
  console.log("---------");
  benchmark(label, measuredIterations, () => {
    const row = statement.get("active", 40, "Agriculture");
    return hydrateSqliteResult(row, counts);
  });
}

function hydrateSqliteResult(row, counts) {
  if (!row) {
    return {
      answer: null,
      data: null,
      candidateCounts: {
        topicMatches: counts.topicMatches,
        statusMatches: counts.statusMatches,
        ageMatches: counts.ageMatches,
        industryMatches: counts.finalMatches,
        finalMatches: counts.finalMatches,
      },
    };
  }

  return {
    answer: row.person_name || row.person_anchor,
    data: {
      person: {
        anchor: row.person_anchor,
        name: row.person_name,
        age: row.person_age,
        status: row.person_status,
        salary: row.person_salary,
        location: {
          city: row.person_city,
          state: row.person_state,
          country: row.person_country,
        },
      },
      company: {
        anchor: row.company_anchor,
        name: row.company_name,
        industry: row.company_industry,
        founded: row.company_founded,
        headquarters: {
          city: row.company_city,
          state: row.company_state,
          country: row.company_country,
        },
      },
    },
    candidateCounts: {
      topicMatches: counts.topicMatches,
      statusMatches: counts.statusMatches,
      ageMatches: counts.ageMatches,
      industryMatches: counts.finalMatches,
      finalMatches: counts.finalMatches,
    },
  };
}

function getPersonDisplayName(node) {
  if (node["~fullName"]) return node["~fullName"];
  if (node["~name"]) return node["~name"];

  const firstName = node["~firstName"] || node["~first_name"] || node["~first"];
  const lastName = node["~lastName"] || node["~last_name"] || node["~last"];

  if (firstName && lastName) {
    return `${firstName} ${lastName}`;
  }

  if (firstName) return firstName;
  if (lastName) return lastName;

  return node["#"];
}

function toNumberOrNull(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number) ? number : null;
}

function warmup(label, iterations, fn) {
  let blackhole = 0;

  for (let index = 0; index < iterations; index += 1) {
    blackhole += consume(fn());
  }

  console.log(`${label.padEnd(20)} blackhole: ${blackhole}`);
}

function benchmark(label, iterations, fn) {
  let blackhole = 0;

  const start = performance.now();

  for (let index = 0; index < iterations; index += 1) {
    blackhole += consume(fn());
  }

  const end = performance.now();

  const totalMs = end - start;
  const avgMs = totalMs / iterations;
  const opsPerSecond = 1000 / avgMs;

  console.log(
    `${label.padEnd(20)} total: ${formatMs(totalMs)} | avg: ${formatMs(
      avgMs,
    )} | ops/sec: ${opsPerSecond.toFixed(3)} | blackhole: ${blackhole}`,
  );

  return {
    totalMs,
    avgMs,
    opsPerSecond,
    blackhole,
  };
}

function consume(value) {
  if (!value) return 0;

  if (Array.isArray(value)) {
    return value.length;
  }

  if (typeof value === "object") {
    return JSON.stringify(value).length;
  }

  return String(value).length;
}

function getMemoryDelta(before, after) {
  const keys = ["rss", "heapTotal", "heapUsed", "external", "arrayBuffers"];
  const delta = {};

  for (const key of keys) {
    const beforeValue = before[key] || 0;
    const afterValue = after[key] || 0;

    delta[key] = {
      before: beforeValue,
      after: afterValue,
      delta: afterValue - beforeValue,
    };
  }

  return delta;
}

function printMemoryDelta(memoryDelta) {
  for (const [key, values] of Object.entries(memoryDelta)) {
    console.log(
      `${key.padEnd(13)} ${formatBytes(values.before).padStart(
        12,
      )} -> ${formatBytes(values.after).padStart(12)} | delta ${formatBytes(
        values.delta,
      ).padStart(12)}`,
    );
  }
}

function formatBytes(bytes) {
  const sign = bytes < 0 ? "-" : "";
  const absolute = Math.abs(bytes);

  if (absolute < 1024) {
    return `${sign}${absolute} B`;
  }

  const kb = absolute / 1024;

  if (kb < 1024) {
    return `${sign}${kb.toFixed(2)} KB`;
  }

  const mb = kb / 1024;

  return `${sign}${mb.toFixed(2)} MB`;
}

function formatMs(ms) {
  return `${ms.toFixed(6)} ms`;
}

function forceGcIfAvailable() {
  if (typeof global.gc === "function") {
    global.gc();
  }
}