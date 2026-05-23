/**
 * Author: Kris Sherbondy
 * Date: 2026-05-21
 * Purpose:
 *   Build a schema-specific optimized runtime graph from the raw
 *   people + companies JSONL dataset.
 *
 *   This is intentionally raw-specific. It knows the source schema:
 *     - person.person.job.company_name
 *     - company.name
 *     - person.household_id
 *     - person.person.location.state
 *     - person.person.interests
 *
 *   This exists so raw JSONL gets a fair optimized lane.
 */

function buildRawPeopleCompaniesNormalizedGraph(companies, people) {
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
    if (!map.has(key)) {
      map.set(key, map.size);
    }

    return map.get(key);
  }

  for (const company of companies) {
    const companyId = normalizedCompanies.length;
    const industryId = getOrCreateId(industryIdByName, company.industry);

    const normalizedCompany = {
      id: companyId,
      rawId: company.id,
      name: company.name,
      industryId,
      industry: company.industry,
      founded: company.founded,
      state: company.headquarters?.state || null,
      city: company.headquarters?.city || null,
      country: company.headquarters?.country || null,
    };

    normalizedCompanies.push(normalizedCompany);
    companyIdByName.set(company.name, companyId);

    if (!companiesByIndustryId.has(industryId)) {
      companiesByIndustryId.set(industryId, []);
    }

    companiesByIndustryId.get(industryId).push(companyId);
  }

  for (const person of people) {
    const companyName = person.person?.job?.company_name || null;
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
      person.household_id || "unknown",
    );

    const interestIds = [];

    for (const interest of person.person?.interests || []) {
      const interestId = getOrCreateId(interestIdByName, interest);
      interestIds.push(interestId);

      if (!peopleByInterestId.has(interestId)) {
        peopleByInterestId.set(interestId, []);
      }
    }

    const normalizedPerson = {
      id: normalizedPeople.length,
      rawId: person.id,
      fullName: `${person.person?.name?.first || ""} ${
        person.person?.name?.last || ""
      }`.trim(),
      companyId: companyId ?? -1,
      householdId,
      interestIds,
      status: person.status || null,
      age: person.person?.age ?? null,
      salary: person.person?.job?.salary ?? 0,
      state: person.person?.location?.state || null,
      city: person.person?.location?.city || null,
      country: person.person?.location?.country || null,
    };

    normalizedPeople.push(normalizedPerson);

    if (normalizedPerson.companyId !== -1) {
      if (!peopleByCompanyId.has(normalizedPerson.companyId)) {
        peopleByCompanyId.set(normalizedPerson.companyId, []);
      }

      peopleByCompanyId.get(normalizedPerson.companyId).push(normalizedPerson.id);
    }

    if (!peopleByHouseholdId.has(householdId)) {
      peopleByHouseholdId.set(householdId, []);
    }

    peopleByHouseholdId.get(householdId).push(normalizedPerson.id);

    for (const interestId of interestIds) {
      peopleByInterestId.get(interestId).push(normalizedPerson.id);
    }
  }

  return {
    companies: normalizedCompanies,
    people: normalizedPeople,
    peopleByCompanyId,
    peopleByHouseholdId,
    peopleByInterestId,
    companiesByIndustryId,
    companyIdByName,
    industryIdByName,
    householdIdByRawId,
    interestIdByName,
    missingCompanyLinks,
  };
}

module.exports = {
  buildRawPeopleCompaniesNormalizedGraph,
};