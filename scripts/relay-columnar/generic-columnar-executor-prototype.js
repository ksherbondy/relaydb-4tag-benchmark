/**
 * Author: Kris Sherbondy
 * Date: 2026-05-22
 * Purpose:
 *   Prototype a generic manifest-driven RelayDB columnar executor.
 *
 *   This takes the hardcoded v2 columnar bitset idea and starts moving it toward:
 *
 *     manifest -> registry -> plan -> lanes -> bitsets -> hydrate
 *
 *   Query:
 *     active agriculture people under 40
 *
 * Usage:
 *   node --expose-gc scripts/relay-columnar/generic-columnar-executor-prototype.js \
 *     1000 10000 \
 *     datasets/generated/merged/people-companies.10000x100000.4tag.merged.jsonl \
 *     reports/relay-columnar/people-companies.10000x100000.columnar-manifest.v2.json
 */

const fs = require("fs");
const path = require("path");
const { performance } = require("perf_hooks");

const INVALID_INDEX = 0xffffffff;

const warmupIterations = Number(process.argv[2] || 1000);
const measuredIterations = Number(process.argv[3] || 10000);

const datasetPath = process.argv[4]
  ? path.resolve(process.cwd(), process.argv[4])
  : path.join(
      process.cwd(),
      "datasets",
      "generated",
      "merged",
      "people-companies.10000x100000.4tag.merged.jsonl",
    );

const manifestPath = process.argv[5]
  ? path.resolve(process.cwd(), process.argv[5])
  : path.join(
      process.cwd(),
      "reports",
      "relay-columnar",
      "people-companies.10000x100000.columnar-manifest.v2.json",
    );



function main() {
  if (!fs.existsSync(datasetPath)) {
    console.error(`Missing dataset: ${datasetPath}`);
    process.exit(1);
  }

  if (!fs.existsSync(manifestPath)) {
    console.error(`Missing manifest: ${manifestPath}`);
    process.exit(1);
  }

  console.log("RelayDB Generic Columnar Executor Prototype");
  console.log("===========================================");
  console.log(`Dataset:  ${datasetPath}`);
  console.log(`Manifest: ${manifestPath}`);
  console.log(`Question: active agriculture people under 40`);
  console.log(`Warmup iterations: ${warmupIterations}`);
  console.log(`Measured iterations: ${measuredIterations}`);
  console.log("");

  forceGcIfAvailable();

  const beforeOpenMemory = process.memoryUsage();
  const openStart = performance.now();

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const registry = LaneRegistry.fromManifest(manifest);

  const plan = registry.planQuery({
    topic: "person",
    predicates: [
      {
        fieldId: "attribute:status",
        operator: "eq",
        value: "active",
      },
      {
        fieldId: "attribute:age",
        operator: "lt",
        value: 40,
      },
      {
        relationship: {
          fieldId: "relationship:company",
          targetTopic: "company",
          targetFieldId: "attribute:industry",
        },
        operator: "eq",
        value: "Agriculture",
      },
    ],
    hydrate: true,
    limit: 1,
  });

  const db = buildGenericColumnarRuntime({
  datasetPath,
  manifest,
  registry,
  requiredPlan: plan,
});

forceGcIfAvailable();

const openEnd = performance.now();
const afterOpenMemory = process.memoryUsage();

  console.log("Open / Build Generic Runtime");
  console.log("----------------------------");
  console.log(`Open time:  ${formatMs(openEnd - openStart)}`);
  console.log(`Bytes:      ${db.stats.bytes.toLocaleString()}`);
  console.log(`Lines:      ${db.stats.lineCount.toLocaleString()}`);
  console.log(`Topics:     ${registry.listTopics().length}`);
  console.log(`People:     ${db.topicCounts.person.toLocaleString()}`);
  console.log(`Companies:  ${db.topicCounts.company.toLocaleString()}`);
  console.log("");

  console.log("Memory Delta During Open");
  console.log("------------------------");
  printMemoryDelta(getMemoryDelta(beforeOpenMemory, afterOpenMemory));
  console.log("");

  console.log("Query Plan");
  console.log("----------");
  console.log(JSON.stringify(plan, null, 2));
  console.log("");

  const correctness = executePlanDebug(db, plan, { hydrateLimit: 1 });

  console.log("Correctness");
  console.log("-----------");
  console.log(`Answer:   ${correctness.results[0]?.answer || null}`);
  console.log(`Company:  ${correctness.results[0]?.data?.company?.name || null}`);
  console.log(`Industry: ${correctness.results[0]?.data?.company?.industry || null}`);
  console.log("");

  console.log("Candidate Counts");
  console.log("----------------");
  console.log(correctness.candidateCounts);
  console.log("");

  console.log("Warmup");
  console.log("------");
  warmup("answerOnly", warmupIterations, () => executePlanAnswerOnly(db, plan));
  warmup("debugStyle", warmupIterations, () =>
    executePlanDebug(db, plan, { hydrateLimit: 10 }),
  );
  console.log("");

  console.log("Benchmark");
  console.log("---------");
  benchmark("answerOnly", measuredIterations, () => executePlanAnswerOnly(db, plan));
  benchmark("debugStyle", measuredIterations, () =>
    executePlanDebug(db, plan, { hydrateLimit: 10 }),
  );
}

