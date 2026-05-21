/**
 * Author: Project Owner
 * Date: 2026-05-21
 * Purpose:
 *   Analyze the LOC burden of the torture query benchmark.
 *
 *   This separates:
 *     - shared benchmark harness
 *     - raw JSONL runtime logic
 *     - tagged JSONL runtime logic
 *     - report/output code
 *
 * Usage:
 *   node scripts/analyze-torture-loc.js
 */

const fs = require("fs");
const path = require("path");

const TARGET_PATH = path.join(
  process.cwd(),
  "scripts",
  "torture-query-people-companies.js",
);

if (!fs.existsSync(TARGET_PATH)) {
  console.error(`Missing file: ${TARGET_PATH}`);
  process.exit(1);
}

const source = fs.readFileSync(TARGET_PATH, "utf8");
const lines = source.split(/\r?\n/);

const buckets = {
  rawRuntimeLogic: {
    description: "Raw JSONL graph building, raw query functions, raw benchmark lanes",
    patterns: [
      /^function buildRawGraph/,
      /^function buildRawGraphFromMerged/,
      /^function raw/,
      /^function runRaw/,
      /^async function benchmarkRaw/,
    ],
  },
  taggedRuntimeLogic: {
    description: "Tagged graph building, tagged query functions, tagged benchmark lanes",
    patterns: [
      /^function buildTaggedGraph/,
      /^function tagged/,
      /^function runTagged/,
      /^async function benchmarkTagged/,
    ],
  },
  sharedHarness: {
    description: "Shared file reading, utilities, validation, summaries, timing setup",
    patterns: [
      /^function ensure/,
      /^async function readJsonl/,
      /^function getRawFullName/,
      /^function getTaggedFullName/,
      /^function rawLocationKey/,
      /^function arrayIntersectionCount/,
      /^function compareResults/,
      /^function buildRunResult/,
      /^function summarize/,
      /^function round/,
      /^function format/,
      /^async function runBenchmark/,
    ],
  },
  reporting: {
    description: "Markdown report generation and console output",
    patterns: [
      /^function buildMarkdownReport/,
      /^function printReport/,
    ],
  },
};

function isBlank(line) {
  return line.trim() === "";
}

function isCommentOnly(line) {
  const trimmed = line.trim();

  return (
    trimmed.startsWith("//") ||
    trimmed.startsWith("*") ||
    trimmed.startsWith("/*") ||
    trimmed.startsWith("*/")
  );
}

function findFunctions(lines) {
  const functions = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (
      line.startsWith("function ") ||
      line.startsWith("async function ")
    ) {
      const start = i;
      let braceDepth = 0;
      let seenOpeningBrace = false;

      for (let j = i; j < lines.length; j++) {
        for (const char of lines[j]) {
          if (char === "{") {
            braceDepth += 1;
            seenOpeningBrace = true;
          }

          if (char === "}") {
            braceDepth -= 1;
          }
        }

        if (seenOpeningBrace && braceDepth === 0) {
          functions.push({
            nameLine: line.trim(),
            startLine: start + 1,
            endLine: j + 1,
            lines: lines.slice(start, j + 1),
          });

          i = j;
          break;
        }
      }
    }
  }

  return functions;
}

function countLogicalLines(functionLines) {
  return functionLines.filter((line) => {
    return !isBlank(line) && !isCommentOnly(line);
  }).length;
}

function classifyFunction(fn) {
  for (const [bucketName, bucket] of Object.entries(buckets)) {
    for (const pattern of bucket.patterns) {
      if (pattern.test(fn.nameLine)) {
        return bucketName;
      }
    }
  }

  return "unclassified";
}

function countWholeFileLogicalLoc(lines) {
  return lines.filter((line) => !isBlank(line) && !isCommentOnly(line)).length;
}

function main() {
  const functions = findFunctions(lines);

  const report = {
    file: TARGET_PATH,
    physicalLines: lines.length,
    logicalLoc: countWholeFileLogicalLoc(lines),
    functionCount: functions.length,
    buckets: {},
    unclassifiedFunctions: [],
  };

  for (const bucketName of Object.keys(buckets)) {
    report.buckets[bucketName] = {
      description: buckets[bucketName].description,
      functions: [],
      logicalLoc: 0,
    };
  }

  report.buckets.unclassified = {
    description: "Functions not matched by the current classifier",
    functions: [],
    logicalLoc: 0,
  };

  for (const fn of functions) {
    const bucketName = classifyFunction(fn);
    const logicalLoc = countLogicalLines(fn.lines);

    const entry = {
      nameLine: fn.nameLine,
      startLine: fn.startLine,
      endLine: fn.endLine,
      logicalLoc,
    };

    report.buckets[bucketName].functions.push(entry);
    report.buckets[bucketName].logicalLoc += logicalLoc;
  }

  const bucketTotal = Object.values(report.buckets).reduce(
    (sum, bucket) => sum + bucket.logicalLoc,
    0,
  );

  report.bucketedFunctionLoc = bucketTotal;

  const outputPath = path.join(
    process.cwd(),
    "reports",
    "people-companies.torture-query.loc-analysis.json",
  );

  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), "utf8");

  printSummary(report, outputPath);
}

function printSummary(report, outputPath) {
  console.log("");
  console.log("Torture query LOC analysis complete.");
  console.log("------------------------------------");
  console.log(`Physical lines:        ${report.physicalLines}`);
  console.log(`Logical LOC:           ${report.logicalLoc}`);
  console.log(`Function count:        ${report.functionCount}`);
  console.log("");

  for (const [bucketName, bucket] of Object.entries(report.buckets)) {
    console.log(`${bucketName}:`);
    console.log(`  LOC:       ${bucket.logicalLoc}`);
    console.log(`  Functions: ${bucket.functions.length}`);
    console.log("");
  }

  console.log(`Report: ${outputPath}`);
  console.log("");
}

main();