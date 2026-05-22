/**
 * Author: Kris Sherbondy
 * Date: 2026-05-22
 * Purpose:
 *   Compare RelayDB offset reader strategies under the same benchmark conditions.
 *
 *   Compares:
 *     1. Object-row offset reader
 *     2. Compact typed-array offset reader
 *
 *   This gives us one clean report for memory, open time, correctness,
 *   cached search speed, and honest debugSearch speed.
 */

const path = require("path");
const { performance } = require("perf_hooks");

const RelayOffsetDB = require("./relay-offset-db");
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
  console.log("RelayDB Offset Reader Comparison");
  console.log("================================");
  console.log(`Dataset: ${filePath}`);
  console.log(`Question: ${question}`);
  console.log(`Warmup iterations: ${warmupIterations}`);
  console.log(`Measured iterations: ${measuredIterations}`);
  console.log("");

  const objectRowReport = await runReaderBenchmark({
    label: "object-row offset reader",
    ReaderClass: RelayOffsetDB,
  });

  forceGcIfAvailable();

  const compactReport = await runReaderBenchmark({
    label: "compact typed-array offset reader",
    ReaderClass: RelayOffsetCompactDB,
  });

  printSummaryTable([objectRowReport, compactReport]);
}

async function runReaderBenchmark({ label, ReaderClass }) {
  console.log("");
  console.log(label.toUpperCase());
  console.log("=".repeat(label.length));
  console.log("");

  forceGcIfAvailable();

  const beforeOpenMemory = process.memoryUsage();
  const openStart = performance.now();
  const db = await ReaderClass.open(filePath);
  const openEnd = performance.now();
  const afterOpenMemory = process.memoryUsage();

  const openMs = openEnd - openStart;
  const memoryDelta = getMemoryDelta(beforeOpenMemory, afterOpenMemory);

  console.log("Open Stats");
  console.log("----------");
  console.log(`Open time: ${openMs.toFixed(6)} ms`);
  console.log(`Reader openMs: ${db.stats.openMs.toFixed(6)} ms`);
  console.log(`Bytes: ${db.stats.bytes.toLocaleString()}`);

  if (db.stats.lineCount !== undefined) {
    console.log(`Lines: ${db.stats.lineCount.toLocaleString()}`);
  }

  if (db.stats.nodeCount !== undefined) {
    console.log(`Nodes: ${db.stats.nodeCount.toLocaleString()}`);
  }

  if (db.stats.anchorCount !== undefined) {
    console.log(`Anchors: ${db.stats.anchorCount.toLocaleString()}`);
  }

  if (db.stats.personSearchRows !== undefined) {
    console.log(`Person search rows: ${db.stats.personSearchRows.toLocaleString()}`);
  }

  if (db.stats.personCount !== undefined) {
    console.log(`People: ${db.stats.personCount.toLocaleString()}`);
  }

  if (db.stats.companyCount !== undefined) {
    console.log(`Companies: ${db.stats.companyCount.toLocaleString()}`);
  }

  if (db.stats.layout !== undefined) {
    console.log(`Layout: ${db.stats.layout}`);
  }

  console.log("");

  console.log("Memory Delta During Open");
  console.log("------------------------");
  printMemoryDelta(memoryDelta);
  console.log("");

  const correctness = db.search(question, { explain: true });
  const debug = db.debugSearch(question);

  console.log("Correctness");
  console.log("-----------");
  console.log(`Answer: ${correctness.answer}`);

  if (correctness.data?.company?.name) {
    console.log(`Company: ${correctness.data.company.name}`);
  }

  if (correctness.data?.company?.industry) {
    console.log(`Industry: ${correctness.data.company.industry}`);
  }

  console.log("");

  console.log("Debug Candidate Counts");
  console.log("----------------------");
  console.log(debug.explanation.candidateCounts);
  console.log("");

  console.log("Warmup");
  console.log("------");
  warmup("search", warmupIterations, () => db.search(question));
  warmup("search explain", warmupIterations, () =>
    db.search(question, { explain: true }),
  );
  warmup("search limit 10 explain", warmupIterations, () =>
    db.search(question, { limit: 10, explain: true }),
  );
  warmup("debugSearch", warmupIterations, () => db.debugSearch(question));
  console.log("");

  console.log("Benchmark");
  console.log("---------");
  const searchBench = benchmark("search", measuredIterations, () =>
    db.search(question),
  );
  const searchExplainBench = benchmark("search explain", measuredIterations, () =>
    db.search(question, { explain: true }),
  );
  const searchLimit10ExplainBench = benchmark(
    "search limit 10 explain",
    measuredIterations,
    () => db.search(question, { limit: 10, explain: true }),
  );
  const debugBench = benchmark("debugSearch", measuredIterations, () =>
    db.debugSearch(question),
  );

  return {
    label,
    openMs,
    readerOpenMs: db.stats.openMs,
    memoryDelta,
    answer: correctness.answer,
    company: correctness.data?.company?.name || null,
    industry: correctness.data?.company?.industry || null,
    candidateCounts: debug.explanation.candidateCounts,
    searchAvgMs: searchBench.avgMs,
    searchExplainAvgMs: searchExplainBench.avgMs,
    searchLimit10ExplainAvgMs: searchLimit10ExplainBench.avgMs,
    debugSearchAvgMs: debugBench.avgMs,
    searchOps: searchBench.opsPerSecond,
    debugOps: debugBench.opsPerSecond,
  };
}

