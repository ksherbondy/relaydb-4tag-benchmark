/**
 * Author: Kris Sherbondy
 * Date: 2026-05-21
 * Purpose:
 *   Execute a simple RelayDB search plan against the normalized v2 graph.
 */

function executeSearchPlan(plan, graph, searchIndex, options = {}) {
  const limit = options.limit ?? 1;

  const candidates = [];
  const candidateCounts = {
    topicMatches: 0,
    statusMatches: 0,
    ageMatches: 0,
    industryMatches: 0,
    finalMatches: 0,
  };

  if (plan.topic === "person") {
    candidateCounts.topicMatches = graph.people.length;

    for (const person of graph.people) {
      if (!matchesStatus(person, plan, candidateCounts)) continue;
      if (!matchesAge(person, plan, candidateCounts)) continue;
      if (!matchesCompanyIndustry(person, graph, searchIndex, plan, candidateCounts)) {
        continue;
      }

      candidates.push({
        topic: "person",
        id: person.id,
        score: scorePerson(person, graph, searchIndex, plan),
      });
    }
  }

  candidates.sort((left, right) => right.score - left.score);

  candidateCounts.finalMatches = candidates.length;

  return {
    matches: candidates.slice(0, limit),
    candidateCounts,
  };
}

function matchesStatus(person, plan, candidateCounts) {
  if (!plan.filters.status) {
    candidateCounts.statusMatches += 1;
    return true;
  }

  const matched = person.status === plan.filters.status;

  if (matched) {
    candidateCounts.statusMatches += 1;
  }

  return matched;
}

function matchesAge(person, plan, candidateCounts) {
  if (!plan.filters.age) {
    candidateCounts.ageMatches += 1;
    return true;
  }

  if (typeof person.age !== "number") return false;

  if (plan.filters.age.lt !== undefined && person.age < plan.filters.age.lt) {
    candidateCounts.ageMatches += 1;
    return true;
  }

  if (plan.filters.age.gt !== undefined && person.age > plan.filters.age.gt) {
    candidateCounts.ageMatches += 1;
    return true;
  }

  return false;
}

function matchesCompanyIndustry(person, graph, searchIndex, plan, candidateCounts) {
  const wantedIndustry = plan.relationships.company?.industry;

  if (!wantedIndustry) {
    candidateCounts.industryMatches += 1;
    return true;
  }

  const company = graph.companies[person.companyId];

  if (!company) return false;

  const industryName = searchIndex.companyIndustryNameById.get(company.id);

  const matched =
    industryName &&
    industryName.toLowerCase() === wantedIndustry.toLowerCase();

  if (matched) {
    candidateCounts.industryMatches += 1;
  }

  return matched;
}

function scorePerson(person, graph, searchIndex, plan) {
  let score = 0;

  if (plan.filters.status && person.status === plan.filters.status) {
    score += 10;
  }

  if (plan.filters.age?.lt !== undefined && person.age < plan.filters.age.lt) {
    score += 10;
  }

  const company = graph.companies[person.companyId];

  if (company && plan.relationships.company?.industry) {
    const industryName = searchIndex.companyIndustryNameById.get(company.id);

    if (
      industryName &&
      industryName.toLowerCase() ===
        plan.relationships.company.industry.toLowerCase()
    ) {
      score += 15;
    }
  }

  return score;
}

module.exports = {
  executeSearchPlan,
};