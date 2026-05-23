/**
 * Author: Kris Sherbondy
 * Date: 2026-05-22
 * Purpose:
 *   Profile a 4-tag JSONL dataset and generate a RelayDB columnar manifest.
 *
 *   v2 fixes:
 *     1. Prevents field collisions between @field and ~field.
 *     2. Preserves source kind in field IDs.
 *     3. Classifies nested objects as object instead of "[object Object]".
 *     4. Keeps relationship, attribute, anchor, and unknown fields separated.
 *
 * Usage:
 *   node scripts/relay-columnar/profile-columnar-manifest.js \
 *     datasets/generated/merged/people-companies.10000x100000.4tag.merged.jsonl \
 *     reports/relay-columnar/people-companies.10000x100000.columnar-manifest.v2.json
 */

const fs = require("fs");
const path = require("path");
const { performance } = require("perf_hooks");

const inputArg = process.argv[2];
const outputArg = process.argv[3];

const inputPath = inputArg
  ? path.resolve(process.cwd(), inputArg)
  : path.join(
      process.cwd(),
      "datasets",
      "generated",
      "merged",
      "people-companies.10000x100000.4tag.merged.jsonl",
    );

const outputPath = outputArg
  ? path.resolve(process.cwd(), outputArg)
  : path.join(
      process.cwd(),
      "reports",
      "relay-columnar",
      "people-companies.10000x100000.columnar-manifest.v2.json",
    );

main();

