/**
 * Author: Project Owner
 * Date: 2026-05-21
 * Purpose:
 *   Stream-profile large JSONL datasets before converting them into the
 *   RelayDB 4-tag format. This script measures file size, line count,
 *   JSON validity, field frequency, type frequency, nesting depth,
 *   possible ID fields, possible relationship fields, and metadata-like fields.
 *
 * Usage:
 *   node scripts/profile-jsonl.js datasets/raw/skate_reddit.jsonl
 */

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { performance } = require("perf_hooks");

const inputPath = process.argv[2];

if (!inputPath) {
  console.error("Missing input file.");
  console.error("Usage: node scripts/profile-jsonl.js datasets/raw/file.jsonl");
  process.exit(1);
}

if (!fs.existsSync(inputPath)) {
  console.error(`Input file not found: ${inputPath}`);
  process.exit(1);
}

const reportsDir = path.join(process.cwd(), "reports");

if (!fs.existsSync(reportsDir)) {
  fs.mkdirSync(reportsDir, { recursive: true });
}

const fileName = path.basename(inputPath);
const reportBaseName = fileName.replace(/\.jsonl$/i, "");
const jsonReportPath = path.join(reportsDir, `${reportBaseName}.profile.json`);
const markdownReportPath = path.join(reportsDir, `${reportBaseName}.profile.md`);

const MAX_EXAMPLES_PER_FIELD = 5;
const MAX_UNIQUE_VALUES_PER_FIELD = 25;
const MAX_SAMPLE_RECORDS = 5;

const stats = {
  inputPath,
  fileName,
  fileSizeBytes: fs.statSync(inputPath).size,
  startedAt: new Date().toISOString(),

  totalLines: 0,
  validJsonLines: 0,
  invalidJsonLines: 0,
  blankLines: 0,

  totalTopLevelFieldsSeen: 0,
  maxDepth: 0,

  recordSizeBytes: {
    min: null,
    max: 0,
    total: 0,
    average: 0,
  },

  topLevelFields: {},
  allFields: {},
  possibleIdFields: {},
  possibleRelationshipFields: {},
  possibleMetadataFields: {},

  sampleRecords: [],
  parseErrors: [],
};

function getOrCreateFieldBucket(target, fieldPath) {
  if (!target[fieldPath]) {
    target[fieldPath] = {
      count: 0,
      types: {},
      examples: [],
      uniqueValues: [],
      uniqueValueOverflow: false,
    };
  }

  return target[fieldPath];
}

