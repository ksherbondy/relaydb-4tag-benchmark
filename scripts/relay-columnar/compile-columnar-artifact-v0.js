/**
 * Author: Kris Sherbondy
 * Date: 2026-05-22
 * Purpose:
 *   Compile the people/companies 4-tag JSONL dataset into a prototype
 *   RelayDB columnar binary artifact.
 *
 *   This is v0, not the final .relay format.
 *
 *   It proves:
 *     JSONL runtime parsing can be moved to compile time.
 *     Query-time open can load prebuilt lanes and bitsets.
 *     The reader can avoid rebuilding lanes every run.
 */

const fs = require("fs");
const path = require("path");
const { performance } = require("perf_hooks");

const STATUS_UNKNOWN = 0;
const STATUS_ACTIVE = 1;
const STATUS_INACTIVE = 2;
const STATUS_PENDING = 3;
const INVALID_INDEX = 0xffffffff;

const inputPath = process.argv[2]
  ? path.resolve(process.cwd(), process.argv[2])
  : path.join(
      process.cwd(),
      "datasets",
      "generated",
      "merged",
      "people-companies.10000x100000.4tag.merged.jsonl",
    );

const outputPath = process.argv[3]
  ? path.resolve(process.cwd(), process.argv[3])
  : path.join(
      process.cwd(),
      "builds",
      "relay-columnar",
      "people-companies.10000x100000.columnar.relayc",
    );

main();

