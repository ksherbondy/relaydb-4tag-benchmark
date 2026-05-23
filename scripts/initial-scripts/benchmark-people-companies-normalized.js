/**
 * Author: Kris Sherbondy
 * Date: 2026-05-21
 * Purpose:
 *   Benchmark optimized normalized runtime graphs for:
 *
 *     1. Raw merged JSONL normalized with schema-specific logic
 *     2. Tagged merged JSONL normalized through the generic 4-tag contract
 *
 *   This does not overwrite existing tests.
 *
 * Usage:
 *   node scripts/benchmark-people-companies-normalized.js
 *
 * Optional:
 *   node scripts/benchmark-people-companies-normalized.js 100 10000
 */

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { performance } = require("perf_hooks");

const {
  buildRawPeopleCompaniesNormalizedGraph,
} = require("./raw-people-companies-normalized-graph");

const {
  buildFourTagNormalizedRuntimeGraph,
  buildPeopleCompaniesViewFromFourTagGraph,
} = require("./four-tag-normalized-runtime-graph");

const DEFAULT_ITERATIONS = 100;
const DEFAULT_QUERY_SUITES_PER_RUN = 10_000;

const iterations = Number(process.argv[2] || DEFAULT_ITERATIONS);
const querySuitesPerRun = Number(
  process.argv[3] || DEFAULT_QUERY_SUITES_PER_RUN,
);

const RAW_MERGED_PATH = path.join(
  process.cwd(),
  "datasets",
  "merged",
  "people-companies.raw.merged.jsonl",
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
  "people-companies.normalized.benchmark.json",
);

const REPORT_MD_PATH = path.join(
  process.cwd(),
  "reports",
  "people-companies.normalized.benchmark.md",
);

ensureFileExists(RAW_MERGED_PATH);
ensureFileExists(TAGGED_MERGED_PATH);
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

function splitRawMerged(records) {
  const companies = [];
  const people = [];

  for (const record of records) {
    if (record.__record_type === "company") {
      companies.push(record);
    }

    if (record.__record_type === "person") {
      people.push(record);
    }
  }

  return {
    companies,
    people,
  };
}

function intersectionCount(left, right) {
  let count = 0;
  const rightSet = new Set(right);

  for (const value of left) {
    if (rightSet.has(value)) {
      count += 1;
    }
  }

  return count;
}

function peopleHomeStateDiffersFromCompanyState(graph) {
  let count = 0;

  for (const person of graph.people) {
    const company = graph.companies[person.companyId];

    if (!company) continue;

    if (person.state && company.state && person.state !== company.state) {
      count += 1;
    }
  }

  return count;
}

function householdsWithMultipleCompanies(graph) {
  let count = 0;

  for (const personIds of graph.peopleByHouseholdId.values()) {
    const companyIds = new Set();

    for (const personId of personIds) {
      const person = graph.people[personId];

      if (person.companyId !== -1) {
        companyIds.add(person.companyId);
      }
    }

    if (companyIds.size > 1) {
      count += 1;
    }
  }

  return count;
}

function peopleSharingInterestsWithCoworkers(graph) {
  const resultPersonIds = new Set();

  for (const personIds of graph.peopleByCompanyId.values()) {
    for (let i = 0; i < personIds.length; i++) {
      const left = graph.people[personIds[i]];

      for (let j = i + 1; j < personIds.length; j++) {
        const right = graph.people[personIds[j]];

        if (intersectionCount(left.interestIds, right.interestIds) > 0) {
          resultPersonIds.add(left.id);
          resultPersonIds.add(right.id);
        }
      }
    }
  }

  return resultPersonIds.size;
}

function companiesWithEmployeesAcrossMultipleHomeStates(graph) {
  let count = 0;

  for (const personIds of graph.peopleByCompanyId.values()) {
    const states = new Set();

    for (const personId of personIds) {
      const state = graph.people[personId].state;

      if (state) {
        states.add(state);
      }
    }

    if (states.size > 1) {
      count += 1;
    }
  }

  return count;
}

function activeUnder40AtOldCompanies(graph) {
  let count = 0;

  for (const person of graph.people) {
    const company = graph.companies[person.companyId];

    if (!company) continue;

    if (
      person.status === "active" &&
      person.age < 40 &&
      company.founded < 2000
    ) {
      count += 1;
    }
  }

  return count;
}

