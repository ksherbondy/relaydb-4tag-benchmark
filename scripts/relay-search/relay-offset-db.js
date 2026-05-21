/**
 * Author: Kris Sherbondy
 * Date: 2026-05-21
 * Purpose:
 *   Experimental lean RelayDB reader v2.
 *
 *   This reader keeps the JSONL file as a Buffer and builds small open-time
 *   lookup structures:
 *
 *     anchor -> byte range
 *     topic  -> byte ranges
 *     company anchor -> industry
 *     tiny person search rows
 *
 *   It avoids storing the full parsed graph in memory, but also avoids
 *   reparsing every person JSON line during every search.
 *
 * Public API:
 *   RelayOffsetDB.open(filePath)
 *   db.search(question, options?)
 *   db.debugSearch(question, options?)
 */

const fs = require("fs");
const { performance } = require("perf_hooks");

const { parseSearchQuestion } = require("./search-parser");
const { buildSearchPlan } = require("./search-planner");

class RelayOffsetDB {
  constructor(input) {
    this.filePath = input.filePath;
    this.buffer = input.buffer;
    this.anchorToRange = input.anchorToRange;
    this.topicToRanges = input.topicToRanges;
    this.companyIndustryByAnchor = input.companyIndustryByAnchor;
    this.personSearchRows = input.personSearchRows;
    this.searchIndex = input.searchIndex;
    this.stats = input.stats;
  }

