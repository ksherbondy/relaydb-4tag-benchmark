/**
 * Author: Kris Sherbondy
 * Date: 2026-05-22
 * Purpose:
 *   Benchmark a normalized JavaScript object graph against the same query
 *   shape used by the RelayDB compact reader benchmarks.
 *
 *   This is a fairer JS baseline than repeated raw JSONL parsing because it:
 *     1. Reads the JSONL file once.
 *     2. Parses each node once.
 *     3. Builds reusable lookup structures.
 *     4. Queries the preloaded graph repeatedly.
 *
 *   Query:
 *     active agriculture people under 40
 */

const fs = require("fs");
const path = require("path");
const { performance } = require("perf_hooks");

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
      "people-companies.10000x100000.4tag.merged.jsonl",
    );

const question = "active agriculture people under 40";

main();

function main() {
  if (!fs.existsSync(filePath)) {
    console.error(`Missing file: ${filePath}`);
    process.exit(1);
  }

  console.log("Normalized JS Graph Benchmark");
  console.log("=============================");
  console.log(`Dataset: ${filePath}`);
  console.log(`Question: ${question}`);
  console.log(`Warmup iterations: ${warmupIterations}`);
  console.log(`Measured iterations: ${measuredIterations}`);
  console.log("");

  forceGcIfAvailable();

  const beforeLoadMemory = process.memoryUsage();
  const loadStart = performance.now();

  const graph = loadNormalizedGraph(filePath);

  const loadEnd = performance.now();
  const afterLoadMemory = process.memoryUsage();

  console.log("Load / Normalize");
  console.log("----------------");
  console.log(`Load time: ${formatMs(loadEnd - loadStart)}`);
  console.log(`Bytes:     ${graph.bytes.toLocaleString()}`);
  console.log(`Lines:     ${graph.lineCount.toLocaleString()}`);
  console.log(`People:    ${graph.people.length.toLocaleString()}`);
  console.log(`Companies: ${graph.companiesByAnchor.size.toLocaleString()}`);
  console.log("");

  console.log("Memory Delta During Load");
  console.log("------------------------");
  printMemoryDelta(getMemoryDelta(beforeLoadMemory, afterLoadMemory));
  console.log("");

  const correctness = queryNormalizedGraph(graph);

  console.log("Correctness");
  console.log("-----------");
  console.log(`Answer:   ${correctness.answer}`);
  console.log(`Company:  ${correctness.data?.company?.name || null}`);
  console.log(`Industry: ${correctness.data?.company?.industry || null}`);
  console.log("");

  console.log("Candidate Counts");
  console.log("----------------");
  console.log(correctness.candidateCounts);
  console.log("");

  console.log("Warmup");
  console.log("------");
  warmup("normalizedGraph", warmupIterations, () => queryNormalizedGraph(graph));
  console.log("");

  console.log("Benchmark");
  console.log("---------");
  benchmark("normalizedGraph", measuredIterations, () => queryNormalizedGraph(graph));
}

function loadNormalizedGraph(inputPath) {
  const text = fs.readFileSync(inputPath, "utf8");
  const lines = text.split(/\r?\n/).filter(Boolean);

  const companiesByAnchor = new Map();
  const people = [];

  for (const line of lines) {
    const node = JSON.parse(line);
    const topic = node["^"];

    if (topic === "company") {
      companiesByAnchor.set(node["#"], {
        anchor: node["#"],
        name: node["~name"] || null,
        industry: node["~industry"] || null,
        founded: toNumberOrNull(node["~founded"]),
        headquarters: {
          city: node["~city"] || null,
          state: node["~state"] || null,
          country: node["~country"] || null,
        },
      });

      continue;
    }

    if (topic === "person") {
      people.push({
        anchor: node["#"],
        name: getPersonDisplayName(node),
        age: Number(node["~age"]),
        status: node["~status"] || null,
        salary: toNumberOrNull(node["~salary"]),
        companyAnchor: node["@company"] || null,
        location: {
          city: node["~city"] || null,
          state: node["~state"] || null,
          country: node["~country"] || null,
        },
      });
    }
  }

  return {
    bytes: Buffer.byteLength(text),
    lineCount: lines.length,
    companiesByAnchor,
    people,
  };
}

function queryNormalizedGraph(graph) {
  const candidateCounts = {
    topicMatches: 0,
    statusMatches: 0,
    ageMatches: 0,
    industryMatches: 0,
    finalMatches: 0,
  };

  let firstMatch = null;

  for (const person of graph.people) {
    candidateCounts.topicMatches += 1;

    if (person.status !== "active") {
      continue;
    }

    candidateCounts.statusMatches += 1;

    if (!(person.age < 40)) {
      continue;
    }

    candidateCounts.ageMatches += 1;

    const company = graph.companiesByAnchor.get(person.companyAnchor);

    if (!company || company.industry !== "Agriculture") {
      continue;
    }

    candidateCounts.industryMatches += 1;
    candidateCounts.finalMatches += 1;

    if (!firstMatch) {
      firstMatch = {
        answer: person.name || person.anchor,
        data: {
          person: {
            anchor: person.anchor,
            name: person.name,
            age: person.age,
            status: person.status,
            salary: person.salary,
            location: person.location,
          },
          company,
        },
      };
    }
  }

  if (!firstMatch) {
    return {
      answer: null,
      data: null,
      candidateCounts,
    };
  }

  return {
    ...firstMatch,
    candidateCounts,
  };
}

function getPersonDisplayName(node) {
  if (node["~fullName"]) return node["~fullName"];
  if (node["~name"]) return node["~name"];

  const firstName = node["~firstName"] || node["~first_name"] || node["~first"];
  const lastName = node["~lastName"] || node["~last_name"] || node["~last"];

  if (firstName && lastName) {
    return `${firstName} ${lastName}`;
  }

  if (firstName) return firstName;
  if (lastName) return lastName;

  return node["#"];
}

function toNumberOrNull(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number) ? number : null;
}

function warmup(label, iterations, fn) {
  let blackhole = 0;

  for (let index = 0; index < iterations; index += 1) {
    blackhole += consume(fn());
  }

  console.log(`${label.padEnd(18)} blackhole: ${blackhole}`);
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
    `${label.padEnd(18)} total: ${formatMs(totalMs)} | avg: ${formatMs(
      avgMs,
    )} | ops/sec: ${opsPerSecond.toFixed(3)} | blackhole: ${blackhole}`,
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

function formatMs(ms) {
  return `${ms.toFixed(6)} ms`;
}

function forceGcIfAvailable() {
  if (typeof global.gc === "function") {
    global.gc();
  }
}