function highEarnersInIndustriesAcrossMultipleStates(graph) {
  let count = 0;

  for (const person of graph.people) {
    if (person.salary <= 100_000) continue;

    const company = graph.companies[person.companyId];

    if (!company) continue;

    const relatedCompanyIds =
      graph.companiesByIndustryId.get(company.industryId) || [];

    const states = new Set();

    for (const companyId of relatedCompanyIds) {
      const state = graph.companies[companyId].state;

      if (state) {
        states.add(state);
      }
    }

    if (states.size > 1) {
      count += 1;
    }
  }

  return count;
}

function householdDiversitySummaries(graph) {
  let count = 0;

  for (const personIds of graph.peopleByHouseholdId.values()) {
    const companies = new Set();
    const industries = new Set();
    const interests = new Set();

    for (const personId of personIds) {
      const person = graph.people[personId];
      const company = graph.companies[person.companyId];

      if (person.companyId !== -1) {
        companies.add(person.companyId);
      }

      if (company) {
        industries.add(company.industryId);
      }

      for (const interestId of person.interestIds) {
        interests.add(interestId);
      }
    }

    count += 1;
  }

  return count;
}

function contextPackets(graph) {
  let count = 0;

  for (const person of graph.people) {
    const coworkers = graph.peopleByCompanyId.get(person.companyId) || [];
    const household = graph.peopleByHouseholdId.get(person.householdId) || [];

    let coworkersSharingInterests = 0;

    for (const coworkerId of coworkers) {
      if (coworkerId === person.id) continue;

      const coworker = graph.people[coworkerId];

      if (intersectionCount(person.interestIds, coworker.interestIds) > 0) {
        coworkersSharingInterests += 1;
      }
    }

    const packet = {
      person: person.fullName,
      company: graph.companies[person.companyId]?.name || null,
      householdMembers: household.length,
      coworkers: coworkers.length,
      coworkersSharingInterests,
    };

    if (packet) {
      count += 1;
    }
  }

  return count;
}

function runQuerySuite(graph) {
  return {
    peopleHomeStateDiffersFromCompanyState:
      peopleHomeStateDiffersFromCompanyState(graph),
    householdsWithMultipleCompanies: householdsWithMultipleCompanies(graph),
    peopleSharingInterestsWithCoworkers:
      peopleSharingInterestsWithCoworkers(graph),
    companiesWithEmployeesAcrossMultipleHomeStates:
      companiesWithEmployeesAcrossMultipleHomeStates(graph),
    activeUnder40AtOldCompanies: activeUnder40AtOldCompanies(graph),
    highEarnersInIndustriesAcrossMultipleStates:
      highEarnersInIndustriesAcrossMultipleStates(graph),
    householdDiversitySummaries: householdDiversitySummaries(graph),
    contextPackets: contextPackets(graph),
  };
}

function runRepeatedQuerySuites(graph) {
  let lastResult = null;

  const start = performance.now();

  for (let i = 0; i < querySuitesPerRun; i++) {
    lastResult = runQuerySuite(graph);
  }

  const end = performance.now();

  return {
    queryMs: end - start,
    result: lastResult,
  };
}

async function benchmarkRawNormalizedOnce() {
  const loadStart = performance.now();
  const records = await readJsonl(RAW_MERGED_PATH);
  const loadEnd = performance.now();

  const splitStart = performance.now();
  const { companies, people } = splitRawMerged(records);
  const splitEnd = performance.now();

  const normalizeStart = performance.now();
  const graph = buildRawPeopleCompaniesNormalizedGraph(companies, people);
  const normalizeEnd = performance.now();

  const query = runRepeatedQuerySuites(graph);

  return {
    label: "Raw Normalized Runtime Graph",
    records: records.length,
    nodes: null,
    bytesLoaded: fs.statSync(RAW_MERGED_PATH).size,
    missingLinks: graph.missingCompanyLinks.length,
    loadParseMs: loadEnd - loadStart,
    splitMs: splitEnd - splitStart,
    normalizeMs: normalizeEnd - normalizeStart,
    queryMs: query.queryMs,
    totalMs:
      loadEnd -
      loadStart +
      splitEnd -
      splitStart +
      normalizeEnd -
      normalizeStart +
      query.queryMs,
    result: query.result,
    optimizationModel:
      "schema-specific raw normalizer for people + companies dataset",
  };
}

