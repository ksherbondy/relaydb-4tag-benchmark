/**
 * Author: Kris Sherbondy
 * Date: 2026-05-22
 * Purpose:
 *   Prototype a generic RelayDB LaneRegistry from a columnar manifest.
 *
 *   This proves the reader can stop hardcoding person/company fields and
 *   instead ask the manifest what lanes, fields, predicates, and relationships exist.
 *
 * Usage:
 *   node scripts/relay-columnar/lane-registry-prototype.js \
 *     reports/relay-columnar/people-companies.10000x100000.columnar-manifest.v2.json \
 *     > reports/relay-columnar/lane-registry-prototype-output.md
 */

const fs = require("fs");
const path = require("path");

const manifestArg = process.argv[2];

const manifestPath = manifestArg
  ? path.resolve(process.cwd(), manifestArg)
  : path.join(
      process.cwd(),
      "reports",
      "relay-columnar",
      "people-companies.10000x100000.columnar-manifest.v2.json",
    );



function main() {
  if (!fs.existsSync(manifestPath)) {
    console.error(`Missing manifest file: ${manifestPath}`);
    process.exit(1);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const registry = LaneRegistry.fromManifest(manifest);

  console.log("RelayDB LaneRegistry Prototype");
  console.log("==============================");
  console.log("");
  console.log(`Manifest: ${manifestPath}`);
  console.log(`Format:   ${manifest.format}`);
  console.log(`Version:  ${manifest.version}`);
  console.log("");

  console.log("Topics");
  console.log("------");
  for (const topic of registry.listTopics()) {
    const topicSpec = registry.getTopic(topic);
    console.log(`${topic.padEnd(24)} count: ${topicSpec.count.toLocaleString()}`);
  }

  console.log("");
  console.log("Known Lane Specs");
  console.log("----------------");
  printLaneSpec(registry, "person", "attribute:age");
  printLaneSpec(registry, "person", "attribute:status");
  printLaneSpec(registry, "person", "relationship:company");
  printLaneSpec(registry, "company", "attribute:industry");
  printLaneSpec(registry, "company", "relationship:industry");

  console.log("");
  console.log("Searchable Fields: person");
  console.log("-------------------------");
  for (const field of registry.listSearchableFields("person")) {
    console.log(
      `${field.fieldId.padEnd(32)} kind: ${field.kind.padEnd(13)} lane: ${field.suggestedLane}`,
    );
  }

  console.log("");
  console.log("Predicate Candidates: person");
  console.log("----------------------------");
  for (const predicate of registry.listPredicateCandidates("person")) {
    console.log(
      `${predicate.name.padEnd(48)} field: ${predicate.fieldId} value: ${String(
        predicate.value ?? predicate.operator + " " + predicate.threshold,
      )}`,
    );
  }

  console.log("");
  console.log("Relationship Fields: person");
  console.log("---------------------------");
  for (const relationship of registry.listRelationships("person")) {
    console.log(
      `${relationship.fieldId.padEnd(32)} target: ${String(
        relationship.target,
      ).padEnd(20)} targetFound: ${relationship.targetFound}`,
    );
  }

  console.log("");
  console.log("Query Plan Prototype");
  console.log("--------------------");

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

  console.log(JSON.stringify(plan, null, 2));
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

  hasTopic(topicName) {
    return this.topics.has(topicName);
  }

  getLaneSpec(topicName, fieldId) {
    const laneKey = createLaneKey(topicName, fieldId);
    const lane = this.lanes.get(laneKey);

    if (!lane) {
      throw new Error(`Unknown lane: ${topicName}.${fieldId}`);
    }

    return lane;
  }

  maybeGetLaneSpec(topicName, fieldId) {
    return this.lanes.get(createLaneKey(topicName, fieldId)) || null;
  }

  listFields(topicName) {
    this.getTopic(topicName);

    return Array.from(this.lanes.values())
      .filter((lane) => lane.topic === topicName)
      .sort((a, b) => a.fieldId.localeCompare(b.fieldId));
  }

  listSearchableFields(topicName) {
    return this.listFields(topicName).filter((field) => field.searchable);
  }

  listRelationships(topicName) {
    this.getTopic(topicName);

    return Array.from(this.relationships.values())
      .filter((relationship) => relationship.topic === topicName)
      .sort((a, b) => a.fieldId.localeCompare(b.fieldId));
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

function printLaneSpec(registry, topic, fieldId) {
  const lane = registry.maybeGetLaneSpec(topic, fieldId);

  if (!lane) {
    console.log(`${topic}.${fieldId}: MISSING`);
    return;
  }

  console.log(
    `${topic}.${fieldId}: kind=${lane.kind}, lane=${lane.suggestedLane}, searchable=${lane.searchable}`,
  );
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

function createLaneKey(topicName, fieldId) {
  return `${topicName}::${fieldId}`;
}

function createPredicateKey(topicName, predicateName) {
  return `${topicName}::${predicateName}`;
}

function sanitizePredicateName(value) {
  return String(value)
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

main();