/**
 * Author: Project Owner
 * Date: 2026-05-21
 * Purpose:
 *   Convert split raw JSONL files into standardized RelayDB-style 4-tag JSONL,
 *   while also producing raw merged and tagged merged benchmark files.
 *
 * Inputs:
 *   datasets/raw/companies.jsonl
 *   datasets/raw/people.jsonl
 *
 * Outputs:
 *   datasets/tagged/companies.4tag.jsonl
 *   datasets/tagged/people.4tag.jsonl
 *   datasets/merged/people-companies.raw.merged.jsonl
 *   datasets/merged/people-companies.4tag.merged.jsonl
 *   reports/people-companies.convert.report.json
 *
 * Usage:
 *   node scripts/convert-people-companies.js
 */

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { performance } = require("perf_hooks");

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

const RAW_MERGED_PATH = path.join(
  process.cwd(),
  "datasets",
  "merged",
  "people-companies.raw.merged.jsonl",
);

const TAGGED_MERGED_PATH = path.join(
  process.cwd(),
  "datasets",
  "merged",
  "people-companies.4tag.merged.jsonl",
);

const REPORT_PATH = path.join(
  process.cwd(),
  "reports",
  "people-companies.convert.report.json",
);

const SOURCE_NAME = "people_companies";

function ensureDirectory(filePath) {
  const dir = path.dirname(filePath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function ensureFileExists(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error(`Missing file: ${filePath}`);
    process.exit(1);
  }
}

function cleanAnchorPart(value) {
  return String(value || "unknown")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function companyAnchorFromId(id) {
  return `company:${cleanAnchorPart(id)}`;
}

function companyNameAnchor(name) {
  return `company_name:${cleanAnchorPart(name)}`;
}

function personAnchorFromId(id) {
  return `person:${cleanAnchorPart(id)}`;
}

function householdAnchorFromId(id) {
  return `household:${cleanAnchorPart(id)}`;
}

function interestAnchor(value) {
  return `interest:${cleanAnchorPart(value)}`;
}

function industryAnchor(value) {
  return `industry:${cleanAnchorPart(value)}`;
}

function locationAnchor(location) {
  const city = cleanAnchorPart(location?.city || "unknown_city");
  const state = cleanAnchorPart(location?.state || "unknown_state");
  const country = cleanAnchorPart(location?.country || "unknown_country");

  return `location:${country}:${state}:${city}`;
}

function parseDateToYear(value) {
  if (!value) return null;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.getUTCFullYear();
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

  let lineNumber = 0;

  for await (const line of rl) {
    lineNumber += 1;

    const trimmed = line.trim();

    if (!trimmed) continue;

    try {
      records.push(JSON.parse(trimmed));
    } catch (error) {
      throw new Error(
        `Invalid JSON in ${filePath} on line ${lineNumber}: ${error.message}`,
      );
    }
  }

  return records;
}

function convertCompany(rawCompany) {
  const companyAnchor = companyAnchorFromId(rawCompany.id);
  const nameAnchor = companyNameAnchor(rawCompany.name);
  const hqLocationAnchor = locationAnchor(rawCompany.headquarters);
  const companyIndustryAnchor = industryAnchor(rawCompany.industry);

  return {
    "#": companyAnchor,
    "^": "company",
    "@industry": companyIndustryAnchor,
    "@headquarters": hqLocationAnchor,
    "~source": SOURCE_NAME,
    "~raw_id": rawCompany.id,
    "~name": rawCompany.name,
    "~name_anchor": nameAnchor,
    "~industry": rawCompany.industry,
    "~size": rawCompany.size,
    "~founded": rawCompany.founded,
    name: rawCompany.name,
    headquarters: rawCompany.headquarters,
  };
}

function convertCompanyNameAlias(rawCompany) {
  return {
    "#": companyNameAnchor(rawCompany.name),
    "^": "company_name_alias",
    "@company": companyAnchorFromId(rawCompany.id),
    "~source": SOURCE_NAME,
    "~name": rawCompany.name,
  };
}

function convertCompanyIndustry(rawCompany) {
  return {
    "#": industryAnchor(rawCompany.industry),
    "^": "industry",
    "~source": SOURCE_NAME,
    "~name": rawCompany.industry,
  };
}

function convertCompanyLocation(rawCompany) {
  const hq = rawCompany.headquarters || {};

  return {
    "#": locationAnchor(hq),
    "^": "location",
    "~source": SOURCE_NAME,
    "~city": hq.city || null,
    "~state": hq.state || null,
    "~country": hq.country || null,
  };
}

function convertPerson(rawPerson, companyByName) {
  const person = rawPerson.person || {};
  const job = person.job || {};
  const location = person.location || {};
  const name = person.name || {};

  const companyName = job.company_name || null;
  const matchedCompany = companyName ? companyByName.get(companyName) : null;

  const personNode = {
    "#": personAnchorFromId(rawPerson.id),
    "^": "person",
    "@household": householdAnchorFromId(rawPerson.household_id),
    "@company": matchedCompany ? companyAnchorFromId(matchedCompany.id) : null,
    "@company_name": companyName ? companyNameAnchor(companyName) : null,
    "@location": locationAnchor(location),
    "@interests": Array.isArray(person.interests)
      ? person.interests.map((interest) => interestAnchor(interest))
      : [],
    "~source": SOURCE_NAME,
    "~raw_id": rawPerson.id,
    "~created_at": rawPerson.created_at,
    "~created_year": parseDateToYear(rawPerson.created_at),
    "~status": rawPerson.status,
    "~household_id": rawPerson.household_id,
    "~age": person.age ?? null,
    "~gender": person.gender ?? null,
    "~job_title": job.title || null,
    "~salary": job.salary ?? null,
    name: {
      first: name.first || null,
      last: name.last || null,
      full: [name.first, name.last].filter(Boolean).join(" "),
    },
    contact: {
      email: person.email || null,
      phone: person.phone || null,
    },
  };

  return personNode;
}

function convertHousehold(rawPerson) {
  return {
    "#": householdAnchorFromId(rawPerson.household_id),
    "^": "household",
    "~source": SOURCE_NAME,
    "~raw_id": rawPerson.household_id,
  };
}

function convertPersonLocation(rawPerson) {
  const location = rawPerson.person?.location || {};

  return {
    "#": locationAnchor(location),
    "^": "location",
    "~source": SOURCE_NAME,
    "~city": location.city || null,
    "~state": location.state || null,
    "~country": location.country || null,
  };
}

function convertInterest(interest) {
  return {
    "#": interestAnchor(interest),
    "^": "interest",
    "~source": SOURCE_NAME,
    "~name": interest,
  };
}

function dedupeNodes(nodes) {
  const map = new Map();

  for (const node of nodes) {
    if (!node || !node["#"]) continue;

    if (!map.has(node["#"])) {
      map.set(node["#"], node);
    }
  }

  return Array.from(map.values());
}

function writeJsonl(filePath, records) {
  ensureDirectory(filePath);

  const text = records.map((record) => JSON.stringify(record)).join("\n");

  fs.writeFileSync(filePath, `${text}\n`, "utf8");
}

function createRawMergedRecords(companies, people) {
  const merged = [];

  for (const company of companies) {
    merged.push({
      __source_file: "companies.jsonl",
      __record_type: "company",
      ...company,
    });
  }

  for (const person of people) {
    merged.push({
      __source_file: "people.jsonl",
      __record_type: "person",
      ...person,
    });
  }

  return merged;
}

function buildCompanyByName(companies) {
  const map = new Map();

  for (const company of companies) {
    map.set(company.name, company);
  }

  return map;
}

function validatePersonCompanyLinks(people, companyByName) {
  const linked = [];
  const missing = [];

  for (const rawPerson of people) {
    const companyName = rawPerson.person?.job?.company_name || null;

    if (!companyName) {
      missing.push({
        person_id: rawPerson.id,
        reason: "missing_company_name",
      });

      continue;
    }

    const company = companyByName.get(companyName);

    if (!company) {
      missing.push({
        person_id: rawPerson.id,
        company_name: companyName,
        reason: "company_name_not_found",
      });

      continue;
    }

    linked.push({
      person_id: rawPerson.id,
      company_name: companyName,
      company_id: company.id,
    });
  }

  return {
    linked,
    missing,
  };
}

async function convert() {
  ensureFileExists(RAW_COMPANIES_PATH);
  ensureFileExists(RAW_PEOPLE_PATH);

  ensureDirectory(TAGGED_COMPANIES_PATH);
  ensureDirectory(TAGGED_PEOPLE_PATH);
  ensureDirectory(RAW_MERGED_PATH);
  ensureDirectory(TAGGED_MERGED_PATH);
  ensureDirectory(REPORT_PATH);

  const start = performance.now();

  const companies = await readJsonl(RAW_COMPANIES_PATH);
  const people = await readJsonl(RAW_PEOPLE_PATH);

  const companyByName = buildCompanyByName(companies);
  const personCompanyValidation = validatePersonCompanyLinks(people, companyByName);

  const companyNodes = [];
const peopleNodes = [];
const companySupportNodes = [];
const peopleSupportNodes = [];

for (const company of companies) {
  companyNodes.push(convertCompany(company));
  companySupportNodes.push(convertCompanyNameAlias(company));
  companySupportNodes.push(convertCompanyIndustry(company));
  companySupportNodes.push(convertCompanyLocation(company));
}

for (const rawPerson of people) {
  peopleNodes.push(convertPerson(rawPerson, companyByName));
  peopleSupportNodes.push(convertHousehold(rawPerson));
  peopleSupportNodes.push(convertPersonLocation(rawPerson));

  const interests = rawPerson.person?.interests || [];

  for (const interest of interests) {
    peopleSupportNodes.push(convertInterest(interest));
  }
}

const dedupedCompanyNodes = dedupeNodes(companyNodes);
const dedupedPeopleNodes = dedupeNodes(peopleNodes);
const dedupedCompanySupportNodes = dedupeNodes(companySupportNodes);
const dedupedPeopleSupportNodes = dedupeNodes(peopleSupportNodes);

const taggedCompaniesFileNodes = dedupeNodes([
  ...dedupedCompanyNodes,
  ...dedupedCompanySupportNodes,
]);

const taggedPeopleFileNodes = dedupeNodes([
  ...dedupedPeopleNodes,
  ...dedupedPeopleSupportNodes,
]);

const taggedMergedNodes = dedupeNodes([
  ...dedupedCompanyNodes,
  ...dedupedPeopleNodes,
  ...dedupedCompanySupportNodes,
  ...dedupedPeopleSupportNodes,
]);

  const rawMergedRecords = createRawMergedRecords(companies, people);

  writeJsonl(TAGGED_COMPANIES_PATH, taggedCompaniesFileNodes);
  writeJsonl(TAGGED_PEOPLE_PATH, taggedPeopleFileNodes);
  writeJsonl(RAW_MERGED_PATH, rawMergedRecords);
  writeJsonl(TAGGED_MERGED_PATH, taggedMergedNodes);

  const end = performance.now();

  const report = {
    createdAt: new Date().toISOString(),
    sourceName: SOURCE_NAME,
    convertMs: Number((end - start).toFixed(3)),
    inputs: {
      companies: {
        path: RAW_COMPANIES_PATH,
        bytes: fs.statSync(RAW_COMPANIES_PATH).size,
        records: companies.length,
      },
      people: {
        path: RAW_PEOPLE_PATH,
        bytes: fs.statSync(RAW_PEOPLE_PATH).size,
        records: people.length,
      },
    },
    outputs: {
      taggedCompanies: {
        path: TAGGED_COMPANIES_PATH,
        bytes: fs.statSync(TAGGED_COMPANIES_PATH).size,
        nodes: taggedCompaniesFileNodes.length,
      },
      taggedPeople: {
        path: TAGGED_PEOPLE_PATH,
        bytes: fs.statSync(TAGGED_PEOPLE_PATH).size,
        nodes: taggedPeopleFileNodes.length,
      },
      rawMerged: {
        path: RAW_MERGED_PATH,
        bytes: fs.statSync(RAW_MERGED_PATH).size,
        records: rawMergedRecords.length,
      },
      taggedMerged: {
        path: TAGGED_MERGED_PATH,
        bytes: fs.statSync(TAGGED_MERGED_PATH).size,
        nodes: taggedMergedNodes.length,
      },
    },
    validation: {
      personCompanyLinks: {
        linkedCount: personCompanyValidation.linked.length,
        missingCount: personCompanyValidation.missing.length,
        missing: personCompanyValidation.missing,
      },
    },
    topicCounts: countTopics(taggedMergedNodes),
  };

  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), "utf8");

  printSummary(report);
}

