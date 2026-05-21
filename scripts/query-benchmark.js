/**
 * Author: Project Owner
 * Date: 2026-05-21
 * Purpose:
 *   Benchmark useful query behavior over raw JSONL versus RelayDB-style
 *   4-tag JSONL.
 *
 *   This script tests questions like:
 *     - How many posts/comments were created on a specific UTC date?
 *     - How many records fall within a UTC date range?
 *
 *   It compares:
 *     1. Raw JSONL using meta.created_utc
 *     2. 4-tag JSONL using ~created_utc
 *
 * Usage:
 *   node scripts/query-benchmark.js
 *
 * Optional:
 *   node scripts/query-benchmark.js 25 2012-03-25 2012-04-01
 *
 *   First arg  = iterations
 *   Second arg = exact date query, YYYY-MM-DD
 *   Third arg  = range end date, YYYY-MM-DD
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
  "skate_reddit.query-benchmark.json",
);

const REPORT_MD_PATH = path.join(
  process.cwd(),
  "reports",
  "skate_reddit.query-benchmark.md",
);

const DEFAULT_ITERATIONS = 25;
const DEFAULT_EXACT_DATE = "2012-03-25";
const DEFAULT_RANGE_END_DATE = "2012-04-01";

const iterations = Number(process.argv[2] || DEFAULT_ITERATIONS);
const exactDate = process.argv[3] || DEFAULT_EXACT_DATE;
const rangeEndDate = process.argv[4] || DEFAULT_RANGE_END_DATE;

if (!Number.isInteger(iterations) || iterations <= 0) {
  console.error("Iterations must be a positive integer.");
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
  const date = new Date(seconds * 1000);
  return date.toISOString().slice(0, 10);
}

function unixStartOfUtcDate(dateString) {
  return Math.floor(new Date(`${dateString}T00:00:00.000Z`).getTime() / 1000);
}

function unixEndExclusiveOfUtcDate(dateString) {
  return Math.floor(new Date(`${dateString}T00:00:00.000Z`).getTime() / 1000);
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
    indexMs: end - start,
  };
}

function queryExactDate(indexes, dateString) {
  const start = performance.now();
  const results = indexes.byDate.get(dateString) || [];
  const end = performance.now();

  return {
    count: results.length,
    queryMs: end - start,
  };
}

function queryRange(indexes, startDateString, endDateString) {
  const startUnix = unixStartOfUtcDate(startDateString);
  const endUnix = unixEndExclusiveOfUtcDate(endDateString);

  const start = performance.now();

  const lower = lowerBoundTimestamp(indexes.byTimestamp, startUnix);
  const upper = lowerBoundTimestamp(indexes.byTimestamp, endUnix);
  const count = Math.max(0, upper - lower);

  const end = performance.now();

  return {
    count,
    queryMs: end - start,
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

async function benchmarkRawOnce() {
  const startTotal = performance.now();

  const startLoadParse = performance.now();
  const records = await readJsonl(RAW_PATH);
  const endLoadParse = performance.now();

  const indexes = buildRawDateIndexes(records);

  const exact = queryExactDate(indexes, exactDate);
  const range = queryRange(indexes, exactDate, rangeEndDate);

  const endTotal = performance.now();

  return {
    label: "Raw JSONL",
    records: records.length,
    indexedRecords: indexes.byTimestamp.length,
    dateBuckets: indexes.byDate.size,
    exactCount: exact.count,
    rangeCount: range.count,
    loadParseMs: endLoadParse - startLoadParse,
    indexMs: indexes.indexMs,
    exactQueryMs: exact.queryMs,
    rangeQueryMs: range.queryMs,
    totalMs: endTotal - startTotal,
  };
}

async function benchmarkFourTagOnce() {
  const startTotal = performance.now();

  const startLoadParse = performance.now();
  const nodes = await readJsonl(TAGGED_PATH);
  const endLoadParse = performance.now();

  const indexes = buildFourTagDateIndexes(nodes);

  const exact = queryExactDate(indexes, exactDate);
  const range = queryRange(indexes, exactDate, rangeEndDate);

  const endTotal = performance.now();

  return {
    label: "4-tag JSONL",
    records: nodes.length,
    indexedRecords: indexes.byTimestamp.length,
    dateBuckets: indexes.byDate.size,
    exactCount: exact.count,
    rangeCount: range.count,
    loadParseMs: endLoadParse - startLoadParse,
    indexMs: indexes.indexMs,
    exactQueryMs: exact.queryMs,
    rangeQueryMs: range.queryMs,
    totalMs: endTotal - startTotal,
  };
}

function summarizeRuns(label, runs) {
  const first = runs[0];

  return {
    label,
    records: first.records,
    indexedRecords: first.indexedRecords,
    dateBuckets: first.dateBuckets,
    exactCount: first.exactCount,
    rangeCount: first.rangeCount,
    loadParseMs: summarizeMetric(runs.map((run) => run.loadParseMs)),
    indexMs: summarizeMetric(runs.map((run) => run.indexMs)),
    exactQueryMs: summarizeMetric(runs.map((run) => run.exactQueryMs)),
    rangeQueryMs: summarizeMetric(runs.map((run) => run.rangeQueryMs)),
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
  console.log("Running date query benchmark...");
  console.log("----------------------------------------");
  console.log(`Iterations:   ${iterations.toLocaleString()}`);
  console.log(`Exact date:   ${exactDate}`);
  console.log(`Range:        ${exactDate} to ${rangeEndDate} exclusive`);
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
    exactDate,
    rangeStartDate: exactDate,
    rangeEndDate,
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
      "This benchmark compares date-query behavior over raw JSONL and 4-tag JSONL.",
      "Raw JSONL reads timestamps from meta.created_utc.",
      "4-tag JSONL reads timestamps from ~created_utc and filters to ^ = reddit_comment.",
      "Both paths build a date bucket index and a sorted timestamp index before querying.",
      "Exact-date queries use a Map lookup.",
      "Range queries use binary search over the sorted timestamp index.",
    ],
  };

  fs.writeFileSync(REPORT_JSON_PATH, JSON.stringify(report, null, 2), "utf8");
  fs.writeFileSync(REPORT_MD_PATH, buildMarkdownReport(report), "utf8");

  printReport(report);
}

function buildMarkdownReport(report) {
  const lines = [];

  lines.push("# JSONL Date Query Benchmark");
  lines.push("");
  lines.push(`Generated: ${report.createdAt}`);
  lines.push("");
  lines.push("## Configuration");
  lines.push("");
  lines.push("| Metric | Value |");
  lines.push("|---|---:|");
  lines.push(`| Iterations | ${report.iterations.toLocaleString()} |`);
  lines.push(`| Exact date | ${report.exactDate} |`);
  lines.push(`| Range start | ${report.rangeStartDate} |`);
  lines.push(`| Range end exclusive | ${report.rangeEndDate} |`);
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
    [
      "Records",
      report.raw.records.toLocaleString(),
      report.fourTag.records.toLocaleString(),
      "Context",
    ],
    [
      "Indexed timestamp records",
      report.raw.indexedRecords.toLocaleString(),
      report.fourTag.indexedRecords.toLocaleString(),
      "Context",
    ],
    [
      "Date buckets",
      report.raw.dateBuckets.toLocaleString(),
      report.fourTag.dateBuckets.toLocaleString(),
      "Context",
    ],
    [
      `Count on ${report.exactDate}`,
      report.raw.exactCount.toLocaleString(),
      report.fourTag.exactCount.toLocaleString(),
      compareCounts(report.raw.exactCount, report.fourTag.exactCount),
    ],
    [
      `Count ${report.rangeStartDate} to ${report.rangeEndDate}`,
      report.raw.rangeCount.toLocaleString(),
      report.fourTag.rangeCount.toLocaleString(),
      compareCounts(report.raw.rangeCount, report.fourTag.rangeCount),
    ],
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
      "Exact Date Query",
      `${report.raw.exactQueryMs.avgMs} ms`,
      `${report.fourTag.exactQueryMs.avgMs} ms`,
      compareLowerIsBetter(
        report.raw.exactQueryMs.avgMs,
        report.fourTag.exactQueryMs.avgMs,
      ),
    ],
    [
      "Range Query",
      `${report.raw.rangeQueryMs.avgMs} ms`,
      `${report.fourTag.rangeQueryMs.avgMs} ms`,
      compareLowerIsBetter(
        report.raw.rangeQueryMs.avgMs,
        report.fourTag.rangeQueryMs.avgMs,
      ),
    ],
    [
      "Total",
      `${report.raw.totalMs.avgMs} ms`,
      `${report.fourTag.totalMs.avgMs} ms`,
      compareLowerIsBetter(report.raw.totalMs.avgMs, report.fourTag.totalMs.avgMs),
    ],
  ];

  const lines = [];

  lines.push("| Metric | Raw JSONL | 4-tag JSONL | Winner / Meaning |");
  lines.push("|---|---:|---:|---|");

  for (const row of rows) {
    lines.push(`| ${row[0]} | ${row[1]} | ${row[2]} | ${row[3]} |`);
  }

  return lines.join("\n");
}

function compareCounts(left, right) {
  if (left === right) return "Same result";
  return "Mismatch - investigate";
}

function compareLowerIsBetter(left, right) {
  if (left < right) return "Raw JSONL";
  if (right < left) return "4-tag JSONL";
  return "Tie";
}

function printReport(report) {
  console.log("");
  console.log("Date query benchmark complete.");
  console.log("----------------------------------------");
  console.log(`Raw indexed records:       ${report.raw.indexedRecords.toLocaleString()}`);
  console.log(`4-tag indexed records:     ${report.fourTag.indexedRecords.toLocaleString()}`);
  console.log("");
  console.log(`Raw date buckets:          ${report.raw.dateBuckets.toLocaleString()}`);
  console.log(`4-tag date buckets:        ${report.fourTag.dateBuckets.toLocaleString()}`);
  console.log("");
  console.log(`Raw exact count:           ${report.raw.exactCount.toLocaleString()}`);
  console.log(`4-tag exact count:         ${report.fourTag.exactCount.toLocaleString()}`);
  console.log("");
  console.log(`Raw range count:           ${report.raw.rangeCount.toLocaleString()}`);
  console.log(`4-tag range count:         ${report.fourTag.rangeCount.toLocaleString()}`);
  console.log("");
  console.log(`Raw load + parse avg:      ${report.raw.loadParseMs.avgMs} ms`);
  console.log(`4-tag load + parse avg:    ${report.fourTag.loadParseMs.avgMs} ms`);
  console.log("");
  console.log(`Raw date index avg:        ${report.raw.indexMs.avgMs} ms`);
  console.log(`4-tag date index avg:      ${report.fourTag.indexMs.avgMs} ms`);
  console.log("");
  console.log(`Raw exact query avg:       ${report.raw.exactQueryMs.avgMs} ms`);
  console.log(`4-tag exact query avg:     ${report.fourTag.exactQueryMs.avgMs} ms`);
  console.log("");
  console.log(`Raw range query avg:       ${report.raw.rangeQueryMs.avgMs} ms`);
  console.log(`4-tag range query avg:     ${report.fourTag.rangeQueryMs.avgMs} ms`);
  console.log("");
  console.log(`Raw total avg:             ${report.raw.totalMs.avgMs} ms`);
  console.log(`4-tag total avg:           ${report.fourTag.totalMs.avgMs} ms`);
  console.log("");
  console.log(`JSON report:               ${REPORT_JSON_PATH}`);
  console.log(`Markdown report:           ${REPORT_MD_PATH}`);
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
  console.error("Query benchmark failed.");
  console.error(error);
  process.exit(1);
});