function main() {
  if (!fs.existsSync(inputPath)) {
    console.error(`Missing input file: ${inputPath}`);
    process.exit(1);
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  console.log("RelayDB Columnar Manifest Profiler v2");
  console.log("=====================================");
  console.log(`Input:  ${inputPath}`);
  console.log(`Output: ${outputPath}`);
  console.log("");

  const start = performance.now();
  const manifest = profileColumnarManifest(inputPath);
  const end = performance.now();

  fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  console.log("Profile Complete");
  console.log("----------------");
  console.log(`Profile time: ${formatMs(end - start)}`);
  console.log(`Topics:       ${Object.keys(manifest.topics).length}`);
  console.log(`Lines:        ${manifest.source.lineCount.toLocaleString()}`);
  console.log(`Bytes:        ${manifest.source.bytes.toLocaleString()}`);
  console.log("");
  console.log(`Wrote: ${outputPath}`);
}

function profileColumnarManifest(filePath) {
  const buffer = fs.readFileSync(filePath);

  const topicProfiles = new Map();

  let lineCount = 0;

  scanJsonlBuffer(buffer, (node) => {
    lineCount += 1;

    const topic = normalizeTopic(node["^"]);

    if (!topic) {
      return;
    }

    let topicProfile = topicProfiles.get(topic);

    if (!topicProfile) {
      topicProfile = createTopicProfile(topic);
      topicProfiles.set(topic, topicProfile);
    }

    topicProfile.count += 1;

    for (const [key, value] of Object.entries(node)) {
      if (key === "^") {
        continue;
      }

      const sourceKind = classifySourceKey(key);
      const fieldName = normalizeFieldName(key);
      const fieldId = createFieldId(sourceKind, fieldName);

      let fieldProfile = topicProfile.fields.get(fieldId);

      if (!fieldProfile) {
        fieldProfile = createFieldProfile({
          fieldId,
          fieldName,
          sourceKey: key,
          sourceKind,
        });

        topicProfile.fields.set(fieldId, fieldProfile);
      }

      updateFieldProfile(fieldProfile, value);
    }
  });

  const topics = {};

  for (const [topicName, topicProfile] of topicProfiles.entries()) {
    topics[topicName] = finalizeTopicProfile(topicProfile);
  }

  inferRelationshipTargets(topics);

  return {
    format: "relaydb-columnar-manifest",
    version: "0.2.0",
    generatedAt: new Date().toISOString(),
    source: {
      path: path.relative(process.cwd(), filePath),
      bytes: buffer.byteLength,
      lineCount,
    },
    topics,
    notes: [
      "This manifest is inferred from 4-tag JSONL source data.",
      "v2 separates attributes, relationships, anchors, and unknown keys to prevent field collisions.",
      "Nested objects are classified as object fields instead of being converted to strings.",
      "This is a profiling artifact, not yet a compiled .relay file header.",
    ],
  };
}

function createTopicProfile(topicName) {
  return {
    name: topicName,
    count: 0,
    fields: new Map(),
  };
}

function createFieldProfile({ fieldId, fieldName, sourceKey, sourceKind }) {
  return {
    fieldId,
    fieldName,
    sourceKey,
    sourceKind,

    count: 0,
    nullishCount: 0,

    observedTypes: new Set(),

    number: {
      count: 0,
      min: Infinity,
      max: -Infinity,
      integer: true,
    },

    string: {
      count: 0,
      minLength: Infinity,
      maxLength: 0,
      enumSamples: new Map(),
      uniqueSamplesOverflow: false,
    },

    boolean: {
      trueCount: 0,
      falseCount: 0,
    },

    object: {
      count: 0,
      keys: new Map(),
    },

    array: {
      count: 0,
      minLength: Infinity,
      maxLength: 0,
      itemTypeSamples: new Map(),
    },
  };
}

function updateFieldProfile(field, value) {
  field.count += 1;

  if (value === null || value === undefined || value === "") {
    field.nullishCount += 1;
    field.observedTypes.add("nullish");
    return;
  }

  if (Array.isArray(value)) {
    field.observedTypes.add("array");
    field.array.count += 1;
    field.array.minLength = Math.min(field.array.minLength, value.length);
    field.array.maxLength = Math.max(field.array.maxLength, value.length);

    for (const item of value.slice(0, 10)) {
      const itemType = getValueType(item);
      field.array.itemTypeSamples.set(
        itemType,
        (field.array.itemTypeSamples.get(itemType) || 0) + 1,
      );
    }

    return;
  }

  if (typeof value === "object") {
    field.observedTypes.add("object");
    field.object.count += 1;

    for (const objectKey of Object.keys(value)) {
      field.object.keys.set(objectKey, (field.object.keys.get(objectKey) || 0) + 1);
    }

    return;
  }

  if (typeof value === "boolean") {
    field.observedTypes.add("boolean");

    if (value) {
      field.boolean.trueCount += 1;
    } else {
      field.boolean.falseCount += 1;
    }

    return;
  }

  const numericValue = Number(value);
  const isNumeric =
    value !== "" &&
    value !== null &&
    value !== undefined &&
    Number.isFinite(numericValue) &&
    String(value).trim() !== "";

  if (isNumeric && isNumericLooking(value)) {
    field.observedTypes.add("number");
    field.number.count += 1;
    field.number.min = Math.min(field.number.min, numericValue);
    field.number.max = Math.max(field.number.max, numericValue);

    if (!Number.isInteger(numericValue)) {
      field.number.integer = false;
    }

    return;
  }

  const stringValue = String(value);

  field.observedTypes.add("string");
  field.string.count += 1;
  field.string.minLength = Math.min(field.string.minLength, stringValue.length);
  field.string.maxLength = Math.max(field.string.maxLength, stringValue.length);

  if (field.string.enumSamples.size < 256 || field.string.enumSamples.has(stringValue)) {
    field.string.enumSamples.set(
      stringValue,
      (field.string.enumSamples.get(stringValue) || 0) + 1,
    );
  } else {
    field.string.uniqueSamplesOverflow = true;
  }
}

function finalizeTopicProfile(topicProfile) {
  const fields = {};

  for (const [fieldId, fieldProfile] of topicProfile.fields.entries()) {
    fields[fieldId] = finalizeFieldProfile(fieldProfile, topicProfile.count);
  }

  return {
    count: topicProfile.count,
    recordIndex: {
      kind: "shared-topic-index",
      description: `All ${topicProfile.name} lanes align on this topic-local record index.`,
    },
    fields,
  };
}

function finalizeFieldProfile(field, topicCount) {
  const kind = inferFieldKind(field);
  const suggestedLane = suggestLane(field, kind);
  const searchable = shouldBeSearchable(field, kind);

  const result = {
    fieldId: field.fieldId,
    fieldName: field.fieldName,
    sourceKey: field.sourceKey,
    sourceKind: field.sourceKind,
    kind,
    count: field.count,
    coverage: Number((field.count / topicCount).toFixed(6)),
    nullishCount: field.nullishCount,
    searchable,
    suggestedLane,
    observedTypes: Array.from(field.observedTypes).sort(),
  };

  if (field.number.count > 0) {
    result.number = {
      count: field.number.count,
      min: field.number.min,
      max: field.number.max,
      integer: field.number.integer,
    };
  }

  if (field.string.count > 0) {
    const topValues = Array.from(field.string.enumSamples.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([value, count]) => ({ value, count }));

    result.string = {
      count: field.string.count,
      minLength: field.string.minLength === Infinity ? 0 : field.string.minLength,
      maxLength: field.string.maxLength,
      sampledCardinality: field.string.enumSamples.size,
      cardinalityOverflow: field.string.uniqueSamplesOverflow,
      topValues,
    };
  }

  if (field.boolean.trueCount > 0 || field.boolean.falseCount > 0) {
    result.boolean = {
      trueCount: field.boolean.trueCount,
      falseCount: field.boolean.falseCount,
    };
  }

  if (field.object.count > 0) {
    result.object = {
      count: field.object.count,
      sampledKeys: Array.from(field.object.keys.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([key, count]) => ({ key, count })),
    };
  }

  if (field.array.count > 0) {
    result.array = {
      count: field.array.count,
      minLength: field.array.minLength === Infinity ? 0 : field.array.minLength,
      maxLength: field.array.maxLength,
      sampledItemTypes: Array.from(field.array.itemTypeSamples.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([type, count]) => ({ type, count })),
    };
  }

  if (field.sourceKind === "anchor") {
    result.role = "anchor";
  }

  if (field.sourceKind === "relationship") {
    result.relationship = {
      target: inferTargetFromRelationshipName(field.fieldName),
      targetInferred: true,
    };
  }

  if (kind === "enum") {
    result.enum = {
      sampledCardinality: field.string.enumSamples.size,
      cardinalityOverflow: field.string.uniqueSamplesOverflow,
      suggestedDictionary: field.string.uniqueSamplesOverflow
        ? "string-table"
        : "enum-dictionary",
    };

    result.predicateBitsetCandidates = suggestEnumBitsets(field);
  }

  if (kind === "number") {
    result.numericPredicateCandidates = suggestNumericPredicates(field);
  }

  return result;
}

function inferFieldKind(field) {
  if (field.sourceKind === "anchor") return "anchor";
  if (field.sourceKind === "relationship") return "relationship";

  const types = field.observedTypes;

  if (types.has("object")) return "object";
  if (types.has("array")) return "array";

  if (types.has("number") && !types.has("string") && !types.has("boolean")) {
    return "number";
  }

  if (types.has("boolean") && !types.has("string") && !types.has("number")) {
    return "boolean";
  }

  if (types.has("string")) {
    const cardinality = field.string.enumSamples.size;
    const overflow = field.string.uniqueSamplesOverflow;
    const nonNullCount = field.string.count;

    const lowCardinality =
      !overflow &&
      cardinality > 0 &&
      (cardinality <= 64 || cardinality / Math.max(nonNullCount, 1) <= 0.05);

    if (lowCardinality) {
      return "enum";
    }

    return "string";
  }

  return "unknown";
}

function suggestLane(field, kind) {
  if (kind === "anchor") return "uint32-offset";
  if (kind === "relationship") return "uint32";
  if (kind === "boolean") return "bitset";
  if (kind === "object") return "payload-offset";
  if (kind === "array") return "payload-offset";

  if (kind === "enum") {
    const cardinality = field.string.enumSamples.size;

    if (cardinality <= 255) return "uint8";
    if (cardinality <= 65535) return "uint16";

    return "uint32";
  }

  if (kind === "number") {
    const min = field.number.min;
    const max = field.number.max;

    if (field.number.integer) {
      if (min >= 0 && max <= 255) return "uint8";
      if (min >= 0 && max <= 65535) return "uint16";
      if (min >= 0 && max <= 4294967295) return "uint32";
      if (min >= -128 && max <= 127) return "int8";
      if (min >= -32768 && max <= 32767) return "int16";
      if (min >= -2147483648 && max <= 2147483647) return "int32";
    }

    return "float64";
  }

  if (kind === "string") return "uint32-offset";

  return "unknown";
}

function shouldBeSearchable(field, kind) {
  if (field.sourceKind === "anchor") return true;
  if (field.sourceKind === "relationship") return true;
  if (kind === "number") return true;
  if (kind === "boolean") return true;
  if (kind === "enum") return true;

  return false;
}

function suggestNumericPredicates(field) {
  const suggestions = [];
  const fieldName = field.fieldName.toLowerCase();

  if (fieldName.includes("age")) {
    suggestions.push({
      name: `${field.fieldId}.under40`,
      operator: "<",
      value: 40,
      kind: "predicate-bitset",
    });
  }

  if (fieldName.includes("year") || fieldName.includes("founded")) {
    suggestions.push({
      name: `${field.fieldId}.recent`,
      operator: ">=",
      value: 2000,
      kind: "predicate-bitset",
    });
  }

  return suggestions;
}

function suggestEnumBitsets(field) {
  return Array.from(field.string.enumSamples.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 16)
    .map(([value, count]) => ({
      name: `${field.fieldId}.${sanitizePredicateName(value)}`,
      value,
      count,
      kind: "predicate-bitset",
    }));
}

function inferRelationshipTargets(topics) {
  const topicNames = new Set(Object.keys(topics));

  for (const topic of Object.values(topics)) {
    for (const field of Object.values(topic.fields)) {
      if (field.kind !== "relationship") {
        continue;
      }

      const inferred = inferTargetFromRelationshipName(field.fieldName);

      if (topicNames.has(inferred)) {
        field.relationship.target = inferred;
        field.relationship.targetInferred = true;
      } else {
        field.relationship.target = inferred;
        field.relationship.targetInferred = false;
        field.relationship.warning =
          "Target was inferred from the relationship name but was not found as a topic.";
      }
    }
  }
}

function classifySourceKey(key) {
  if (key === "#") return "anchor";
  if (key === "^") return "topic";
  if (key.startsWith("@")) return "relationship";
  if (key.startsWith("~")) return "attribute";

  return "unknown";
}

function normalizeTopic(value) {
  if (!value) return null;

  return String(value).trim();
}

function normalizeFieldName(key) {
  if (key === "#") return "anchor";
  if (key === "^") return "topic";

  if (key.startsWith("@") || key.startsWith("~")) {
    return key.slice(1);
  }

  return key;
}

function createFieldId(sourceKind, fieldName) {
  if (sourceKind === "anchor") return "anchor:anchor";
  if (sourceKind === "relationship") return `relationship:${fieldName}`;
  if (sourceKind === "attribute") return `attribute:${fieldName}`;
  if (sourceKind === "topic") return "topic:topic";

  return `unknown:${fieldName}`;
}

function inferTargetFromRelationshipName(fieldName) {
  return fieldName.replace(/Id$/i, "").replace(/Anchor$/i, "");
}

function sanitizePredicateName(value) {
  return String(value)
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function isNumericLooking(value) {
  if (typeof value === "number") return true;

  if (typeof value !== "string") {
    return false;
  }

  return /^-?\d+(\.\d+)?$/.test(value.trim());
}

function getValueType(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";

  return typeof value;
}

function scanJsonlBuffer(buffer, callback) {
  let start = 0;

  for (let index = 0; index <= buffer.length; index += 1) {
    const isEnd = index === buffer.length;
    const isNewline = !isEnd && buffer[index] === 10;

    if (!isEnd && !isNewline) {
      continue;
    }

    let end = index;

    if (end > start && buffer[end - 1] === 13) {
      end -= 1;
    }

    if (end > start) {
      const node = JSON.parse(buffer.toString("utf8", start, end));
      callback(node, start, end);
    }

    start = index + 1;
  }
}

function formatMs(ms) {
  return `${ms.toFixed(6)} ms`;
}