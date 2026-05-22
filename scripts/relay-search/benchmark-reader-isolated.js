/**
 * Author: Kris Sherbondy
 * Date: 2026-05-22
 * Purpose:
 *   Run one RelayDB reader benchmark in an isolated Node process.
 *
 *   This is used by compare-offset-readers-isolated.js so each reader gets
 *   clean memory measurements without V8 retaining memory from a previous run.
 */

const path = require("path");
const { performance } = require("perf_hooks");

const readerKind = process.argv[2];
const warmupIterations = Number(process.argv[3] || 1000);
const measuredIterations = Number(process.argv[4] || 10000);
const datasetArg = process.argv[5];

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

let ReaderClass;
let label;

if (readerKind === "object") {
  ReaderClass = require("./relay-offset-db");
  label = "object-row offset reader";
} else if (readerKind === "compact") {
  ReaderClass = require("./relay-offset-compact-db");
  label = "compact typed-array offset reader";
} else {
  console.error(
    JSON.stringify({
      error: `Unknown reader kind: ${readerKind}`,
      expected: ["object", "compact"],
    }),
  );
  process.exit(1);
}

main().catch((error) => {
  console.error(
    JSON.stringify({
      readerKind,
      label,
      error: error.message,
      stack: error.stack,
    }),
  );
  process.exit(1);
});

async function main() {
  forceGcIfAvailable();

  const beforeOpenMemory = process.memoryUsage();
  const openStart = performance.now();
  const db = await ReaderClass.open(filePath);
  const openEnd = performance.now();
  const afterOpenMemory = process.memoryUsage();

  const correctness = db.search(question, { explain: true });
  const debug = db.debugSearch(question);

  warmup("search", warmupIterations, () => db.search(question));
  warmup("searchExplain", warmupIterations, () =>
    db.search(question, { explain: true }),
  );
  warmup("searchLimit10Explain", warmupIterations, () =>
    db.search(question, { limit: 10, explain: true }),
  );
  warmup("debugSearch", warmupIterations, () => db.debugSearch(question));

  const searchBench = benchmark("search", measuredIterations, () =>
    db.search(question),
  );
  const searchExplainBench = benchmark("searchExplain", measuredIterations, () =>
    db.search(question, { explain: true }),
  );
  const searchLimit10ExplainBench = benchmark(
    "searchLimit10Explain",
    measuredIterations,
    () => db.search(question, { limit: 10, explain: true }),
  );
  const debugBench = benchmark("debugSearch", measuredIterations, () =>
    db.debugSearch(question),
  );

  const report = {
    readerKind,
    label,
    filePath,
    question,
    warmupIterations,
    measuredIterations,
    openMs: openEnd - openStart,
    readerOpenMs: db.stats.openMs,
    stats: db.stats,
    memory: {
      beforeOpen: beforeOpenMemory,
      afterOpen: afterOpenMemory,
      delta: getMemoryDelta(beforeOpenMemory, afterOpenMemory),
    },
    correctness: {
      answer: correctness.answer,
      company: correctness.data?.company?.name || null,
      industry: correctness.data?.company?.industry || null,
    },
    candidateCounts: debug.explanation.candidateCounts,
    timings: {
      initialDebug: debug.explanation.timings,
    },
    benchmarks: {
      search: searchBench,
      searchExplain: searchExplainBench,
      searchLimit10Explain: searchLimit10ExplainBench,
      debugSearch: debugBench,
    },
  };

  console.log(JSON.stringify(report, null, 2));
}

function warmup(label, iterations, fn) {
  let blackhole = 0;

  for (let index = 0; index < iterations; index += 1) {
    blackhole += consume(fn());
  }

  return {
    label,
    blackhole,
  };
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

  return {
    label,
    iterations,
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
    delta[key] = (after[key] || 0) - (before[key] || 0);
  }

  return delta;
}

function forceGcIfAvailable() {
  if (typeof global.gc === "function") {
    global.gc();
  }
}