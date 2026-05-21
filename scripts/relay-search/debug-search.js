/**
 * Author: Kris Sherbondy
 * Date: 2026-05-21
 * Purpose:
 *   Build a full RelayDB debug search packet for developer diagnostics.
 */

const { performance } = require("perf_hooks");

function buildDebugSearchPacket(input) {
  const {
    question,
    parsed,
    plan,
    execution,
    hydratedResults,
    timings,
  } = input;

  return {
    query: question,
    parsed,
    interpretedAs: plan,
    results: hydratedResults,
    explanation: {
      indexesUsed: inferIndexesUsed(plan),
      candidateCounts: execution.candidateCounts,
      timings,
    },
  };
}

function inferIndexesUsed(plan) {
  const indexes = [];

  if (plan.topic) {
    indexes.push(`^:${plan.topic}`);
  }

  if (plan.filters.status) {
    indexes.push(`~status:${plan.filters.status}`);
  }

  if (plan.filters.age?.lt !== undefined) {
    indexes.push(`~age:<${plan.filters.age.lt}`);
  }

  if (plan.filters.age?.gt !== undefined) {
    indexes.push(`~age:>${plan.filters.age.gt}`);
  }

  if (plan.relationships.company?.industry) {
    indexes.push("@company");
    indexes.push("@industry");
    indexes.push(`~name:${plan.relationships.company.industry}`);
  }

  return indexes;
}

function now() {
  return performance.now();
}

module.exports = {
  buildDebugSearchPacket,
  now,
};