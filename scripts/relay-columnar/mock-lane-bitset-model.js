/**
 * Author: Kris Sherbondy
 * Date: 2026-05-22
 * Purpose:
 *   Mock the RelayDB lane + bitset memory model in plain JavaScript.
 *
 *   Demonstrates:
 *     1. Shared record index
 *     2. Contiguous typed lanes
 *     3. Predicate bitsets
 *     4. Bitwise query execution
 *     5. Hydration by gathering index X across lanes
 */

const STATUS = {
  unknown: 0,
  active: 1,
  inactive: 2,
};

const STATUS_NAME = {
  0: "unknown",
  1: "active",
  2: "inactive",
};

const INDUSTRY = {
  unknown: 0,
  Agriculture: 1,
  Finance: 2,
  Technology: 3,
};

const INDUSTRY_NAME = {
  0: "unknown",
  1: "Agriculture",
  2: "Finance",
  3: "Technology",
};

/**
 * Mock source records.
 *
 * In a real RelayDB file, these would already be compiled into lanes.
 */
const source = {
  companies: [
    { id: "comp1", name: "Green Fields Co", industry: "Agriculture" },
    { id: "comp2", name: "Nova Finance", industry: "Finance" },
    { id: "comp3", name: "BrightPath Labs", industry: "Technology" },
  ],

  people: [
    { id: "per1", firstName: "Alice", lastName: "Reed", age: 37, status: "active", companyIndex: 0 },
    { id: "per2", firstName: "Bob", lastName: "Stone", age: 55, status: "inactive", companyIndex: 1 },
    { id: "per3", firstName: "Cara", lastName: "Miles", age: 22, status: "active", companyIndex: 0 },
    { id: "per4", firstName: "Dan", lastName: "West", age: 41, status: "active", companyIndex: 2 },
    { id: "per5", firstName: "Eva", lastName: "North", age: 39, status: "active", companyIndex: 0 },
    { id: "per6", firstName: "Finn", lastName: "Cole", age: 28, status: "inactive", companyIndex: 1 },
    { id: "per7", firstName: "Gina", lastName: "Vale", age: 60, status: "active", companyIndex: 2 },
    { id: "per8", firstName: "Hank", lastName: "Blue", age: 19, status: "active", companyIndex: 0 },
    { id: "per9", firstName: "Ivy", lastName: "Ray", age: 44, status: "inactive", companyIndex: 1 },
    { id: "per10", firstName: "Jack", lastName: "Moss", age: 31, status: "active", companyIndex: 0 },
  ],
};

main();

function main() {
  const db = buildMockLaneDB(source);

  console.log("RelayDB Lane + Bitset Mock");
  console.log("==========================");
  console.log("");

  printLaneModel(db);

  console.log("");
  console.log("Hydrate person index 0");
  console.log("----------------------");
  console.log(hydratePerson(db, 0));

  console.log("");
  console.log("Query: active agriculture people under 40");
  console.log("-----------------------------------------");

  const result = queryActiveAgricultureUnder40(db);

  console.log("Matching indexes:", result.matchingIndexes);
  console.log("Matching records:");
  console.log(result.records);

  console.log("");
  console.log("Bitsets");
  console.log("-------");
  console.log("activePeople:       ", bitsetToBinaryString(db.bitsets.activePeople, db.personCount));
  console.log("under40People:      ", bitsetToBinaryString(db.bitsets.under40People, db.personCount));
  console.log("agriculturePeople:  ", bitsetToBinaryString(db.bitsets.agriculturePeople, db.personCount));
  console.log("combined matches:   ", bitsetToBinaryString(result.matchBitset, db.personCount));
}