class LaneRegistry {
  constructor(manifest) {
    this.manifest = manifest;
    this.topics = new Map();
    this.lanes = new Map();
    this.relationships = new Map();
    this.predicates = new Map();

    this.#build();
  }

  static fromManifest(manifest) {
    return new LaneRegistry(manifest);
  }

  #build() {
    for (const [topicName, topicSpec] of Object.entries(this.manifest.topics || {})) {
      this.topics.set(topicName, topicSpec);

      for (const [fieldId, fieldSpec] of Object.entries(topicSpec.fields || {})) {
        const laneKey = createLaneKey(topicName, fieldId);

        const laneSpec = {
          topic: topicName,
          fieldId,
          fieldName: fieldSpec.fieldName,
          sourceKey: fieldSpec.sourceKey,
          sourceKind: fieldSpec.sourceKind,
          kind: fieldSpec.kind,
          searchable: fieldSpec.searchable === true,
          suggestedLane: fieldSpec.suggestedLane,
          count: fieldSpec.count,
          coverage: fieldSpec.coverage,
          raw: fieldSpec,
        };

        this.lanes.set(laneKey, laneSpec);

        if (fieldSpec.kind === "relationship") {
          const target = fieldSpec.relationship?.target || null;

          this.relationships.set(laneKey, {
            ...laneSpec,
            target,
            targetFound: target ? this.topics.has(target) : false,
            warning: fieldSpec.relationship?.warning || null,
          });
        }

        for (const predicate of collectPredicates(fieldSpec)) {
          const predicateKey = createPredicateKey(topicName, predicate.name);

          this.predicates.set(predicateKey, {
            topic: topicName,
            fieldId,
            fieldName: fieldSpec.fieldName,
            sourceKind: fieldSpec.sourceKind,
            laneKey,
            ...predicate,
          });
        }
      }
    }
  }

  listTopics() {
    return Array.from(this.topics.keys()).sort();
  }

  getTopic(topicName) {
    const topic = this.topics.get(topicName);

    if (!topic) {
      throw new Error(`Unknown topic: ${topicName}`);
    }

    return topic;
  }

  getLaneSpec(topicName, fieldId) {
    const lane = this.lanes.get(createLaneKey(topicName, fieldId));

    if (!lane) {
      throw new Error(`Unknown lane: ${topicName}.${fieldId}`);
    }

    return lane;
  }

  listPredicateCandidates(topicName) {
    this.getTopic(topicName);

    return Array.from(this.predicates.values())
      .filter((predicate) => predicate.topic === topicName)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  findPredicate(topicName, fieldId, operator, value) {
    const candidates = this.listPredicateCandidates(topicName).filter(
      (predicate) => predicate.fieldId === fieldId,
    );

    for (const predicate of candidates) {
      if (predicate.operator && predicate.operator === operator && predicate.value === value) {
        return predicate;
      }

      if (
        operator === "eq" &&
        Object.prototype.hasOwnProperty.call(predicate, "value") &&
        predicate.value === value
      ) {
        return predicate;
      }
    }

    return null;
  }

  planQuery(query) {
    const topic = query.topic;
    this.getTopic(topic);

    const steps = [];

    for (const predicate of query.predicates || []) {
      if (predicate.relationship) {
        steps.push(this.#planRelationshipPredicate(topic, predicate));
      } else {
        steps.push(this.#planDirectPredicate(topic, predicate));
      }
    }

    return {
      kind: "relaydb-columnar-query-plan",
      topic,
      executionModel: "bitset-first",
      limit: query.limit ?? null,
      hydrate: query.hydrate === true,
      steps,
      finalOperation: {
        type: "bitset-and",
        inputs: steps.map((step) => step.outputBitset),
      },
      output: {
        type: query.hydrate === true ? "hydrated-records" : "record-indexes",
        topic,
      },
    };
  }

  #planDirectPredicate(topic, predicate) {
    const lane = this.getLaneSpec(topic, predicate.fieldId);
    const precomputed = this.findPredicate(
      topic,
      predicate.fieldId,
      predicate.operator,
      predicate.value,
    );

    if (precomputed) {
      return {
        type: "direct-predicate",
        topic,
        fieldId: predicate.fieldId,
        operator: predicate.operator,
        value: predicate.value,
        lane: summarizeLane(lane),
        strategy: "precomputed-predicate-bitset",
        predicateName: precomputed.name,
        outputBitset: `${topic}.${precomputed.name}`,
      };
    }

    return {
      type: "direct-predicate",
      topic,
      fieldId: predicate.fieldId,
      operator: predicate.operator,
      value: predicate.value,
      lane: summarizeLane(lane),
      strategy: "scan-lane-build-runtime-bitset",
      outputBitset: `${topic}.${predicate.fieldId}.${predicate.operator}.${sanitizePredicateName(
        predicate.value,
      )}`,
    };
  }

  #planRelationshipPredicate(sourceTopic, predicate) {
    const rel = predicate.relationship;

    const relationshipLane = this.getLaneSpec(sourceTopic, rel.fieldId);
    const targetLane = this.getLaneSpec(rel.targetTopic, rel.targetFieldId);

    const targetPredicate = this.findPredicate(
      rel.targetTopic,
      rel.targetFieldId,
      predicate.operator,
      predicate.value,
    );

    return {
      type: "relationship-predicate",
      sourceTopic,
      relationshipFieldId: rel.fieldId,
      targetTopic: rel.targetTopic,
      targetFieldId: rel.targetFieldId,
      operator: predicate.operator,
      value: predicate.value,
      relationshipLane: summarizeLane(relationshipLane),
      targetLane: summarizeLane(targetLane),
      targetPredicate: targetPredicate
        ? {
            strategy: "precomputed-target-bitset",
            predicateName: targetPredicate.name,
            bitset: `${rel.targetTopic}.${targetPredicate.name}`,
          }
        : {
            strategy: "scan-target-lane-build-runtime-bitset",
          },
      strategy: "derive-source-bitset-through-relationship",
      outputBitset: `${sourceTopic}.${rel.fieldId}.${rel.targetFieldId}.${sanitizePredicateName(
        predicate.value,
      )}`,
    };
  }
}

