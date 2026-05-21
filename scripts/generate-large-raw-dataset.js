/**
 * Author: Kris Sherbondy
 * Date: 2026-05-21
 * Purpose:
 *   Generate larger raw JSONL datasets for RelayDB benchmark testing.
 *
 *   Outputs:
 *     datasets/generated/companies.1000.jsonl
 *     datasets/generated/people.10000.jsonl
 *
 * Usage:
 *   node scripts/generate-large-raw-dataset.js
 *
 * Optional:
 *   node scripts/generate-large-raw-dataset.js 1000 10000
 *
 *   arg1 = company count
 *   arg2 = people count
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DEFAULT_COMPANY_COUNT = 1_000;
const DEFAULT_PEOPLE_COUNT = 10_000;

const companyCount = Number(process.argv[2]) || DEFAULT_COMPANY_COUNT;
const peopleCount = Number(process.argv[3]) || DEFAULT_PEOPLE_COUNT;

const outputDirectory = path.join(process.cwd(), "datasets", "generated");

const companiesOutputPath = path.join(
  outputDirectory,
  `companies.${companyCount}.jsonl`,
);

const peopleOutputPath = path.join(
  outputDirectory,
  `people.${peopleCount}.jsonl`,
);

const companyPrefixes = [
  "Green Valley",
  "Blue Ridge",
  "Silver Oak",
  "Summit",
  "Ironwood",
  "Northstar",
  "BrightPath",
  "Cedar Grove",
  "Redwood",
  "Clearwater",
  "Golden Plains",
  "Riverstone",
  "Pioneer",
  "Evergreen",
  "Skyline",
  "Harbor",
  "Sterling",
  "Liberty",
  "Atlas",
  "Nova",
];

const companySuffixes = [
  "Agriculture",
  "Technologies",
  "Logistics",
  "Healthcare",
  "Finance",
  "Manufacturing",
  "Consulting",
  "Energy",
  "Education",
  "Retail",
  "Systems",
  "Solutions",
  "Group",
  "Labs",
  "Services",
  "Industries",
  "Partners",
  "Holdings",
  "Works",
  "Dynamics",
];

const industries = [
  "Agriculture",
  "Technology",
  "Transportation",
  "Healthcare",
  "Finance",
  "Manufacturing",
  "Consulting",
  "Energy",
  "Education",
  "Retail",
];

const locations = [
  { city: "Austin", state: "TX", country: "USA" },
  { city: "Dallas", state: "TX", country: "USA" },
  { city: "Houston", state: "TX", country: "USA" },
  { city: "New York", state: "NY", country: "USA" },
  { city: "Syracuse", state: "NY", country: "USA" },
  { city: "Raleigh", state: "NC", country: "USA" },
  { city: "Charlotte", state: "NC", country: "USA" },
  { city: "Atlanta", state: "GA", country: "USA" },
  { city: "Augusta", state: "GA", country: "USA" },
  { city: "Des Moines", state: "IA", country: "USA" },
  { city: "Cedar Rapids", state: "IA", country: "USA" },
  { city: "Denver", state: "CO", country: "USA" },
  { city: "Boulder", state: "CO", country: "USA" },
  { city: "Seattle", state: "WA", country: "USA" },
  { city: "Tacoma", state: "WA", country: "USA" },
  { city: "Portland", state: "OR", country: "USA" },
  { city: "Salem", state: "OR", country: "USA" },
  { city: "Chicago", state: "IL", country: "USA" },
  { city: "Springfield", state: "IL", country: "USA" },
  { city: "Phoenix", state: "AZ", country: "USA" },
];

const firstNames = [
  "James",
  "Mary",
  "John",
  "Patricia",
  "Robert",
  "Jennifer",
  "Michael",
  "Linda",
  "William",
  "Elizabeth",
  "David",
  "Barbara",
  "Richard",
  "Susan",
  "Joseph",
  "Jessica",
  "Thomas",
  "Sarah",
  "Charles",
  "Karen",
  "Daniel",
  "Nancy",
  "Matthew",
  "Lisa",
  "Anthony",
  "Betty",
  "Mark",
  "Margaret",
  "Donald",
  "Sandra",
  "Steven",
  "Ashley",
  "Paul",
  "Kimberly",
  "Andrew",
  "Emily",
  "Joshua",
  "Donna",
  "Kenneth",
  "Michelle",
];

const lastNames = [
  "Smith",
  "Johnson",
  "Williams",
  "Brown",
  "Jones",
  "Garcia",
  "Miller",
  "Davis",
  "Rodriguez",
  "Martinez",
  "Hernandez",
  "Lopez",
  "Gonzalez",
  "Wilson",
  "Anderson",
  "Thomas",
  "Taylor",
  "Moore",
  "Jackson",
  "Martin",
];

const statuses = ["active", "inactive", "pending"];

const genders = ["male", "female"];

const interests = [
  "sports",
  "yoga",
  "gardening",
  "writing",
  "traveling",
  "reading",
  "music",
  "coding",
  "hiking",
  "cooking",
  "gaming",
  "photography",
  "fitness",
  "woodworking",
  "painting",
];

const jobTitles = [
  "Software Developer",
  "Data Scientist",
  "Project Manager",
  "Administrator",
  "Security Analyst",
  "Operations Manager",
  "Product Designer",
  "Systems Engineer",
  "Account Manager",
  "Research Analyst",
  "Marketing Specialist",
  "Financial Analyst",
  "HR Coordinator",
  "Logistics Planner",
  "Technical Writer",
];

function main() {
  fs.mkdirSync(outputDirectory, { recursive: true });

  const companies = generateCompanies(companyCount);
  const people = generatePeople(peopleCount, companies);

  writeJsonl(companiesOutputPath, companies);
  writeJsonl(peopleOutputPath, people);

  console.log("");
  console.log("Generated RelayDB raw benchmark dataset");
  console.log("=======================================");
  console.log(`Companies: ${companies.length}`);
  console.log(`People:    ${people.length}`);
  console.log(`Company file: ${companiesOutputPath}`);
  console.log(`People file:  ${peopleOutputPath}`);
  console.log("");
}

function generateCompanies(count) {
  const companies = [];
  const usedIds = new Set();
  const usedNames = new Set();

  for (let index = 0; index < count; index += 1) {
    const industry = pick(industries);
    const location = pick(locations);

    const id = makeUniqueUuid(usedIds);
    const name = makeUniqueCompanyName(industry, index, usedNames);

    companies.push({
      id,
      name,
      industry,
      headquarters: {
        city: location.city,
        state: location.state,
        country: location.country,
      },
      size: randomInt(25, 50_000),
      founded: randomInt(1950, 2024),
    });
  }

  return companies;
}

function makeUniqueCompanyName(industry, index, usedNames) {
  let attempt = 0;

  while (true) {
    const prefix = pick(companyPrefixes);
    const suffix = Math.random() < 0.35 ? industry : pick(companySuffixes);

    const name = `${prefix} ${suffix} ${index + 1}-${attempt + 1}`;

    if (!usedNames.has(name)) {
      usedNames.add(name);
      return name;
    }

    attempt += 1;
  }
}

function makeUniqueUuid(usedIds) {
  while (true) {
    const id = crypto.randomUUID();

    if (!usedIds.has(id)) {
      usedIds.add(id);
      return id;
    }
  }
}

function generatePeople(count, companies) {
  const people = [];
  const usedIds = new Set();
  const usedEmails = new Set();
  const householdIds = makeHouseholdIds(Math.max(1, Math.floor(count / 3)));

  for (let index = 0; index < count; index += 1) {
    const firstName = pick(firstNames);
    const lastName = pick(lastNames);
    const company = pick(companies);
    const location = pick(locations);
    const status = pick(statuses);
    const age = randomInt(18, 82);
    const emailDomain = pick([
      "gmail.com",
      "yahoo.com",
      "outlook.com",
      "example.com",
    ]);

    people.push({
      id: makeUniqueUuid(usedIds),
      created_at: randomCreatedAt(),
      status,
      household_id: pick(householdIds),
      person: {
        name: {
          first: firstName,
          last: lastName,
        },
        age,
        gender: pick(genders),
        email: makeUniqueEmail(
          firstName,
          lastName,
          index,
          emailDomain,
          usedEmails,
        ),
        phone: makePhoneNumber(),
        location: {
          city: location.city,
          state: location.state,
          country: location.country,
        },
        interests: pickMany(interests, randomInt(2, 5)),
        job: {
          title: pick(jobTitles),
          company_name: company.name,
          salary: randomInt(42_000, 190_000),
        },
      },
    });
  }

  return people;
}

function makeUniqueCompanyName(industry, index, usedNames) {
  let attempt = 0;

  while (true) {
    const prefix = pick(companyPrefixes);
    const suffix = Math.random() < 0.35 ? industry : pick(companySuffixes);

    const name = `${prefix} ${suffix} ${index + 1}-${attempt + 1}`;

    if (!usedNames.has(name)) {
      usedNames.add(name);
      return name;
    }

    attempt += 1;
  }
}

function makeHouseholdIds(count) {
  const householdIds = [];

  for (let index = 0; index < count; index += 1) {
    householdIds.push(crypto.randomUUID());
  }

  return householdIds;
}

function randomCreatedAt() {
  const start = new Date("2020-01-01T00:00:00.000Z").getTime();
  const end = new Date("2026-01-01T00:00:00.000Z").getTime();
  const timestamp = randomInt(start, end);

  return new Date(timestamp).toISOString();
}

function makeUniqueEmail(firstName, lastName, index, domain, usedEmails) {
  const safeFirst = firstName.toLowerCase();
  const safeLast = lastName.toLowerCase();

  let attempt = 0;

  while (true) {
    const email = `${safeFirst}.${safeLast}.${index}.${attempt}@${domain}`;

    if (!usedEmails.has(email)) {
      usedEmails.add(email);
      return email;
    }

    attempt += 1;
  }
}

function makePhoneNumber() {
  const first = randomInt(200, 999);
  const second = randomInt(200, 999);
  const third = randomInt(1000, 9999);

  return `${first}-${second}-${third}`;
}

function writeJsonl(filePath, records) {
  const lines = records.map((record) => JSON.stringify(record)).join("\n");
  fs.writeFileSync(filePath, `${lines}\n`, "utf8");
}

function pick(values) {
  return values[randomInt(0, values.length - 1)];
}

function pickMany(values, count) {
  const copy = [...values];
  const selected = [];

  while (selected.length < count && copy.length > 0) {
    const index = randomInt(0, copy.length - 1);
    selected.push(copy.splice(index, 1)[0]);
  }

  return selected;
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

main();