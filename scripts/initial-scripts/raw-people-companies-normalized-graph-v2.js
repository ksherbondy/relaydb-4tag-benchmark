/**
 * Author: Kris Sherbondy
 * Date: 2026-05-21
 * Purpose:
 *   Build a schema-specific raw normalized runtime graph using the shared
 *   runtime object factories.
 *
 *   This gives raw JSONL a fair optimized lane while keeping its
 *   schema-specific nature visible.
 */

const {
  makeRuntimeCompany,
  makeRuntimePerson,
  makeRuntimeGraph,
} = require("./runtime-shape-factory");

function buildRawPeopleCompaniesNormalizedGraphV2(companies, people) {
  const companyIdByName = new Map();
  const industryIdByName = new Map();
  const householdIdByRawId = new Map();
  const interestIdByName = new Map();

  const normalizedCompanies = [];
  const normalizedPeople = [];

  const peopleByCompanyId = new Map();
  const peopleByHouseholdId = new Map();
  const peopleByInterestId = new Map();
  const companiesByIndustryId = new Map();

  const missingCompanyLinks = [];

  function getOrCreateId(map, key) {
    const safeKey = key ?? "unknown";

    if (!map.has(safeKey)) {
      map.set(safeKey, map.size);
    }

    return map.get(safeKey);
  }

  for (const company of companies) {
    const companyId = normalizedCompanies.length;
    const industryId = getOrCreateId(industryIdByName, company.industry);

    const runtimeCompany = makeRuntimeCompany({
      id: companyId,
      rawId: company.id,
      nodeId: -1,
      anchor: null,
      name: company.name,
      industryId,
      industry: company.industry,
      industryAnchor: null,
      founded: company.founded,
      state: company.headquarters?.state ?? null,
      city: company.headquarters?.city ?? null,
      country: company.headquarters?.country ?? null,
    });

    normalizedCompanies.push(runtimeCompany);
    companyIdByName.set(company.name, companyId);

    if (!companiesByIndustryId.has(industryId)) {
      companiesByIndustryId.set(industryId, []);
    }

    companiesByIndustryId.get(industryId).push(companyId);
  }

  for (const person of people) {
    const personId = normalizedPeople.length;
    const companyName = person.person?.job?.company_name ?? null;
    const companyId = companyName ? companyIdByName.get(companyName) : undefined;

    if (companyId === undefined) {
      missingCompanyLinks.push({
        personId: person.id,
        companyName,
        reason: "company_name_not_found",
      });
    }

    const householdId = getOrCreateId(
      householdIdByRawId,
      person.household_id ?? "unknown",
    );

    const interestIds = [];

    for (const interest of person.person?.interests ?? []) {
      const interestId = getOrCreateId(interestIdByName, interest);
      interestIds.push(interestId);

      if (!peopleByInterestId.has(interestId)) {
        peopleByInterestId.set(interestId, []);
      }
    }

    const firstName = person.person?.name?.first ?? "";
    const lastName = person.person?.name?.last ?? "";

    const runtimePerson = makeRuntimePerson({
      id: personId,
      rawId: person.id,
      nodeId: -1,
      anchor: null,
      fullName: `${firstName} ${lastName}`.trim(),
      companyId: companyId ?? -1,
      householdId,
      interestIds,
      status: person.status ?? null,
      age: person.person?.age ?? null,
      salary: person.person?.job?.salary ?? 0,
      state: person.person?.location?.state ?? null,
      city: person.person?.location?.city ?? null,
      country: person.person?.location?.country ?? null,
    });

    normalizedPeople.push(runtimePerson);

    if (runtimePerson.companyId !== -1) {
      if (!peopleByCompanyId.has(runtimePerson.companyId)) {
        peopleByCompanyId.set(runtimePerson.companyId, []);
      }

      peopleByCompanyId.get(runtimePerson.companyId).push(runtimePerson.id);
    }

    if (!peopleByHouseholdId.has(householdId)) {
      peopleByHouseholdId.set(householdId, []);
    }

    peopleByHouseholdId.get(householdId).push(runtimePerson.id);

    for (const interestId of interestIds) {
      peopleByInterestId.get(interestId).push(runtimePerson.id);
    }
  }

  return makeRuntimeGraph({
    companies: normalizedCompanies,
    people: normalizedPeople,
    peopleByCompanyId,
    peopleByHouseholdId,
    peopleByInterestId,
    companiesByIndustryId,
    missingCompanyLinks,
    sourceModel: "raw-schema-specific-v2",
  });
}

module.exports = {
  buildRawPeopleCompaniesNormalizedGraphV2,
};