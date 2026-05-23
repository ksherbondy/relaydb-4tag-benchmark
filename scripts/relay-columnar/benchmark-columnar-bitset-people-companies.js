/**
 * Author: Kris Sherbondy
 * Date: 2026-05-22
 * Purpose:
 *   Benchmark a RelayDB columnar lane + predicate bitset model against the
 *   generated people/companies 4-tag JSONL dataset.
 *
 *   Demonstrates:
 *     1. Shared record index per topic
 *     2. Contiguous typed lanes
 *     3. Predicate bitsets
 *     4. Bitwise query execution
 *     5. Lazy hydration/gather after matching
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

  console.log("RelayDB Columnar Bitset Benchmark");
  console.log("=================================");
  console.log(`Dataset: ${filePath}`);
  console.log(`Question: ${question}`);
  console.log(`Warmup iterations: ${warmupIterations}`);
  console.log(`Measured iterations: ${measuredIterations}`);
  console.log("");

  forceGcIfAvailable();

  const beforeOpenMemory = process.memoryUsage();
  const openStart = performance.now();

  const db = openColumnarBitsetDB(filePath);

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

  const correctness = searchActiveAgricultureUnder40(db, {
    hydrateLimit: 1,
    explain: true,
  });

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
  warmup("answerOnly", warmupIterations, () =>
    searchActiveAgricultureUnder40(db, { hydrateLimit: 1, explain: false }),
  );
  warmup("debugStyle", warmupIterations, () =>
    searchActiveAgricultureUnder40(db, { hydrateLimit: 10, explain: true }),
  );
  console.log("");

  console.log("Benchmark");
  console.log("---------");
  benchmark("answerOnly", measuredIterations, () =>
    searchActiveAgricultureUnder40(db, { hydrateLimit: 1, explain: false }),
  );
  benchmark("debugStyle", measuredIterations, () =>
    searchActiveAgricultureUnder40(db, { hydrateLimit: 10, explain: true }),
  );
}

function openColumnarBitsetDB(inputPath) {
  const text = fs.readFileSync(inputPath, "utf8");
  const lines = text.split(/\r?\n/).filter(Boolean);

  const companyAnchors = [];
  const companyNames = [];
  const companyIndustryIds = [];
  const companyFounded = [];
  const companyCities = [];
  const companyStates = [];
  const companyCountries = [];

  const companyAnchorToIndex = new Map();

  const personAnchors = [];
  const personNames = [];
  const personAgesTemp = [];
  const personStatusIdsTemp = [];
  const personSalaryTemp = [];
  const personCompanyAnchorsTemp = [];
  const personCities = [];
  const personStates = [];
  const personCountries = [];

  const industryToId = new Map();
  const idToIndustry = ["unknown"];

  function getIndustryId(industry) {
    if (!industry) return INDUSTRY_UNKNOWN;

    let id = industryToId.get(industry);

    if (id !== undefined) {
      return id;
    }

    id = idToIndustry.length;
    industryToId.set(industry, id);
    idToIndustry.push(industry);

    return id;
  }

  /*
   * Pass 1:
   * Parse source JSONL once into temporary arrays.
   *
   * This still uses JS strings/arrays because this is a prototype over JSONL.
   * The actual lane model begins once we convert these into typed lanes below.
   */
  for (const line of lines) {
    const node = JSON.parse(line);
    const topic = node["^"];

    if (topic === "company") {
      const companyIndex = companyAnchors.length;
      const industry = node["~industry"] || null;

      companyAnchorToIndex.set(node["#"], companyIndex);

      companyAnchors.push(node["#"]);
      companyNames.push(node["~name"] || null);
      companyIndustryIds.push(getIndustryId(industry));
      companyFounded.push(toNumberOrZero(node["~founded"]));
      companyCities.push(node["~city"] || null);
      companyStates.push(node["~state"] || null);
      companyCountries.push(node["~country"] || null);

      continue;
    }

    if (topic === "person") {
      personAnchors.push(node["#"]);
      personNames.push(getPersonDisplayName(node));
      personAgesTemp.push(toNumberOrZero(node["~age"]));
      personStatusIdsTemp.push(getStatusId(node["~status"]));
      personSalaryTemp.push(toNumberOrZero(node["~salary"]));
      personCompanyAnchorsTemp.push(node["@company"] || null);
      personCities.push(node["~city"] || null);
      personStates.push(node["~state"] || null);
      personCountries.push(node["~country"] || null);
    }
  }

  const personCount = personAnchors.length;
  const companyCount = companyAnchors.length;

  /*
   * Typed lanes.
   */
  const personAges = new Uint8Array(personCount);
  const personStatusIds = new Uint8Array(personCount);
  const personSalaries = new Uint32Array(personCount);
  const personCompanyIndexes = new Uint32Array(personCount);

  const companyIndustries = new Uint16Array(companyCount);
  const companyFoundedYears = new Uint16Array(companyCount);

  for (let i = 0; i < companyCount; i += 1) {
    companyIndustries[i] = companyIndustryIds[i];
    companyFoundedYears[i] = companyFounded[i];
  }

  for (let i = 0; i < personCount; i += 1) {
    personAges[i] = personAgesTemp[i];
    personStatusIds[i] = personStatusIdsTemp[i];
    personSalaries[i] = personSalaryTemp[i];

    const companyAnchor = personCompanyAnchorsTemp[i];
    const companyIndex = companyAnchorToIndex.get(companyAnchor);

    personCompanyIndexes[i] =
      companyIndex === undefined ? 0xffffffff : companyIndex;
  }

  /*
   * Predicate bitsets.
   *
   * These are person-level bitsets. One bit per person.
   */
  const activePeople = createBitset(personCount);
  const under40People = createBitset(personCount);
  const agriculturePeople = createBitset(personCount);

  const agricultureIndustryId = industryToId.get("Agriculture");

  for (let i = 0; i < personCount; i += 1) {
    if (personStatusIds[i] === STATUS_ACTIVE) {
      setBit(activePeople, i);
    }

    if (personAges[i] < 40) {
      setBit(under40People, i);
    }

    const companyIndex = personCompanyIndexes[i];

    if (
      companyIndex !== 0xffffffff &&
      companyIndustries[companyIndex] === agricultureIndustryId
    ) {
      setBit(agriculturePeople, i);
    }
  }

  return {
    stats: {
      bytes: Buffer.byteLength(text),
      lineCount: lines.length,
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
        anchors: personAnchors,
        names: personNames,
        ages: personAges,
        statusIds: personStatusIds,
        salaries: personSalaries,
        companyIndexes: personCompanyIndexes,
        cities: personCities,
        states: personStates,
        countries: personCountries,
      },

      company: {
        anchors: companyAnchors,
        names: companyNames,
        industryIds: companyIndustries,
        foundedYears: companyFoundedYears,
        cities: companyCities,
        states: companyStates,
        countries: companyCountries,
      },
    },

    bitsets: {
      activePeople,
      under40People,
      agriculturePeople,
    },
  };
}

