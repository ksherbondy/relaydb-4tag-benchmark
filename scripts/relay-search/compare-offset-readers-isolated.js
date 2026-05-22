/**
 * Author: Kris Sherbondy
 * Date: 2026-05-22
 * Purpose:
 *   Compare RelayDB offset readers using isolated child Node processes.
 *
 *   This avoids misleading memory deltas caused by V8 retaining heap/RSS
 *   between reader runs in the same process.
 */

const path = require("path");
const { spawnSync } = require("child_process");

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

const childScript = path.join(
  process.cwd(),
  "scripts",
  "relay-search",
  "benchmark-reader-isolated.js",
);

main();

function main() {
  console.log("RelayDB Isolated Offset Reader Comparison");
  console.log("=========================================");
  console.log(`Dataset: ${filePath}`);
  console.log(`Warmup iterations: ${warmupIterations}`);
  console.log(`Measured iterations: ${measuredIterations}`);
  console.log("");

  const objectReport = runChild("object");
  const compactReport = runChild("compact");

  printReport(objectReport);
  printReport(compactReport);
  printComparison(objectReport, compactReport);
}

function runChild(readerKind) {
  const result = spawnSync(
    process.execPath,
    [
      "--expose-gc",
      childScript,
      readerKind,
      String(warmupIterations),
      String(measuredIterations),
      filePath,
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 50,
    },
  );

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    console.error(result.stdout);
    console.error(result.stderr);
    throw new Error(`Child benchmark failed for reader: ${readerKind}`);
  }

  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    console.error("Failed to parse child JSON output.");
    console.error("STDOUT:");
    console.error(result.stdout);
    console.error("STDERR:");
    console.error(result.stderr);
    throw error;
  }
}

function printReport(report) {
  console.log(report.label.toUpperCase());
  console.log("=".repeat(report.label.length));
  console.log("");

  console.log("Open");
  console.log("----");
  console.log(`openMs:         ${report.openMs.toFixed(6)} ms`);
  console.log(`readerOpenMs:   ${report.readerOpenMs.toFixed(6)} ms`);
  console.log("");

  console.log("Stats");
  console.log("-----");
  console.log(`bytes:          ${report.stats.bytes.toLocaleString()}`);

  if (report.stats.lineCount !== undefined) {
    console.log(`lines:          ${report.stats.lineCount.toLocaleString()}`);
  }

  if (report.stats.nodeCount !== undefined) {
    console.log(`nodes:          ${report.stats.nodeCount.toLocaleString()}`);
  }

  if (report.stats.anchorCount !== undefined) {
    console.log(`anchors:        ${report.stats.anchorCount.toLocaleString()}`);
  }

  if (report.stats.personSearchRows !== undefined) {
    console.log(
      `person rows:    ${report.stats.personSearchRows.toLocaleString()}`,
    );
  }

  if (report.stats.personCount !== undefined) {
    console.log(`people:         ${report.stats.personCount.toLocaleString()}`);
  }

  if (report.stats.companyCount !== undefined) {
    console.log(
      `companies:      ${report.stats.companyCount.toLocaleString()}`,
    );
  }

  if (report.stats.layout !== undefined) {
    console.log(`layout:         ${report.stats.layout}`);
  }

  console.log("");

  console.log("Memory Delta");
  console.log("------------");
  printMemoryDelta(report.memory.delta);
  console.log("");

  console.log("Correctness");
  console.log("-----------");
  console.log(`answer:         ${report.correctness.answer}`);
  console.log(`company:        ${report.correctness.company}`);
  console.log(`industry:       ${report.correctness.industry}`);
  console.log("");

  console.log("Candidate Counts");
  console.log("----------------");
  console.log(report.candidateCounts);
  console.log("");

  console.log("Benchmarks");
  console.log("----------");
  printBench("search", report.benchmarks.search);
  printBench("search explain", report.benchmarks.searchExplain);
  printBench("limit 10 explain", report.benchmarks.searchLimit10Explain);
  printBench("debugSearch", report.benchmarks.debugSearch);
  console.log("");
}

function printBench(label, bench) {
  console.log(
    `${label.padEnd(18)} avg: ${bench.avgMs.toFixed(
      6,
    )} ms | ops/sec: ${bench.opsPerSecond.toFixed(3)}`,
  );
}

function printComparison(objectReport, compactReport) {
  console.log("COMPARISON");
  console.log("==========");
  console.log("");

  const objectMemory = objectReport.memory.delta;
  const compactMemory = compactReport.memory.delta;

  console.log(
    `open time difference:     ${(
      compactReport.openMs - objectReport.openMs
    ).toFixed(6)} ms`,
  );

  console.log(
    `rss reduction:            ${formatBytes(
      objectMemory.rss - compactMemory.rss,
    )}`,
  );

  console.log(
    `heapUsed reduction:       ${formatBytes(
      objectMemory.heapUsed - compactMemory.heapUsed,
    )}`,
  );

  console.log(
    `arrayBuffers difference:  ${formatBytes(
      compactMemory.arrayBuffers - objectMemory.arrayBuffers,
    )}`,
  );

  console.log(
    `debugSearch speedup:      ${(
      objectReport.benchmarks.debugSearch.avgMs /
      compactReport.benchmarks.debugSearch.avgMs
    ).toFixed(3)}x`,
  );

  console.log(
    `search speed ratio:       ${(
      objectReport.benchmarks.search.avgMs / compactReport.benchmarks.search.avgMs
    ).toFixed(3)}x`,
  );
}

function printMemoryDelta(delta) {
  const keys = ["rss", "heapTotal", "heapUsed", "external", "arrayBuffers"];

  for (const key of keys) {
    console.log(`${key.padEnd(13)} ${formatBytes(delta[key]).padStart(12)}`);
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