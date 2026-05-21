/**
 * Author: Project Owner
 * Date: 2026-05-21
 * Purpose:
 *   Convert generated split raw JSONL files into standardized RelayDB-style
 *   4-tag JSONL while producing raw merged, tagged merged, and validation reports.
 *
 *   This v2 converter is designed for larger generated benchmark datasets and
 *   does not overwrite the original small people/companies benchmark files.
 *
 * Inputs:
 *   datasets/generated/companies.<companyCount>.jsonl
 *   datasets/generated/people.<peopleCount>.jsonl
 *
 * Outputs:
 *   datasets/generated/tagged/companies.<companyCount>.4tag.jsonl
 *   datasets/generated/tagged/people.<peopleCount>.4tag.jsonl
 *   datasets/generated/merged/people-companies.<companyCount>x<peopleCount>.raw.merged.jsonl
 *   datasets/generated/merged/people-companies.<companyCount>x<peopleCount>.4tag.merged.jsonl
 *   reports/people-companies.<companyCount>x<peopleCount>.convert.report.json
 *
 * Usage:
 *   node scripts/convert-people-companies-v2.js
 *   node scripts/convert-people-companies-v2.js 1000 10000
 */

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { performance } = require("perf_hooks");

const DEFAULT_COMPANY_COUNT = 1_000;
const DEFAULT_PEOPLE_COUNT = 10_000;

const companyCount = Number(process.argv[2]) || DEFAULT_COMPANY_COUNT;
const peopleCount = Number(process.argv[3]) || DEFAULT_PEOPLE_COUNT;

const SOURCE_NAME = "generated_people_companies";

const RAW_COMPANIES_PATH = path.join(
  process.cwd(),
  "datasets",
  "generated",
  `companies.${companyCount}.jsonl`,
);

const RAW_PEOPLE_PATH = path.join(
  process.cwd(),
  "datasets",
  "generated",
  `people.${peopleCount}.jsonl`,
);

const TAGGED_COMPANIES_PATH = path.join(
  process.cwd(),
  "datasets",
  "generated",
  "tagged",
  `companies.${companyCount}.4tag.jsonl`,
);

const TAGGED_PEOPLE_PATH = path.join(
  process.cwd(),
  "datasets",
  "generated",
  "tagged",
  `people.${peopleCount}.4tag.jsonl`,
);

const RAW_MERGED_PATH = path.join(
  process.cwd(),
  "datasets",
  "generated",
  "merged",
  `people-companies.${companyCount}x${peopleCount}.raw.merged.jsonl`,
);

const TAGGED_MERGED_PATH = path.join(
  process.cwd(),
  "datasets",
  "generated",
  "merged",
  `people-companies.${companyCount}x${peopleCount}.4tag.merged.jsonl`,
);