function buildGenericColumnarRuntime({ datasetPath, manifest, registry, requiredPlan }) {
  const buffer = fs.readFileSync(datasetPath);

  const topicNames = registry.listTopics();
  const topicCounts = {};

  for (const topicName of topicNames) {
    topicCounts[topicName] = manifest.topics[topicName].count;
  }

  const topicRuntime = {};
  const anchorIndexes = new Map();

  for (const topicName of topicNames) {
    const count = topicCounts[topicName];

    topicRuntime[topicName] = {
      payloadStarts: new Uint32Array(count),
      payloadEnds: new Uint32Array(count),
      anchors: new Array(count),
      lanes: new Map(),
      enumDictionaries: new Map(),
      bitsets: new Map(),
      nextIndex: 0,
    };

    const fields = manifest.topics[topicName].fields || {};

    for (const [fieldId, fieldSpec] of Object.entries(fields)) {
      if (!isRequiredField(requiredPlan, topicName, fieldId)) {
        continue;
      }

      const lane = createLaneForField(fieldSpec, count);

      if (lane) {
        topicRuntime[topicName].lanes.set(fieldId, lane);
      }

      if (fieldSpec.kind === "enum") {
        topicRuntime[topicName].enumDictionaries.set(fieldId, {
          valueToId: new Map(),
          idToValue: ["unknown"],
        });
      }
    }
  }

  let lineCount = 0;

  scanJsonlBuffer(buffer, (node, start, end) => {
    lineCount += 1;

    const topic = node["^"];
    const runtime = topicRuntime[topic];

    if (!runtime) {
      return;
    }

    const index = runtime.nextIndex;
    runtime.nextIndex += 1;

    runtime.payloadStarts[index] = start;
    runtime.payloadEnds[index] = end;
    runtime.anchors[index] = node["#"];

    if (node["#"]) {
      anchorIndexes.set(node["#"], {
        topic,
        index,
      });
    }

    const fields = manifest.topics[topic].fields || {};

    for (const [fieldId, fieldSpec] of Object.entries(fields)) {
      if (!runtime.lanes.has(fieldId)) {
        continue;
      }

      const lane = runtime.lanes.get(fieldId);
      const rawValue = node[fieldSpec.sourceKey];

      writeLaneValue({
        runtime,
        fieldId,
        fieldSpec,
        lane,
        index,
        rawValue,
      });
    }
  });

  resolveRelationshipLanes({
    topicRuntime,
    manifest,
    anchorIndexes,
    requiredPlan,
  });

  buildRequiredBitsets({
    topicRuntime,
    requiredPlan,
  });

  return {
    buffer,
    manifest,
    registry,
    topicRuntime,
    topicCounts,
    stats: {
      bytes: buffer.byteLength,
      lineCount,
    },
  };
}

