/**
 * Author: Kris Sherbondy
 * Date: 2026-05-23
 * Purpose:
 *   Read a v1 RelayDB columnar binary artifact using aligned section offsets
 *   and zero-copy typed-array views.
 *
 *   v1 improvements over v0 reader:
 *     1. Uses magic RDBC0002.
 *     2. Reads explicit section offsets from manifest.
 *     3. Requires aligned sections.
 *     4. Uses zero-copy typed-array views.
 *     5. Avoids DataView copy workaround from v0.
 */

const fs = require("fs");
const path = require("path");
const { performance } = require("perf_hooks");

const MAGIC = "RDBC0002";
const INVALID_INDEX = 0xffffffff;

const warmupIterations = Number(process.argv[2] || 1000);
const measuredIterations = Number(process.argv[3] || 10000);

const artifactPath = process.argv[4]
  ? path.resolve(process.cwd(), process.argv[4])
  : path.join(
      process.cwd(),
      "builds",
      "relay-columnar",
      "people-companies.10000x100000.columnar.v1.relayc",
    );

main();

function main() {
  if (!fs.existsSync(artifactPath)) {
    console.error(`Missing artifact: ${artifactPath}`);
    process.exit(1);
  }

  console.log("RelayDB Columnar Artifact Reader v1");
  console.log("===================================");
  console.log(`Artifact: ${artifactPath}`);
  console.log("Question: active agriculture people under 40");
  console.log(`Warmup iterations: ${warmupIterations}`);
  console.log(`Measured iterations: ${measuredIterations}`);
  console.log("");

  forceGcIfAvailable();

  const beforeOpenMemory = process.memoryUsage();
  const openStart = performance.now();

  const db = openArtifact(artifactPath);

  forceGcIfAvailable();

  const openEnd = performance.now();
  const afterOpenMemory = process.memoryUsage();

  console.log("Open Precompiled Artifact");
  console.log("-------------------------");
  console.log(`Open time:  ${formatMs(openEnd - openStart)}`);
  console.log(`Bytes:      ${db.stats.bytes.toLocaleString()}`);
  console.log(`People:     ${db.manifest.topicCounts.person.toLocaleString()}`);
  console.log(`Companies:  ${db.manifest.topicCounts.company.toLocaleString()}`);
  console.log(`Alignment:  ${db.manifest.alignment} bytes`);
  console.log("");

  console.log("Memory Delta During Open");
  console.log("------------------------");
  printMemoryDelta(getMemoryDelta(beforeOpenMemory, afterOpenMemory));
  console.log("");

  console.log("Section Alignment Check");
  console.log("-----------------------");
  console.log(`Aligned: ${db.alignmentCheck.aligned}`);
  console.log(`Sections checked: ${db.alignmentCheck.checked}`);
  console.log("");

  const correctness = debugSearch(db, { hydrateLimit: 1 });

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
  warmup("answerOnly", warmupIterations, () => answerOnlySearch(db));
  warmup("debugStyle", warmupIterations, () => debugSearch(db, { hydrateLimit: 10 }));
  console.log("");

  console.log("Benchmark");
  console.log("---------");
  benchmark("answerOnly", measuredIterations, () => answerOnlySearch(db));
  benchmark("debugStyle", measuredIterations, () => debugSearch(db, { hydrateLimit: 10 }));
}

function openArtifact(filePath) {
  const file = fs.readFileSync(filePath);
  const magic = file.subarray(0, 8).toString("ascii");

  if (magic !== MAGIC) {
    throw new Error(`Invalid artifact magic: ${magic}`);
  }

  const manifestLength = file.readUInt32LE(8);
  const manifestStart = 12;
  const manifestEnd = manifestStart + manifestLength;

  const manifest = JSON.parse(file.subarray(manifestStart, manifestEnd).toString("utf8"));

  const alignmentCheck = validateSectionAlignment(manifest);

  const personCount = manifest.topicCounts.person;
  const companyCount = manifest.topicCounts.company;

  return {
    file,
    manifest,
    stats: {
      bytes: file.byteLength,
    },
    alignmentCheck,

    person: {
      payloadStarts: typedView(file, manifest.sections.personPayloadStarts),
      payloadEnds: typedView(file, manifest.sections.personPayloadEnds),
      ages: typedView(file, manifest.sections.personAges),
      statusIds: typedView(file, manifest.sections.personStatusIds),
      companyIndexes: typedView(file, manifest.sections.personCompanyIndexes),
      count: personCount,
    },

    company: {
      payloadStarts: typedView(file, manifest.sections.companyPayloadStarts),
      payloadEnds: typedView(file, manifest.sections.companyPayloadEnds),
      industryIds: typedView(file, manifest.sections.companyIndustryIds),
      count: companyCount,
    },

    bitsets: {
      activePeople: typedView(file, manifest.sections.bitsetPersonStatusActive),
      under40People: typedView(file, manifest.sections.bitsetPersonAgeUnder40),
      agriculturePeople: typedView(
        file,
        manifest.sections.bitsetPersonCompanyIndustryAgriculture,
      ),
    },

    payload: sectionBuffer(file, manifest.sections.payload),
  };
}