function main() {
  if (!fs.existsSync(inputPath)) {
    console.error(`Missing input file: ${inputPath}`);
    process.exit(1);
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  console.log("RelayDB Columnar Artifact Compiler v0");
  console.log("=====================================");
  console.log(`Input:  ${inputPath}`);
  console.log(`Output: ${outputPath}`);
  console.log("");

  const start = performance.now();
  const artifact = compileArtifact(inputPath);
  writeArtifact(outputPath, artifact);
  const end = performance.now();

  const stats = fs.statSync(outputPath);

  console.log("Compile Complete");
  console.log("----------------");
  console.log(`Compile time: ${formatMs(end - start)}`);
  console.log(`People:       ${artifact.manifest.topicCounts.person.toLocaleString()}`);
  console.log(`Companies:    ${artifact.manifest.topicCounts.company.toLocaleString()}`);
  console.log(`Lines:        ${artifact.manifest.source.lineCount.toLocaleString()}`);
  console.log(`Source bytes: ${artifact.payload.byteLength.toLocaleString()}`);
  console.log(`Output bytes: ${stats.size.toLocaleString()}`);
}

function compileArtifact(filePath) {
  const payload = fs.readFileSync(filePath);

  const companyAnchorToIndex = new Map();
  const companyStarts = [];
  const companyEnds = [];
  const companyIndustryIdsTemp = [];
  const companyIndustryValues = [];

  const industryToId = new Map();
  const idToIndustry = ["unknown"];

  let lineCount = 0;
  let personCount = 0;

  function getIndustryId(value) {
    if (!value) return 0;

    let id = industryToId.get(value);

    if (id !== undefined) {
      return id;
    }

    id = idToIndustry.length;
    industryToId.set(value, id);
    idToIndustry.push(value);
    return id;
  }

  scanJsonlBuffer(payload, (node, start, end) => {
    lineCount += 1;

    if (node["^"] === "company") {
      const index = companyStarts.length;
      companyAnchorToIndex.set(node["#"], index);
      companyStarts.push(start);
      companyEnds.push(end);

      const industry = node["~industry"] || "unknown";
      companyIndustryValues.push(industry);
      companyIndustryIdsTemp.push(getIndustryId(industry));
      return;
    }

    if (node["^"] === "person") {
      personCount += 1;
    }
  });

  const companyCount = companyStarts.length;

  const personStarts = new Uint32Array(personCount);
  const personEnds = new Uint32Array(personCount);
  const personAges = new Uint8Array(personCount);
  const personStatusIds = new Uint8Array(personCount);
  const personCompanyIndexes = new Uint32Array(personCount);

  const companyPayloadStarts = Uint32Array.from(companyStarts);
  const companyPayloadEnds = Uint32Array.from(companyEnds);
  const companyIndustryIds = new Uint16Array(companyCount);

  for (let i = 0; i < companyCount; i += 1) {
    companyIndustryIds[i] = companyIndustryIdsTemp[i];
  }

  const activePeople = createBitset(personCount);
  const under40People = createBitset(personCount);
  const agriculturePeople = createBitset(personCount);

  const agricultureIndustryId = industryToId.get("Agriculture");

  let personIndex = 0;

  scanJsonlBuffer(payload, (node, start, end) => {
    if (node["^"] !== "person") {
      return;
    }

    const age = toNumberOrZero(node["~age"]);
    const statusId = getStatusId(node["~status"]);
    const companyAnchor = node["@company"] || null;
    const companyIndex = companyAnchorToIndex.get(companyAnchor);

    personStarts[personIndex] = start;
    personEnds[personIndex] = end;
    personAges[personIndex] = age;
    personStatusIds[personIndex] = statusId;
    personCompanyIndexes[personIndex] =
      companyIndex === undefined ? INVALID_INDEX : companyIndex;

    if (statusId === STATUS_ACTIVE) {
      setBit(activePeople, personIndex);
    }

    if (age < 40) {
      setBit(under40People, personIndex);
    }

    if (
      companyIndex !== undefined &&
      companyIndustryIds[companyIndex] === agricultureIndustryId
    ) {
      setBit(agriculturePeople, personIndex);
    }

    personIndex += 1;
  });

  const sections = {
    personPayloadStarts: Buffer.from(personStarts.buffer),
    personPayloadEnds: Buffer.from(personEnds.buffer),
    personAges: Buffer.from(personAges.buffer),
    personStatusIds: Buffer.from(personStatusIds.buffer),
    personCompanyIndexes: Buffer.from(personCompanyIndexes.buffer),

    companyPayloadStarts: Buffer.from(companyPayloadStarts.buffer),
    companyPayloadEnds: Buffer.from(companyPayloadEnds.buffer),
    companyIndustryIds: Buffer.from(companyIndustryIds.buffer),

    bitsetPersonStatusActive: Buffer.from(activePeople.buffer),
    bitsetPersonAgeUnder40: Buffer.from(under40People.buffer),
    bitsetPersonCompanyIndustryAgriculture: Buffer.from(agriculturePeople.buffer),

    payload,
  };

  const manifest = {
    format: "relaydb-columnar-artifact",
    version: "0.0.1",
    createdAt: new Date().toISOString(),
    source: {
      path: path.relative(process.cwd(), filePath),
      bytes: payload.byteLength,
      lineCount,
    },
    topicCounts: {
      person: personCount,
      company: companyCount,
    },
    dictionaries: {
      status: {
        idToValue: ["unknown", "active", "inactive", "pending"],
      },
      industry: {
        idToValue: idToIndustry,
      },
    },
    sections: Object.fromEntries(
      Object.entries(sections).map(([name, buffer]) => [
        name,
        {
          byteLength: buffer.byteLength,
        },
      ]),
    ),
    queryPresets: {
      activeAgriculturePeopleUnder40: {
        topic: "person",
        bitsets: [
          "bitsetPersonStatusActive",
          "bitsetPersonAgeUnder40",
          "bitsetPersonCompanyIndustryAgriculture",
        ],
        hydrate: true,
        limit: 1,
      },
    },
  };

  return {
    manifest,
    sections,
    payload,
  };
}

function writeArtifact(filePath, artifact) {
  const magic = Buffer.from("RDBC0001", "ascii");
  const manifestBytes = Buffer.from(JSON.stringify(artifact.manifest), "utf8");
  const manifestLength = Buffer.allocUnsafe(4);

  manifestLength.writeUInt32LE(manifestBytes.byteLength, 0);

  const sectionBuffers = Object.values(artifact.sections);

  fs.writeFileSync(
    filePath,
    Buffer.concat([magic, manifestLength, manifestBytes, ...sectionBuffers]),
  );
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

function createBitset(recordCount) {
  return new Uint32Array(Math.ceil(recordCount / 32));
}

function setBit(bitset, index) {
  bitset[index >> 5] |= 1 << (index & 31);
}

function getStatusId(status) {
  if (status === "active") return STATUS_ACTIVE;
  if (status === "inactive") return STATUS_INACTIVE;
  if (status === "pending") return STATUS_PENDING;
  return STATUS_UNKNOWN;
}

function toNumberOrZero(value) {
  if (value === undefined || value === null || value === "") {
    return 0;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function formatMs(ms) {
  return `${ms.toFixed(6)} ms`;
}