function isRequiredField(plan, topicName, fieldId) {
  for (const step of plan.steps) {
    if (step.type === "direct-predicate") {
      if (step.topic === topicName && step.fieldId === fieldId) {
        return true;
      }
    }

    if (step.type === "relationship-predicate") {
      if (step.sourceTopic === topicName && step.relationshipFieldId === fieldId) {
        return true;
      }

      if (step.targetTopic === topicName && step.targetFieldId === fieldId) {
        return true;
      }
    }
  }

  return false;
}

function createLaneForField(fieldSpec, count) {
  if (fieldSpec.kind === "number") {
    return createTypedArray(fieldSpec.suggestedLane, count);
  }

  if (fieldSpec.kind === "enum") {
    return createTypedArray(fieldSpec.suggestedLane, count);
  }

  if (fieldSpec.kind === "relationship") {
    return {
      rawAnchors: new Array(count),
      indexes: new Uint32Array(count),
    };
  }

  return null;
}

function createTypedArray(type, count) {
  if (type === "uint8") return new Uint8Array(count);
  if (type === "uint16") return new Uint16Array(count);
  if (type === "uint32") return new Uint32Array(count);
  if (type === "int8") return new Int8Array(count);
  if (type === "int16") return new Int16Array(count);
  if (type === "int32") return new Int32Array(count);
  if (type === "float64") return new Float64Array(count);

  throw new Error(`Unsupported lane type: ${type}`);
}

function writeLaneValue({ runtime, fieldId, fieldSpec, lane, index, rawValue }) {
  if (fieldSpec.kind === "number") {
    lane[index] = toNumberOrZero(rawValue);
    return;
  }

  if (fieldSpec.kind === "enum") {
    const dictionary = runtime.enumDictionaries.get(fieldId);
    lane[index] = getEnumId(dictionary, rawValue);
    return;
  }

  if (fieldSpec.kind === "relationship") {
    lane.rawAnchors[index] = Array.isArray(rawValue) ? rawValue[0] : rawValue || null;
    lane.indexes[index] = INVALID_INDEX;
  }
}