function validateSectionAlignment(manifest) {
  let checked = 0;

  for (const [name, section] of Object.entries(manifest.sections)) {
    checked += 1;

    const alignment = section.alignment || manifest.alignment || 8;

    if (section.offset % alignment !== 0) {
      throw new Error(
        `Unaligned section ${name}: offset=${section.offset}, alignment=${alignment}`,
      );
    }

    if (section.type === "uint16" && section.offset % 2 !== 0) {
      throw new Error(`Unaligned uint16 section ${name}: offset=${section.offset}`);
    }

    if (section.type === "uint32" && section.offset % 4 !== 0) {
      throw new Error(`Unaligned uint32 section ${name}: offset=${section.offset}`);
    }
  }

  return {
    aligned: true,
    checked,
  };
}

function sectionBuffer(file, section) {
  return file.subarray(section.offset, section.offset + section.byteLength);
}

function typedView(file, section) {
  const byteOffset = file.byteOffset + section.offset;
  const byteLength = section.byteLength;

  if (section.type === "uint8") {
    return new Uint8Array(file.buffer, byteOffset, byteLength);
  }

  if (section.type === "uint16") {
    return new Uint16Array(
      file.buffer,
      byteOffset,
      Math.floor(byteLength / Uint16Array.BYTES_PER_ELEMENT),
    );
  }

  if (section.type === "uint32") {
    return new Uint32Array(
      file.buffer,
      byteOffset,
      Math.floor(byteLength / Uint32Array.BYTES_PER_ELEMENT),
    );
  }

  if (section.type === "bytes") {
    return sectionBuffer(file, section);
  }

  throw new Error(`Unsupported section type: ${section.type}`);
}

function answerOnlySearch(db) {
  const personIndex = findFirstAndMatch(
    db.bitsets.activePeople,
    db.bitsets.under40People,
    db.bitsets.agriculturePeople,
    db.person.count,
  );

  if (personIndex < 0) {
    return {
      answer: null,
      personIndex: -1,
    };
  }

  const result = hydratePersonCompany(db, personIndex);

  return {
    answer: result.answer,
    personIndex,
    result,
  };
}

function debugSearch(db, options = {}) {
  const hydrateLimit = options.hydrateLimit ?? 10;

  const finalBitset = andBitsets(
    db.bitsets.activePeople,
    db.bitsets.under40People,
    db.bitsets.agriculturePeople,
  );

  const matchingIndexes = collectSetBitsLimited(finalBitset, db.person.count, hydrateLimit);
  const results = [];

  for (const personIndex of matchingIndexes) {
    results.push(hydratePersonCompany(db, personIndex));
  }

  return {
    answer: results[0]?.answer || null,
    results,
    candidateCounts: {
      topicMatches: db.person.count,
      statusMatches: countSetBits(db.bitsets.activePeople),
      ageMatches: countSetBits(db.bitsets.under40People),
      industryMatches: countSetBits(db.bitsets.agriculturePeople),
      finalMatches: countSetBits(finalBitset),
    },
  };
}

function hydratePersonCompany(db, personIndex) {
  const personNode = parsePayloadNode(
    db.payload,
    db.person.payloadStarts[personIndex],
    db.person.payloadEnds[personIndex],
  );

  const companyIndex = db.person.companyIndexes[personIndex];

  const companyNode =
    companyIndex === INVALID_INDEX
      ? null
      : parsePayloadNode(
          db.payload,
          db.company.payloadStarts[companyIndex],
          db.company.payloadEnds[companyIndex],
        );

  const answer = getPersonDisplayName(personNode);

  return {
    answer,
    data: {
      person: {
        index: personIndex,
        anchor: personNode["#"],
        name: answer,
        age: db.person.ages[personIndex],
        status: db.manifest.dictionaries.status.idToValue[db.person.statusIds[personIndex]],
      },
      company: companyNode
        ? {
            index: companyIndex,
            anchor: companyNode["#"],
            name: companyNode["~name"] || companyNode.name || null,
            industry:
              db.manifest.dictionaries.industry.idToValue[
                db.company.industryIds[companyIndex]
              ],
          }
        : null,
    },
  };
}

function parsePayloadNode(payload, start, end) {
  return JSON.parse(payload.toString("utf8", start, end));
}

function findFirstAndMatch(bitsetA, bitsetB, bitsetC, recordCount) {
  for (let wordIndex = 0; wordIndex < bitsetA.length; wordIndex += 1) {
    const word = bitsetA[wordIndex] & bitsetB[wordIndex] & bitsetC[wordIndex];

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

function andBitsets(...bitsets) {
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