/**
 * Author: Kris Sherbondy
 * Date: 2026-05-21
 * Purpose:
 *   Convert parsed search hints into a simple RelayDB internal query plan.
 */

function buildSearchPlan(parsed, searchIndex) {
  const hints = parsed.hints;

  const plan = {
    topic: hints.topic || "person",
    filters: {},
    relationships: {},
    limitReason: [],
  };

  if (hints.status) {
    plan.filters.status = hints.status;
  }

  if (hints.age) {
    plan.filters.age = hints.age;
  }

  const matchedIndustry = findKnownValue(
    hints.possibleValues,
    searchIndex.knownIndustries,
  );

  if (matchedIndustry) {
    plan.relationships.company = {
      industry: matchedIndustry,
    };
  }

  if (!matchedIndustry && hints.possibleValues.length > 0) {
    plan.freeText = hints.possibleValues;
  }

  return plan;
}

function findKnownValue(values, knownValues) {
  for (const value of values) {
    for (const knownValue of knownValues) {
      if (knownValue.toLowerCase() === value.toLowerCase()) {
        return knownValue;
      }

      if (knownValue.toLowerCase().includes(value.toLowerCase())) {
        return knownValue;
      }
    }
  }

  return null;
}

module.exports = {
  buildSearchPlan,
};