/**
 * Author: Kris Sherbondy
 * Date: 2026-05-22
 * Purpose:
 *   Benchmark a more optimized normalized JavaScript graph.
 *
 *   This is a fairer JS baseline than repeated raw JSONL scanning and
 *   stronger than the first normalized graph benchmark.
 *
 *   Improvements:
 *     1. Parse source JSONL once.
 *     2. Store companies by numeric ID.
 *     3. Convert person.companyAnchor -> person.companyId at load time.
 *     4. Convert company.industry -> numeric industryId.
 *     5. Avoid Map lookups inside the hot query loop.
 *     6. Avoid nested result hydration until after matching.
 *
 *   Query:
 *     active agriculture people under 40
 */

const fs = require("fs");
const path = require("path");
const { performance } = require("perf_hooks");

const STATUS_UNKNOWN = 0;
const STATUS_ACTIVE = 1;
const STATUS_INACTIVE = 2;
const STATUS_PENDING = 3;

const INDUSTRY_UNKNOWN = 0;

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

  console.log("Normalized JS Graph v2 Benchmark");
  console.log("================================");
  console.log(`Dataset: ${filePath}`);
  console.log(`Question: ${question}`);
  console.log(`Warmup iterations: ${warmupIterations}`);
  console.log(`Measured iterations: ${measuredIterations}`);
  console.log("");

  forceGcIfAvailable();

  const beforeLoadMemory = process.memoryUsage();
  const loadStart = performance.now();

  const graph = loadNormalizedGraphV2(filePath);

  const loadEnd = performance.now();
  const afterLoadMemory = process.memoryUsage();

  console.log("Load / Normalize");
  console.log("----------------");
  console.log(`Load time: ${formatMs(loadEnd - loadStart)}`);
  console.log(`Bytes:     ${graph.bytes.toLocaleString()}`);
  console.log(`Lines:     ${graph.lineCount.toLocaleString()}`);
  console.log(`People:    ${graph.people.length.toLocaleString()}`);
  console.log(`Companies: ${graph.companyIndustries.length.toLocaleString()}`);
  console.log("");

  console.log("Memory Delta During Load");
  console.log("------------------------");
  printMemoryDelta(getMemoryDelta(beforeLoadMemory, afterLoadMemory));
  console.log("");

  const correctness = queryNormalizedGraphV2(graph);

  console.log("Correctness");
  console.log("-----------");
  console.log(`Answer:   ${correctness.answer}`);
  console.log(`Company:  ${correctness.data?.company?.name || null}`);
  console.log(`Industry: ${correctness.data?.company?.industry || null}`);
  console.log("");

  console.log("Candidate Counts");
  console.log("----------------");
  console.log(correctness.candidateCounts);
  console.log("");

  console.log("Warmup");
  console.log("------");
  warmup("normalizedGraphV2", warmupIterations, () =>
    queryNormalizedGraphV2(graph),
  );
  console.log("");

  console.log("Benchmark");
  console.log("---------");
  benchmark("normalizedGraphV2", measuredIterations, () =>
    queryNormalizedGraphV2(graph),
  );
}

function loadNormalizedGraphV2(inputPath) {
  const text = fs.readFileSync(inputPath, "utf8");
  const lines = text.split(/\r?\n/).filter(Boolean);

  const companyAnchorToId = new Map();
  const companyIndustries = [];
  const companies = [];

  const peoplePendingCompanyAnchor = [];
  const people = [];

  const industryToId = new Map();
  const idToIndustry = ["unknown"];

  function getIndustryId(industry) {
    if (!industry) return INDUSTRY_UNKNOWN;

    let id = industryToId.get(industry);

    if (id !== undefined) {
      return id;
    }

    id = idToIndustry.length;
    industryToId.set(industry, id);
    idToIndustry.push(industry);

    return id;
  }

  for (const line of lines) {
    const node = JSON.parse(line);
    const topic = node["^"];

    if (topic === "company") {
      const companyId = companies.length;
      const industry = node["~industry"] || null;
      const industryId = getIndustryId(industry);

      companyAnchorToId.set(node["#"], companyId);

      companyIndustries.push(industryId);

      companies.push({
        anchor: node["#"],
        name: node["~name"] || null,
        industry,
        founded: toNumberOrNull(node["~founded"]),
        city: node["~city"] || null,
        state: node["~state"] || null,
        country: node["~country"] || null,
      });

      continue;
    }

    if (topic === "person") {
      const personId = people.length;

      people.push({
        anchor: node["#"],
        name: getPersonDisplayName(node),
        age: Number(node["~age"]),
        statusId: getStatusId(node["~status"]),
        salary: toNumberOrNull(node["~salary"]),
        companyId: -1,
        city: node["~city"] || null,
        state: node["~state"] || null,
        country: node["~country"] || null,
      });

      peoplePendingCompanyAnchor[personId] = node["@company"] || null;
    }
  }

  for (let index = 0; index < people.length; index += 1) {
    const companyAnchor = peoplePendingCompanyAnchor[index];
    const companyId = companyAnchorToId.get(companyAnchor);

    people[index].companyId = companyId === undefined ? -1 : companyId;
  }

  return {
    bytes: Buffer.byteLength(text),
    lineCount: lines.length,
    people,
    companies,
    companyIndustries,
    industryToId,
    idToIndustry,
  };
}

function queryNormalizedGraphV2(graph) {
  const agricultureIndustryId = graph.industryToId.get("Agriculture");

  const candidateCounts = {
    topicMatches: 0,
    statusMatches: 0,
    ageMatches: 0,
    industryMatches: 0,
    finalMatches: 0,
  };

  let firstMatchPersonId = -1;

  const people = graph.people;
  const companyIndustries = graph.companyIndustries;

  for (let index = 0; index < people.length; index += 1) {
    const person = people[index];

    candidateCounts.topicMatches += 1;

    if (person.statusId !== STATUS_ACTIVE) {
      continue;
    }

    candidateCounts.statusMatches += 1;

    if (!(person.age < 40)) {
      continue;
    }

    candidateCounts.ageMatches += 1;

    const companyId = person.companyId;

    if (companyId < 0 || companyIndustries[companyId] !== agricultureIndustryId) {
      continue;
    }

    candidateCounts.industryMatches += 1;
    candidateCounts.finalMatches += 1;

    if (firstMatchPersonId < 0) {
      firstMatchPersonId = index;
    }
  }

  if (firstMatchPersonId < 0) {
    return {
      answer: null,
      data: null,
      candidateCounts,
    };
  }

  const person = people[firstMatchPersonId];
  const company = graph.companies[person.companyId];

  return {
    answer: person.name || person.anchor,
    data: {
      person: {
        anchor: person.anchor,
        name: person.name,
        age: person.age,
        status: statusNameFromId(person.statusId),
        salary: person.salary,
        location: {
          city: person.city,
          state: person.state,
          country: person.country,
        },
      },
      company: {
        anchor: company.anchor,
        name: company.name,
        industry: company.industry,
        founded: company.founded,
        headquarters: {
          city: company.city,
          state: company.state,
          country: company.country,
        },
      },
    },
    candidateCounts,
  };
}

function getStatusId(status) {
  if (status === "active") return STATUS_ACTIVE;
  if (status === "inactive") return STATUS_INACTIVE;
  if (status === "pending") return STATUS_PENDING;

  return STATUS_UNKNOWN;
}

function statusNameFromId(statusId) {
  if (statusId === STATUS_ACTIVE) return "active";
  if (statusId === STATUS_INACTIVE) return "inactive";
  if (statusId === STATUS_PENDING) return "pending";

  return "unknown";
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