  static async open(filePath) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Missing file: ${filePath}`);
    }

    const openStarted = performance.now();

    const buffer = fs.readFileSync(filePath);

    const anchorToRange = new Map();
    const topicToRanges = new Map();
    const companyIndustryByAnchor = new Map();
    const personSearchRows = [];
    const knownIndustries = new Set();

    let lineCount = 0;
    let nodeCount = 0;

    let start = 0;

    while (start < buffer.length) {
      let end = buffer.indexOf(10, start); // "\n"

      if (end === -1) {
        end = buffer.length;
      }

      if (end > start) {
        lineCount += 1;

        const range = [start, end];
        const node = parseNodeFromRange(buffer, range);

        if (node && node["#"]) {
          nodeCount += 1;

          const anchor = node["#"];
          const topic = node["^"] || "unknown";

          anchorToRange.set(anchor, range);

          if (!topicToRanges.has(topic)) {
            topicToRanges.set(topic, []);
          }

          topicToRanges.get(topic).push(range);

          if (topic === "company") {
            const industry = node["~industry"] || null;

            if (industry) {
              companyIndustryByAnchor.set(anchor, industry);
              knownIndustries.add(industry);
            }
          }

          if (topic === "industry") {
            const industryName = node["~name"] || null;

            if (industryName) {
              knownIndustries.add(industryName);
            }
          }

          if (topic === "person") {
            personSearchRows.push({
              range,
              anchor,
              status: node["~status"] || null,
              age: node["~age"] ?? null,
              salary: node["~salary"] ?? null,
              companyAnchor: node["@company"] || null,
              fullName:
                node.name?.full ||
                [node.name?.first, node.name?.last].filter(Boolean).join(" ") ||
                anchor,
            });
          }
        }
      }

      start = end + 1;
    }

    const openEnded = performance.now();

    return new RelayOffsetDB({
      filePath,
      buffer,
      anchorToRange,
      topicToRanges,
      companyIndustryByAnchor,
      personSearchRows,
      searchIndex: {
        knownIndustries: Array.from(knownIndustries),
      },
      stats: {
        filePath,
        bytes: buffer.length,
        lineCount,
        nodeCount,
        anchorCount: anchorToRange.size,
        personSearchRows: personSearchRows.length,
        topicCounts: countTopicRanges(topicToRanges),
        openMs: openEnded - openStarted,
      },
    });
  }

  search(question, options = {}) {
    const started = performance.now();

    const limit = options.limit ?? 1;

    const parsed = parseSearchQuestion(question);
    const plan = buildSearchPlan(parsed, this.searchIndex);

    const execution = this.executePlan(plan, {
      limit,
    });

    const hydratedResults = execution.matches.map((match) =>
      this.hydrateMatch(match, {
        explain: Boolean(options.explain),
      }),
    );

    const ended = performance.now();

    if (limit === 1) {
      return (
        hydratedResults[0] || {
          answer: null,
          timingMs: ended - started,
        }
      );
    }

    return {
      query: question,
      count: hydratedResults.length,
      results: hydratedResults,
      timingMs: ended - started,
    };
  }

  debugSearch(question, options = {}) {
    const timings = {};

    const parseStart = performance.now();
    const parsed = parseSearchQuestion(question);
    timings.parseMs = performance.now() - parseStart;

    const planStart = performance.now();
    const plan = buildSearchPlan(parsed, this.searchIndex);
    timings.planMs = performance.now() - planStart;

    const executeStart = performance.now();
    const execution = this.executePlan(plan, {
      limit: options.limit ?? 1,
    });
    timings.executeMs = performance.now() - executeStart;

    const hydrateStart = performance.now();
    const hydratedResults = execution.matches.map((match) =>
      this.hydrateMatch(match, {
        explain: true,
      }),
    );
    timings.hydrateMs = performance.now() - hydrateStart;

    timings.totalMs =
      timings.parseMs + timings.planMs + timings.executeMs + timings.hydrateMs;

    return {
      query: question,
      parsed,
      interpretedAs: plan,
      results: hydratedResults,
      explanation: {
        indexesUsed: inferIndexesUsed(plan),
        candidateCounts: execution.candidateCounts,
        timings,
        offsetStats: this.stats,
      },
    };
  }

  executePlan(plan, options = {}) {
    const limit = options.limit ?? 1;

    const matches = [];

    const candidateCounts = {
      topicMatches: this.personSearchRows.length,
      statusMatches: 0,
      ageMatches: 0,
      industryMatches: 0,
      finalMatches: 0,
    };

    for (const row of this.personSearchRows) {
      if (!matchesStatusRow(row, plan, candidateCounts)) continue;
      if (!matchesAgeRow(row, plan, candidateCounts)) continue;
      if (!this.matchesCompanyIndustryRow(row, plan, candidateCounts)) {
        continue;
      }

      matches.push({
        topic: "person",
        anchor: row.anchor,
        range: row.range,
        fullName: row.fullName,
        score: scorePersonRow(row, plan),
      });
    }

    matches.sort((left, right) => right.score - left.score);

    candidateCounts.finalMatches = matches.length;

    return {
      matches: matches.slice(0, limit),
      candidateCounts,
    };
  }

  matchesCompanyIndustryRow(row, plan, candidateCounts) {
    const wantedIndustry = plan.relationships.company?.industry;

    if (!wantedIndustry) {
      candidateCounts.industryMatches += 1;
      return true;
    }

    if (!row.companyAnchor) return false;

    const industry = this.companyIndustryByAnchor.get(row.companyAnchor);

    if (!industry) return false;

    const matched = industry.toLowerCase() === wantedIndustry.toLowerCase();

    if (matched) {
      candidateCounts.industryMatches += 1;
    }

    return matched;
  }

  hydrateMatch(match, options = {}) {
    if (!match) {
      return {
        answer: null,
      };
    }

    if (!options.explain) {
      return {
        answer: match.fullName || match.anchor,
      };
    }

    const personNode = parseNodeFromRange(this.buffer, match.range);

    if (!personNode) {
      return {
        answer: null,
      };
    }

    const fullName =
      personNode.name?.full ||
      [personNode.name?.first, personNode.name?.last].filter(Boolean).join(" ") ||
      personNode["#"];

    const companyAnchor = personNode["@company"];
    const companyRange = companyAnchor
      ? this.anchorToRange.get(companyAnchor)
      : null;

    const companyNode = companyRange
      ? parseNodeFromRange(this.buffer, companyRange)
      : null;

    return {
      answer: fullName,
      data: {
        person: {
          name: fullName,
          age: personNode["~age"],
          status: personNode["~status"],
          salary: personNode["~salary"],
          location: {
            city: locationValueFromAnchor(personNode["@location"], "city"),
            state: locationValueFromAnchor(personNode["@location"], "state"),
            country: locationValueFromAnchor(personNode["@location"], "country"),
          },
        },
        company: companyNode
          ? {
              name: companyNode["~name"] || companyNode.name || null,
              industry: companyNode["~industry"] || null,
              founded: companyNode["~founded"] ?? null,
              headquarters: {
                city:
                  companyNode.headquarters?.city ||
                  locationValueFromAnchor(companyNode["@headquarters"], "city"),
                state:
                  companyNode.headquarters?.state ||
                  locationValueFromAnchor(companyNode["@headquarters"], "state"),
                country:
                  companyNode.headquarters?.country ||
                  locationValueFromAnchor(
                    companyNode["@headquarters"],
                    "country",
                  ),
              },
            }
          : null,
      },
    };
  }
}

function parseNodeFromRange(buffer, range) {
  const [start, end] = range;

  try {
    return JSON.parse(buffer.toString("utf8", start, end));
  } catch {
    return null;
  }
}

function matchesStatusRow(row, plan, candidateCounts) {
  if (!plan.filters.status) {
    candidateCounts.statusMatches += 1;
    return true;
  }

  const matched = row.status === plan.filters.status;

  if (matched) {
    candidateCounts.statusMatches += 1;
  }

  return matched;
}

function matchesAgeRow(row, plan, candidateCounts) {
  if (!plan.filters.age) {
    candidateCounts.ageMatches += 1;
    return true;
  }

  if (typeof row.age !== "number") return false;

  if (plan.filters.age.lt !== undefined && row.age < plan.filters.age.lt) {
    candidateCounts.ageMatches += 1;
    return true;
  }

  if (plan.filters.age.gt !== undefined && row.age > plan.filters.age.gt) {
    candidateCounts.ageMatches += 1;
    return true;
  }

  return false;
}

function scorePersonRow(row, plan) {
  let score = 0;

  if (plan.filters.status && row.status === plan.filters.status) {
    score += 10;
  }

  if (plan.filters.age?.lt !== undefined && row.age < plan.filters.age.lt) {
    score += 10;
  }

  if (plan.filters.age?.gt !== undefined && row.age > plan.filters.age.gt) {
    score += 10;
  }

  if (plan.relationships.company?.industry) {
    score += 15;
  }

  return score;
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

function countTopicRanges(topicToRanges) {
  const counts = {};

  for (const [topic, ranges] of topicToRanges.entries()) {
    counts[topic] = ranges.length;
  }

  return counts;
}

function locationValueFromAnchor(anchor, part) {
  if (!anchor || !anchor.startsWith("location:")) return null;

  const pieces = anchor.split(":");

  const country = pieces[1] || null;
  const state = pieces[2] || null;
  const city = pieces[3] || null;

  if (part === "country") return denormalizeAnchorPart(country, true);
  if (part === "state") return state ? state.toUpperCase() : null;
  if (part === "city") return denormalizeAnchorPart(city, false);

  return null;
}

function denormalizeAnchorPart(value, forceUppercase = false) {
  if (!value) return null;

  if (forceUppercase || value.length <= 3) {
    return String(value).toUpperCase();
  }

  return String(value)
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

module.exports = RelayOffsetDB;