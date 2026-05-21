/**
 * Author: Kris Sherbondy
 * Date: 2026-05-21
 * Purpose:
 *   Benchmark the compact typed-array RelayDB offset reader.
 */

const path = require("path");
const { performance } = require("perf_hooks");

const RelayOffsetCompactDB = require("./relay-offset-compact-db");

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
      "people-companies.1000x10000.4tag.merged.jsonl",
    );

const question = "active agriculture people under 40";

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  console.log("RelayDB Compact Offset Search Prototype Benchmark");
  console.log("=================================================");
  console.log(`Dataset: ${filePath}`);
  console.log(`Question: ${question}`);
  console.log(`Warmup iterations: ${warmupIterations}`);
  console.log(`Measured iterations: ${measuredIterations}`);
  console.log("");

  const beforeOpenMemory = process.memoryUsage();
  const openStart = performance.now();
  const db = await RelayOffsetCompactDB.open(filePath);
  const openEnd = performance.now();
  const afterOpenMemory = process.memoryUsage();

  console.log("Open Stats");
  console.log("==========");
  console.log(`Open time: ${(openEnd - openStart).toFixed(6)} ms`);
  console.log(`Reader openMs: ${db.stats.openMs.toFixed(6)} ms`);
  console.log(`Bytes: ${db.stats.bytes.toLocaleString()}`);
  console.log(`Lines: ${db.stats.lineCount.toLocaleString()}`);
  console.log(`Nodes: ${db.stats.nodeCount.toLocaleString()}`);
  console.log(`Anchors: ${db.stats.anchorCount.toLocaleString()}`);
  console.log(`People: ${db.stats.personCount.toLocaleString()}`);
  console.log(`Companies: ${db.stats.companyCount.toLocaleString()}`);
  console.log(`Industries: ${db.stats.industryCount.toLocaleString()}`);
  console.log(`Layout: ${db.stats.layout}`);
  console.log("Topics:");
  console.log(db.stats.topicCounts);
  console.log("");

  console.log("Memory Delta During Open");
  console.log("========================");
  printMemoryDelta(beforeOpenMemory, afterOpenMemory);
  console.log("");

  console.log("Correctness check:");
  console.dir(db.search(question, { explain: true }), {
    depth: 10,
  });
  console.log("");

  console.log("Debug check:");
  console.dir(db.debugSearch(question), {
    depth: 10,
  });
  console.log("");

  console.log("Warmup");
  console.log("======");
  warmup("db.search(question)", warmupIterations, () => db.search(question));
  warmup("db.search(question, { explain: true })", warmupIterations, () =>
    db.search(question, { explain: true }),
  );
  warmup(
    "db.search(question, { limit: 10, explain: true })",
    warmupIterations,
    () => db.search(question, { limit: 10, explain: true }),
  );
  warmup("db.debugSearch(question)", warmupIterations, () =>
    db.debugSearch(question),
  );
  console.log("");

  console.log("Benchmark Results");
  console.log("=================");
  benchmark("db.search(question)", measuredIterations, () =>
    db.search(question),
  );
  benchmark("db.search(question, { explain: true })", measuredIterations, () =>
    db.search(question, { explain: true }),
  );
  benchmark(
    "db.search(question, { limit: 10, explain: true })",
    measuredIterations,
    () => db.search(question, { limit: 10, explain: true }),
  );
  benchmark("db.debugSearch(question)", measuredIterations, () =>
    db.debugSearch(question),
  );
}

function warmup(label, iterations, fn) {
  let blackhole = 0;

  for (let index = 0; index < iterations; index += 1) {
    blackhole += consume(fn());
  }

  console.log(`${label} | blackhole: ${blackhole}`);
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
    `${label.padEnd(47)} | total: ${totalMs.toFixed(6)} ms | avg: ${avgMs.toFixed(
      6,
    )} ms | ops/sec: ${opsPerSecond.toFixed(6)} | blackhole: ${blackhole}`,
  );
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

function printMemoryDelta(before, after) {
  const keys = ["rss", "heapTotal", "heapUsed", "external", "arrayBuffers"];

  for (const key of keys) {
    const beforeValue = before[key] || 0;
    const afterValue = after[key] || 0;
    const delta = afterValue - beforeValue;

    console.log(
      `${key.padEnd(13)} ${formatBytes(beforeValue).padStart(
        12,
      )} -> ${formatBytes(afterValue).padStart(12)} | delta ${formatBytes(
        delta,
      ).padStart(12)}`,
    );
  }
}

function formatBytes(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const kb = bytes / 1024;

  if (kb < 1024) {
    return `${kb.toFixed(2)} KB`;
  }

  const mb = kb / 1024;

  return `${mb.toFixed(2)} MB`;
}