function getValueType(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function addExample(bucket, value) {
  if (bucket.examples.length >= MAX_EXAMPLES_PER_FIELD) return;

  const safeValue = shortenValue(value);
  bucket.examples.push(safeValue);
}

function addUniqueValue(bucket, value) {
  if (
    value === null ||
    typeof value === "object" ||
    typeof value === "function" ||
    typeof value === "undefined"
  ) {
    return;
  }

  const safeValue = String(value);

  if (bucket.uniqueValues.includes(safeValue)) return;

  if (bucket.uniqueValues.length >= MAX_UNIQUE_VALUES_PER_FIELD) {
    bucket.uniqueValueOverflow = true;
    return;
  }

  bucket.uniqueValues.push(safeValue);
}

function shortenValue(value) {
  if (typeof value === "string") {
    if (value.length > 140) {
      return `${value.slice(0, 140)}...`;
    }

    return value;
  }

  if (typeof value === "number" || typeof value === "boolean" || value === null) {
    return value;
  }

  try {
    const json = JSON.stringify(value);

    if (json.length > 180) {
      return `${json.slice(0, 180)}...`;
    }

    return JSON.parse(json);
  } catch {
    return String(value);
  }
}

function updateFieldStats(target, fieldPath, value) {
  const bucket = getOrCreateFieldBucket(target, fieldPath);
  const valueType = getValueType(value);

  bucket.count += 1;
  bucket.types[valueType] = (bucket.types[valueType] || 0) + 1;

  addExample(bucket, value);
  addUniqueValue(bucket, value);
}

function inspectObject(value, currentPath = "", depth = 1) {
  if (depth > stats.maxDepth) {
    stats.maxDepth = depth;
  }

  if (!value || typeof value !== "object") return;

  if (Array.isArray(value)) {
    for (const item of value.slice(0, 10)) {
      inspectObject(item, `${currentPath}[]`, depth + 1);
    }

    return;
  }

  for (const [key, childValue] of Object.entries(value)) {
    const fieldPath = currentPath ? `${currentPath}.${key}` : key;

    updateFieldStats(stats.allFields, fieldPath, childValue);
    classifyField(fieldPath, key, childValue);

    if (childValue && typeof childValue === "object") {
      inspectObject(childValue, fieldPath, depth + 1);
    }
  }
}

function classifyField(fieldPath, key, value) {
  const lowerKey = key.toLowerCase();
  const lowerPath = fieldPath.toLowerCase();

  const idPattern =
    lowerKey === "id" ||
    lowerKey.endsWith("_id") ||
    lowerKey.endsWith("id") ||
    lowerKey === "uuid" ||
    lowerKey === "guid" ||
    lowerPath.includes(".id");

  const relationshipPattern =
    lowerKey.includes("parent") ||
    lowerKey.includes("child") ||
    lowerKey.includes("author") ||
    lowerKey.includes("user") ||
    lowerKey.includes("owner") ||
    lowerKey.includes("reply") ||
    lowerKey.includes("thread") ||
    lowerKey.includes("post") ||
    lowerKey.includes("comment") ||
    lowerKey.includes("link") ||
    lowerKey.includes("url") ||
    lowerKey.includes("ref") ||
    lowerKey.includes("target") ||
    lowerKey.includes("source") ||
    lowerKey.includes("from") ||
    lowerKey.includes("to");

  const metadataPattern =
    lowerKey.includes("created") ||
    lowerKey.includes("updated") ||
    lowerKey.includes("time") ||
    lowerKey.includes("date") ||
    lowerKey.includes("timestamp") ||
    lowerKey.includes("subreddit") ||
    lowerKey.includes("category") ||
    lowerKey.includes("topic") ||
    lowerKey.includes("tag") ||
    lowerKey.includes("score") ||
    lowerKey.includes("count") ||
    lowerKey.includes("type") ||
    lowerKey.includes("status") ||
    lowerKey.includes("source") ||
    lowerKey.includes("meta");

  if (idPattern) {
    updateFieldStats(stats.possibleIdFields, fieldPath, value);
  }

  if (relationshipPattern) {
    updateFieldStats(stats.possibleRelationshipFields, fieldPath, value);
  }

  if (metadataPattern) {
    updateFieldStats(stats.possibleMetadataFields, fieldPath, value);
  }
}

function updateRecordSizeStats(line) {
  const size = Buffer.byteLength(line, "utf8");

  if (stats.recordSizeBytes.min === null || size < stats.recordSizeBytes.min) {
    stats.recordSizeBytes.min = size;
  }

  if (size > stats.recordSizeBytes.max) {
    stats.recordSizeBytes.max = size;
  }

  stats.recordSizeBytes.total += size;
}

async function profileJsonl() {
  const start = performance.now();

  const stream = fs.createReadStream(inputPath, {
    encoding: "utf8",
  });

  const rl = readline.createInterface({
    input: stream,
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    stats.totalLines += 1;

    const trimmed = line.trim();

    if (!trimmed) {
      stats.blankLines += 1;
      continue;
    }

    updateRecordSizeStats(trimmed);

    try {
      const record = JSON.parse(trimmed);

      stats.validJsonLines += 1;

      if (stats.sampleRecords.length < MAX_SAMPLE_RECORDS) {
        stats.sampleRecords.push(record);
      }

      if (record && typeof record === "object" && !Array.isArray(record)) {
        const topLevelKeys = Object.keys(record);
        stats.totalTopLevelFieldsSeen += topLevelKeys.length;

        for (const key of topLevelKeys) {
          updateFieldStats(stats.topLevelFields, key, record[key]);
        }

        inspectObject(record);
      }
    } catch (error) {
      stats.invalidJsonLines += 1;

      if (stats.parseErrors.length < 25) {
        stats.parseErrors.push({
          line: stats.totalLines,
          error: error.message,
          preview: trimmed.slice(0, 200),
        });
      }
    }
  }

  const end = performance.now();

  stats.finishedAt = new Date().toISOString();
  stats.profileMs = Number((end - start).toFixed(3));

  stats.recordSizeBytes.average =
    stats.validJsonLines > 0
      ? Number((stats.recordSizeBytes.total / stats.validJsonLines).toFixed(3))
      : 0;

  stats.averageTopLevelFields =
    stats.validJsonLines > 0
      ? Number((stats.totalTopLevelFieldsSeen / stats.validJsonLines).toFixed(3))
      : 0;

  stats.validJsonRatio =
    stats.totalLines > 0
      ? Number((stats.validJsonLines / stats.totalLines).toFixed(6))
      : 0;

  writeReports(stats);
  printSummary(stats);
}

function sortFieldBuckets(fieldBuckets) {
  return Object.fromEntries(
    Object.entries(fieldBuckets).sort((a, b) => b[1].count - a[1].count),
  );
}

function writeReports(reportStats) {
  const cleanStats = {
    ...reportStats,
    topLevelFields: sortFieldBuckets(reportStats.topLevelFields),
    allFields: sortFieldBuckets(reportStats.allFields),
    possibleIdFields: sortFieldBuckets(reportStats.possibleIdFields),
    possibleRelationshipFields: sortFieldBuckets(
      reportStats.possibleRelationshipFields,
    ),
    possibleMetadataFields: sortFieldBuckets(reportStats.possibleMetadataFields),
  };

  fs.writeFileSync(jsonReportPath, JSON.stringify(cleanStats, null, 2), "utf8");
  fs.writeFileSync(markdownReportPath, buildMarkdownReport(cleanStats), "utf8");
}

function buildMarkdownReport(reportStats) {
  const lines = [];

  lines.push(`# JSONL Profile Report: ${reportStats.fileName}`);
  lines.push("");
  lines.push(`Generated: ${reportStats.finishedAt}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`| Metric | Value |`);
  lines.push(`|---|---:|`);
  lines.push(`| File size | ${formatBytes(reportStats.fileSizeBytes)} |`);
  lines.push(`| Total lines | ${reportStats.totalLines.toLocaleString()} |`);
  lines.push(`| Valid JSON lines | ${reportStats.validJsonLines.toLocaleString()} |`);
  lines.push(`| Invalid JSON lines | ${reportStats.invalidJsonLines.toLocaleString()} |`);
  lines.push(`| Blank lines | ${reportStats.blankLines.toLocaleString()} |`);
  lines.push(`| Valid JSON ratio | ${reportStats.validJsonRatio} |`);
  lines.push(`| Profile time | ${reportStats.profileMs} ms |`);
  lines.push(`| Max nesting depth | ${reportStats.maxDepth} |`);
  lines.push(`| Avg top-level fields | ${reportStats.averageTopLevelFields} |`);
  lines.push(`| Avg record size | ${reportStats.recordSizeBytes.average} bytes |`);
  lines.push("");

  lines.push("## Top-Level Fields");
  lines.push("");
  lines.push(buildFieldTable(reportStats.topLevelFields, 25));
  lines.push("");

  lines.push("## Possible ID Fields");
  lines.push("");
  lines.push(buildFieldTable(reportStats.possibleIdFields, 25));
  lines.push("");

  lines.push("## Possible Relationship Fields");
  lines.push("");
  lines.push(buildFieldTable(reportStats.possibleRelationshipFields, 25));
  lines.push("");

  lines.push("## Possible Metadata Fields");
  lines.push("");
  lines.push(buildFieldTable(reportStats.possibleMetadataFields, 25));
  lines.push("");

  if (reportStats.parseErrors.length > 0) {
    lines.push("## Parse Errors");
    lines.push("");

    for (const err of reportStats.parseErrors) {
      lines.push(`- Line ${err.line}: ${err.error}`);
    }

    lines.push("");
  }

  lines.push("## Sample Records");
  lines.push("");

  for (const [index, record] of reportStats.sampleRecords.entries()) {
    lines.push(`### Sample ${index + 1}`);
    lines.push("");
    lines.push("```json");
    lines.push(JSON.stringify(record, null, 2));
    lines.push("```");
    lines.push("");
  }

  return lines.join("\n");
}

function buildFieldTable(fieldBuckets, limit) {
  const entries = Object.entries(fieldBuckets).slice(0, limit);

  if (entries.length === 0) {
    return "_None detected._";
  }

  const lines = [];

  lines.push("| Field | Count | Types | Example |");
  lines.push("|---|---:|---|---|");

  for (const [field, bucket] of entries) {
    const types = Object.entries(bucket.types)
      .map(([type, count]) => `${type}:${count}`)
      .join(", ");

    const example =
      bucket.examples.length > 0
        ? inlineCode(JSON.stringify(bucket.examples[0]))
        : "";

    lines.push(
      `| ${escapePipes(field)} | ${bucket.count.toLocaleString()} | ${escapePipes(
        types,
      )} | ${example} |`,
    );
  }

  return lines.join("\n");
}

function escapePipes(value) {
  return String(value).replace(/\|/g, "\\|");
}

function inlineCode(value) {
  if (!value) return "";

  const short = value.length > 100 ? `${value.slice(0, 100)}...` : value;
  return `<code>${short.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</code>`;
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

function printSummary(reportStats) {
  console.log("");
  console.log("JSONL profile complete.");
  console.log("----------------------------------------");
  console.log(`File:              ${reportStats.fileName}`);
  console.log(`Size:              ${formatBytes(reportStats.fileSizeBytes)}`);
  console.log(`Lines:             ${reportStats.totalLines.toLocaleString()}`);
  console.log(`Valid JSON lines:  ${reportStats.validJsonLines.toLocaleString()}`);
  console.log(`Invalid lines:     ${reportStats.invalidJsonLines.toLocaleString()}`);
  console.log(`Profile time:      ${reportStats.profileMs} ms`);
  console.log(`Max depth:         ${reportStats.maxDepth}`);
  console.log(`Avg fields:        ${reportStats.averageTopLevelFields}`);
  console.log("");
  console.log(`JSON report:       ${jsonReportPath}`);
  console.log(`Markdown report:   ${markdownReportPath}`);
  console.log("");
}

profileJsonl().catch((error) => {
  console.error("Profile failed.");
  console.error(error);
  process.exit(1);
});