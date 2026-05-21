/**
 * Author: Kris Sherbondy
 * Date: 2026-05-21
 * Purpose:
 *   Benchmark the RelayDB search/debugSearch prototype with result consumption.
 *
 *   This benchmark measures:
 *     1. db.search(question)
 *     2. db.search(question, { explain: true })
 *     3. db.search(question, { limit: 10, explain: true })
 *     4. db.debugSearch(question)
 *
 *   A blackhole checksum is used so V8 cannot easily ignore returned results.
 *
 * Usage:
 *   node scripts/relay-search/benchmark-search.js
 *
 * Optional:
 *   node scripts/relay-search/benchmark-search.js 10000 100000
 *
 *   arg1 = warmup iterations
 *   arg2 = measured iterations
 */

const path = require("path");
const { performance } = require("perf_hooks");
const RelayDB = require("./relay-db");

const DEFAULT_WARMUP_ITERATIONS = 10_000;
const DEFAULT_MEASURED_ITERATIONS = 100_000;

async function main() {
  const warmupIterations = Number(process.argv[2]) || DEFAULT_WARMUP_ITERATIONS;
  const measuredIterations =
    Number(process.argv[3]) || DEFAULT_MEASURED_ITERATIONS;

  const datasetArg = process.argv[4];

const filePath = datasetArg
  ? path.resolve(process.cwd(), datasetArg)
  : path.join(
      process.cwd(),
      "datasets",
      "merged",
      "people-companies.4tag.merged.jsonl",
    );

  const db = await RelayDB.open(filePath);

  const question = "active agriculture people under 40";

  console.log("");
  console.log("RelayDB Search Prototype Benchmark");
  console.log("==================================");
  console.log(`Dataset: ${filePath}`);
  console.log(`Question: ${question}`);
  console.log(`Warmup iterations: ${warmupIterations}`);
  console.log(`Measured iterations: ${measuredIterations}`);

  console.log("");
  console.log("Correctness check:");
  console.dir(db.search(question, { explain: true }), { depth: null });

  console.log("");
  console.log("Warmup");
  console.log("======");

  warmup("db.search(question)", warmupIterations, () => {
    return db.search(question);
  });

  warmup("db.search(question, { explain: true })", warmupIterations, () => {
    return db.search(question, { explain: true });
  });

  warmup(
    "db.search(question, { limit: 10, explain: true })",
    warmupIterations,
    () => {
      return db.search(question, { limit: 10, explain: true });
    },
  );

  warmup("db.debugSearch(question)", warmupIterations, () => {
    return db.debugSearch(question);
  });

  const results = [];

  results.push(
    benchmark("db.search(question)", measuredIterations, () => {
      return db.search(question);
    }),
  );

  results.push(
    benchmark(
      "db.search(question, { explain: true })",
      measuredIterations,
      () => {
        return db.search(question, { explain: true });
      },
    ),
  );

  results.push(
    benchmark(
      "db.search(question, { limit: 10, explain: true })",
      measuredIterations,
      () => {
        return db.search(question, { limit: 10, explain: true });
      },
    ),
  );

  results.push(
    benchmark("db.debugSearch(question)", measuredIterations, () => {
      return db.debugSearch(question);
    }),
  );

  console.log("");
  console.log("Benchmark Results");
  console.log("=================");
  printResults(results);

  console.log("");
}

function warmup(label, iterations, callback) {
  let blackhole = 0;

  for (let index = 0; index < iterations; index += 1) {
    blackhole += consume(callback());
  }

  console.log(`${label} | blackhole: ${blackhole}`);
}

function benchmark(label, iterations, callback) {
  let blackhole = 0;

  const started = performance.now();

  for (let index = 0; index < iterations; index += 1) {
    blackhole += consume(callback());
  }

  const ended = performance.now();

  const totalMs = ended - started;
  const avgMs = totalMs / iterations;
  const opsPerSecond = avgMs === 0 ? 0 : 1000 / avgMs;

  return {
    label,
    iterations,
    totalMs,
    avgMs,
    opsPerSecond,
    blackhole,
  };
}

function consume(result) {
  if (!result) return 0;

  let value = 0;

  if (typeof result.answer === "string") {
    value += result.answer.length;
  }

  if (result.data?.person?.name) {
    value += result.data.person.name.length;
  }

  if (typeof result.data?.person?.age === "number") {
    value += result.data.person.age;
  }

  if (result.data?.person?.status) {
    value += result.data.person.status.length;
  }

  if (typeof result.data?.person?.salary === "number") {
    value += result.data.person.salary;
  }

  if (result.data?.person?.location?.city) {
    value += result.data.person.location.city.length;
  }

  if (result.data?.person?.location?.state) {
    value += result.data.person.location.state.length;
  }

  if (result.data?.company?.name) {
    value += result.data.company.name.length;
  }

  if (result.data?.company?.industry) {
    value += result.data.company.industry.length;
  }

  if (typeof result.data?.company?.founded === "number") {
    value += result.data.company.founded;
  }

  if (result.data?.company?.headquarters?.city) {
    value += result.data.company.headquarters.city.length;
  }

  if (result.data?.company?.headquarters?.state) {
    value += result.data.company.headquarters.state.length;
  }

  if (Array.isArray(result.results)) {
    value += result.results.length;

    for (const item of result.results) {
      value += consume(item);
    }
  }

  if (result.explanation?.indexesUsed) {
    value += result.explanation.indexesUsed.length;
  }

  if (result.explanation?.candidateCounts) {
    value += result.explanation.candidateCounts.topicMatches || 0;
    value += result.explanation.candidateCounts.statusMatches || 0;
    value += result.explanation.candidateCounts.ageMatches || 0;
    value += result.explanation.candidateCounts.industryMatches || 0;
    value += result.explanation.candidateCounts.finalMatches || 0;
  }

  return value;
}

function printResults(results) {
  const labelWidth = Math.max(...results.map((result) => result.label.length));

  for (const result of results) {
    console.log(
      `${result.label.padEnd(labelWidth)} | ` +
        `total: ${formatNumber(result.totalMs)} ms | ` +
        `avg: ${formatNumber(result.avgMs)} ms | ` +
        `ops/sec: ${formatNumber(result.opsPerSecond)} | ` +
        `blackhole: ${result.blackhole}`,
    );
  }
}

function formatNumber(value) {
  return Number(value).toLocaleString("en-US", {
    minimumFractionDigits: 6,
    maximumFractionDigits: 6,
  });
}

main().catch((error) => {
  console.error("RelayDB search benchmark failed.");
  console.error(error);
  process.exit(1);
});