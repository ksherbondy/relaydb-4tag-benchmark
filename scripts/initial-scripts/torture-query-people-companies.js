/**
 * Author: Project Owner
 * Date: 2026-05-21
 * Purpose:
 *   Run relationship-heavy "torture queries" against four data lanes:
 *
 *   1. Raw split JSONL
 *   2. Raw merged JSONL
 *   3. Tagged split JSONL
 *   4. Tagged merged JSONL
 *
 *   This test is not just measuring simple lookup speed.
 *   It measures how each shape handles messy, cross-cutting questions
 *   involving people, companies, households, locations, interests,
 *   salaries, industries, and relationship traversal.
 *
 * Usage:
 *   node scripts/torture-query-people-companies.js
 *
 * Optional:
 *   node scripts/torture-query-people-companies.js 100 10000
 *
 *   First arg  = benchmark iterations
 *   Second arg = query suites per run
 */

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { performance } = require("perf_hooks");

const DEFAULT_ITERATIONS = 100;
const DEFAULT_QUERY_SUITES_PER_RUN = 10_000;

const iterations = Number(process.argv[2] || DEFAULT_ITERATIONS);
const querySuitesPerRun = Number(
  process.argv[3] || DEFAULT_QUERY_SUITES_PER_RUN,
);

const RAW_COMPANIES_PATH = path.join(
  process.cwd(),
  "datasets",
  "raw",
  "companies.jsonl",
);

const RAW_PEOPLE_PATH = path.join(
  process.cwd(),
  "datasets",
  "raw",
  "people.jsonl",
);

const RAW_MERGED_PATH = path.join(
  process.cwd(),
  "datasets",
  "merged",
  "people-companies.raw.merged.jsonl",
);

const TAGGED_COMPANIES_PATH = path.join(
  process.cwd(),
  "datasets",
  "tagged",
  "companies.4tag.jsonl",
);

const TAGGED_PEOPLE_PATH = path.join(
  process.cwd(),
  "datasets",
  "tagged",
  "people.4tag.jsonl",
);

const TAGGED_MERGED_PATH = path.join(
  process.cwd(),
  "datasets",
  "merged",
  "people-companies.4tag.merged.jsonl",
);

const REPORT_JSON_PATH = path.join(
  process.cwd(),
  "reports",
  "people-companies.torture-query.benchmark.json",
);

const REPORT_MD_PATH = path.join(
  process.cwd(),
  "reports",
  "people-companies.torture-query.benchmark.md",
);

ensureFileExists(RAW_COMPANIES_PATH);
ensureFileExists(RAW_PEOPLE_PATH);
ensureFileExists(RAW_MERGED_PATH);
ensureFileExists(TAGGED_COMPANIES_PATH);
ensureFileExists(TAGGED_PEOPLE_PATH);
ensureFileExists(TAGGED_MERGED_PATH);
ensureDirectory(REPORT_JSON_PATH);

if (!Number.isInteger(iterations) || iterations <= 0) {
  console.error("Iterations must be a positive integer.");
  process.exit(1);
}

if (!Number.isInteger(querySuitesPerRun) || querySuitesPerRun <= 0) {
  console.error("Query suites per run must be a positive integer.");
  process.exit(1);
}

function ensureFileExists(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error(`Missing file: ${filePath}`);
    process.exit(1);
  }
}

