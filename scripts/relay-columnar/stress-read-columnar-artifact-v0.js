/**
 * Author: Kris Sherbondy
 * Date: 2026-05-22
 * Purpose:
 *   Stress test the compiled RelayDB columnar artifact v0 with multiple
 *   SQL-like query shapes.
 *
 *   This tests:
 *     1. Precompiled predicate bitsets
 *     2. Runtime bitsets from typed lanes
 *     3. Relationship-derived bitsets
 *     4. Range predicates
 *     5. Count-only queries
 *     6. Limit/hydration queries
 *     7. Group-like aggregation
 */

const fs = require("fs");
const path = require("path");
const { performance } = require("perf_hooks");

const STATUS_UNKNOWN = 0;
const STATUS_ACTIVE = 1;
const STATUS_INACTIVE = 2;
const STATUS_PENDING = 3;
const INVALID_INDEX = 0xffffffff;

const warmupIterations = Number(process.argv[2] || 1000);
const measuredIterations = Number(process.argv[3] || 10000);

const artifactPath = process.argv[4]
  ? path.resolve(process.cwd(), process.argv[4])
  : path.join(
      process.cwd(),
      "builds",
      "relay-columnar",
      "people-companies.10000x100000.columnar.relayc",
    );

main();

function main() {
  if (!fs.existsSync(artifactPath)) {
    console.error(`Missing artifact: ${artifactPath}`);
    process.exit(1);
  }

  console.log("RelayDB Columnar Artifact v0 Stress Test");
  console.log("========================================");
  console.log(`Artifact: ${artifactPath}`);
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
  console.log("");

  console.log("Memory Delta During Open");
  console.log("------------------------");
  printMemoryDelta(getMemoryDelta(beforeOpenMemory, afterOpenMemory));
  console.log("");

  const tests = createStressTests(db);

  console.log("Correctness / Sanity");
  console.log("--------------------");
  for (const test of tests) {
    const result = test.run();
    console.log(`${test.name}`);
    console.log(`  result: ${formatStressResult(result)}`);
  }
    console.log("");
    
    console.log("Runtime Bitset Cache");
    console.log("--------------------");
    console.log(`Cached bitsets: ${db.runtimeCache.bitsets.size}`);
    for (const key of db.runtimeCache.bitsets.keys()) {
    console.log(`  ${key}`);
    }
    console.log("");

  console.log("Benchmarks");
  console.log("----------");

  for (const test of tests) {
    warmup(test.name, warmupIterations, test.run);
    benchmark(test.name, measuredIterations, test.run);
    console.log("");
  }
}

