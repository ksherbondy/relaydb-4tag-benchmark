/**
 * Author: Project Owner
 * Date: 2026-05-21
 * Purpose:
 *   Benchmark query throughput after setup.
 *
 *   This test separates:
 *     1. Setup cost:
 *        - load
 *        - parse
 *        - build date indexes
 *
 *     2. Hot query cost:
 *        - many exact-date queries
 *        - many date-range queries
 *
 *   This better simulates an application that loads static JSONL once,
 *   builds indexes once, and then answers many user/application queries.
 *
 * Usage:
 *   node scripts/query-throughput-benchmark.js
 *
 * Optional:
 *   node scripts/query-throughput-benchmark.js 25 1000000
 *
 *   First arg  = benchmark iterations
 *   Second arg = queries per run
 */

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { performance } = require("perf_hooks");

const RAW_PATH = path.join(
  process.cwd(),
  "datasets",
  "raw",
  "skate_reddit.jsonl",
);

const TAGGED_PATH = path.join(
  process.cwd(),
  "datasets",
  "tagged",
  "skate_reddit.4tag.jsonl",
);

const REPORT_JSON_PATH = path.join(
  process.cwd(),
  "reports",
  "skate_reddit.query-throughput-benchmark.json",
);

const REPORT_MD_PATH = path.join(
  process.cwd(),
  "reports",
  "skate_reddit.query-throughput-benchmark.md",
);

const DEFAULT_ITERATIONS = 25;
const DEFAULT_QUERIES_PER_RUN = 1_000_000;

const iterations = Number(process.argv[2] || DEFAULT_ITERATIONS);
const queriesPerRun = Number(process.argv[3] || DEFAULT_QUERIES_PER_RUN);

if (!Number.isInteger(iterations) || iterations <= 0) {
  console.error("Iterations must be a positive integer.");
  process.exit(1);
}

if (!Number.isInteger(queriesPerRun) || queriesPerRun <= 0) {
  console.error("Queries per run must be a positive integer.");
  process.exit(1);
}

ensureFileExists(RAW_PATH);
ensureFileExists(TAGGED_PATH);
ensureDirectory(REPORT_JSON_PATH);

function ensureFileExists(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error(`Missing file: ${filePath}`);
    process.exit(1);
  }
}

