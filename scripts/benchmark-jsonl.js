/**
 * Author: Project Owner
 * Date: 2026-05-21
 * Purpose:
 *   Benchmark raw JSONL post-parse structure work against RelayDB-style
 *   4-tag JSONL post-parse structure work.
 *
 *   This benchmark does NOT test RelayDB binary artifacts yet.
 *
 *   It compares:
 *     1. Raw JSONL:
 *        - parse records
 *        - manually group by meta.subreddit
 *        - synthesize stable IDs
 *        - build a manual lookup map
 *        - run lookup stress test
 *
 *     2. 4-tag JSONL:
 *        - parse nodes
 *        - build anchor map from #
 *        - build topic groups from ^
 *        - build graph edges from @ fields
 *        - run lookup stress test
 *
 * Usage:
 *   node scripts/benchmark-jsonl.js
 *
 * Optional:
 *   node scripts/benchmark-jsonl.js 25 1000000
 *
 *   First arg  = iterations
 *   Second arg = lookup iterations per benchmark run
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
  "skate_reddit.jsonl-vs-4tag.benchmark.json",
);

const REPORT_MD_PATH = path.join(
  process.cwd(),
  "reports",
  "skate_reddit.jsonl-vs-4tag.benchmark.md",
);

const DEFAULT_ITERATIONS = 25;
const DEFAULT_LOOKUP_ITERATIONS = 1_000_000;

const iterations = Number(process.argv[2] || DEFAULT_ITERATIONS);
const lookupIterations = Number(process.argv[3] || DEFAULT_LOOKUP_ITERATIONS);

if (!Number.isInteger(iterations) || iterations <= 0) {
  console.error("Iterations must be a positive integer.");
  process.exit(1);
}

if (!Number.isInteger(lookupIterations) || lookupIterations <= 0) {
  console.error("Lookup iterations must be a positive integer.");
  process.exit(1);
}

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

ensureFileExists(RAW_PATH);
ensureFileExists(TAGGED_PATH);
ensureDirectory(REPORT_JSON_PATH);

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

function cleanAnchorPart(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function padRecordNumber(value) {
  return String(value).padStart(8, "0");
}

function createRawSyntheticId(record, index) {
  const subreddit = record?.meta?.subreddit || "unknown";
  return `reddit_comment:${cleanAnchorPart(subreddit)}:${padRecordNumber(
    index + 1,
  )}`;
}

function benchmarkRawStructure(records) {
  const startStructure = performance.now();

  const idMap = new Map();
  const subredditGroups = new Map();
  const subredditCounts = new Map();
  const syntheticEdges = [];

  for (let i = 0; i < records.length; i++) {
    const record = records[i];

    const id = createRawSyntheticId(record, i);
    const subreddit = record?.meta?.subreddit || "unknown";
    const subredditAnchor = `subreddit:${cleanAnchorPart(subreddit)}`;

    const normalizedRecord = {
      id,
      type: "reddit_comment",
      subredditAnchor,
      source: "skate_reddit",
      createdUtc: Number(record?.meta?.created_utc || 0),
      recordIndex: i + 1,
      text: record?.text || "",
    };

    idMap.set(id, normalizedRecord);

    if (!subredditGroups.has(subredditAnchor)) {
      subredditGroups.set(subredditAnchor, []);
    }

    subredditGroups.get(subredditAnchor).push(id);

    subredditCounts.set(
      subredditAnchor,
      (subredditCounts.get(subredditAnchor) || 0) + 1,
    );

    syntheticEdges.push({
      from: id,
      field: "subreddit",
      to: subredditAnchor,
    });
  }

  const subredditNodes = [];

  for (const [subredditAnchor, count] of subredditCounts.entries()) {
    subredditNodes.push({
      id: subredditAnchor,
      type: "subreddit",
      source: "skate_reddit",
      count,
    });
  }

  const endStructure = performance.now();

  return {
    idMap,
    subredditGroups,
    syntheticEdges,
    subredditNodes,
    structureMs: endStructure - startStructure,
  };
}

function benchmarkFourTagStructure(nodes) {
  const startStructure = performance.now();

  const anchorMap = new Map();
  const topicGroups = new Map();
  const graphEdges = [];
  const metadataFields = new Map();

  for (const node of nodes) {
    const anchor = node["#"];
    const topic = node["^"] || "unknown";

    if (anchor) {
      anchorMap.set(anchor, node);
    }

    if (!topicGroups.has(topic)) {
      topicGroups.set(topic, []);
    }

    topicGroups.get(topic).push(anchor);

    for (const [key, value] of Object.entries(node)) {
      if (key.startsWith("@")) {
        addGraphEdges(graphEdges, anchor, key, value);
      }

      if (key.startsWith("~")) {
        metadataFields.set(key, (metadataFields.get(key) || 0) + 1);
      }
    }
  }

  const endStructure = performance.now();

  return {
    anchorMap,
    topicGroups,
    graphEdges,
    metadataFields,
    structureMs: endStructure - startStructure,
  };
}

function addGraphEdges(graphEdges, fromAnchor, field, value) {
  if (!fromAnchor) return;

  if (Array.isArray(value)) {
    for (const target of value) {
      if (typeof target === "string") {
        graphEdges.push({
          from: fromAnchor,
          field,
          to: target,
        });
      }
    }

    return;
  }

  if (typeof value === "string") {
    graphEdges.push({
      from: fromAnchor,
      field,
      to: value,
    });
  }
}

function runLookupStress(keys, getter, label) {
  const start = performance.now();

  for (let i = 0; i < lookupIterations; i++) {
    const key = keys[i % keys.length];
    const value = getter(key);

    if (!value) {
      throw new Error(`${label} lookup failed for key: ${key}`);
    }
  }

  const end = performance.now();

  return end - start;
}

async function benchmarkRawOnce() {
  const startTotal = performance.now();

  const startLoadParse = performance.now();
  const records = await readJsonl(RAW_PATH);
  const endLoadParse = performance.now();

  const structure = benchmarkRawStructure(records);

  const keys = Array.from(structure.idMap.keys());

  const lookupMs = runLookupStress(
    keys,
    (key) => structure.idMap.get(key),
    "Raw JSONL synthetic ID map",
  );

  const endTotal = performance.now();

  return {
    file: "raw",
    records: records.length,
    nodes: records.length + structure.subredditNodes.length,
    edges: structure.syntheticEdges.length,
    groups: structure.subredditGroups.size,
    loadParseMs: endLoadParse - startLoadParse,
    structureMs: structure.structureMs,
    lookupMs,
    totalMs: endTotal - startTotal,
  };
}

async function benchmarkFourTagOnce() {
  const startTotal = performance.now();

  const startLoadParse = performance.now();
  const nodes = await readJsonl(TAGGED_PATH);
  const endLoadParse = performance.now();

  const structure = benchmarkFourTagStructure(nodes);

  const keys = Array.from(structure.anchorMap.keys());

  const lookupMs = runLookupStress(
    keys,
    (key) => structure.anchorMap.get(key),
    "4-tag anchor map",
  );

  const endTotal = performance.now();

  return {
    file: "4tag",
    records: nodes.length,
    nodes: structure.anchorMap.size,
    edges: structure.graphEdges.length,
    groups: structure.topicGroups.size,
    metadataFieldKinds: structure.metadataFields.size,
    loadParseMs: endLoadParse - startLoadParse,
    structureMs: structure.structureMs,
    lookupMs,
    totalMs: endTotal - startTotal,
  };
}

function summarizeRuns(label, runs) {
  const first = runs[0];

  return {
    label,
    records: first.records,
    nodes: first.nodes,
    edges: first.edges,
    groups: first.groups,
    metadataFieldKinds: first.metadataFieldKinds ?? null,
    loadParseMs: summarizeMetric(runs.map((run) => run.loadParseMs)),
    structureMs: summarizeMetric(runs.map((run) => run.structureMs)),
    lookupMs: summarizeMetric(runs.map((run) => run.lookupMs)),
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
  return Number(value.toFixed(3));
}

async function runBenchmark() {
  console.log("");
  console.log("Running JSONL vs 4-tag benchmark...");
  console.log("----------------------------------------");
  console.log(`Iterations:        ${iterations.toLocaleString()}`);
  console.log(`Lookup iterations: ${lookupIterations.toLocaleString()}`);
  console.log("");

  // Warmup pass.
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
    lookupIterations,
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
      "This benchmark compares raw JSONL post-parse structure work against 4-tag JSONL post-parse structure work.",
      "It does not test RelayDB binary artifacts.",
      "The raw JSONL path manually synthesizes IDs and subreddit edges.",
      "The 4-tag path reads identity from #, topic from ^, relationships from @ fields, and metadata from ~ fields.",
      "The 4-tag file is larger because it carries explicit identity, relationship, topic, and metadata fields.",
    ],
  };

  fs.writeFileSync(REPORT_JSON_PATH, JSON.stringify(report, null, 2), "utf8");
  fs.writeFileSync(REPORT_MD_PATH, buildMarkdownReport(report), "utf8");

  printReport(report);
}

function buildMarkdownReport(report) {
  const lines = [];

  lines.push("# JSONL vs 4-Tag Benchmark Report");
  lines.push("");
  lines.push(`Generated: ${report.createdAt}`);
  lines.push("");
  lines.push("## Configuration");
  lines.push("");
  lines.push(`| Metric | Value |`);
  lines.push(`|---|---:|`);
  lines.push(`| Iterations | ${report.iterations.toLocaleString()} |`);
  lines.push(
    `| Lookup iterations per run | ${report.lookupIterations.toLocaleString()} |`,
  );
  lines.push(`| Raw file size | ${formatBytes(report.files.raw.bytes)} |`);
  lines.push(`| 4-tag file size | ${formatBytes(report.files.fourTag.bytes)} |`);
  lines.push("");

  lines.push("## Summary");
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
      "Records / Nodes",
      report.raw.records.toLocaleString(),
      report.fourTag.records.toLocaleString(),
      "Context",
    ],
    [
      "Edges",
      report.raw.edges.toLocaleString(),
      report.fourTag.edges.toLocaleString(),
      compareLowerIsBetter(report.raw.edges, report.fourTag.edges, false),
    ],
    [
      "Groups",
      report.raw.groups.toLocaleString(),
      report.fourTag.groups.toLocaleString(),
      "Context",
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
      "Structure Build",
      `${report.raw.structureMs.avgMs} ms`,
      `${report.fourTag.structureMs.avgMs} ms`,
      compareLowerIsBetter(
        report.raw.structureMs.avgMs,
        report.fourTag.structureMs.avgMs,
      ),
    ],
    [
      "Lookup Stress",
      `${report.raw.lookupMs.avgMs} ms`,
      `${report.fourTag.lookupMs.avgMs} ms`,
      compareLowerIsBetter(
        report.raw.lookupMs.avgMs,
        report.fourTag.lookupMs.avgMs,
      ),
    ],
    [
      "Total",
      `${report.raw.totalMs.avgMs} ms`,
      `${report.fourTag.totalMs.avgMs} ms`,
      compareLowerIsBetter(
        report.raw.totalMs.avgMs,
        report.fourTag.totalMs.avgMs,
      ),
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

function compareLowerIsBetter(left, right, lowerIsBetter = true) {
  if (!lowerIsBetter) {
    if (left === right) return "Same";
    return "Different semantics";
  }

  if (left < right) return "Raw JSONL";
  if (right < left) return "4-tag JSONL";
  return "Tie";
}

function printReport(report) {
  console.log("");
  console.log("Benchmark complete.");
  console.log("----------------------------------------");
  console.log(`Raw load + parse avg:      ${report.raw.loadParseMs.avgMs} ms`);
  console.log(`4-tag load + parse avg:    ${report.fourTag.loadParseMs.avgMs} ms`);
  console.log("");
  console.log(`Raw structure avg:         ${report.raw.structureMs.avgMs} ms`);
  console.log(`4-tag structure avg:       ${report.fourTag.structureMs.avgMs} ms`);
  console.log("");
  console.log(`Raw lookup avg:            ${report.raw.lookupMs.avgMs} ms`);
  console.log(`4-tag lookup avg:          ${report.fourTag.lookupMs.avgMs} ms`);
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
  console.error("Benchmark failed.");
  console.error(error);
  process.exit(1);
});