function buildMockLaneDB(input) {
  const personCount = input.people.length;
  const companyCount = input.companies.length;

  /*
   * Company lanes.
   *
   * Same idea:
   *   company index 0 means the same company across every company lane.
   */
  const companyIds = new Array(companyCount);
  const companyNames = new Array(companyCount);
  const companyIndustryIds = new Uint8Array(companyCount);

  for (let i = 0; i < companyCount; i += 1) {
    const company = input.companies[i];

    companyIds[i] = company.id;
    companyNames[i] = company.name;
    companyIndustryIds[i] = INDUSTRY[company.industry] || INDUSTRY.unknown;
  }

  /*
   * Person lanes.
   *
   * Every lane uses the same person index:
   *
   * person index 0:
   *   personIds[0]
   *   firstNames[0]
   *   lastNames[0]
   *   ages[0]
   *   statusIds[0]
   *   companyIndexes[0]
   */
  const personIds = new Array(personCount);
  const firstNames = new Array(personCount);
  const lastNames = new Array(personCount);

  const ages = new Uint8Array(personCount);
  const statusIds = new Uint8Array(personCount);
  const companyIndexes = new Uint32Array(personCount);

  for (let i = 0; i < personCount; i += 1) {
    const person = input.people[i];

    personIds[i] = person.id;
    firstNames[i] = person.firstName;
    lastNames[i] = person.lastName;
    ages[i] = person.age;
    statusIds[i] = STATUS[person.status] || STATUS.unknown;
    companyIndexes[i] = person.companyIndex;
  }

  /*
   * Predicate bitsets.
   *
   * One bit per person.
   *
   * bit 0 means person index 0.
   * bit 1 means person index 1.
   * etc.
   */
  const activePeople = createBitset(personCount);
  const under40People = createBitset(personCount);
  const agriculturePeople = createBitset(personCount);

  for (let i = 0; i < personCount; i += 1) {
    if (statusIds[i] === STATUS.active) {
      setBit(activePeople, i);
    }

    if (ages[i] < 40) {
      setBit(under40People, i);
    }

    const companyIndex = companyIndexes[i];
    const companyIndustryId = companyIndustryIds[companyIndex];

    if (companyIndustryId === INDUSTRY.Agriculture) {
      setBit(agriculturePeople, i);
    }
  }

  return {
    personCount,
    companyCount,

    lanes: {
      person: {
        ids: personIds,
        firstNames,
        lastNames,
        ages,
        statusIds,
        companyIndexes,
      },

      company: {
        ids: companyIds,
        names: companyNames,
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

function queryActiveAgricultureUnder40(db) {
  const matches = andBitsets(
    db.bitsets.activePeople,
    db.bitsets.under40People,
    db.bitsets.agriculturePeople,
  );

  const matchingIndexes = collectSetBits(matches, db.personCount);
  const records = matchingIndexes.map((personIndex) => hydratePerson(db, personIndex));

  return {
    matchBitset: matches,
    matchingIndexes,
    records,
  };
}

function hydratePerson(db, personIndex) {
  const person = db.lanes.person;
  const company = db.lanes.company;

  const companyIndex = person.companyIndexes[personIndex];

  return {
    id: person.ids[personIndex],
    firstName: person.firstNames[personIndex],
    lastName: person.lastNames[personIndex],
    age: person.ages[personIndex],
    status: STATUS_NAME[person.statusIds[personIndex]],
    company: {
      id: company.ids[companyIndex],
      name: company.names[companyIndex],
      industry: INDUSTRY_NAME[company.industryIds[companyIndex]],
    },
  };
}

function createBitset(recordCount) {
  return new Uint32Array(Math.ceil(recordCount / 32));
}

function setBit(bitset, index) {
  bitset[index >> 5] |= 1 << (index & 31);
}

function clearBit(bitset, index) {
  bitset[index >> 5] &= ~(1 << (index & 31));
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

function bitsetToBinaryString(bitset, recordCount) {
  let output = "";

  for (let index = 0; index < recordCount; index += 1) {
    output += hasBit(bitset, index) ? "1" : "0";
  }

  return output;
}

function printLaneModel(db) {
  console.log("Person lanes");
  console.log("------------");
  console.log("ids:            ", db.lanes.person.ids);
  console.log("firstNames:     ", db.lanes.person.firstNames);
  console.log("lastNames:      ", db.lanes.person.lastNames);
  console.log("ages:           ", Array.from(db.lanes.person.ages));
  console.log("statusIds:      ", Array.from(db.lanes.person.statusIds));
  console.log("companyIndexes: ", Array.from(db.lanes.person.companyIndexes));

  console.log("");
  console.log("Company lanes");
  console.log("-------------");
  console.log("ids:         ", db.lanes.company.ids);
  console.log("names:       ", db.lanes.company.names);
  console.log("industryIds: ", Array.from(db.lanes.company.industryIds));
}