function ensureDirectory(filePath) {
  const dir = path.dirname(filePath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

async function readJsonl(filePath) {
  const records = [];

  const stream = fs.createReadStream(filePath, {
    encoding: "utf8",
  });

  const rl = readline.createInterface({
    input: stream,
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    const trimmed = line.trim();

    if (!trimmed) continue;

    records.push(JSON.parse(trimmed));
  }

  return records;
}

function utcDateStringFromUnixSeconds(seconds) {
  return new Date(seconds * 1000).toISOString().slice(0, 10);
}

function getRawCreatedUtc(record) {
  return Number(record?.meta?.created_utc || 0);
}

function getFourTagCreatedUtc(node) {
  return Number(node?.["~created_utc"] || 0);
}

function buildRawDateIndexes(records) {
  const start = performance.now();

  const byDate = new Map();
  const byTimestamp = [];

  for (const record of records) {
    const createdUtc = getRawCreatedUtc(record);

    if (!createdUtc) continue;

    const dateKey = utcDateStringFromUnixSeconds(createdUtc);

    if (!byDate.has(dateKey)) {
      byDate.set(dateKey, []);
    }

    byDate.get(dateKey).push(record);

    byTimestamp.push({
      createdUtc,
      record,
    });
  }

  byTimestamp.sort((a, b) => a.createdUtc - b.createdUtc);

  const end = performance.now();

  return {
    byDate,
    byTimestamp,
    dateKeys: Array.from(byDate.keys()).sort(),
    indexMs: end - start,
  };
}

function buildFourTagDateIndexes(nodes) {
  const start = performance.now();

  const byDate = new Map();
  const byTimestamp = [];

  for (const node of nodes) {
    if (node["^"] !== "reddit_comment") continue;

    const createdUtc = getFourTagCreatedUtc(node);

    if (!createdUtc) continue;

    const dateKey = utcDateStringFromUnixSeconds(createdUtc);

    if (!byDate.has(dateKey)) {
      byDate.set(dateKey, []);
    }

    byDate.get(dateKey).push(node);

    byTimestamp.push({
      createdUtc,
      node,
    });
  }

  byTimestamp.sort((a, b) => a.createdUtc - b.createdUtc);

  const end = performance.now();

  return {
    byDate,
    byTimestamp,
    dateKeys: Array.from(byDate.keys()).sort(),
    indexMs: end - start,
  };
}

function lowerBoundTimestamp(items, targetUnix) {
  let low = 0;
  let high = items.length;

  while (low < high) {
    const mid = Math.floor((low + high) / 2);

    if (items[mid].createdUtc < targetUnix) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  return low;
}

function unixStartOfUtcDate(dateString) {
  return Math.floor(new Date(`${dateString}T00:00:00.000Z`).getTime() / 1000);
}

function buildDateRanges(dateKeys) {
  const ranges = [];

  for (let i = 0; i < dateKeys.length; i++) {
    const startDate = dateKeys[i];
    const endDate = dateKeys[Math.min(i + 7, dateKeys.length - 1)];

    ranges.push({
      startDate,
      endDate,
      startUnix: unixStartOfUtcDate(startDate),
      endUnix: unixStartOfUtcDate(endDate),
    });
  }

  return ranges;
}

function runExactDateThroughput(indexes) {
  const keys = indexes.dateKeys;
  let totalCount = 0;

  const start = performance.now();

  for (let i = 0; i < queriesPerRun; i++) {
    const key = keys[i % keys.length];
    const records = indexes.byDate.get(key) || [];
    totalCount += records.length;
  }

  const end = performance.now();

  return {
    totalCount,
    queryMs: end - start,
  };
}

function runRangeThroughput(indexes) {
  const ranges = buildDateRanges(indexes.dateKeys);
  let totalCount = 0;

  const start = performance.now();

  for (let i = 0; i < queriesPerRun; i++) {
    const range = ranges[i % ranges.length];

    const lower = lowerBoundTimestamp(indexes.byTimestamp, range.startUnix);
    const upper = lowerBoundTimestamp(indexes.byTimestamp, range.endUnix);

    totalCount += Math.max(0, upper - lower);
  }

  const end = performance.now();

  return {
    totalCount,
    queryMs: end - start,
  };
}

async function setupRaw() {
  const startSetup = performance.now();

  const startLoadParse = performance.now();
  const records = await readJsonl(RAW_PATH);
  const endLoadParse = performance.now();

  const indexes = buildRawDateIndexes(records);

  const endSetup = performance.now();

  return {
    label: "Raw JSONL",
    records: records.length,
    indexedRecords: indexes.byTimestamp.length,
    dateBuckets: indexes.byDate.size,
    indexes,
    loadParseMs: endLoadParse - startLoadParse,
    indexMs: indexes.indexMs,
    setupMs: endSetup - startSetup,
  };
}

async function setupFourTag() {
  const startSetup = performance.now();

  const startLoadParse = performance.now();
  const nodes = await readJsonl(TAGGED_PATH);
  const endLoadParse = performance.now();

  const indexes = buildFourTagDateIndexes(nodes);

  const endSetup = performance.now();

  return {
    label: "4-tag JSONL",
    records: nodes.length,
    indexedRecords: indexes.byTimestamp.length,
    dateBuckets: indexes.byDate.size,
    indexes,
    loadParseMs: endLoadParse - startLoadParse,
    indexMs: indexes.indexMs,
    setupMs: endSetup - startSetup,
  };
}

async function benchmarkRawOnce() {
  const setup = await setupRaw();

  const exact = runExactDateThroughput(setup.indexes);
  const range = runRangeThroughput(setup.indexes);

  return {
    label: setup.label,
    records: setup.records,
    indexedRecords: setup.indexedRecords,
    dateBuckets: setup.dateBuckets,
    exactTotalCount: exact.totalCount,
    rangeTotalCount: range.totalCount,
    loadParseMs: setup.loadParseMs,
    indexMs: setup.indexMs,
    setupMs: setup.setupMs,
    exactQueryThroughputMs: exact.queryMs,
    rangeQueryThroughputMs: range.queryMs,
    queryOnlyMs: exact.queryMs + range.queryMs,
    totalMs: setup.setupMs + exact.queryMs + range.queryMs,
  };
}

async function benchmarkFourTagOnce() {
  const setup = await setupFourTag();

  const exact = runExactDateThroughput(setup.indexes);
  const range = runRangeThroughput(setup.indexes);

  return {
    label: setup.label,
    records: setup.records,
    indexedRecords: setup.indexedRecords,
    dateBuckets: setup.dateBuckets,
    exactTotalCount: exact.totalCount,
    rangeTotalCount: range.totalCount,
    loadParseMs: setup.loadParseMs,
    indexMs: setup.indexMs,
    setupMs: setup.setupMs,
    exactQueryThroughputMs: exact.queryMs,
    rangeQueryThroughputMs: range.queryMs,
    queryOnlyMs: exact.queryMs + range.queryMs,
    totalMs: setup.setupMs + exact.queryMs + range.queryMs,
  };
}

function summarizeRuns(label, runs) {
  const first = runs[0];

  return {
    label,
    records: first.records,
    indexedRecords: first.indexedRecords,
    dateBuckets: first.dateBuckets,
    exactTotalCount: first.exactTotalCount,
    rangeTotalCount: first.rangeTotalCount,
    loadParseMs: summarizeMetric(runs.map((run) => run.loadParseMs)),
    indexMs: summarizeMetric(runs.map((run) => run.indexMs)),
    setupMs: summarizeMetric(runs.map((run) => run.setupMs)),
    exactQueryThroughputMs: summarizeMetric(
      runs.map((run) => run.exactQueryThroughputMs),
    ),
    rangeQueryThroughputMs: summarizeMetric(
      runs.map((run) => run.rangeQueryThroughputMs),
    ),
    queryOnlyMs: summarizeMetric(runs.map((run) => run.queryOnlyMs)),
    totalMs: summarizeMetric(runs.map((run) => run.totalMs)),
  };
}

function summarizeMetric(values) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const avg = values.reduce((sum, value) => sum + value, 0) / values.length;

  return {
    minMs: round(min),
    maxMs: round(max),
    avgMs: round(avg),
  };
}

function round(value) {
  return Number(value.toFixed(6));
}

async function runBenchmark() {
  console.log("");
  console.log("Running query throughput benchmark...");
  console.log("----------------------------------------");
  console.log(`Iterations:       ${iterations.toLocaleString()}`);
  console.log(`Queries per run:  ${queriesPerRun.toLocaleString()}`);
  console.log("");

  await benchmarkRawOnce();
  await benchmarkFourTagOnce();

  const rawRuns = [];
  const fourTagRuns = [];

  for (let i = 0; i < iterations; i++) {
    process.stdout.write(`Run ${i + 1}/${iterations}...\r`);

    rawRuns.push(await benchmarkRawOnce());
    fourTagRuns.push(await benchmarkFourTagOnce());
  }

  process.stdout.write("\n");

  const report = {
    createdAt: new Date().toISOString(),
    iterations,
    queriesPerRun,
    files: {
      raw: {
        path: RAW_PATH,
        bytes: fs.statSync(RAW_PATH).size,
      },
      fourTag: {
        path: TAGGED_PATH,
        bytes: fs.statSync(TAGGED_PATH).size,
      },
    },
    raw: summarizeRuns("Raw JSONL", rawRuns),
    fourTag: summarizeRuns("4-tag JSONL", fourTagRuns),
    notes: [
      "This benchmark tests hot query throughput after setup.",
      "Setup includes load, parse, and date-index construction.",
      "Query-only time excludes setup and measures repeated exact-date and date-range queries.",
      "Exact-date queries use Map lookups.",
      "Range queries use binary search over sorted timestamp arrays.",
      "This benchmark does not test RelayDB binary artifacts.",
    ],
  };

  fs.writeFileSync(REPORT_JSON_PATH, JSON.stringify(report, null, 2), "utf8");
  fs.writeFileSync(REPORT_MD_PATH, buildMarkdownReport(report), "utf8");

  printReport(report);
}

function buildMarkdownReport(report) {
  const lines = [];

  lines.push("# JSONL Query Throughput Benchmark");
  lines.push("");
  lines.push(`Generated: ${report.createdAt}`);
  lines.push("");
  lines.push("## Configuration");
  lines.push("");
  lines.push("| Metric | Value |");
  lines.push("|---|---:|");
  lines.push(`| Iterations | ${report.iterations.toLocaleString()} |`);
  lines.push(`| Queries per run | ${report.queriesPerRun.toLocaleString()} |`);
  lines.push(`| Raw file size | ${formatBytes(report.files.raw.bytes)} |`);
  lines.push(`| 4-tag file size | ${formatBytes(report.files.fourTag.bytes)} |`);
  lines.push("");
  lines.push("## Results");
  lines.push("");
  lines.push(buildComparisonTable(report));
  lines.push("");
  lines.push("## Notes");
  lines.push("");

  for (const note of report.notes) {
    lines.push(`- ${note}`);
  }

  lines.push("");

  return lines.join("\n");
}

function buildComparisonTable(report) {
  const rows = [
    ["Records", report.raw.records, report.fourTag.records, "Context"],
    [
      "Indexed records",
      report.raw.indexedRecords,
      report.fourTag.indexedRecords,
      "Context",
    ],
    ["Date buckets", report.raw.dateBuckets, report.fourTag.dateBuckets, "Context"],
    [
      "Load + Parse",
      `${report.raw.loadParseMs.avgMs} ms`,
      `${report.fourTag.loadParseMs.avgMs} ms`,
      compareLowerIsBetter(
        report.raw.loadParseMs.avgMs,
        report.fourTag.loadParseMs.avgMs,
      ),
    ],
    [
      "Date Index Build",
      `${report.raw.indexMs.avgMs} ms`,
      `${report.fourTag.indexMs.avgMs} ms`,
      compareLowerIsBetter(report.raw.indexMs.avgMs, report.fourTag.indexMs.avgMs),
    ],
    [
      "Setup Total",
      `${report.raw.setupMs.avgMs} ms`,
      `${report.fourTag.setupMs.avgMs} ms`,
      compareLowerIsBetter(report.raw.setupMs.avgMs, report.fourTag.setupMs.avgMs),
    ],
    [
      "Exact Query Throughput",
      `${report.raw.exactQueryThroughputMs.avgMs} ms`,
      `${report.fourTag.exactQueryThroughputMs.avgMs} ms`,
      compareLowerIsBetter(
        report.raw.exactQueryThroughputMs.avgMs,
        report.fourTag.exactQueryThroughputMs.avgMs,
      ),
    ],
    [
      "Range Query Throughput",
      `${report.raw.rangeQueryThroughputMs.avgMs} ms`,
      `${report.fourTag.rangeQueryThroughputMs.avgMs} ms`,
      compareLowerIsBetter(
        report.raw.rangeQueryThroughputMs.avgMs,
        report.fourTag.rangeQueryThroughputMs.avgMs,
      ),
    ],
    [
      "Query-Only Total",
      `${report.raw.queryOnlyMs.avgMs} ms`,
      `${report.fourTag.queryOnlyMs.avgMs} ms`,
      compareLowerIsBetter(
        report.raw.queryOnlyMs.avgMs,
        report.fourTag.queryOnlyMs.avgMs,
      ),
    ],
    [
      "Total With Setup",
      `${report.raw.totalMs.avgMs} ms`,
      `${report.fourTag.totalMs.avgMs} ms`,
      compareLowerIsBetter(report.raw.totalMs.avgMs, report.fourTag.totalMs.avgMs),
    ],
  ];

  const lines = [];

  lines.push("| Metric | Raw JSONL | 4-tag JSONL | Winner / Meaning |");
  lines.push("|---|---:|---:|---|");

  for (const row of rows) {
    lines.push(
      `| ${row[0]} | ${formatCell(row[1])} | ${formatCell(row[2])} | ${row[3]} |`,
    );
  }

  return lines.join("\n");
}

function formatCell(value) {
  if (typeof value === "number") {
    return value.toLocaleString();
  }

  return value;
}

function compareLowerIsBetter(left, right) {
  if (left < right) return "Raw JSONL";
  if (right < left) return "4-tag JSONL";
  return "Tie";
}

function printReport(report) {
  console.log("");
  console.log("Query throughput benchmark complete.");
  console.log("----------------------------------------");
  console.log(`Raw indexed records:              ${report.raw.indexedRecords.toLocaleString()}`);
  console.log(`4-tag indexed records:            ${report.fourTag.indexedRecords.toLocaleString()}`);
  console.log("");
  console.log(`Raw setup avg:                    ${report.raw.setupMs.avgMs} ms`);
  console.log(`4-tag setup avg:                  ${report.fourTag.setupMs.avgMs} ms`);
  console.log("");
  console.log(`Raw exact query throughput avg:   ${report.raw.exactQueryThroughputMs.avgMs} ms`);
  console.log(`4-tag exact query throughput avg: ${report.fourTag.exactQueryThroughputMs.avgMs} ms`);
  console.log("");
  console.log(`Raw range query throughput avg:   ${report.raw.rangeQueryThroughputMs.avgMs} ms`);
  console.log(`4-tag range query throughput avg: ${report.fourTag.rangeQueryThroughputMs.avgMs} ms`);
  console.log("");
  console.log(`Raw query-only avg:               ${report.raw.queryOnlyMs.avgMs} ms`);
  console.log(`4-tag query-only avg:             ${report.fourTag.queryOnlyMs.avgMs} ms`);
  console.log("");
  console.log(`Raw total with setup avg:         ${report.raw.totalMs.avgMs} ms`);
  console.log(`4-tag total with setup avg:       ${report.fourTag.totalMs.avgMs} ms`);
  console.log("");
  console.log(`JSON report:                      ${REPORT_JSON_PATH}`);
  console.log(`Markdown report:                  ${REPORT_MD_PATH}`);
  console.log("");
}

function formatBytes(bytes) {
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(2)} ${units[unitIndex]}`;
}

runBenchmark().catch((error) => {
  console.error("");
  console.error("Query throughput benchmark failed.");
  console.error(error);
  process.exit(1);
});