function createStressTests(db) {
  return [
    {
      name: "Q1 active agriculture under40 limit1",
      run: () => {
        const index = findFirstAndMatch(
          db.bitsets.activePeople,
          db.bitsets.under40People,
          db.bitsets.agriculturePeople,
          db.person.count,
        );

        return {
          kind: "limit1",
          index,
          result: index >= 0 ? hydratePersonCompany(db, index) : null,
        };
      },
    },

    {
      name: "Q2 active agriculture under40 count",
      run: () => {
        const finalBitset = andBitsets(
          db.bitsets.activePeople,
          db.bitsets.under40People,
          db.bitsets.agriculturePeople,
        );

        return {
          kind: "count",
          count: countSetBits(finalBitset),
        };
      },
    },

    {
      name: "Q3 active under40 count",
      run: () => {
        const finalBitset = andBitsets(db.bitsets.activePeople, db.bitsets.under40People);

        return {
          kind: "count",
          count: countSetBits(finalBitset),
        };
      },
    },

    {
      name: "Q4 agriculture under40 count",
      run: () => {
        const finalBitset = andBitsets(
          db.bitsets.agriculturePeople,
          db.bitsets.under40People,
        );

        return {
          kind: "count",
          count: countSetBits(finalBitset),
        };
      },
    },

    {
      name: "Q5 inactive over50 count",
      run: () => {
        const inactive = getStatusBitsetCached(db, STATUS_INACTIVE);
        const over50 = getAgeGreaterThanBitsetCached(db, 50);
        const finalBitset = andBitsets(inactive, over50);

        return {
          kind: "count",
          count: countSetBits(finalBitset),
        };
      },
    },

    {
      name: "Q6 pending agriculture age30to60 count",
      run: () => {
        const pending = getStatusBitsetCached(db, STATUS_PENDING);
        const age30to60 = getAgeBetweenBitsetCached(db, 30, 60);
        const finalBitset = andBitsets(pending, db.bitsets.agriculturePeople, age30to60);

        return {
          kind: "count",
          count: countSetBits(finalBitset),
        };
      },
    },

    {
      name: "Q7 agriculture age18to25 limit10 hydrate",
      run: () => {
        const age18to25 = getAgeBetweenBitsetCached(db, 18, 25);
        const finalBitset = andBitsets(db.bitsets.agriculturePeople, age18to25);
        const indexes = collectSetBitsLimited(finalBitset, db.person.count, 10);

        return {
          kind: "limit10",
          count: indexes.length,
          indexes,
          results: indexes.map((index) => hydratePersonCompany(db, index)),
        };
      },
    },

    {
      name: "Q8 group by status x agriculture",
      run: () => {
        const counts = {
          activeAgriculture: 0,
          activeOther: 0,
          inactiveAgriculture: 0,
          inactiveOther: 0,
          pendingAgriculture: 0,
          pendingOther: 0,
          unknownAgriculture: 0,
          unknownOther: 0,
        };

        for (let i = 0; i < db.person.count; i += 1) {
          const status = db.person.statusIds[i];
          const agriculture = hasBit(db.bitsets.agriculturePeople, i);

          if (status === STATUS_ACTIVE && agriculture) counts.activeAgriculture += 1;
          else if (status === STATUS_ACTIVE) counts.activeOther += 1;
          else if (status === STATUS_INACTIVE && agriculture) counts.inactiveAgriculture += 1;
          else if (status === STATUS_INACTIVE) counts.inactiveOther += 1;
          else if (status === STATUS_PENDING && agriculture) counts.pendingAgriculture += 1;
          else if (status === STATUS_PENDING) counts.pendingOther += 1;
          else if (agriculture) counts.unknownAgriculture += 1;
          else counts.unknownOther += 1;
        }

        return {
          kind: "group",
          counts,
        };
      },
    },
  ];
}

function openArtifact(filePath) {
  const file = fs.readFileSync(filePath);
  const magic = file.subarray(0, 8).toString("ascii");

  if (magic !== "RDBC0001") {
    throw new Error(`Invalid artifact magic: ${magic}`);
  }

  const manifestLength = file.readUInt32LE(8);
  const manifestStart = 12;
  const manifestEnd = manifestStart + manifestLength;

  const manifest = JSON.parse(file.subarray(manifestStart, manifestEnd).toString("utf8"));

  let offset = manifestEnd;
  const sections = {};

  for (const [sectionName, sectionInfo] of Object.entries(manifest.sections)) {
    const start = offset;
    const end = start + sectionInfo.byteLength;

    sections[sectionName] = file.subarray(start, end);
    offset = end;
  }

  return {
    file,
    manifest,
    sections,
    stats: {
      bytes: file.byteLength,
    },

    person: {
      payloadStarts: uint32View(sections.personPayloadStarts),
      payloadEnds: uint32View(sections.personPayloadEnds),
      ages: uint8View(sections.personAges),
      statusIds: uint8View(sections.personStatusIds),
      companyIndexes: uint32View(sections.personCompanyIndexes),
      count: manifest.topicCounts.person,
    },

    company: {
      payloadStarts: uint32View(sections.companyPayloadStarts),
      payloadEnds: uint32View(sections.companyPayloadEnds),
      industryIds: uint16View(sections.companyIndustryIds),
      count: manifest.topicCounts.company,
    },

    bitsets: {
      activePeople: uint32View(sections.bitsetPersonStatusActive),
      under40People: uint32View(sections.bitsetPersonAgeUnder40),
      agriculturePeople: uint32View(sections.bitsetPersonCompanyIndustryAgriculture),
    },

    payload: sections.payload,

    runtimeCache: {
    bitsets: new Map(),
    },
  };
}

