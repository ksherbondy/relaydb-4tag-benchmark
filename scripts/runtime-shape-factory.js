/**
 * Author: Kris Sherbondy
 * Date: 2026-05-21
 * Purpose:
 *   Shared runtime object factories for normalized benchmark v2.
 *
 *   Raw normalized and tagged normalized lanes both use these factories
 *   so V8 sees the same object property order and shape.
 */

function makeRuntimeCompany(input) {
  return {
    id: input.id ?? -1,
    rawId: input.rawId ?? null,
    nodeId: input.nodeId ?? -1,
    anchor: input.anchor ?? null,
    name: input.name ?? null,
    industryId: input.industryId ?? -1,
    industry: input.industry ?? null,
    industryAnchor: input.industryAnchor ?? null,
    founded: input.founded ?? null,
    state: input.state ?? null,
    city: input.city ?? null,
    country: input.country ?? null,
  };
}

function makeRuntimePerson(input) {
  return {
    id: input.id ?? -1,
    rawId: input.rawId ?? null,
    nodeId: input.nodeId ?? -1,
    anchor: input.anchor ?? null,
    fullName: input.fullName ?? null,
    companyId: input.companyId ?? -1,
    householdId: input.householdId ?? -1,
    interestIds: input.interestIds ?? [],
    status: input.status ?? null,
    age: input.age ?? null,
    salary: input.salary ?? 0,
    state: input.state ?? null,
    city: input.city ?? null,
    country: input.country ?? null,
  };
}

function makeRuntimeGraph(input) {
  return {
    companies: input.companies ?? [],
    people: input.people ?? [],
    peopleByCompanyId: input.peopleByCompanyId ?? new Map(),
    peopleByHouseholdId: input.peopleByHouseholdId ?? new Map(),
    peopleByInterestId: input.peopleByInterestId ?? new Map(),
    companiesByIndustryId: input.companiesByIndustryId ?? new Map(),
    missingCompanyLinks: input.missingCompanyLinks ?? [],
    sourceModel: input.sourceModel ?? "unknown",
  };
}

module.exports = {
  makeRuntimeCompany,
  makeRuntimePerson,
  makeRuntimeGraph,
};