async function benchmarkTaggedNormalizedOnce() {
  const loadStart = performance.now();
  const nodes = await readJsonl(TAGGED_MERGED_PATH);
  const loadEnd = performance.now();

  const genericStart = performance.now();
  const genericGraph = buildFourTagNormalizedRuntimeGraph(nodes);
  const genericEnd = performance.now();

  const viewStart = performance.now();
  const graph = buildPeopleCompaniesViewFromFourTagGraph(genericGraph);
  const viewEnd = performance.now();

  const query = runRepeatedQuerySuites(graph);

  return {
    label: "Tagged Normalized Runtime Graph",
    records: null,
    nodes: nodes.length,
    bytesLoaded: fs.statSync(TAGGED_MERGED_PATH).size,
    missingLinks: graph.missingCompanyLinks.length,
    loadParseMs: loadEnd - loadStart,
    splitMs: 0,
    normalizeMs: genericEnd - genericStart + viewEnd - viewStart,
    genericNormalizeMs: genericEnd - genericStart,
    viewBuildMs: viewEnd - viewStart,
    queryMs: query.queryMs,
    totalMs:
      loadEnd -
      loadStart +
      genericEnd -
      genericStart +
      viewEnd -
      viewStart +
      query.queryMs,
    result: query.result,
    optimizationModel:
      "generic 4-tag graph normalizer plus people-companies view",
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

function summarizeRuns(label, runs) {
  const first = runs[0];

  return {
    label,
    records: first.records,
    nodes: first.nodes,
    bytesLoaded: first.bytesLoaded,
    missingLinks: first.missingLinks,
    result: first.result,
    optimizationModel: first.optimizationModel,
    loadParseMs: summarizeMetric(runs.map((run) => run.loadParseMs)),
    splitMs: summarizeMetric(runs.map((run) => run.splitMs)),
    normalizeMs: summarizeMetric(runs.map((run) => run.normalizeMs)),
    queryMs: summarizeMetric(runs.map((run) => run.queryMs)),
    totalMs: summarizeMetric(runs.map((run) => run.totalMs)),
  };
}

function round(value) {
  return Number(value.toFixed(6));
}

function compareResults(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
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
  const lines = [];

  lines.push("# People + Companies Normalized Runtime Benchmark");
  lines.push("");
  lines.push(`Generated: ${report.createdAt}`);
  lines.push("");
  lines.push("## Configuration");
  lines.push("");
  lines.push("| Metric | Value |");
  lines.push("|---|---:|");
  lines.push(`| Iterations | ${report.iterations.toLocaleString()} |`);
  lines.push(
    `| Query suites per run | ${report.querySuitesPerRun.toLocaleString()} |`,
  );
  lines.push("| Queries per suite | 8 |");
  lines.push("");
  lines.push("## Performance Results");
  lines.push("");
  lines.push(
    "| Lane | Records | Nodes | Bytes Loaded | Missing Links | Load + Parse Avg | Split Avg | Normalize Avg | Query Avg | Total Avg |",
  );
  lines.push("|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|");

  for (const lane of [report.rawNormalized, report.taggedNormalized]) {
    lines.push(
      `| ${lane.label} | ${lane.records ?? "N/A"} | ${
        lane.nodes ?? "N/A"
      } | ${formatBytes(lane.bytesLoaded)} | ${lane.missingLinks} | ${
        lane.loadParseMs.avgMs
      } ms | ${lane.splitMs.avgMs} ms | ${lane.normalizeMs.avgMs} ms | ${
        lane.queryMs.avgMs
      } ms | ${lane.totalMs.avgMs} ms |`,
    );
  }

  lines.push("");
  lines.push("## Result Equivalence");
  lines.push("");
  lines.push("| Comparison | Match? |");
  lines.push("|---|---|");
  lines.push(
    `| Raw Normalized vs Tagged Normalized | ${report.equivalence.rawNormalizedVsTaggedNormalized} |`,
  );

  lines.push("");
  lines.push("## Query Result Counts");
  lines.push("");
  lines.push("| Query | Raw Normalized | Tagged Normalized |");
  lines.push("|---|---:|---:|");

  for (const queryName of Object.keys(report.rawNormalized.result)) {
    lines.push(
      `| ${queryName} | ${report.rawNormalized.result[queryName]} | ${report.taggedNormalized.result[queryName]} |`,
    );
  }

  lines.push("");
  lines.push("## Optimization Model");
  lines.push("");
  lines.push("| Lane | Model |");
  lines.push("|---|---|");
  lines.push(
    `| Raw Normalized | ${report.rawNormalized.optimizationModel} |`,
  );
  lines.push(
    `| Tagged Normalized | ${report.taggedNormalized.optimizationModel} |`,
  );

  lines.push("");
  lines.push("## Notes");
  lines.push("");
  lines.push("- This benchmark gives raw JSONL a fair optimized lane.");
  lines.push("- Raw normalization is schema-specific.");
  lines.push("- Tagged normalization starts from the generic 4-tag contract.");
  lines.push("- This still does not test compiled `.relay` artifacts.");
  lines.push("");

  return lines.join("\n");
}

function printReport(report) {
  console.log("");
  console.log("People + Companies normalized benchmark complete.");
  console.log("-------------------------------------------------");
  console.log(`Iterations:                    ${report.iterations}`);
  console.log(`Query suites per run:          ${report.querySuitesPerRun}`);
  console.log("");
  console.log(
    `Raw normalized total avg:       ${report.rawNormalized.totalMs.avgMs} ms`,
  );
  console.log(
    `Tagged normalized total avg:    ${report.taggedNormalized.totalMs.avgMs} ms`,
  );
  console.log("");
  console.log(
    `Raw normalized query avg:       ${report.rawNormalized.queryMs.avgMs} ms`,
  );
  console.log(
    `Tagged normalized query avg:    ${report.taggedNormalized.queryMs.avgMs} ms`,
  );
  console.log("");
  console.log(
    `Raw normalized normalize avg:   ${report.rawNormalized.normalizeMs.avgMs} ms`,
  );
  console.log(
    `Tagged normalized normalize avg:${report.taggedNormalized.normalizeMs.avgMs} ms`,
  );
  console.log("");
  console.log("Result equivalence:");
  console.log(
    `Raw Normalized vs Tagged Normalized: ${report.equivalence.rawNormalizedVsTaggedNormalized}`,
  );
  console.log("");
  console.log(`JSON report:                   ${REPORT_JSON_PATH}`);
  console.log(`Markdown report:               ${REPORT_MD_PATH}`);
  console.log("");
}

async function runBenchmark() {
  console.log("");
  console.log("Running People + Companies normalized benchmark...");
  console.log("-------------------------------------------------");
  console.log(`Iterations:           ${iterations}`);
  console.log(`Query suites per run: ${querySuitesPerRun}`);
  console.log("");

  await benchmarkRawNormalizedOnce();
  await benchmarkTaggedNormalizedOnce();

  const rawRuns = [];
  const taggedRuns = [];

  for (let i = 0; i < iterations; i++) {
    process.stdout.write(`Run ${i + 1}/${iterations}...\r`);

    rawRuns.push(await benchmarkRawNormalizedOnce());
    taggedRuns.push(await benchmarkTaggedNormalizedOnce());
  }

  process.stdout.write("\n");

  const report = {
    createdAt: new Date().toISOString(),
    iterations,
    querySuitesPerRun,
    rawNormalized: summarizeRuns(
      "Raw Normalized Runtime Graph",
      rawRuns,
    ),
    taggedNormalized: summarizeRuns(
      "Tagged Normalized Runtime Graph",
      taggedRuns,
    ),
  };

  report.equivalence = {
    rawNormalizedVsTaggedNormalized: compareResults(
      report.rawNormalized.result,
      report.taggedNormalized.result,
    ),
  };

  fs.writeFileSync(REPORT_JSON_PATH, JSON.stringify(report, null, 2), "utf8");
  fs.writeFileSync(REPORT_MD_PATH, buildMarkdownReport(report), "utf8");

  printReport(report);
}

runBenchmark().catch((error) => {
  console.error("");
  console.error("Normalized benchmark failed.");
  console.error(error);
  process.exit(1);
});