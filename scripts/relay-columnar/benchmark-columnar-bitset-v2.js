/**
 * Author: Kris Sherbondy
 * Date: 2026-05-22
 * Purpose:
 *   Benchmark RelayDB columnar bitset model v2.
 *
 *   Improvements over v1:
 *     1. Uses Buffer-backed source bytes instead of full text + split lines.
 *     2. Stores byte offsets for payload hydration.
 *     3. Keeps hot query fields in typed lanes.
 *     4. Uses answer-only bitset search without collecting every match.
 *     5. Uses debug-style bitset counts without hydrating unnecessary rows.
 *
 *   Query:
 *     active agriculture people under 40
 */

const fs = require("fs");
const path = require("path");
const { performance } = require("perf_hooks");

const STATUS_UNKNOWN = 0;
const STATUS_ACTIVE = 1;
const STATUS_INACTIVE = 2;
const STATUS_PENDING = 3;

const INDUSTRY_UNKNOWN = 0;
const INVALID_INDEX = 0xffffffff;

const warmupIterations = Number(process.argv[2] || 1000);
const measuredIterations = Number(process.argv[3] || 10000);
const datasetArg = process.argv[4];

const filePath = datasetArg
  ? path.resolve(process.cwd(), datasetArg)
  : path.join(
      process.cwd(),
      "datasets",
      "generated",
      "merged",
      "people-companies.10000x100000.4tag.merged.jsonl",
    );

const question = "active agriculture people under 40";

main();

