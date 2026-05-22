/**
 * Author: Kris Sherbondy
 * Date: 2026-05-22
 * Purpose:
 *   Benchmark a raw JSONL scan against the same query shape used by the
 *   RelayDB compact reader benchmarks.
 *
 *   This gives RelayDB a simple external baseline:
 *
 *     "What if we just read/parse/scan the source JSONL directly?"
 *
 *   Query:
 *     active agriculture people under 40
 */

const fs = require("fs");
const path = require("path");
const { performance } = require("perf_hooks");

const warmupIterations = Number(process.argv[2] || 10);
const measuredIterations = Number(process.argv[3] || 100);
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

  console.log("Raw JSONL Scan Benchmark");
  console.log("========================");
  console.log(`Dataset: ${filePath}`);
  console.log(`Question: ${question}`);
  console.log(`Warmup iterations: ${warmupIterations}`);
  console.log(`Measured iterations: ${measuredIterations}`);
  console.log("");

  forceGcIfAvailable();

  const beforeLoadMemory = process.memoryUsage();
  const loadStart = performance.now();

  const text = fs.readFileSync(filePath, "utf8");
  const lines = text.split(/\r?\n/).filter(Boolean);

  const loadEnd = performance.now();
  const afterLoadMemory = process.memoryUsage();

  console.log("Load");
  console.log("----");
  console.log(`Load time: ${formatMs(loadEnd - loadStart)}`);
  console.log(`Bytes:     ${Buffer.byteLength(text).toLocaleString()}`);
  console.log(`Lines:     ${lines.length.toLocaleString()}`);
  console.log("");

  console.log("Memory Delta During Load");
  console.log("------------------------");
  printMemoryDelta(getMemoryDelta(beforeLoadMemory, afterLoadMemory));
  console.log("");

  const correctness = rawJsonlScan(lines);

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
  warmup("rawJsonlScan", warmupIterations, () => rawJsonlScan(lines));
  console.log("");

  console.log("Benchmark");
  console.log("---------");
  benchmark("rawJsonlScan", measuredIterations, () => rawJsonlScan(lines));
}

function rawJsonlScan(lines) {
  const companiesByAnchor = new Map();

  const candidateCounts = {
    topicMatches: 0,
    statusMatches: 0,
    ageMatches: 0,
    industryMatches: 0,
    finalMatches: 0,
  };

  let firstMatch = null;

  /*
   * Pass 1:
   * Build company lookup.
   *
   * This intentionally parses JSON every scan. That is the baseline we are
   * testing against: repeated direct source scanning.
   */
  for (const line of lines) {
    const node = JSON.parse(line);

    if (node["^"] !== "company") {
      continue;
    }

    companiesByAnchor.set(node["#"], {
      anchor: node["#"],
      name: node["~name"] || null,
      industry: node["~industry"] || null,
      founded: node["~founded"] || null,
      headquarters: {
        city: node["~city"] || null,
        state: node["~state"] || null,
        country: node["~country"] || null,
      },
    });
  }

  /*
   * Pass 2:
   * Scan people and check the relationship against company industry.
   */
  for (const line of lines) {
    const node = JSON.parse(line);

    if (node["^"] !== "person") {
      continue;
    }

    candidateCounts.topicMatches += 1;

    if (node["~status"] !== "active") {
      continue;
    }

    candidateCounts.statusMatches += 1;

    const age = Number(node["~age"]);

    if (!(age < 40)) {
      continue;
    }

    candidateCounts.ageMatches += 1;

    const companyAnchor = node["@company"];
    const company = companiesByAnchor.get(companyAnchor);

    if (!company || company.industry !== "Agriculture") {
      continue;
    }

    candidateCounts.industryMatches += 1;
    candidateCounts.finalMatches += 1;

    if (!firstMatch) {
      firstMatch = {
        answer: node["~fullName"] || node["~name"] || node["#"],
        data: {
          person: {
            anchor: node["#"],
            name: node["~fullName"] || node["~name"] || null,
            age,
            status: node["~status"] || null,
            salary: Number(node["~salary"]) || null,
            location: {
              city: node["~city"] || null,
              state: node["~state"] || null,
              country: node["~country"] || null,
            },
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