function resolveRelationshipLanes({ topicRuntime, manifest, anchorIndexes, requiredPlan }) {
  for (const step of requiredPlan.steps) {
    if (step.type !== "relationship-predicate") {
      continue;
    }

    const sourceRuntime = topicRuntime[step.sourceTopic];
    const lane = sourceRuntime.lanes.get(step.relationshipFieldId);

    if (!lane) {
      throw new Error(
        `Missing relationship lane: ${step.sourceTopic}.${step.relationshipFieldId}`,
      );
    }

    for (let i = 0; i < lane.rawAnchors.length; i += 1) {
      const anchor = lane.rawAnchors[i];
      const resolved = anchorIndexes.get(anchor);

      lane.indexes[i] =
        resolved && resolved.topic === step.targetTopic ? resolved.index : INVALID_INDEX;
    }

    /*
     * Memory reduction:
     * Once relationship anchors are resolved to integer indexes, the raw
     * anchor strings/references are no longer needed for query execution.
     */
    lane.rawAnchors = null;
  }
}

function buildRequiredBitsets({ topicRuntime, requiredPlan }) {
  for (const step of requiredPlan.steps) {
    if (step.type === "direct-predicate") {
      const topic = topicRuntime[step.topic];

      if (step.strategy === "precomputed-predicate-bitset") {
        const bitset = buildDirectPredicateBitset(topic, step);
        topic.bitsets.set(step.outputBitset, bitset);
      } else if (step.strategy === "scan-lane-build-runtime-bitset") {
        const bitset = buildDirectPredicateBitset(topic, step);
        topic.bitsets.set(step.outputBitset, bitset);
      }

      continue;
    }

    if (step.type === "relationship-predicate") {
      const targetTopic = topicRuntime[step.targetTopic];
      const sourceTopic = topicRuntime[step.sourceTopic];

      const targetBitset = buildDirectPredicateBitset(targetTopic, {
        topic: step.targetTopic,
        fieldId: step.targetFieldId,
        operator: step.operator,
        value: step.value,
      });

      const sourceBitset = deriveSourceBitsetThroughRelationship({
        sourceTopic,
        relationshipFieldId: step.relationshipFieldId,
        targetBitset,
      });

      sourceTopic.bitsets.set(step.outputBitset, sourceBitset);
    }
  }
}

function buildDirectPredicateBitset(topic, step) {
  const fieldId = step.fieldId;
  const lane = topic.lanes.get(fieldId);
  const count = topic.payloadStarts.length;
  const bitset = createBitset(count);

  if (!lane) {
    throw new Error(`Missing lane for bitset: ${fieldId}`);
  }

  const dictionary = topic.enumDictionaries.get(fieldId);

  let compareValue = step.value;

  if (dictionary) {
    compareValue = dictionary.valueToId.get(step.value);

    if (compareValue === undefined) {
      return bitset;
    }
  }

  for (let i = 0; i < count; i += 1) {
    const value = lane[i];

    if (matchesPredicate(value, step.operator, compareValue)) {
      setBit(bitset, i);
    }
  }

  return bitset;
}

function deriveSourceBitsetThroughRelationship({
  sourceTopic,
  relationshipFieldId,
  targetBitset,
}) {
  const relLane = sourceTopic.lanes.get(relationshipFieldId);
  const count = sourceTopic.payloadStarts.length;
  const output = createBitset(count);

  for (let sourceIndex = 0; sourceIndex < count; sourceIndex += 1) {
    const targetIndex = relLane.indexes[sourceIndex];

    if (targetIndex === INVALID_INDEX) {
      continue;
    }

    if (hasBit(targetBitset, targetIndex)) {
      setBit(output, sourceIndex);
    }
  }

  return output;
}

function executePlanAnswerOnly(db, plan) {
  const sourceRuntime = db.topicRuntime[plan.topic];

  const firstIndex = findFirstAndMatchFromInputs(
    sourceRuntime,
    plan.finalOperation.inputs,
  );

  if (firstIndex < 0) {
    return {
      answer: null,
      personIndex: -1,
    };
  }

  const result = hydratePersonCompany(db, firstIndex);

  return {
    answer: result.answer,
    personIndex: firstIndex,
    result,
  };
}