function searchActiveAgricultureUnder40(db, options = {}) {
  const hydrateLimit = options.hydrateLimit ?? 1;
  const explain = options.explain === true;

  const start = performance.now();

  const matches = andBitsets(
    db.bitsets.activePeople,
    db.bitsets.under40People,
    db.bitsets.agriculturePeople,
  );

  const andEnd = performance.now();

  const matchingIndexes = collectSetBits(matches, db.stats.personCount);

  const collectEnd = performance.now();

  const results = [];
  const maxHydrate = Math.min(hydrateLimit, matchingIndexes.length);

  for (let i = 0; i < maxHydrate; i += 1) {
    results.push(hydratePersonCompany(db, matchingIndexes[i]));
  }

  const hydrateEnd = performance.now();

  const response = {
    answer: results[0]?.answer || null,
    results,
  };

  if (explain) {
    response.candidateCounts = {
      topicMatches: db.stats.personCount,
      statusMatches: countSetBits(db.bitsets.activePeople),
      ageMatches: countSetBits(db.bitsets.under40People),
      industryMatches: countSetBits(db.bitsets.agriculturePeople),
      finalMatches: matchingIndexes.length,
    };

    response.timings = {
      bitsetAndMs: andEnd - start,
      collectMs: collectEnd - andEnd,
      hydrateMs: hydrateEnd - collectEnd,
      totalMs: hydrateEnd - start,
    };
  }

  return response;
}

function hydratePersonCompany(db, personIndex) {
  const person = db.lanes.person;
  const company = db.lanes.company;

  const companyIndex = person.companyIndexes[personIndex];
  const industryId = company.industryIds[companyIndex];

  const personName = person.names[personIndex] || person.anchors[personIndex];

  return {
    answer: personName,
    data: {
      person: {
        index: personIndex,
        anchor: person.anchors[personIndex],
        name: personName,
        age: person.ages[personIndex],
        status: statusNameFromId(person.statusIds[personIndex]),
        salary: person.salaries[personIndex],
        location: {
          city: person.cities[personIndex],
          state: person.states[personIndex],
          country: person.countries[personIndex],
        },
      },
      company: {
        index: companyIndex,
        anchor: company.anchors[companyIndex],
        name: company.names[companyIndex],
        industry: db.dictionaries.idToIndustry[industryId],
        founded: company.foundedYears[companyIndex],
        headquarters: {
          city: company.cities[companyIndex],
          state: company.states[companyIndex],
          country: company.countries[companyIndex],
        },
      },
    },
  };
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

function collectSetBits(bitset, recordCount) {
  const indexes = [];

  for (let wordIndex = 0; wordIndex < bitset.length; wordIndex += 1) {
    let word = bitset[wordIndex];

    while (word !== 0) {
      const lowestBit = word & -word;
      const bitIndex = 31 - Math.clz32(lowestBit);
      const recordIndex = wordIndex * 32 + bitIndex;

      if (recordIndex < recordCount) {
        indexes.push(recordIndex);
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
    if (Array.isArray(value.results)) {
      return value.results.length + (value.candidateCounts?.finalMatches || 0);
    }

    return JSON.stringify(value).length;
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