function main() {
  if (!fs.existsSync(filePath)) {
    console.error(`Missing file: ${filePath}`);
    process.exit(1);
  }

  console.log("RelayDB Columnar Bitset v2 Benchmark");
  console.log("====================================");
  console.log(`Dataset: ${filePath}`);
  console.log(`Question: ${question}`);
  console.log(`Warmup iterations: ${warmupIterations}`);
  console.log(`Measured iterations: ${measuredIterations}`);
  console.log("");

  forceGcIfAvailable();

  const beforeOpenMemory = process.memoryUsage();
  const openStart = performance.now();

  const db = openColumnarBitsetDBV2(filePath);

  const openEnd = performance.now();
  const afterOpenMemory = process.memoryUsage();

  console.log("Open / Build Columnar Runtime");
  console.log("-----------------------------");
  console.log(`Open time:  ${formatMs(openEnd - openStart)}`);
  console.log(`Bytes:      ${db.stats.bytes.toLocaleString()}`);
  console.log(`Lines:      ${db.stats.lineCount.toLocaleString()}`);
  console.log(`People:     ${db.stats.personCount.toLocaleString()}`);
  console.log(`Companies:  ${db.stats.companyCount.toLocaleString()}`);
  console.log(`Bit words:  ${db.stats.personBitWords.toLocaleString()}`);
  console.log("");

  console.log("Memory Delta During Open");
  console.log("------------------------");
  printMemoryDelta(getMemoryDelta(beforeOpenMemory, afterOpenMemory));
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

  console.log("Initial Timings");
  console.log("---------------");
  console.log(correctness.timings);
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

function openColumnarBitsetDBV2(inputPath) {
  const buffer = fs.readFileSync(inputPath);

  const companyAnchorToIndex = new Map();

  const companyStarts = [];
  const companyEnds = [];
  const companyIndustryIdsTemp = [];

  const industryToId = new Map();
  const idToIndustry = ["unknown"];

  let lineCount = 0;
  let personCount = 0;

  function getIndustryId(industry) {
    if (!industry) return INDUSTRY_UNKNOWN;

    let id = industryToId.get(industry);

    if (id !== undefined) return id;

    id = idToIndustry.length;
    industryToId.set(industry, id);
    idToIndustry.push(industry);

    return id;
  }

  /*
   * Pass 1:
   * Count people and build company dictionary.
   *
   * We do not split the whole file into an array of lines.
   * We scan byte ranges and parse one line at a time.
   */
  scanJsonlBuffer(buffer, (node, start, end) => {
    lineCount += 1;

    const topic = node["^"];

    if (topic === "company") {
      const companyIndex = companyStarts.length;

      companyAnchorToIndex.set(node["#"], companyIndex);

      companyStarts.push(start);
      companyEnds.push(end);
      companyIndustryIdsTemp.push(getIndustryId(node["~industry"] || null));

      return;
    }

    if (topic === "person") {
      personCount += 1;
    }
  });

  const companyCount = companyStarts.length;

  /*
   * Company lanes.
   */
  const companyPayloadStarts = Uint32Array.from(companyStarts);
  const companyPayloadEnds = Uint32Array.from(companyEnds);
  const companyIndustryIds = new Uint16Array(companyCount);

  for (let i = 0; i < companyCount; i += 1) {
    companyIndustryIds[i] = companyIndustryIdsTemp[i];
  }

  /*
   * Person lanes.
   */
  const personPayloadStarts = new Uint32Array(personCount);
  const personPayloadEnds = new Uint32Array(personCount);
  const personAges = new Uint8Array(personCount);
  const personStatusIds = new Uint8Array(personCount);
  const personSalaries = new Uint32Array(personCount);
  const personCompanyIndexes = new Uint32Array(personCount);

  const activePeople = createBitset(personCount);
  const under40People = createBitset(personCount);
  const agriculturePeople = createBitset(personCount);

  const agricultureIndustryId = industryToId.get("Agriculture");

  /*
   * Pass 2:
   * Fill person lanes and predicate bitsets.
   */
  let personIndex = 0;

  scanJsonlBuffer(buffer, (node, start, end) => {
    if (node["^"] !== "person") {
      return;
    }

    const age = toNumberOrZero(node["~age"]);
    const statusId = getStatusId(node["~status"]);
    const salary = toNumberOrZero(node["~salary"]);

    const companyAnchor = node["@company"] || null;
    const companyIndex = companyAnchorToIndex.get(companyAnchor);

    personPayloadStarts[personIndex] = start;
    personPayloadEnds[personIndex] = end;
    personAges[personIndex] = age;
    personStatusIds[personIndex] = statusId;
    personSalaries[personIndex] = salary;
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

  return {
    buffer,

    stats: {
      bytes: buffer.byteLength,
      lineCount,
      personCount,
      companyCount,
      personBitWords: activePeople.length,
    },

    dictionaries: {
      industryToId,
      idToIndustry,
    },

    lanes: {
      person: {
        payloadStarts: personPayloadStarts,
        payloadEnds: personPayloadEnds,
        ages: personAges,
        statusIds: personStatusIds,
        salaries: personSalaries,
        companyIndexes: personCompanyIndexes,
      },

      company: {
        payloadStarts: companyPayloadStarts,
        payloadEnds: companyPayloadEnds,
        industryIds: companyIndustryIds,
      },
    },

    bitsets: {
      activePeople,
      under40People,
      agriculturePeople,
    },
  };
}

function answerOnlySearch(db) {
  const start = performance.now();

  const personIndex = findFirstAndMatch(
    db.bitsets.activePeople,
    db.bitsets.under40People,
    db.bitsets.agriculturePeople,
    db.stats.personCount,
  );

  const searchEnd = performance.now();

  if (personIndex < 0) {
    return {
      answer: null,
      personIndex: -1,
      timings: {
        searchMs: searchEnd - start,
        hydrateMs: 0,
        totalMs: searchEnd - start,
      },
    };
  }

  const hydrateStart = performance.now();
  const result = hydratePersonCompany(db, personIndex);
  const hydrateEnd = performance.now();

  return {
    answer: result.answer,
    personIndex,
    result,
    timings: {
      searchMs: searchEnd - start,
      hydrateMs: hydrateEnd - hydrateStart,
      totalMs: hydrateEnd - start,
    },
  };
}

function debugSearch(db, options = {}) {
  const hydrateLimit = options.hydrateLimit ?? 10;

  const start = performance.now();

  const finalMatchesBitset = andBitsets(
    db.bitsets.activePeople,
    db.bitsets.under40People,
    db.bitsets.agriculturePeople,
  );

  const andEnd = performance.now();

  const finalMatchCount = countSetBits(finalMatchesBitset);

  const countEnd = performance.now();

  const matchingIndexes = collectSetBitsLimited(
    finalMatchesBitset,
    db.stats.personCount,
    hydrateLimit,
  );

  const collectEnd = performance.now();

  const results = [];

  for (const personIndex of matchingIndexes) {
    results.push(hydratePersonCompany(db, personIndex));
  }

  const hydrateEnd = performance.now();

  return {
    answer: results[0]?.answer || null,
    results,
    candidateCounts: {
      topicMatches: db.stats.personCount,
      statusMatches: countSetBits(db.bitsets.activePeople),
      ageMatches: countSetBits(db.bitsets.under40People),
      industryMatches: countSetBits(db.bitsets.agriculturePeople),
      finalMatches: finalMatchCount,
    },
    timings: {
      bitsetAndMs: andEnd - start,
      countFinalMs: countEnd - andEnd,
      collectLimitedMs: collectEnd - countEnd,
      hydrateMs: hydrateEnd - collectEnd,
      totalMs: hydrateEnd - start,
    },
  };
}

function hydratePersonCompany(db, personIndex) {
  const personNode = parseNodeAt(
    db.buffer,
    db.lanes.person.payloadStarts[personIndex],
    db.lanes.person.payloadEnds[personIndex],
  );

  const companyIndex = db.lanes.person.companyIndexes[personIndex];

  const companyNode =
    companyIndex === INVALID_INDEX
      ? null
      : parseNodeAt(
          db.buffer,
          db.lanes.company.payloadStarts[companyIndex],
          db.lanes.company.payloadEnds[companyIndex],
        );

  const personName = getPersonDisplayName(personNode);

  return {
    answer: personName,
    data: {
      person: {
        index: personIndex,
        anchor: personNode["#"],
        name: personName,
        age: db.lanes.person.ages[personIndex],
        status: statusNameFromId(db.lanes.person.statusIds[personIndex]),
        salary: db.lanes.person.salaries[personIndex],
        location: {
          city: personNode["~city"] || null,
          state: personNode["~state"] || null,
          country: personNode["~country"] || null,
        },
      },
      company: companyNode
        ? {
            index: companyIndex,
            anchor: companyNode["#"],
            name: companyNode["~name"] || null,
            industry:
              db.dictionaries.idToIndustry[
                db.lanes.company.industryIds[companyIndex]
              ],
            founded: toNumberOrZero(companyNode["~founded"]),
            headquarters: {
              city: companyNode["~city"] || null,
              state: companyNode["~state"] || null,
              country: companyNode["~country"] || null,
            },
          }
        : null,
    },
  };
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

function andBitsets(...bitsets) {
  if (bitsets.length === 0) {
    return new Uint32Array(0);
  }

  const result = new Uint32Array(bitsets[0].length);

  for (let wordIndex = 0; wordIndex < result.length; wordIndex += 1) {
    let word = bitsets[0][wordIndex];

    for (let bitsetIndex = 1; bitsetIndex < bitsets.length; bitsetIndex += 1) {
      word &= bitsets[bitsetIndex][wordIndex];
    }

    result[wordIndex] = word;
  }

  return result;
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

function getStatusId(status) {
  if (status === "active") return STATUS_ACTIVE;
  if (status === "inactive") return STATUS_INACTIVE;
  if (status === "pending") return STATUS_PENDING;

  return STATUS_UNKNOWN;
}

function statusNameFromId(statusId) {
  if (statusId === STATUS_ACTIVE) return "active";
  if (statusId === STATUS_INACTIVE) return "inactive";
  if (statusId === STATUS_PENDING) return "pending";

  return "unknown";
}

function getPersonDisplayName(node) {
  if (node["~fullName"]) return node["~fullName"];
  if (node["~name"]) return node["~name"];

  const firstName = node["~firstName"] || node["~first_name"] || node["~first"];
  const lastName = node["~lastName"] || node["~last_name"] || node["~last"];

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
