/**
 * Author: Project Owner
 * Date: 2026-05-21
 * Purpose:
 *   Convert the raw skate_reddit.jsonl dataset into RelayDB-style 4-tag JSONL.
 *
 *   Raw shape:
 *     {
 *       "text": "...",
 *       "meta": {
 *         "subreddit": "skateboarding",
 *         "created_utc": "1332652563"
 *       }
 *     }
 *
 *   4-tag output shape:
 *     {
 *       "#": "reddit_comment:skateboarding:00000001",
 *       "^": "reddit_comment",
 *       "@subreddit": "subreddit:skateboarding",
 *       "~source": "skate_reddit",
 *       "~created_utc": 1332652563,
 *       "~record_index": 1,
 *       "text": "..."
 *     }
 *
 * Usage:
 *   node scripts/convert-skate-reddit.js
 */

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { performance } = require("perf_hooks");

const INPUT_PATH = path.join(
  process.cwd(),
  "datasets",
  "raw",
  "skate_reddit.jsonl",
);

const OUTPUT_PATH = path.join(
  process.cwd(),
  "datasets",
  "tagged",
  "skate_reddit.4tag.jsonl",
);

const REPORT_PATH = path.join(
  process.cwd(),
  "reports",
  "skate_reddit.4tag.convert.report.json",
);

const SOURCE_NAME = "skate_reddit";

function ensureDirectory(filePath) {
  const dir = path.dirname(filePath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function padRecordNumber(value) {
  return String(value).padStart(8, "0");
}

function cleanAnchorPart(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function toUnixNumber(value) {
  const parsed = Number(value);

  if (Number.isNaN(parsed)) {
    return null;
  }

  return parsed;
}

function createSubredditAnchor(subreddit) {
  return `subreddit:${cleanAnchorPart(subreddit || "unknown")}`;
}

function createCommentAnchor(subreddit, recordIndex) {
  const subredditPart = cleanAnchorPart(subreddit || "unknown");
  return `reddit_comment:${subredditPart}:${padRecordNumber(recordIndex)}`;
}

function convertRecord(rawRecord, recordIndex) {
  const text = typeof rawRecord.text === "string" ? rawRecord.text : "";

  const meta =
    rawRecord.meta && typeof rawRecord.meta === "object" ? rawRecord.meta : {};

  const subreddit =
    typeof meta.subreddit === "string" && meta.subreddit.trim()
      ? meta.subreddit.trim()
      : "unknown";

  const createdUtc = toUnixNumber(meta.created_utc);

  const subredditAnchor = createSubredditAnchor(subreddit);

  return {
    "#": createCommentAnchor(subreddit, recordIndex),
    "^": "reddit_comment",
    "@subreddit": subredditAnchor,
    "~source": SOURCE_NAME,
    "~created_utc": createdUtc,
    "~record_index": recordIndex,
    text,
  };
}

function createSubredditNode(subreddit, count) {
  return {
    "#": createSubredditAnchor(subreddit),
    "^": "subreddit",
    "~source": SOURCE_NAME,
    "~name": subreddit,
    "~record_count": count,
  };
}

async function convertFile() {
  if (!fs.existsSync(INPUT_PATH)) {
    console.error(`Input file not found: ${INPUT_PATH}`);
    process.exit(1);
  }

  ensureDirectory(OUTPUT_PATH);
  ensureDirectory(REPORT_PATH);

  const start = performance.now();

  const inputStream = fs.createReadStream(INPUT_PATH, {
    encoding: "utf8",
  });

  const outputStream = fs.createWriteStream(OUTPUT_PATH, {
    encoding: "utf8",
  });

  const rl = readline.createInterface({
    input: inputStream,
    crlfDelay: Infinity,
  });

  const subredditCounts = new Map();

  const report = {
    inputPath: INPUT_PATH,
    outputPath: OUTPUT_PATH,
    sourceName: SOURCE_NAME,
    startedAt: new Date().toISOString(),

    totalLines: 0,
    convertedRecords: 0,
    invalidJsonLines: 0,
    blankLines: 0,

    commentNodes: 0,
    subredditNodes: 0,
    totalOutputNodes: 0,

    inputBytes: fs.statSync(INPUT_PATH).size,
    outputBytes: 0,

    errors: [],
  };

  for await (const line of rl) {
    report.totalLines += 1;

    const trimmed = line.trim();

    if (!trimmed) {
      report.blankLines += 1;
      continue;
    }

    try {
      const rawRecord = JSON.parse(trimmed);
      const recordIndex = report.convertedRecords + 1;

      const taggedRecord = convertRecord(rawRecord, recordIndex);
      const subredditAnchor = taggedRecord["@subreddit"];

      subredditCounts.set(
        subredditAnchor,
        (subredditCounts.get(subredditAnchor) || 0) + 1,
      );

      outputStream.write(`${JSON.stringify(taggedRecord)}\n`);

      report.convertedRecords += 1;
      report.commentNodes += 1;
    } catch (error) {
      report.invalidJsonLines += 1;

      if (report.errors.length < 25) {
        report.errors.push({
          line: report.totalLines,
          message: error.message,
          preview: trimmed.slice(0, 200),
        });
      }
    }
  }

  for (const [subredditAnchor, count] of subredditCounts.entries()) {
    const subredditName = subredditAnchor.replace(/^subreddit:/, "");
    const subredditNode = createSubredditNode(subredditName, count);

    outputStream.write(`${JSON.stringify(subredditNode)}\n`);
    report.subredditNodes += 1;
  }

  await new Promise((resolve) => outputStream.end(resolve));

  const end = performance.now();

  report.finishedAt = new Date().toISOString();
  report.convertMs = Number((end - start).toFixed(3));
  report.totalOutputNodes = report.commentNodes + report.subredditNodes;
  report.outputBytes = fs.statSync(OUTPUT_PATH).size;

  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), "utf8");

  printSummary(report);
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

function printSummary(report) {
  console.log("");
  console.log("4-tag conversion complete.");
  console.log("----------------------------------------");
  console.log(`Input:             ${report.inputPath}`);
  console.log(`Output:            ${report.outputPath}`);
  console.log(`Input size:        ${formatBytes(report.inputBytes)}`);
  console.log(`Output size:       ${formatBytes(report.outputBytes)}`);
  console.log(`Total lines:       ${report.totalLines.toLocaleString()}`);
  console.log(`Converted records: ${report.convertedRecords.toLocaleString()}`);
  console.log(`Comment nodes:     ${report.commentNodes.toLocaleString()}`);
  console.log(`Subreddit nodes:   ${report.subredditNodes.toLocaleString()}`);
  console.log(`Total nodes:       ${report.totalOutputNodes.toLocaleString()}`);
  console.log(`Invalid lines:     ${report.invalidJsonLines.toLocaleString()}`);
  console.log(`Convert time:      ${report.convertMs} ms`);
  console.log("");
  console.log(`Report:            ${REPORT_PATH}`);
  console.log("");
}

convertFile().catch((error) => {
  console.error("Conversion failed.");
  console.error(error);
  process.exit(1);
});