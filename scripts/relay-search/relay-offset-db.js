/**
 * Author: Kris Sherbondy
 * Date: 2026-05-21
 * Purpose:
 *   Experimental lean RelayDB reader v4.
 *
 *   This reader keeps the JSONL file as a Buffer and builds small open-time
 *   lookup structures:
 *
 *     anchor -> byte range
 *     topic  -> byte ranges
 *     company anchor -> industry
 *     tiny person search rows
 *
 *   This version separates:
 *
 *     search()      -> fast cached answer path
 *     debugSearch() -> honest full diagnostic path
 *
 *   The goal is to keep the public API clean while avoiding debug/audit
 *   overhead in normal search calls.
 *
 * Public API:
 *   RelayOffsetDB.open(filePath)
 *   db.search(question, options?)
 *   db.debugSearch(question, options?)
 */

const fs = require("fs");
const { performance } = require("perf_hooks");

const TinyLRU = require("./tiny-lru");
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

    this.queryPlanCache = new TinyLRU(64);
    this.searchResultCache = new TinyLRU(128);
    this.nodeCache = new TinyLRU(512);
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
    const limit = options.limit ?? 1;
    const explain = Boolean(options.explain);

    const cacheKey = makeSearchCacheKey(question, {
      limit,
      explain,
    });

    const cachedResult = this.searchResultCache.get(cacheKey);

    if (cachedResult !== undefined) {
      return cachedResult;
    }

    const planPacket = this.getOrBuildPlan(question);

    const execution = this.executeFastPlan(planPacket.plan, {
      limit,
    });

    const hydratedResults = execution.matches.map((match) =>
      this.hydrateMatch(match, {
        explain,
      }),
    );

    let result;

    if (limit === 1) {
      result =
        hydratedResults[0] || {
          answer: null,
        };
    } else {
      result = {
        query: question,
        count: hydratedResults.length,
        results: hydratedResults,
      };
    }

    this.searchResultCache.set(cacheKey, result);

    return result;
  }

  debugSearch(question, options = {}) {
    const timings = {};

    const planStart = performance.now();
    const planPacket = this.getOrBuildPlan(question);
    timings.planPacketMs = performance.now() - planStart;

    const parsed = planPacket.parsed;
    const plan = planPacket.plan;

    const executeStart = performance.now();
    const execution = this.executeDebugPlan(plan, {
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
      timings.planPacketMs + timings.executeMs + timings.hydrateMs;

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
        cacheStats: this.cacheStats(),
      },
    };
  }

  getOrBuildPlan(question) {
    const normalizedQuestion = String(question || "").trim().toLowerCase();

    const cachedPlan = this.queryPlanCache.get(normalizedQuestion);

    if (cachedPlan !== undefined) {
      return cachedPlan;
    }

    const parsed = parseSearchQuestion(question);
    const plan = buildSearchPlan(parsed, this.searchIndex);

    const packet = {
      parsed,
      plan,
    };

    this.queryPlanCache.set(normalizedQuestion, packet);

    return packet;
  }

  cacheStats() {
    return {
      queryPlanCache: this.queryPlanCache.stats(),
      searchResultCache: this.searchResultCache.stats(),
      nodeCache: this.nodeCache.stats(),
    };
  }

  executeFastPlan(plan, options = {}) {
    const limit = options.limit ?? 1;
    const matches = [];

    const rows = this.personSearchRows;
    const wantedStatus = plan.filters.status || null;
    const ageFilter = plan.filters.age || null;
    const ageLt = ageFilter?.lt;
    const ageGt = ageFilter?.gt;
    const wantedIndustry = plan.relationships.company?.industry
      ? plan.relationships.company.industry.toLowerCase()
      : null;

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];

      if (wantedStatus && row.status !== wantedStatus) {
        continue;
      }

      if (ageLt !== undefined) {
        if (typeof row.age !== "number" || row.age >= ageLt) {
          continue;
        }
      }

      if (ageGt !== undefined) {
        if (typeof row.age !== "number" || row.age <= ageGt) {
          continue;
        }
      }

      if (wantedIndustry) {
        if (!row.companyAnchor) {
          continue;
        }

        const industry = this.companyIndustryByAnchor.get(row.companyAnchor);

        if (!industry || industry.toLowerCase() !== wantedIndustry) {
          continue;
        }
      }

      matches.push({
        topic: "person",
        anchor: row.anchor,
        range: row.range,
        fullName: row.fullName,
      });

      if (matches.length >= limit) {
        break;
      }
    }

    return {
      matches,
    };
  }

  executeDebugPlan(plan, options = {}) {
    const limit = options.limit ?? 1;
    const matches = [];

    const rows = this.personSearchRows;
    const wantedStatus = plan.filters.status || null;
    const ageFilter = plan.filters.age || null;
    const ageLt = ageFilter?.lt;
    const ageGt = ageFilter?.gt;
    const wantedIndustry = plan.relationships.company?.industry
      ? plan.relationships.company.industry.toLowerCase()
      : null;

    const candidateCounts = {
      topicMatches: rows.length,
      statusMatches: 0,
      ageMatches: 0,
      industryMatches: 0,
      finalMatches: 0,
    };

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];

      if (wantedStatus) {
        if (row.status !== wantedStatus) {
          continue;
        }

        candidateCounts.statusMatches += 1;
      } else {
        candidateCounts.statusMatches += 1;
      }

      if (ageLt !== undefined) {
        if (typeof row.age !== "number" || row.age >= ageLt) {
          continue;
        }

        candidateCounts.ageMatches += 1;
      } else if (ageGt !== undefined) {
        if (typeof row.age !== "number" || row.age <= ageGt) {
          continue;
        }

        candidateCounts.ageMatches += 1;
      } else {
        candidateCounts.ageMatches += 1;
      }

      if (wantedIndustry) {
        if (!row.companyAnchor) {
          continue;
        }

        const industry = this.companyIndustryByAnchor.get(row.companyAnchor);

        if (!industry || industry.toLowerCase() !== wantedIndustry) {
          continue;
        }

        candidateCounts.industryMatches += 1;
      } else {
        candidateCounts.industryMatches += 1;
      }

      candidateCounts.finalMatches += 1;

      if (matches.length < limit) {
        matches.push({
          topic: "person",
          anchor: row.anchor,
          range: row.range,
          fullName: row.fullName,
        });
      }
    }

    return {
      matches,
      candidateCounts,
    };
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

    const personNode = this.getNodeByAnchorOrRange(match.anchor, match.range);

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

    const companyNode =
      companyAnchor && companyRange
        ? this.getNodeByAnchorOrRange(companyAnchor, companyRange)
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

  getNodeByAnchorOrRange(anchor, range) {
    if (anchor) {
      const cachedNode = this.nodeCache.get(anchor);

      if (cachedNode !== undefined) {
        return cachedNode;
      }
    }

    const node = parseNodeFromRange(this.buffer, range);

    if (anchor && node) {
      this.nodeCache.set(anchor, node);
    }

    return node;
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

function makeSearchCacheKey(question, options) {
  return JSON.stringify({
    question: String(question || "").trim().toLowerCase(),
    limit: options.limit ?? 1,
    explain: Boolean(options.explain),
  });
}

module.exports = RelayOffsetDB;