function warmup(label, iterations, fn) {
  let blackhole = 0;

  for (let index = 0; index < iterations; index += 1) {
    blackhole += consume(fn());
  }

  console.log(`${label.padEnd(24)} blackhole: ${blackhole}`);
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
    `${label.padEnd(24)} total: ${totalMs.toFixed(6)} ms | avg: ${avgMs.toFixed(
      6,
    )} ms | ops/sec: ${opsPerSecond.toFixed(3)} | blackhole: ${blackhole}`,
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

function printSummaryTable(reports) {
  console.log("");
  console.log("SUMMARY");
  console.log("=======");
  console.log("");

  const rows = reports.map((report) => ({
    reader: report.label,
    openMs: report.openMs,
    rssDelta: report.memoryDelta.rss.delta,
    heapUsedDelta: report.memoryDelta.heapUsed.delta,
    arrayBuffersDelta: report.memoryDelta.arrayBuffers.delta,
    searchAvgMs: report.searchAvgMs,
    explainAvgMs: report.searchExplainAvgMs,
    limit10ExplainAvgMs: report.searchLimit10ExplainAvgMs,
    debugAvgMs: report.debugSearchAvgMs,
    debugOps: report.debugOps,
  }));

  for (const row of rows) {
    console.log(row.reader);
    console.log("-".repeat(row.reader.length));
    console.log(`openMs:                ${row.openMs.toFixed(6)} ms`);
    console.log(`rss delta:             ${formatBytes(row.rssDelta)}`);
    console.log(`heapUsed delta:        ${formatBytes(row.heapUsedDelta)}`);
    console.log(`arrayBuffers delta:    ${formatBytes(row.arrayBuffersDelta)}`);
    console.log(`search avg:            ${row.searchAvgMs.toFixed(6)} ms`);
    console.log(`search explain avg:    ${row.explainAvgMs.toFixed(6)} ms`);
    console.log(
      `limit 10 explain avg:  ${row.limit10ExplainAvgMs.toFixed(6)} ms`,
    );
    console.log(`debugSearch avg:       ${row.debugAvgMs.toFixed(6)} ms`);
    console.log(`debugSearch ops/sec:   ${row.debugOps.toFixed(3)}`);
    console.log("");
  }

  if (rows.length === 2) {
    const [first, second] = rows;

    console.log("Comparison");
    console.log("----------");
    console.log(
      `heapUsed reduction:     ${formatBytes(
        first.heapUsedDelta - second.heapUsedDelta,
      )}`,
    );
    console.log(
      `rss reduction:          ${formatBytes(first.rssDelta - second.rssDelta)}`,
    );
    console.log(
      `debugSearch speedup:    ${(first.debugAvgMs / second.debugAvgMs).toFixed(
        3,
      )}x`,
    );
    console.log(
      `open time difference:   ${(second.openMs - first.openMs).toFixed(6)} ms`,
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

function forceGcIfAvailable() {
  if (typeof global.gc === "function") {
    global.gc();
  }
}