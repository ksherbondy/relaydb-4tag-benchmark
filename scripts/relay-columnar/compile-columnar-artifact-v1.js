/**
 * Author: Kris Sherbondy
 * Date: 2026-05-23
 * Purpose:
 *   Compile the people/companies 4-tag JSONL dataset into a v1 prototype
 *   RelayDB columnar binary artifact with aligned section offsets.
 *
 *   v1 improvements over v0:
 *     1. Uses magic RDBC0002.
 *     2. Stores explicit section offsets in the manifest.
 *     3. Aligns every section to 8-byte boundaries.
 *     4. Prepares the reader for zero-copy typed-array views.
 *
 *   This is still dataset-specific. The goal of v1 is binary-layout hardening,
 *   not full generic section naming yet.
 */

const fs = require("fs");
const path = require("path");
const { performance } = require("perf_hooks");

const MAGIC = "RDBC0002";
const ALIGNMENT = 8;

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
      "people-companies.10000x100000.columnar.v1.relayc",
    );

main();

function main() {
  if (!fs.existsSync(inputPath)) {
    console.error(`Missing input file: ${inputPath}`);
    process.exit(1);
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  console.log("RelayDB Columnar Artifact Compiler v1");
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
  console.log(`Alignment:    ${ALIGNMENT} bytes`);
}

function compileArtifact(filePath) {
  const payload = fs.readFileSync(filePath);

  const companyAnchorToIndex = new Map();
  const companyStarts = [];
  const companyEnds = [];
  const companyIndustryIdsTemp = [];

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
      companyIndustryIdsTemp.push(getIndustryId(node["~industry"] || "unknown"));

      return;
    }

    if (node["^"] === "person") {
      personCount += 1;
    }
  });

  const companyCount = companyStarts.length;

  const personPayloadStarts = new Uint32Array(personCount);
  const personPayloadEnds = new Uint32Array(personCount);
  const personAges = new Uint8Array(personCount);
  const personStatusIds = new Uint8Array(personCount);
  const personCompanyIndexes = new Uint32Array(personCount);

  const companyPayloadStarts = Uint32Array.from(companyStarts);
  const companyPayloadEnds = Uint32Array.from(companyEnds);
  const companyIndustryIds = new Uint16Array(companyCount);

  for (let index = 0; index < companyCount; index += 1) {
    companyIndustryIds[index] = companyIndustryIdsTemp[index];
  }

  const bitsetPersonStatusActive = createBitset(personCount);
  const bitsetPersonAgeUnder40 = createBitset(personCount);
  const bitsetPersonCompanyIndustryAgriculture = createBitset(personCount);

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

    personPayloadStarts[personIndex] = start;
    personPayloadEnds[personIndex] = end;
    personAges[personIndex] = age;
    personStatusIds[personIndex] = statusId;
    personCompanyIndexes[personIndex] =
      companyIndex === undefined ? INVALID_INDEX : companyIndex;

    if (statusId === STATUS_ACTIVE) {
      setBit(bitsetPersonStatusActive, personIndex);
    }

    if (age < 40) {
      setBit(bitsetPersonAgeUnder40, personIndex);
    }

    if (
      companyIndex !== undefined &&
      companyIndustryIds[companyIndex] === agricultureIndustryId
    ) {
      setBit(bitsetPersonCompanyIndustryAgriculture, personIndex);
    }

    personIndex += 1;
  });

  const sections = {
    personPayloadStarts: typedArrayToBuffer(personPayloadStarts),
    personPayloadEnds: typedArrayToBuffer(personPayloadEnds),
    personAges: typedArrayToBuffer(personAges),
    personStatusIds: typedArrayToBuffer(personStatusIds),
    personCompanyIndexes: typedArrayToBuffer(personCompanyIndexes),

    companyPayloadStarts: typedArrayToBuffer(companyPayloadStarts),
    companyPayloadEnds: typedArrayToBuffer(companyPayloadEnds),
    companyIndustryIds: typedArrayToBuffer(companyIndustryIds),

    bitsetPersonStatusActive: typedArrayToBuffer(bitsetPersonStatusActive),
    bitsetPersonAgeUnder40: typedArrayToBuffer(bitsetPersonAgeUnder40),
    bitsetPersonCompanyIndustryAgriculture: typedArrayToBuffer(
      bitsetPersonCompanyIndustryAgriculture,
    ),

    payload,
  };

  const manifest = {
    format: "relaydb-columnar-artifact",
    version: "0.1.0",
    magic: MAGIC,
    alignment: ALIGNMENT,
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
    sections: createInitialSectionManifest(sections),
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

function createInitialSectionManifest(sections) {
  return Object.fromEntries(
    Object.entries(sections).map(([name, buffer]) => [
      name,
      {
        offset: null,
        byteLength: buffer.byteLength,
        alignment: ALIGNMENT,
        type: inferSectionType(name),
      },
    ]),
  );
}

function inferSectionType(name) {
  if (name === "personAges") return "uint8";
  if (name === "personStatusIds") return "uint8";
  if (name === "companyIndustryIds") return "uint16";
  if (name.startsWith("bitset")) return "uint32";
  if (name.endsWith("Starts")) return "uint32";
  if (name.endsWith("Ends")) return "uint32";
  if (name.endsWith("Indexes")) return "uint32";
  if (name === "payload") return "bytes";

  return "bytes";
}

function writeArtifact(filePath, artifact) {
  const magic = Buffer.from(MAGIC, "ascii");
  const sectionEntries = Object.entries(artifact.sections);

  let manifest = {
    ...artifact.manifest,
    header: {
      magic: MAGIC,
      magicBytes: 8,
      manifestLengthBytes: 4,
      manifestEncoding: "utf8-json",
      endian: "little",
    },
    sections: createInitialSectionManifest(artifact.sections),
  };

  let manifestBytes = Buffer.from(JSON.stringify(manifest), "utf8");

  /*
   * Offsets are stored inside the manifest.
   * Since offsets can change the manifest's byte length, iterate until stable.
   */
  let stable = false;

  while (!stable) {
    let currentOffset = alignOffset(8 + 4 + manifestBytes.byteLength);

    for (const [name, buffer] of sectionEntries) {
      currentOffset = alignOffset(currentOffset);

      manifest.sections[name].offset = currentOffset;
      manifest.sections[name].byteLength = buffer.byteLength;
      manifest.sections[name].alignment = ALIGNMENT;
      manifest.sections[name].type = inferSectionType(name);

      currentOffset += buffer.byteLength;
    }

    const nextManifestBytes = Buffer.from(JSON.stringify(manifest), "utf8");
    stable = nextManifestBytes.byteLength === manifestBytes.byteLength;
    manifestBytes = nextManifestBytes;
  }

  const manifestLength = Buffer.allocUnsafe(4);
  manifestLength.writeUInt32LE(manifestBytes.byteLength, 0);

  const chunks = [magic, manifestLength, manifestBytes];
  let writeOffset = 8 + 4 + manifestBytes.byteLength;

  for (const [name, buffer] of sectionEntries) {
    const sectionOffset = manifest.sections[name].offset;

    if (writeOffset > sectionOffset) {
      throw new Error(
        `Internal alignment error for ${name}: writeOffset=${writeOffset}, sectionOffset=${sectionOffset}`,
      );
    }

    if (writeOffset < sectionOffset) {
      const paddingLength = sectionOffset - writeOffset;
      chunks.push(Buffer.alloc(paddingLength));
      writeOffset += paddingLength;
    }

    chunks.push(buffer);
    writeOffset += buffer.byteLength;
  }

  fs.writeFileSync(filePath, Buffer.concat(chunks));
}

function alignOffset(offset, alignment = ALIGNMENT) {
  const remainder = offset % alignment;

  return remainder === 0 ? offset : offset + (alignment - remainder);
}

function typedArrayToBuffer(typedArray) {
  return Buffer.from(
    typedArray.buffer,
    typedArray.byteOffset,
    typedArray.byteLength,
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