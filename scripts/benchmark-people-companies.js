/**
 * Author: Project Owner
 * Date: 2026-05-21
 * Purpose:
 *   Benchmark four runtime data-loading lanes:
 *
 *   1. Raw split JSONL
 *   2. Raw merged JSONL
 *   3. Tagged split JSONL
 *   4. Tagged merged JSONL
 *
 *   This benchmark measures both performance and runtime assembly burden.
 *
 * Usage:
 *   node scripts/benchmark-people-companies.js
 *
 * Optional:
 *   node scripts/benchmark-people-companies.js 100 1000000
 *
 *   First arg  = benchmark iterations
 *   Second arg = query loops per run
 */

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { performance } = require("perf_hooks");

const DEFAULT_ITERATIONS = 100;
const DEFAULT_QUERY_LOOPS = 1_000_000;

const iterations = Number(process.argv[2] || DEFAULT_ITERATIONS);
const queryLoops = Number(process.argv[3] || DEFAULT_QUERY_LOOPS);

const RAW_COMPANIES_PATH = path.join(
  process.cwd(),
  "datasets",
  "raw",
  "companies.jsonl",
);

const RAW_PEOPLE_PATH = path.join(
  process.cwd(),
  "datasets",
  "raw",
  "people.jsonl",
);

const RAW_MERGED_PATH = path.join(
  process.cwd(),
  "datasets",
  "merged",
  "people-companies.raw.merged.jsonl",
);

const TAGGED_COMPANIES_PATH = path.join(
  process.cwd(),
  "datasets",
  "tagged",
  "companies.4tag.jsonl",
);

const TAGGED_PEOPLE_PATH = path.join(
  process.cwd(),
  "datasets",
  "tagged",
  "people.4tag.jsonl",
);

const TAGGED_MERGED_PATH = path.join(
  process.cwd(),
  "datasets",
  "merged",
  "people-companies.4tag.merged.jsonl",
);

const REPORT_JSON_PATH = path.join(
  process.cwd(),
  "reports",
  "people-companies.benchmark.json",
);

const REPORT_MD_PATH = path.join(
  process.cwd(),
  "reports",
  "people-companies.benchmark.md",
);

const TARGET_COMPANY_NAME = "Smart Labs Inc";
const TARGET_COMPANY_ANCHOR =
  "company:475dcc3c-d2eb-4750-a8ce-40e6e459409d";

ensureFileExists(RAW_COMPANIES_PATH);
ensureFileExists(RAW_PEOPLE_PATH);
ensureFileExists(RAW_MERGED_PATH);
ensureFileExists(TAGGED_COMPANIES_PATH);
ensureFileExists(TAGGED_PEOPLE_PATH);
ensureFileExists(TAGGED_MERGED_PATH);
ensureDirectory(REPORT_JSON_PATH);

if (!Number.isInteger(iterations) || iterations <= 0) {
  console.error("Iterations must be a positive integer.");
  process.exit(1);
}