function countTopics(nodes) {
  const counts = {};

  for (const node of nodes) {
    const topic = node["^"] || "unknown";
    counts[topic] = (counts[topic] || 0) + 1;
  }

  return counts;
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

function printSummary(report) {
  console.log("");
  console.log("People + Companies conversion complete.");
  console.log("----------------------------------------");
  console.log(`Convert time:           ${report.convertMs} ms`);
  console.log("");
  console.log(`Raw companies:          ${report.inputs.companies.records} records`);
  console.log(`Raw people:             ${report.inputs.people.records} records`);
  console.log("");
  console.log(`Tagged companies:       ${report.outputs.taggedCompanies.nodes} nodes`);
  console.log(`Tagged people:          ${report.outputs.taggedPeople.nodes} nodes`);
  console.log(`Raw merged:             ${report.outputs.rawMerged.records} records`);
  console.log(`Tagged merged:          ${report.outputs.taggedMerged.nodes} nodes`);
  console.log("");
  console.log(
    `Person-company links:   ${report.validation.personCompanyLinks.linkedCount} linked`,
  );
  console.log(
    `Missing company links:  ${report.validation.personCompanyLinks.missingCount} missing`,
  );
  console.log("");
  console.log(`Tagged merged size:     ${formatBytes(report.outputs.taggedMerged.bytes)}`);
  console.log(`Raw merged size:        ${formatBytes(report.outputs.rawMerged.bytes)}`);
  console.log("");
  console.log(`Report:                 ${REPORT_PATH}`);
  console.log("");
}

convert().catch((error) => {
  console.error("");
  console.error("Conversion failed.");
  console.error(error);
  process.exit(1);
});