function buildStatusBitset(db, statusId) {
  const bitset = createBitset(db.person.count);

  for (let i = 0; i < db.person.count; i += 1) {
    if (db.person.statusIds[i] === statusId) {
      setBit(bitset, i);
    }
  }

  return bitset;
}

function buildAgeGreaterThanBitset(db, age) {
  const bitset = createBitset(db.person.count);

  for (let i = 0; i < db.person.count; i += 1) {
    if (db.person.ages[i] > age) {
      setBit(bitset, i);
    }
  }

  return bitset;
}

function buildAgeBetweenBitset(db, minInclusive, maxInclusive) {
  const bitset = createBitset(db.person.count);

  for (let i = 0; i < db.person.count; i += 1) {
    const age = db.person.ages[i];

    if (age >= minInclusive && age <= maxInclusive) {
      setBit(bitset, i);
    }
  }

  return bitset;
}

function getCachedBitset(db, key, builder) {
  const cached = db.runtimeCache.bitsets.get(key);

  if (cached) {
    return cached;
  }

  const bitset = builder();
  db.runtimeCache.bitsets.set(key, bitset);

  return bitset;
}

function getStatusBitsetCached(db, statusId) {
  return getCachedBitset(db, `person.status.eq.${statusId}`, () =>
    buildStatusBitset(db, statusId),
  );
}

function getAgeGreaterThanBitsetCached(db, age) {
  return getCachedBitset(db, `person.age.gt.${age}`, () =>
    buildAgeGreaterThanBitset(db, age),
  );
}

function getAgeBetweenBitsetCached(db, minInclusive, maxInclusive) {
  return getCachedBitset(db, `person.age.between.${minInclusive}.${maxInclusive}`, () =>
    buildAgeBetweenBitset(db, minInclusive, maxInclusive),
  );
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

function uint8View(buffer) {
  const out = new Uint8Array(buffer.byteLength);
  out.set(buffer);
  return out;
}

function uint16View(buffer) {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const out = new Uint16Array(Math.floor(buffer.byteLength / Uint16Array.BYTES_PER_ELEMENT));

  for (let i = 0; i < out.length; i += 1) {
    out[i] = view.getUint16(i * Uint16Array.BYTES_PER_ELEMENT, true);
  }

  return out;
}

function uint32View(buffer) {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const out = new Uint32Array(Math.floor(buffer.byteLength / Uint32Array.BYTES_PER_ELEMENT));

  for (let i = 0; i < out.length; i += 1) {
    out[i] = view.getUint32(i * Uint32Array.BYTES_PER_ELEMENT, true);
  }

  return out;
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

  console.log(`${label.padEnd(42)} warmup blackhole: ${blackhole}`);
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
    `${label.padEnd(42)} total: ${formatMs(totalMs)} | avg: ${formatMs(
      avgMs,
    )} | ops/sec: ${opsPerSecond.toFixed(3)} | blackhole: ${blackhole}`,
  );
}

function consume(value) {
  if (!value) return 0;

  if (value.kind === "count") {
    return value.count;
  }

  if (value.kind === "limit1") {
    return (value.index || 0) + (value.result?.answer?.length || 0);
  }

  if (value.kind === "limit10") {
    return value.count + value.indexes.reduce((sum, index) => sum + index, 0);
  }

  if (value.kind === "group") {
    return Object.values(value.counts).reduce((sum, count) => sum + count, 0);
  }

  return JSON.stringify(value).length;
}

function formatStressResult(result) {
  if (result.kind === "count") {
    return `count=${result.count.toLocaleString()}`;
  }

  if (result.kind === "limit1") {
    return `index=${result.index}, answer=${result.result?.answer || null}`;
  }

  if (result.kind === "limit10") {
    return `count=${result.count}, indexes=[${result.indexes.join(", ")}]`;
  }

  if (result.kind === "group") {
    return JSON.stringify(result.counts);
  }

  return JSON.stringify(result);
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