function executePlanDebug(db, plan, options = {}) {
  const hydrateLimit = options.hydrateLimit ?? 10;
  const sourceRuntime = db.topicRuntime[plan.topic];

  const finalBitset = andBitsetsFromInputs(sourceRuntime, plan.finalOperation.inputs);
  const matchingIndexes = collectSetBitsLimited(
    finalBitset,
    sourceRuntime.payloadStarts.length,
    hydrateLimit,
  );

  const results = [];

  for (const personIndex of matchingIndexes) {
    results.push(hydratePersonCompany(db, personIndex));
  }

  const candidateCounts = {
    topicMatches: sourceRuntime.payloadStarts.length,
    finalMatches: countSetBits(finalBitset),
  };

  for (const input of plan.finalOperation.inputs) {
    candidateCounts[input] = countSetBits(sourceRuntime.bitsets.get(input));
  }

  return {
    answer: results[0]?.answer || null,
    results,
    candidateCounts,
  };
}

function findFirstAndMatchFromInputs(runtime, inputs) {
  const bitsets = inputs.map((input) => runtime.bitsets.get(input));

  for (const bitset of bitsets) {
    if (!bitset) {
      throw new Error(`Missing bitset input: ${inputs.join(", ")}`);
    }
  }

  const wordCount = bitsets[0].length;
  const recordCount = runtime.payloadStarts.length;

  for (let wordIndex = 0; wordIndex < wordCount; wordIndex += 1) {
    let word = bitsets[0][wordIndex];

    for (let i = 1; i < bitsets.length; i += 1) {
      word &= bitsets[i][wordIndex];
    }

    if (word === 0) {
      continue;
    }

    const lowestBit = word & -word;
    const bitIndex = 31 - Math.clz32(lowestBit);
    const recordIndex = wordIndex * 32 + bitIndex;

    return recordIndex < recordCount ? recordIndex : -1;
  }

  return -1;
}

function andBitsetsFromInputs(runtime, inputs) {
  const bitsets = inputs.map((input) => runtime.bitsets.get(input));

  for (const bitset of bitsets) {
    if (!bitset) {
      throw new Error(`Missing bitset input: ${inputs.join(", ")}`);
    }
  }

  const result = new Uint32Array(bitsets[0].length);

  for (let wordIndex = 0; wordIndex < result.length; wordIndex += 1) {
    let word = bitsets[0][wordIndex];

    for (let i = 1; i < bitsets.length; i += 1) {
      word &= bitsets[i][wordIndex];
    }

    result[wordIndex] = word;
  }

  return result;
}

function hydratePersonCompany(db, personIndex) {
  const personRuntime = db.topicRuntime.person;
  const companyRuntime = db.topicRuntime.company;

  const personNode = parseNodeAt(
    db.buffer,
    personRuntime.payloadStarts[personIndex],
    personRuntime.payloadEnds[personIndex],
  );

  const companyRelLane = personRuntime.lanes.get("relationship:company");
  const companyIndex = companyRelLane.indexes[personIndex];

  const companyNode =
    companyIndex === INVALID_INDEX
      ? null
      : parseNodeAt(
          db.buffer,
          companyRuntime.payloadStarts[companyIndex],
          companyRuntime.payloadEnds[companyIndex],
        );

  const answer = getPersonDisplayName(personNode);

  return {
    answer,
    data: {
      person: {
        index: personIndex,
        anchor: personNode["#"],
        name: answer,
        age: personNode["~age"],
        status: personNode["~status"],
      },
      company: companyNode
        ? {
            index: companyIndex,
            anchor: companyNode["#"],
            name: companyNode["~name"] || companyNode.name || null,
            industry: companyNode["~industry"] || null,
          }
        : null,
    },
  };
}

function matchesPredicate(value, operator, compareValue) {
  if (operator === "eq") return value === compareValue;
  if (operator === "lt") return value < compareValue;
  if (operator === "lte") return value <= compareValue;
  if (operator === "gt") return value > compareValue;
  if (operator === "gte") return value >= compareValue;

  throw new Error(`Unsupported operator: ${operator}`);
}