const REPORT_PATH = path.join(
  process.cwd(),
  "reports",
  `people-companies.${companyCount}x${peopleCount}.convert.report.json`,
);

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

  return {
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
      __source_file: path.basename(RAW_COMPANIES_PATH),
      __record_type: "company",
      ...company,
    });
  }

  for (const person of people) {
    merged.push({
      __source_file: path.basename(RAW_PEOPLE_PATH),
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

function auditDuplicateField(records, fieldName, getValue) {
  const seen = new Map();
  const duplicates = [];
  const missing = [];

  for (const [index, record] of records.entries()) {
    const value = getValue(record);

    if (value === null || value === undefined || value === "") {
      missing.push({
        index,
        field: fieldName,
        record_id: record.id || null,
      });

      continue;
    }

    if (seen.has(value)) {
      duplicates.push({
        field: fieldName,
        value,
        first_index: seen.get(value).index,
        first_record_id: seen.get(value).recordId,
        duplicate_index: index,
        duplicate_record_id: record.id || null,
      });

      continue;
    }

    seen.set(value, {
      index,
      recordId: record.id || null,
    });
  }

  return {
    field: fieldName,
    uniqueCount: seen.size,
    duplicateCount: duplicates.length,
    missingCount: missing.length,
    duplicates,
    missing,
  };
}

function auditRawInputs(companies, people) {
  const companyIdAudit = auditDuplicateField(
    companies,
    "company.id",
    (company) => company.id,
  );

  const companyNameAudit = auditDuplicateField(
    companies,
    "company.name",
    (company) => company.name,
  );

  const personIdAudit = auditDuplicateField(
    people,
    "person.id",
    (person) => person.id,
  );

  const personEmailAudit = auditDuplicateField(
    people,
    "person.person.email",
    (person) => person.person?.email,
  );

  const fatalProblems = [];

  if (companyIdAudit.duplicateCount > 0) {
    fatalProblems.push("duplicate_company_ids");
  }

  if (companyNameAudit.duplicateCount > 0) {
    fatalProblems.push("duplicate_company_names");
  }

  if (personIdAudit.duplicateCount > 0) {
    fatalProblems.push("duplicate_person_ids");
  }

  if (personEmailAudit.duplicateCount > 0) {
    fatalProblems.push("duplicate_person_emails");
  }

  return {
    companyIds: companyIdAudit,
    companyNames: companyNameAudit,
    personIds: personIdAudit,
    personEmails: personEmailAudit,
    fatalProblems,
  };
}

function auditAnchors(nodes) {
  const seen = new Map();
  const duplicates = [];
  const missing = [];

  for (const [index, node] of nodes.entries()) {
    const anchor = node["#"];

    if (!anchor) {
      missing.push({
        index,
        topic: node["^"] || null,
      });

      continue;
    }

    if (seen.has(anchor)) {
      duplicates.push({
        anchor,
        first_index: seen.get(anchor).index,
        first_topic: seen.get(anchor).topic,
        duplicate_index: index,
        duplicate_topic: node["^"] || null,
      });

      continue;
    }

    seen.set(anchor, {
      index,
      topic: node["^"] || null,
    });
  }

  return {
    uniqueAnchors: seen.size,
    duplicateAnchorCount: duplicates.length,
    missingAnchorCount: missing.length,
    duplicates,
    missing,
  };
}

function countTopics(nodes) {
  const counts = {};

  for (const node of nodes) {
    const topic = node["^"] || "unknown";
    counts[topic] = (counts[topic] || 0) + 1;
  }

  return counts;
}

function countRelationshipFields(nodes) {
  const counts = {};

  for (const node of nodes) {
    for (const key of Object.keys(node)) {
      if (!key.startsWith("@")) continue;

      const value = node[key];

      if (Array.isArray(value)) {
        counts[key] = (counts[key] || 0) + value.length;
      } else if (value !== null && value !== undefined) {
        counts[key] = (counts[key] || 0) + 1;
      }
    }
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

  const rawAudit = auditRawInputs(companies, people);

  if (rawAudit.fatalProblems.length > 0) {
    const failedReport = {
      createdAt: new Date().toISOString(),
      sourceName: SOURCE_NAME,
      status: "failed",
      fatalProblems: rawAudit.fatalProblems,
      validation: {
        rawInputAudit: rawAudit,
      },
    };

    fs.writeFileSync(REPORT_PATH, JSON.stringify(failedReport, null, 2), "utf8");

    console.error("");
    console.error("Conversion stopped due to fatal raw input validation errors.");
    console.error(`Fatal problems: ${rawAudit.fatalProblems.join(", ")}`);
    console.error(`Report: ${REPORT_PATH}`);
    console.error("");

    process.exit(1);
  }

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

  const anchorAudit = auditAnchors(taggedMergedNodes);

  writeJsonl(TAGGED_COMPANIES_PATH, taggedCompaniesFileNodes);
  writeJsonl(TAGGED_PEOPLE_PATH, taggedPeopleFileNodes);
  writeJsonl(RAW_MERGED_PATH, rawMergedRecords);
  writeJsonl(TAGGED_MERGED_PATH, taggedMergedNodes);

  const end = performance.now();

  const report = {
    createdAt: new Date().toISOString(),
    sourceName: SOURCE_NAME,
    status: "complete",
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
      rawInputAudit: rawAudit,
      personCompanyLinks: {
        linkedCount: personCompanyValidation.linked.length,
        missingCount: personCompanyValidation.missing.length,
        missing: personCompanyValidation.missing,
      },
      anchorAudit,
    },
    topicCounts: countTopics(taggedMergedNodes),
    relationshipCounts: countRelationshipFields(taggedMergedNodes),
  };

  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), "utf8");

  printSummary(report);
}

function printSummary(report) {
  console.log("");
  console.log("People + Companies v2 conversion complete.");
  console.log("-------------------------------------------");
  console.log(`Status:                 ${report.status}`);
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
    `Duplicate company ids:  ${report.validation.rawInputAudit.companyIds.duplicateCount}`,
  );
  console.log(
    `Duplicate company names:${report.validation.rawInputAudit.companyNames.duplicateCount}`,
  );
  console.log(
    `Duplicate person ids:   ${report.validation.rawInputAudit.personIds.duplicateCount}`,
  );
  console.log(
    `Duplicate person emails:${report.validation.rawInputAudit.personEmails.duplicateCount}`,
  );
  console.log("");
  console.log(
    `Person-company links:   ${report.validation.personCompanyLinks.linkedCount} linked`,
  );
  console.log(
    `Missing company links:  ${report.validation.personCompanyLinks.missingCount} missing`,
  );
  console.log("");
  console.log(
    `Unique anchors:         ${report.validation.anchorAudit.uniqueAnchors}`,
  );
  console.log(
    `Duplicate anchors:      ${report.validation.anchorAudit.duplicateAnchorCount}`,
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