if (!Number.isInteger(queryLoops) || queryLoops <= 0) {
  console.error("Query loops must be a positive integer.");
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

function buildRawGraph(companies, people) {
  const start = performance.now();

  const companiesById = new Map();
  const companiesByName = new Map();
  const peopleById = new Map();
  const peopleByCompanyName = new Map();
  const missingCompanyLinks = [];

  for (const company of companies) {
    companiesById.set(company.id, company);
    companiesByName.set(company.name, company);
  }

  for (const person of people) {
    peopleById.set(person.id, person);

    const companyName = person.person?.job?.company_name || null;

    if (!companyName) {
      missingCompanyLinks.push({
        personId: person.id,
        reason: "missing_company_name",
      });

      continue;
    }

    const company = companiesByName.get(companyName);

    if (!company) {
      missingCompanyLinks.push({
        personId: person.id,
        companyName,
        reason: "company_name_not_found",
      });

      continue;
    }

    if (!peopleByCompanyName.has(companyName)) {
      peopleByCompanyName.set(companyName, []);
    }

    peopleByCompanyName.get(companyName).push(person);
  }

  const end = performance.now();

  return {
    companiesById,
    companiesByName,
    peopleById,
    peopleByCompanyName,
    missingCompanyLinks,
    buildMs: end - start,
  };
}

function buildRawGraphFromMerged(records) {
  const companies = [];
  const people = [];

  const splitStart = performance.now();

  for (const record of records) {
    if (record.__record_type === "company") {
      companies.push(record);
    }

    if (record.__record_type === "person") {
      people.push(record);
    }
  }

  const splitEnd = performance.now();
  const graph = buildRawGraph(companies, people);

  return {
    ...graph,
    splitMs: splitEnd - splitStart,
    buildMs: graph.buildMs + (splitEnd - splitStart),
  };
}

function buildTaggedGraph(nodes) {
  const start = performance.now();

  const nodesByAnchor = new Map();
  const nodesByTopic = new Map();
  const peopleByCompanyAnchor = new Map();
  const missingCompanyLinks = [];

  for (const node of nodes) {
    const anchor = node["#"];
    const topic = node["^"];

    if (!anchor || !topic) continue;

    nodesByAnchor.set(anchor, node);

    if (!nodesByTopic.has(topic)) {
      nodesByTopic.set(topic, []);
    }

    nodesByTopic.get(topic).push(node);
  }

  const people = nodesByTopic.get("person") || [];

  for (const person of people) {
    const companyAnchor = person["@company"];

    if (!companyAnchor) {
      missingCompanyLinks.push({
        personAnchor: person["#"],
        reason: "missing_company_anchor",
      });

      continue;
    }

    if (!nodesByAnchor.has(companyAnchor)) {
      missingCompanyLinks.push({
        personAnchor: person["#"],
        companyAnchor,
        reason: "company_anchor_not_found",
      });

      continue;
    }

    if (!peopleByCompanyAnchor.has(companyAnchor)) {
      peopleByCompanyAnchor.set(companyAnchor, []);
    }

    peopleByCompanyAnchor.get(companyAnchor).push(person);
  }

  const end = performance.now();

  return {
    nodesByAnchor,
    nodesByTopic,
    peopleByCompanyAnchor,
    missingCompanyLinks,
    buildMs: end - start,
  };
}

function runRawQueries(graph) {
  let total = 0;

  const start = performance.now();

  for (let i = 0; i < queryLoops; i++) {
    const people = graph.peopleByCompanyName.get(TARGET_COMPANY_NAME) || [];
    total += people.length;
  }

  const end = performance.now();

  return {
    total,
    queryMs: end - start,
  };
}

function runTaggedQueries(graph) {
  let total = 0;

  const start = performance.now();

  for (let i = 0; i < queryLoops; i++) {
    const people = graph.peopleByCompanyAnchor.get(TARGET_COMPANY_ANCHOR) || [];
    total += people.length;
  }

  const end = performance.now();

  return {
    total,
    queryMs: end - start,
  };
}

async function benchmarkRawSplitOnce() {
  const startLoad = performance.now();

  const companies = await readJsonl(RAW_COMPANIES_PATH);
  const people = await readJsonl(RAW_PEOPLE_PATH);

  const endLoad = performance.now();

  const graph = buildRawGraph(companies, people);
  const query = runRawQueries(graph);

  return {
    label: "Raw Split JSONL",
    filesLoaded: 2,
    records: companies.length + people.length,
    nodes: null,
    bytesLoaded:
      fs.statSync(RAW_COMPANIES_PATH).size + fs.statSync(RAW_PEOPLE_PATH).size,
    missingCompanyLinks: graph.missingCompanyLinks.length,
    loadParseMs: endLoad - startLoad,
    graphBuildMs: graph.buildMs,
    queryMs: query.queryMs,
    totalMs: endLoad - startLoad + graph.buildMs + query.queryMs,
    queryTotal: query.total,
    runtimeBurden: {
      fileLoads: 2,
      sourceSplittingRequired: false,
      companyNameMapRequired: true,
      relationshipResolutionAtRuntime: true,
      missingReferenceValidationAtRuntime: true,
      appSpecificJoinLogic: true,
    },
  };
}

async function benchmarkRawMergedOnce() {
  const startLoad = performance.now();

  const records = await readJsonl(RAW_MERGED_PATH);

  const endLoad = performance.now();

  const graph = buildRawGraphFromMerged(records);
  const query = runRawQueries(graph);

  return {
    label: "Raw Merged JSONL",
    filesLoaded: 1,
    records: records.length,
    nodes: null,
    bytesLoaded: fs.statSync(RAW_MERGED_PATH).size,
    missingCompanyLinks: graph.missingCompanyLinks.length,
    loadParseMs: endLoad - startLoad,
    graphBuildMs: graph.buildMs,
    queryMs: query.queryMs,
    totalMs: endLoad - startLoad + graph.buildMs + query.queryMs,
    queryTotal: query.total,
    runtimeBurden: {
      fileLoads: 1,
      sourceSplittingRequired: true,
      companyNameMapRequired: true,
      relationshipResolutionAtRuntime: true,
      missingReferenceValidationAtRuntime: true,
      appSpecificJoinLogic: true,
    },
  };
}

async function benchmarkTaggedSplitOnce() {
  const startLoad = performance.now();

  const companyNodes = await readJsonl(TAGGED_COMPANIES_PATH);
  const peopleNodes = await readJsonl(TAGGED_PEOPLE_PATH);

  const endLoad = performance.now();

  const graph = buildTaggedGraph([...companyNodes, ...peopleNodes]);
  const query = runTaggedQueries(graph);

  return {
    label: "Tagged Split JSONL",
    filesLoaded: 2,
    records: null,
    nodes: companyNodes.length + peopleNodes.length,
    bytesLoaded:
      fs.statSync(TAGGED_COMPANIES_PATH).size +
      fs.statSync(TAGGED_PEOPLE_PATH).size,
    missingCompanyLinks: graph.missingCompanyLinks.length,
    loadParseMs: endLoad - startLoad,
    graphBuildMs: graph.buildMs,
    queryMs: query.queryMs,
    totalMs: endLoad - startLoad + graph.buildMs + query.queryMs,
    queryTotal: query.total,
    runtimeBurden: {
      fileLoads: 2,
      sourceSplittingRequired: false,
      companyNameMapRequired: false,
      relationshipResolutionAtRuntime: "mechanical_anchor_resolution",
      missingReferenceValidationAtRuntime: true,
      appSpecificJoinLogic: false,
    },
  };
}

async function benchmarkTaggedMergedOnce() {
  const startLoad = performance.now();

  const nodes = await readJsonl(TAGGED_MERGED_PATH);

  const endLoad = performance.now();

  const graph = buildTaggedGraph(nodes);
  const query = runTaggedQueries(graph);

  return {
    label: "Tagged Merged JSONL",
    filesLoaded: 1,
    records: null,
    nodes: nodes.length,
    bytesLoaded: fs.statSync(TAGGED_MERGED_PATH).size,
    missingCompanyLinks: graph.missingCompanyLinks.length,
    loadParseMs: endLoad - startLoad,
    graphBuildMs: graph.buildMs,
    queryMs: query.queryMs,
    totalMs: endLoad - startLoad + graph.buildMs + query.queryMs,
    queryTotal: query.total,
    runtimeBurden: {
      fileLoads: 1,
      sourceSplittingRequired: false,
      companyNameMapRequired: false,
      relationshipResolutionAtRuntime: "mechanical_anchor_resolution",
      missingReferenceValidationAtRuntime: true,
      appSpecificJoinLogic: false,
    },
  };
}

function summarizeRuns(label, runs) {
  const first = runs[0];

  return {
    label,
    filesLoaded: first.filesLoaded,
    records: first.records,
    nodes: first.nodes,
    bytesLoaded: first.bytesLoaded,
    missingCompanyLinks: first.missingCompanyLinks,
    queryTotal: first.queryTotal,
    loadParseMs: summarizeMetric(runs.map((run) => run.loadParseMs)),
    graphBuildMs: summarizeMetric(runs.map((run) => run.graphBuildMs)),
    queryMs: summarizeMetric(runs.map((run) => run.queryMs)),
    totalMs: summarizeMetric(runs.map((run) => run.totalMs)),
    runtimeBurden: first.runtimeBurden,
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

function buildMarkdownReport(report) {
  const lanes = [
    report.rawSplit,
    report.rawMerged,
    report.taggedSplit,
    report.taggedMerged,
  ];

  const lines = [];

  lines.push("# People + Companies Benchmark");
  lines.push("");
  lines.push(`Generated: ${report.createdAt}`);
  lines.push("");
  lines.push("## Configuration");
  lines.push("");
  lines.push("| Metric | Value |");
  lines.push("|---|---:|");
  lines.push(`| Iterations | ${report.iterations.toLocaleString()} |`);
  lines.push(`| Query loops per run | ${report.queryLoops.toLocaleString()} |`);
  lines.push(`| Target company name | ${report.targetCompanyName} |`);
  lines.push(`| Target company anchor | ${report.targetCompanyAnchor} |`);
  lines.push("");
  lines.push("## Performance Results");
  lines.push("");
  lines.push("| Lane | Files | Records | Nodes | Bytes Loaded | Missing Links | Load + Parse Avg | Graph Build Avg | Query Avg | Total Avg |");
  lines.push("|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|");

  for (const lane of lanes) {
    lines.push(
      `| ${lane.label} | ${lane.filesLoaded} | ${formatNullable(
        lane.records,
      )} | ${formatNullable(lane.nodes)} | ${formatBytes(
        lane.bytesLoaded,
      )} | ${lane.missingCompanyLinks} | ${lane.loadParseMs.avgMs} ms | ${
        lane.graphBuildMs.avgMs
      } ms | ${lane.queryMs.avgMs} ms | ${lane.totalMs.avgMs} ms |`,
    );
  }

  lines.push("");
  lines.push("## Runtime Burden");
  lines.push("");
  lines.push("| Lane | File Loads | Source Split Required | Company Name Map Required | Runtime Relationship Resolution | Runtime Missing Ref Validation | App-Specific Join Logic |");
  lines.push("|---|---:|---|---|---|---|---|");

  for (const lane of lanes) {
    const burden = lane.runtimeBurden;

    lines.push(
      `| ${lane.label} | ${burden.fileLoads} | ${formatBurden(
        burden.sourceSplittingRequired,
      )} | ${formatBurden(
        burden.companyNameMapRequired,
      )} | ${formatBurden(
        burden.relationshipResolutionAtRuntime,
      )} | ${formatBurden(
        burden.missingReferenceValidationAtRuntime,
      )} | ${formatBurden(burden.appSpecificJoinLogic)} |`,
    );
  }

  lines.push("");
  lines.push("## Notes");
  lines.push("");
  lines.push("- Raw split JSONL represents the normal multi-file source case.");
  lines.push("- Raw merged JSONL gives raw JSONL a fair single-file baseline.");
  lines.push("- Tagged split JSONL tests the 4-tag source contract without merging.");
  lines.push("- Tagged merged JSONL tests the 4-tag source contract as one graph-like JSONL file.");
  lines.push("- This benchmark does not test compiled Relay artifacts yet.");
  lines.push("");

  return lines.join("\n");
}

function formatNullable(value) {
  if (value === null || value === undefined) return "N/A";
  return value.toLocaleString();
}

function formatBurden(value) {
  if (value === true) return "Yes";
  if (value === false) return "No";
  return String(value);
}

function printReport(report) {
  console.log("");
  console.log("People + Companies benchmark complete.");
  console.log("----------------------------------------");
  console.log(`Iterations:                 ${report.iterations.toLocaleString()}`);
  console.log(`Query loops per run:        ${report.queryLoops.toLocaleString()}`);
  console.log("");
  console.log(`Raw split total avg:        ${report.rawSplit.totalMs.avgMs} ms`);
  console.log(`Raw merged total avg:       ${report.rawMerged.totalMs.avgMs} ms`);
  console.log(`Tagged split total avg:     ${report.taggedSplit.totalMs.avgMs} ms`);
  console.log(`Tagged merged total avg:    ${report.taggedMerged.totalMs.avgMs} ms`);
  console.log("");
  console.log(`Raw split query avg:        ${report.rawSplit.queryMs.avgMs} ms`);
  console.log(`Raw merged query avg:       ${report.rawMerged.queryMs.avgMs} ms`);
  console.log(`Tagged split query avg:     ${report.taggedSplit.queryMs.avgMs} ms`);
  console.log(`Tagged merged query avg:    ${report.taggedMerged.queryMs.avgMs} ms`);
  console.log("");
  console.log(`JSON report:                ${REPORT_JSON_PATH}`);
  console.log(`Markdown report:            ${REPORT_MD_PATH}`);
  console.log("");
}

async function runBenchmark() {
  console.log("");
  console.log("Running People + Companies benchmark...");
  console.log("----------------------------------------");
  console.log(`Iterations:          ${iterations.toLocaleString()}`);
  console.log(`Query loops per run: ${queryLoops.toLocaleString()}`);
  console.log("");

  await benchmarkRawSplitOnce();
  await benchmarkRawMergedOnce();
  await benchmarkTaggedSplitOnce();
  await benchmarkTaggedMergedOnce();

  const rawSplitRuns = [];
  const rawMergedRuns = [];
  const taggedSplitRuns = [];
  const taggedMergedRuns = [];

  for (let i = 0; i < iterations; i++) {
    process.stdout.write(`Run ${i + 1}/${iterations}...\r`);

    rawSplitRuns.push(await benchmarkRawSplitOnce());
    rawMergedRuns.push(await benchmarkRawMergedOnce());
    taggedSplitRuns.push(await benchmarkTaggedSplitOnce());
    taggedMergedRuns.push(await benchmarkTaggedMergedOnce());
  }

  process.stdout.write("\n");

  const report = {
    createdAt: new Date().toISOString(),
    iterations,
    queryLoops,
    targetCompanyName: TARGET_COMPANY_NAME,
    targetCompanyAnchor: TARGET_COMPANY_ANCHOR,
    rawSplit: summarizeRuns("Raw Split JSONL", rawSplitRuns),
    rawMerged: summarizeRuns("Raw Merged JSONL", rawMergedRuns),
    taggedSplit: summarizeRuns("Tagged Split JSONL", taggedSplitRuns),
    taggedMerged: summarizeRuns("Tagged Merged JSONL", taggedMergedRuns),
  };

  fs.writeFileSync(REPORT_JSON_PATH, JSON.stringify(report, null, 2), "utf8");
  fs.writeFileSync(REPORT_MD_PATH, buildMarkdownReport(report), "utf8");

  printReport(report);
}

runBenchmark().catch((error) => {
  console.error("");
  console.error("Benchmark failed.");
  console.error(error);
  process.exit(1);
});