function getEnumId(dictionary, value) {
  const normalized = value === undefined || value === null ? "unknown" : String(value);
  let id = dictionary.valueToId.get(normalized);

  if (id !== undefined) {
    return id;
  }

  id = dictionary.idToValue.length;
  dictionary.valueToId.set(normalized, id);
  dictionary.idToValue.push(normalized);

  return id;
}

function collectPredicates(fieldSpec) {
  const predicates = [];

  for (const predicate of fieldSpec.predicateBitsetCandidates || []) {
    predicates.push({
      ...predicate,
      predicateSource: "enum",
    });
  }

  for (const predicate of fieldSpec.numericPredicateCandidates || []) {
    predicates.push({
      name: predicate.name,
      operator: predicate.operator,
      value: predicate.value,
      threshold: predicate.value,
      kind: predicate.kind,
      predicateSource: "numeric",
    });
  }

  return predicates;
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
      const node = parseNodeAt(buffer, start, end);
      callback(node, start, end);
    }

    start = index + 1;
  }
}

function parseNodeAt(buffer, start, end) {
  return JSON.parse(buffer.toString("utf8", start, end));
}

function createBitset(recordCount) {
  return new Uint32Array(Math.ceil(recordCount / 32));
}

function setBit(bitset, index) {
  bitset[index >> 5] |= 1 << (index & 31);
}

function hasBit(bitset, index) {
  return (bitset[index >> 5] & (1 << (index & 31))) !== 0;
}

function collectSetBitsLimited(bitset, recordCount, limit) {
  const indexes = [];

  for (let wordIndex = 0; wordIndex < bitset.length; wordIndex += 1) {
    let word = bitset[wordIndex];

    while (word !== 0) {
      const lowestBit = word & -word;
      const bitIndex = 31 - Math.clz32(lowestBit);
      const recordIndex = wordIndex * 32 + bitIndex;

      if (recordIndex < recordCount) {
        indexes.push(recordIndex);

        if (indexes.length >= limit) {
          return indexes;
        }
      }

      word &= word - 1;
    }
  }

  return indexes;
}

function countSetBits(bitset) {
  let count = 0;

  for (let i = 0; i < bitset.length; i += 1) {
    count += popcount32(bitset[i]);
  }

  return count;
}

function popcount32(value) {
  value -= (value >>> 1) & 0x55555555;
  value = (value & 0x33333333) + ((value >>> 2) & 0x33333333);
  return (((value + (value >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

function createLaneKey(topicName, fieldId) {
  return `${topicName}::${fieldId}`;
}

function createPredicateKey(topicName, predicateName) {
  return `${topicName}::${predicateName}`;
}

function summarizeLane(lane) {
  return {
    topic: lane.topic,
    fieldId: lane.fieldId,
    kind: lane.kind,
    suggestedLane: lane.suggestedLane,
    searchable: lane.searchable,
  };
}

function sanitizePredicateName(value) {
  return String(value)
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function getPersonDisplayName(node) {
  if (node["~fullName"]) return node["~fullName"];
  if (node["~name"]) return node["~name"];
  if (node.name && typeof node.name === "string") return node.name;

  const firstName =
    node["~firstName"] ||
    node["~first_name"] ||
    node["~first"] ||
    node.name?.first ||
    node.name?.firstName;

  const lastName =
    node["~lastName"] ||
    node["~last_name"] ||
    node["~last"] ||
    node.name?.last ||
    node.name?.lastName;

  if (firstName && lastName) {
    return `${firstName} ${lastName}`;
  }

  if (firstName) return firstName;
  if (lastName) return lastName;

  return node["#"];
}

function toNumberOrZero(value) {
  if (value === undefined || value === null || value === "") {
    return 0;
  }

  const number = Number(value);

  return Number.isFinite(number) ? number : 0;
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

  if (typeof value === "object") {
    return (
      (value.personIndex || 0) +
      (value.results?.length || 0) +
      (value.candidateCounts?.finalMatches || 0) +
      (value.answer ? value.answer.length : 0)
    );
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

main();