function ensureDirectory(filePath) {
  const dir = path.dirname(filePath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

async function readJsonl(filePath) {
  const records = [];

  const stream = fs.createReadStream(filePath, {
    encoding: "utf8",
  });

  const rl = readline.createInterface({
    input: stream,
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    const trimmed = line.trim();

    if (!trimmed) continue;

    records.push(JSON.parse(trimmed));
  }

  return records;
}

function getRawFullName(personRecord) {
  const first = personRecord.person?.name?.first || "";
  const last = personRecord.person?.name?.last || "";

  return `${first} ${last}`.trim();
}

function getTaggedFullName(personNode) {
  return personNode.name?.full || "";
}

function rawLocationKey(location) {
  return [
    location?.country || "unknown",
    location?.state || "unknown",
    location?.city || "unknown",
  ].join(":");
}

function arrayIntersectionCount(left, right) {
  const rightSet = new Set(right);
  let count = 0;

  for (const item of left) {
    if (rightSet.has(item)) {
      count += 1;
    }
  }

  return count;
}

function buildRawGraph(companies, people) {
  const start = performance.now();

  const companiesById = new Map();
  const companiesByName = new Map();
  const peopleById = new Map();
  const peopleByCompanyName = new Map();
  const peopleByHousehold = new Map();
  const peopleByInterest = new Map();
  const companiesByIndustry = new Map();
  const missingCompanyLinks = [];

  for (const company of companies) {
    companiesById.set(company.id, company);
    companiesByName.set(company.name, company);

    if (!companiesByIndustry.has(company.industry)) {
      companiesByIndustry.set(company.industry, []);
    }

    companiesByIndustry.get(company.industry).push(company);
  }

  for (const person of people) {
    peopleById.set(person.id, person);

    const householdId = person.household_id;
    const companyName = person.person?.job?.company_name || null;
    const interests = person.person?.interests || [];

    if (!peopleByHousehold.has(householdId)) {
      peopleByHousehold.set(householdId, []);
    }

    peopleByHousehold.get(householdId).push(person);

    for (const interest of interests) {
      if (!peopleByInterest.has(interest)) {
        peopleByInterest.set(interest, []);
      }

      peopleByInterest.get(interest).push(person);
    }

    if (!companyName) {
      missingCompanyLinks.push({
        personId: person.id,
        reason: "missing_company_name",
      });

      continue;
    }

    const company = companiesByName.get(companyName);

    if (!company) {
      missingCompanyLinks.push({
        personId: person.id,
        companyName,
        reason: "company_name_not_found",
      });

      continue;
    }

    if (!peopleByCompanyName.has(companyName)) {
      peopleByCompanyName.set(companyName, []);
    }

    peopleByCompanyName.get(companyName).push(person);
  }

  const end = performance.now();

  return {
    companies,
    people,
    companiesById,
    companiesByName,
    peopleById,
    peopleByCompanyName,
    peopleByHousehold,
    peopleByInterest,
    companiesByIndustry,
    missingCompanyLinks,
    buildMs: end - start,
  };
}

function buildRawGraphFromMerged(records) {
  const start = performance.now();

  const companies = [];
  const people = [];

  for (const record of records) {
    if (record.__record_type === "company") {
      companies.push(record);
    }

    if (record.__record_type === "person") {
      people.push(record);
    }
  }

  const graph = buildRawGraph(companies, people);

  const end = performance.now();

  return {
    ...graph,
    buildMs: end - start,
  };
}

function buildTaggedGraph(nodes) {
  const start = performance.now();

  const nodesByAnchor = new Map();
  const nodesByTopic = new Map();
  const peopleByCompanyAnchor = new Map();
  const peopleByHouseholdAnchor = new Map();
  const peopleByInterestAnchor = new Map();
  const companiesByIndustryAnchor = new Map();
  const missingLinks = [];

  for (const node of nodes) {
    const anchor = node["#"];
    const topic = node["^"];

    if (!anchor || !topic) continue;

    nodesByAnchor.set(anchor, node);

    if (!nodesByTopic.has(topic)) {
      nodesByTopic.set(topic, []);
    }

    nodesByTopic.get(topic).push(node);
  }

  const people = nodesByTopic.get("person") || [];
  const companies = nodesByTopic.get("company") || [];

  for (const company of companies) {
    const industryAnchor = company["@industry"];

    if (!industryAnchor) continue;

    if (!companiesByIndustryAnchor.has(industryAnchor)) {
      companiesByIndustryAnchor.set(industryAnchor, []);
    }

    companiesByIndustryAnchor.get(industryAnchor).push(company);
  }

  for (const person of people) {
    const companyAnchor = person["@company"];
    const householdAnchor = person["@household"];
    const interestAnchors = person["@interests"] || [];

    if (householdAnchor) {
      if (!peopleByHouseholdAnchor.has(householdAnchor)) {
        peopleByHouseholdAnchor.set(householdAnchor, []);
      }

      peopleByHouseholdAnchor.get(householdAnchor).push(person);
    }

    for (const interestAnchor of interestAnchors) {
      if (!peopleByInterestAnchor.has(interestAnchor)) {
        peopleByInterestAnchor.set(interestAnchor, []);
      }

      peopleByInterestAnchor.get(interestAnchor).push(person);
    }

    if (!companyAnchor) {
      missingLinks.push({
        personAnchor: person["#"],
        reason: "missing_company_anchor",
      });

      continue;
    }

    if (!nodesByAnchor.has(companyAnchor)) {
      missingLinks.push({
        personAnchor: person["#"],
        companyAnchor,
        reason: "company_anchor_not_found",
      });

      continue;
    }

    if (!peopleByCompanyAnchor.has(companyAnchor)) {
      peopleByCompanyAnchor.set(companyAnchor, []);
    }

    peopleByCompanyAnchor.get(companyAnchor).push(person);
  }

  const end = performance.now();

  return {
    nodes,
    nodesByAnchor,
    nodesByTopic,
    people,
    companies,
    peopleByCompanyAnchor,
    peopleByHouseholdAnchor,
    peopleByInterestAnchor,
    companiesByIndustryAnchor,
    missingLinks,
    buildMs: end - start,
  };
}

function rawPeopleHomeStateDiffersFromCompanyState(graph) {
  const results = [];

  for (const person of graph.people) {
    const companyName = person.person?.job?.company_name;
    const company = graph.companiesByName.get(companyName);

    if (!company) continue;

    const homeState = person.person?.location?.state;
    const companyState = company.headquarters?.state;

    if (homeState && companyState && homeState !== companyState) {
      results.push(person.id);
    }
  }

  return results;
}

function taggedPeopleHomeStateDiffersFromCompanyState(graph) {
  const results = [];

  for (const person of graph.people) {
    const company = graph.nodesByAnchor.get(person["@company"]);
    const personLocation = graph.nodesByAnchor.get(person["@location"]);
    const companyLocation = graph.nodesByAnchor.get(company?.["@headquarters"]);

    if (!company || !personLocation || !companyLocation) continue;

    if (
      personLocation["~state"] &&
      companyLocation["~state"] &&
      personLocation["~state"] !== companyLocation["~state"]
    ) {
      results.push(person["#"]);
    }
  }

  return results;
}

function rawHouseholdsWithMultipleCompanies(graph) {
  const results = [];

  for (const [householdId, people] of graph.peopleByHousehold.entries()) {
    const companies = new Set();

    for (const person of people) {
      const companyName = person.person?.job?.company_name;

      if (companyName) {
        companies.add(companyName);
      }
    }

    if (companies.size > 1) {
      results.push(householdId);
    }
  }

  return results;
}

function taggedHouseholdsWithMultipleCompanies(graph) {
  const results = [];

  for (const [householdAnchor, people] of graph.peopleByHouseholdAnchor.entries()) {
    const companies = new Set();

    for (const person of people) {
      if (person["@company"]) {
        companies.add(person["@company"]);
      }
    }

    if (companies.size > 1) {
      results.push(householdAnchor);
    }
  }

  return results;
}

function rawPeopleSharingInterestsWithCoworkers(graph) {
  const results = new Set();

  for (const people of graph.peopleByCompanyName.values()) {
    for (let i = 0; i < people.length; i++) {
      const left = people[i];
      const leftInterests = left.person?.interests || [];

      for (let j = i + 1; j < people.length; j++) {
        const right = people[j];
        const rightInterests = right.person?.interests || [];

        if (arrayIntersectionCount(leftInterests, rightInterests) > 0) {
          results.add(left.id);
          results.add(right.id);
        }
      }
    }
  }

  return Array.from(results);
}

function taggedPeopleSharingInterestsWithCoworkers(graph) {
  const results = new Set();

  for (const people of graph.peopleByCompanyAnchor.values()) {
    for (let i = 0; i < people.length; i++) {
      const left = people[i];
      const leftInterests = left["@interests"] || [];

      for (let j = i + 1; j < people.length; j++) {
        const right = people[j];
        const rightInterests = right["@interests"] || [];

        if (arrayIntersectionCount(leftInterests, rightInterests) > 0) {
          results.add(left["#"]);
          results.add(right["#"]);
        }
      }
    }
  }

  return Array.from(results);
}

function rawCompaniesWithEmployeesAcrossMultipleHomeStates(graph) {
  const results = [];

  for (const [companyName, people] of graph.peopleByCompanyName.entries()) {
    const states = new Set();

    for (const person of people) {
      const state = person.person?.location?.state;

      if (state) {
        states.add(state);
      }
    }

    if (states.size > 1) {
      results.push(companyName);
    }
  }

  return results;
}

function taggedCompaniesWithEmployeesAcrossMultipleHomeStates(graph) {
  const results = [];

  for (const [companyAnchor, people] of graph.peopleByCompanyAnchor.entries()) {
    const states = new Set();

    for (const person of people) {
      const location = graph.nodesByAnchor.get(person["@location"]);

      if (location?.["~state"]) {
        states.add(location["~state"]);
      }
    }

    if (states.size > 1) {
      results.push(companyAnchor);
    }
  }

  return results;
}

function rawActiveUnder40AtOldCompanies(graph) {
  const results = [];

  for (const person of graph.people) {
    const companyName = person.person?.job?.company_name;
    const company = graph.companiesByName.get(companyName);

    if (!company) continue;

    if (
      person.status === "active" &&
      person.person?.age < 40 &&
      company.founded < 2000
    ) {
      results.push(person.id);
    }
  }

  return results;
}

function taggedActiveUnder40AtOldCompanies(graph) {
  const results = [];

  for (const person of graph.people) {
    const company = graph.nodesByAnchor.get(person["@company"]);

    if (!company) continue;

    if (
      person["~status"] === "active" &&
      person["~age"] < 40 &&
      company["~founded"] < 2000
    ) {
      results.push(person["#"]);
    }
  }

  return results;
}

function rawHighEarnersInIndustriesAcrossMultipleStates(graph) {
  const results = [];

  for (const person of graph.people) {
    const salary = person.person?.job?.salary || 0;
    const companyName = person.person?.job?.company_name;
    const company = graph.companiesByName.get(companyName);

    if (!company || salary <= 100_000) continue;

    const relatedCompanies = graph.companiesByIndustry.get(company.industry) || [];
    const states = new Set();

    for (const relatedCompany of relatedCompanies) {
      if (relatedCompany.headquarters?.state) {
        states.add(relatedCompany.headquarters.state);
      }
    }

    if (states.size > 1) {
      results.push(person.id);
    }
  }

  return results;
}

function taggedHighEarnersInIndustriesAcrossMultipleStates(graph) {
  const results = [];

  for (const person of graph.people) {
    const company = graph.nodesByAnchor.get(person["@company"]);

    if (!company || person["~salary"] <= 100_000) continue;

    const relatedCompanies =
      graph.companiesByIndustryAnchor.get(company["@industry"]) || [];

    const states = new Set();

    for (const relatedCompany of relatedCompanies) {
      const location = graph.nodesByAnchor.get(relatedCompany["@headquarters"]);

      if (location?.["~state"]) {
        states.add(location["~state"]);
      }
    }

    if (states.size > 1) {
      results.push(person["#"]);
    }
  }

  return results;
}

function rawHouseholdDiversitySummary(graph) {
  const results = [];

  for (const [householdId, people] of graph.peopleByHousehold.entries()) {
    const companies = new Set();
    const industries = new Set();
    const interests = new Set();

    for (const person of people) {
      const companyName = person.person?.job?.company_name;
      const company = graph.companiesByName.get(companyName);

      if (companyName) companies.add(companyName);
      if (company?.industry) industries.add(company.industry);

      for (const interest of person.person?.interests || []) {
        interests.add(interest);
      }
    }

    results.push({
      householdId,
      people: people.length,
      companies: companies.size,
      industries: industries.size,
      interests: interests.size,
    });
  }

  return results;
}

function taggedHouseholdDiversitySummary(graph) {
  const results = [];

  for (const [householdAnchor, people] of graph.peopleByHouseholdAnchor.entries()) {
    const companies = new Set();
    const industries = new Set();
    const interests = new Set();

    for (const person of people) {
      const company = graph.nodesByAnchor.get(person["@company"]);

      if (person["@company"]) companies.add(person["@company"]);
      if (company?.["@industry"]) industries.add(company["@industry"]);

      for (const interest of person["@interests"] || []) {
        interests.add(interest);
      }
    }

    results.push({
      householdAnchor,
      people: people.length,
      companies: companies.size,
      industries: industries.size,
      interests: interests.size,
    });
  }

  return results;
}

function rawContextPackets(graph) {
  const packets = [];

  for (const person of graph.people) {
    const companyName = person.person?.job?.company_name;
    const company = graph.companiesByName.get(companyName);
    const household = graph.peopleByHousehold.get(person.household_id) || [];
    const coworkers = graph.peopleByCompanyName.get(companyName) || [];
    const interests = person.person?.interests || [];

    const coworkersSharingInterests = coworkers.filter((coworker) => {
      if (coworker.id === person.id) return false;

      return (
        arrayIntersectionCount(
          interests,
          coworker.person?.interests || [],
        ) > 0
      );
    });

    packets.push({
      person: getRawFullName(person),
      company: company?.name || null,
      industry: company?.industry || null,
      householdMembers: household.length,
      coworkers: coworkers.length,
      coworkersSharingInterests: coworkersSharingInterests.length,
    });
  }

  return packets;
}

function taggedContextPackets(graph) {
  const packets = [];

  for (const person of graph.people) {
    const company = graph.nodesByAnchor.get(person["@company"]);
    const household = graph.peopleByHouseholdAnchor.get(person["@household"]) || [];
    const coworkers = graph.peopleByCompanyAnchor.get(person["@company"]) || [];
    const interests = person["@interests"] || [];

    const coworkersSharingInterests = coworkers.filter((coworker) => {
      if (coworker["#"] === person["#"]) return false;

      return arrayIntersectionCount(interests, coworker["@interests"] || []) > 0;
    });

    packets.push({
      person: getTaggedFullName(person),
      company: company?.name || null,
      industry: company?.["~industry"] || null,
      householdMembers: household.length,
      coworkers: coworkers.length,
      coworkersSharingInterests: coworkersSharingInterests.length,
    });
  }

  return packets;
}

function runRawQuerySuite(graph) {
  return {
    peopleHomeStateDiffersFromCompanyState:
      rawPeopleHomeStateDiffersFromCompanyState(graph).length,
    householdsWithMultipleCompanies:
      rawHouseholdsWithMultipleCompanies(graph).length,
    peopleSharingInterestsWithCoworkers:
      rawPeopleSharingInterestsWithCoworkers(graph).length,
    companiesWithEmployeesAcrossMultipleHomeStates:
      rawCompaniesWithEmployeesAcrossMultipleHomeStates(graph).length,
    activeUnder40AtOldCompanies:
      rawActiveUnder40AtOldCompanies(graph).length,
    highEarnersInIndustriesAcrossMultipleStates:
      rawHighEarnersInIndustriesAcrossMultipleStates(graph).length,
    householdDiversitySummaries:
      rawHouseholdDiversitySummary(graph).length,
    contextPackets:
      rawContextPackets(graph).length,
  };
}

function runTaggedQuerySuite(graph) {
  return {
    peopleHomeStateDiffersFromCompanyState:
      taggedPeopleHomeStateDiffersFromCompanyState(graph).length,
    householdsWithMultipleCompanies:
      taggedHouseholdsWithMultipleCompanies(graph).length,
    peopleSharingInterestsWithCoworkers:
      taggedPeopleSharingInterestsWithCoworkers(graph).length,
    companiesWithEmployeesAcrossMultipleHomeStates:
      taggedCompaniesWithEmployeesAcrossMultipleHomeStates(graph).length,
    activeUnder40AtOldCompanies:
      taggedActiveUnder40AtOldCompanies(graph).length,
    highEarnersInIndustriesAcrossMultipleStates:
      taggedHighEarnersInIndustriesAcrossMultipleStates(graph).length,
    householdDiversitySummaries:
      taggedHouseholdDiversitySummary(graph).length,
    contextPackets:
      taggedContextPackets(graph).length,
  };
}

function runRawTortureQueries(graph) {
  let lastResult = null;

  const start = performance.now();

  for (let i = 0; i < querySuitesPerRun; i++) {
    lastResult = runRawQuerySuite(graph);
  }

  const end = performance.now();

  return {
    result: lastResult,
    queryMs: end - start,
  };
}

function runTaggedTortureQueries(graph) {
  let lastResult = null;

  const start = performance.now();

  for (let i = 0; i < querySuitesPerRun; i++) {
    lastResult = runTaggedQuerySuite(graph);
  }

  const end = performance.now();

  return {
    result: lastResult,
    queryMs: end - start,
  };
}

function compareResults(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function benchmarkRawSplitOnce() {
  const startLoad = performance.now();

  const companies = await readJsonl(RAW_COMPANIES_PATH);
  const people = await readJsonl(RAW_PEOPLE_PATH);

  const endLoad = performance.now();

  const graph = buildRawGraph(companies, people);
  const query = runRawTortureQueries(graph);

  return buildRunResult({
    label: "Raw Split JSONL",
    filesLoaded: 2,
    records: companies.length + people.length,
    nodes: null,
    bytesLoaded:
      fs.statSync(RAW_COMPANIES_PATH).size + fs.statSync(RAW_PEOPLE_PATH).size,
    loadParseMs: endLoad - startLoad,
    graphBuildMs: graph.buildMs,
    queryMs: query.queryMs,
    missingLinks: graph.missingCompanyLinks.length,
    result: query.result,
    runtimeBurden: {
      fileLoads: 2,
      sourceSplitRequired: false,
      appSpecificJoinLogic: true,
      runtimeRelationshipResolution: true,
      runtimeMissingReferenceValidation: true,
      relationshipModel: "company name joins and custom maps",
    },
  });
}

async function benchmarkRawMergedOnce() {
  const startLoad = performance.now();

  const records = await readJsonl(RAW_MERGED_PATH);

  const endLoad = performance.now();

  const graph = buildRawGraphFromMerged(records);
  const query = runRawTortureQueries(graph);

  return buildRunResult({
    label: "Raw Merged JSONL",
    filesLoaded: 1,
    records: records.length,
    nodes: null,
    bytesLoaded: fs.statSync(RAW_MERGED_PATH).size,
    loadParseMs: endLoad - startLoad,
    graphBuildMs: graph.buildMs,
    queryMs: query.queryMs,
    missingLinks: graph.missingCompanyLinks.length,
    result: query.result,
    runtimeBurden: {
      fileLoads: 1,
      sourceSplitRequired: true,
      appSpecificJoinLogic: true,
      runtimeRelationshipResolution: true,
      runtimeMissingReferenceValidation: true,
      relationshipModel: "record type branching, company name joins, and custom maps",
    },
  });
}

async function benchmarkTaggedSplitOnce() {
  const startLoad = performance.now();

  const companyNodes = await readJsonl(TAGGED_COMPANIES_PATH);
  const peopleNodes = await readJsonl(TAGGED_PEOPLE_PATH);

  const endLoad = performance.now();

  const graph = buildTaggedGraph([...companyNodes, ...peopleNodes]);
  const query = runTaggedTortureQueries(graph);

  return buildRunResult({
    label: "Tagged Split JSONL",
    filesLoaded: 2,
    records: null,
    nodes: companyNodes.length + peopleNodes.length,
    bytesLoaded:
      fs.statSync(TAGGED_COMPANIES_PATH).size +
      fs.statSync(TAGGED_PEOPLE_PATH).size,
    loadParseMs: endLoad - startLoad,
    graphBuildMs: graph.buildMs,
    queryMs: query.queryMs,
    missingLinks: graph.missingLinks.length,
    result: query.result,
    runtimeBurden: {
      fileLoads: 2,
      sourceSplitRequired: false,
      appSpecificJoinLogic: false,
      runtimeRelationshipResolution: "mechanical anchor traversal",
      runtimeMissingReferenceValidation: true,
      relationshipModel: "# anchors, ^ topics, @ relationships, ~ metadata",
    },
  });
}

async function benchmarkTaggedMergedOnce() {
  const startLoad = performance.now();

  const nodes = await readJsonl(TAGGED_MERGED_PATH);

  const endLoad = performance.now();

  const graph = buildTaggedGraph(nodes);
  const query = runTaggedTortureQueries(graph);

  return buildRunResult({
    label: "Tagged Merged JSONL",
    filesLoaded: 1,
    records: null,
    nodes: nodes.length,
    bytesLoaded: fs.statSync(TAGGED_MERGED_PATH).size,
    loadParseMs: endLoad - startLoad,
    graphBuildMs: graph.buildMs,
    queryMs: query.queryMs,
    missingLinks: graph.missingLinks.length,
    result: query.result,
    runtimeBurden: {
      fileLoads: 1,
      sourceSplitRequired: false,
      appSpecificJoinLogic: false,
      runtimeRelationshipResolution: "mechanical anchor traversal",
      runtimeMissingReferenceValidation: true,
      relationshipModel: "# anchors, ^ topics, @ relationships, ~ metadata",
    },
  });
}

function buildRunResult(input) {
  return {
    label: input.label,
    filesLoaded: input.filesLoaded,
    records: input.records,
    nodes: input.nodes,
    bytesLoaded: input.bytesLoaded,
    missingLinks: input.missingLinks,
    loadParseMs: input.loadParseMs,
    graphBuildMs: input.graphBuildMs,
    queryMs: input.queryMs,
    totalMs: input.loadParseMs + input.graphBuildMs + input.queryMs,
    result: input.result,
    runtimeBurden: input.runtimeBurden,
  };
}

function summarizeRuns(label, runs) {
  const first = runs[0];

  return {
    label,
    filesLoaded: first.filesLoaded,
    records: first.records,
    nodes: first.nodes,
    bytesLoaded: first.bytesLoaded,
    missingLinks: first.missingLinks,
    result: first.result,
    loadParseMs: summarizeMetric(runs.map((run) => run.loadParseMs)),
    graphBuildMs: summarizeMetric(runs.map((run) => run.graphBuildMs)),
    queryMs: summarizeMetric(runs.map((run) => run.queryMs)),
    totalMs: summarizeMetric(runs.map((run) => run.totalMs)),
    runtimeBurden: first.runtimeBurden,
  };
}

function summarizeMetric(values) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const avg = values.reduce((sum, value) => sum + value, 0) / values.length;

  return {
    minMs: round(min),
    maxMs: round(max),
    avgMs: round(avg),
  };
}

function round(value) {
  return Number(value.toFixed(6));
}

function formatBytes(bytes) {
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(2)} ${units[unitIndex]}`;
}

function formatNullable(value) {
  if (value === null || value === undefined) return "N/A";
  return value.toLocaleString();
}

function formatBurden(value) {
  if (value === true) return "Yes";
  if (value === false) return "No";
  return String(value);
}

function buildMarkdownReport(report) {
  const lanes = [
    report.rawSplit,
    report.rawMerged,
    report.taggedSplit,
    report.taggedMerged,
  ];

  const lines = [];

  lines.push("# People + Companies Torture Query Benchmark");
  lines.push("");
  lines.push(`Generated: ${report.createdAt}`);
  lines.push("");
  lines.push("## Configuration");
  lines.push("");
  lines.push("| Metric | Value |");
  lines.push("|---|---:|");
  lines.push(`| Iterations | ${report.iterations.toLocaleString()} |`);
  lines.push(
    `| Query suites per run | ${report.querySuitesPerRun.toLocaleString()} |`,
  );
  lines.push("| Queries per suite | 8 |");
  lines.push("");
  lines.push("## Performance Results");
  lines.push("");
  lines.push("| Lane | Files | Records | Nodes | Bytes Loaded | Missing Links | Load + Parse Avg | Graph Build Avg | Query Suite Avg | Total Avg |");
  lines.push("|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|");

  for (const lane of lanes) {
    lines.push(
      `| ${lane.label} | ${lane.filesLoaded} | ${formatNullable(
        lane.records,
      )} | ${formatNullable(lane.nodes)} | ${formatBytes(
        lane.bytesLoaded,
      )} | ${lane.missingLinks} | ${lane.loadParseMs.avgMs} ms | ${
        lane.graphBuildMs.avgMs
      } ms | ${lane.queryMs.avgMs} ms | ${lane.totalMs.avgMs} ms |`,
    );
  }

  lines.push("");
  lines.push("## Result Equivalence");
  lines.push("");
  lines.push("| Comparison | Match? |");
  lines.push("|---|---|");
  lines.push(`| Raw Split vs Raw Merged | ${report.equivalence.rawSplitVsRawMerged} |`);
  lines.push(`| Raw Split vs Tagged Split | ${report.equivalence.rawSplitVsTaggedSplit} |`);
  lines.push(
    `| Raw Split vs Tagged Merged | ${report.equivalence.rawSplitVsTaggedMerged} |`,
  );
  lines.push("");
  lines.push("## Query Result Counts");
  lines.push("");
  lines.push("| Query | Raw Split | Raw Merged | Tagged Split | Tagged Merged |");
  lines.push("|---|---:|---:|---:|---:|");

  const queryNames = Object.keys(report.rawSplit.result);

  for (const queryName of queryNames) {
    lines.push(
      `| ${queryName} | ${report.rawSplit.result[queryName]} | ${
        report.rawMerged.result[queryName]
      } | ${report.taggedSplit.result[queryName]} | ${
        report.taggedMerged.result[queryName]
      } |`,
    );
  }

  lines.push("");
  lines.push("## Runtime Burden");
  lines.push("");
  lines.push("| Lane | File Loads | Source Split Required | App-Specific Join Logic | Runtime Relationship Resolution | Runtime Missing Ref Validation | Relationship Model |");
  lines.push("|---|---:|---|---|---|---|---|");

  for (const lane of lanes) {
    const burden = lane.runtimeBurden;

    lines.push(
      `| ${lane.label} | ${burden.fileLoads} | ${formatBurden(
        burden.sourceSplitRequired,
      )} | ${formatBurden(
        burden.appSpecificJoinLogic,
      )} | ${formatBurden(
        burden.runtimeRelationshipResolution,
      )} | ${formatBurden(
        burden.runtimeMissingReferenceValidation,
      )} | ${burden.relationshipModel} |`,
    );
  }

  lines.push("");
  lines.push("## Notes");
  lines.push("");
  lines.push("- This benchmark intentionally runs relationship-heavy queries.");
  lines.push("- Each query suite contains 8 graph-shaped questions.");
  lines.push("- The goal is to test runtime assembly burden, not only simple lookup speed.");
  lines.push("- This benchmark does not test compiled Relay artifacts yet.");
  lines.push("");

  return lines.join("\n");
}

function printReport(report) {
  console.log("");
  console.log("People + Companies torture query benchmark complete.");
  console.log("----------------------------------------------------");
  console.log(`Iterations:                  ${report.iterations.toLocaleString()}`);
  console.log(
    `Query suites per run:        ${report.querySuitesPerRun.toLocaleString()}`,
  );
  console.log("");
  console.log(`Raw split total avg:         ${report.rawSplit.totalMs.avgMs} ms`);
  console.log(`Raw merged total avg:        ${report.rawMerged.totalMs.avgMs} ms`);
  console.log(`Tagged split total avg:      ${report.taggedSplit.totalMs.avgMs} ms`);
  console.log(`Tagged merged total avg:     ${report.taggedMerged.totalMs.avgMs} ms`);
  console.log("");
  console.log(`Raw split query avg:         ${report.rawSplit.queryMs.avgMs} ms`);
  console.log(`Raw merged query avg:        ${report.rawMerged.queryMs.avgMs} ms`);
  console.log(`Tagged split query avg:      ${report.taggedSplit.queryMs.avgMs} ms`);
  console.log(`Tagged merged query avg:     ${report.taggedMerged.queryMs.avgMs} ms`);
  console.log("");
  console.log("Result equivalence:");
  console.log(`Raw Split vs Raw Merged:     ${report.equivalence.rawSplitVsRawMerged}`);
  console.log(`Raw Split vs Tagged Split:   ${report.equivalence.rawSplitVsTaggedSplit}`);
  console.log(`Raw Split vs Tagged Merged:  ${report.equivalence.rawSplitVsTaggedMerged}`);
  console.log("");
  console.log(`JSON report:                 ${REPORT_JSON_PATH}`);
  console.log(`Markdown report:             ${REPORT_MD_PATH}`);
  console.log("");
}

async function runBenchmark() {
  console.log("");
  console.log("Running People + Companies torture query benchmark...");
  console.log("----------------------------------------------------");
  console.log(`Iterations:           ${iterations.toLocaleString()}`);
  console.log(
    `Query suites per run: ${querySuitesPerRun.toLocaleString()}`,
  );
  console.log("");

  await benchmarkRawSplitOnce();
  await benchmarkRawMergedOnce();
  await benchmarkTaggedSplitOnce();
  await benchmarkTaggedMergedOnce();

  const rawSplitRuns = [];
  const rawMergedRuns = [];
  const taggedSplitRuns = [];
  const taggedMergedRuns = [];

  for (let i = 0; i < iterations; i++) {
    process.stdout.write(`Run ${i + 1}/${iterations}...\r`);

    rawSplitRuns.push(await benchmarkRawSplitOnce());
    rawMergedRuns.push(await benchmarkRawMergedOnce());
    taggedSplitRuns.push(await benchmarkTaggedSplitOnce());
    taggedMergedRuns.push(await benchmarkTaggedMergedOnce());
  }

  process.stdout.write("\n");

  const report = {
    createdAt: new Date().toISOString(),
    iterations,
    querySuitesPerRun,
    rawSplit: summarizeRuns("Raw Split JSONL", rawSplitRuns),
    rawMerged: summarizeRuns("Raw Merged JSONL", rawMergedRuns),
    taggedSplit: summarizeRuns("Tagged Split JSONL", taggedSplitRuns),
    taggedMerged: summarizeRuns("Tagged Merged JSONL", taggedMergedRuns),
  };

  report.equivalence = {
    rawSplitVsRawMerged: compareResults(
      report.rawSplit.result,
      report.rawMerged.result,
    ),
    rawSplitVsTaggedSplit: compareResults(
      report.rawSplit.result,
      report.taggedSplit.result,
    ),
    rawSplitVsTaggedMerged: compareResults(
      report.rawSplit.result,
      report.taggedMerged.result,
    ),
  };

  fs.writeFileSync(REPORT_JSON_PATH, JSON.stringify(report, null, 2), "utf8");
  fs.writeFileSync(REPORT_MD_PATH, buildMarkdownReport(report), "utf8");

  printReport(report);
}

runBenchmark().catch((error) => {
  console.error("");
  console.error("Torture query benchmark failed.");
  console.error(error);
  process.exit(1);
});