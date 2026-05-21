/**
 * Author: Kris Sherbondy
 * Date: 2026-05-21
 * Purpose:
 *   Experimental compact RelayDB offset reader.
 *
 *   This reader keeps the JSONL file as a Buffer, but replaces object-heavy
 *   person search rows with typed arrays and integer IDs.
 *
 *   Goal:
 *     Test whether JS can get closer to a Rust-style memory layout while
 *     preserving the clean RelayDB search/debug API.
 *
 * Public API:
 *   RelayOffsetCompactDB.open(filePath)
 *   db.search(question, options?)
 *   db.debugSearch(question, options?)
 */

const fs = require("fs");
const { performance } = require("perf_hooks");

const TinyLRU = require("./tiny-lru");
const { parseSearchQuestion } = require("./search-parser");
const { buildSearchPlan } = require("./search-planner");

const STATUS_UNKNOWN = 0;
const STATUS_ACTIVE = 1;
const STATUS_INACTIVE = 2;
const STATUS_PENDING = 3;

class RelayOffsetCompactDB {
  constructor(input) {
    this.filePath = input.filePath;
    this.buffer = input.buffer;

    this.personStarts = input.personStarts;
    this.personEnds = input.personEnds;
    this.personAges = input.personAges;
    this.personSalaries = input.personSalaries;
    this.personStatusIds = input.personStatusIds;
    this.personCompanyIds = input.personCompanyIds;
    this.personAnchors = input.personAnchors;
    this.personFullNames = input.personFullNames;

    this.companyStarts = input.companyStarts;
    this.companyEnds = input.companyEnds;
    this.companyIndustryIds = input.companyIndustryIds;
    this.companyAnchorToId = input.companyAnchorToId;

    this.industryToId = input.industryToId;
    this.idToIndustry = input.idToIndustry;

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

    const topicCounts = {};
    const companyAnchorToId = new Map();
    const industryToId = new Map();
    const idToIndustry = ["unknown"];

    const companyStartsTemp = [];
    const companyEndsTemp = [];
    const companyIndustryIdsTemp = [];

    let lineCount = 0;
    let nodeCount = 0;
    let anchorCount = 0;
    let personCount = 0;

    let start = 0;

    while (start < buffer.length) {
      let end = buffer.indexOf(10, start);

      if (end === -1) {
        end = buffer.length;
      }

      if (end > start) {
        lineCount += 1;

        const node = parseNodeFromRange(buffer, start, end);

        if (node && node["#"]) {
          nodeCount += 1;
          anchorCount += 1;

          const topic = node["^"] || "unknown";
          topicCounts[topic] = (topicCounts[topic] || 0) + 1;

          if (topic === "company") {
            const companyId = companyStartsTemp.length;
            const anchor = node["#"];
            const industry = node["~industry"] || null;
            const industryId = getOrCreateIndustryId(
              industry,
              industryToId,
              idToIndustry,
            );

            companyAnchorToId.set(anchor, companyId);
            companyStartsTemp.push(start);
            companyEndsTemp.push(end);
            companyIndustryIdsTemp.push(industryId);
          }

          if (topic === "industry") {
            const industryName = node["~name"] || null;

            if (industryName) {
              getOrCreateIndustryId(industryName, industryToId, idToIndustry);
            }
          }

          if (topic === "person") {
            personCount += 1;
          }
        }
      }

      start = end + 1;
    }

    const personStarts = new Uint32Array(personCount);
    const personEnds = new Uint32Array(personCount);
    const personAges = new Uint8Array(personCount);
    const personSalaries = new Uint32Array(personCount);
    const personStatusIds = new Uint8Array(personCount);
    const personCompanyIds = new Uint32Array(personCount);
    const personAnchors = new Array(personCount);
    const personFullNames = new Array(personCount);

    let personIndex = 0;
    start = 0;

    while (start < buffer.length) {
      let end = buffer.indexOf(10, start);

      if (end === -1) {
        end = buffer.length;
      }

      if (end > start) {
        const node = parseNodeFromRange(buffer, start, end);

        if (node && node["#"] && node["^"] === "person") {
          const anchor = node["#"];
          const companyAnchor = node["@company"] || null;
          const companyId = companyAnchorToId.has(companyAnchor)
            ? companyAnchorToId.get(companyAnchor) + 1
            : 0;

          personStarts[personIndex] = start;
          personEnds[personIndex] = end;
          personAges[personIndex] =
            typeof node["~age"] === "number" ? node["~age"] : 0;
          personSalaries[personIndex] =
            typeof node["~salary"] === "number" ? node["~salary"] : 0;
          personStatusIds[personIndex] = statusToId(node["~status"]);
          personCompanyIds[personIndex] = companyId;
          personAnchors[personIndex] = anchor;
          personFullNames[personIndex] =
            node.name?.full ||
            [node.name?.first, node.name?.last].filter(Boolean).join(" ") ||
            anchor;

          personIndex += 1;
        }
      }

      start = end + 1;
    }

    const companyStarts = Uint32Array.from(companyStartsTemp);
    const companyEnds = Uint32Array.from(companyEndsTemp);
    const companyIndustryIds = Uint16Array.from(companyIndustryIdsTemp);

    const openEnded = performance.now();

    return new RelayOffsetCompactDB({
      filePath,
      buffer,

      personStarts,
      personEnds,
      personAges,
      personSalaries,
      personStatusIds,
      personCompanyIds,
      personAnchors,
      personFullNames,

      companyStarts,
      companyEnds,
      companyIndustryIds,
      companyAnchorToId,

      industryToId,
      idToIndustry,

      searchIndex: {
        knownIndustries: idToIndustry.filter((value) => value !== "unknown"),
      },

      stats: {
        filePath,
        bytes: buffer.length,
        lineCount,
        nodeCount,
        anchorCount,
        personCount,
        companyCount: companyStarts.length,
        industryCount: idToIndustry.length - 1,
        topicCounts,
        openMs: openEnded - openStarted,
        layout: "compact-typed-arrays",
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

    const wantedStatusId = plan.filters.status
      ? statusToId(plan.filters.status)
      : STATUS_UNKNOWN;

    const ageFilter = plan.filters.age || null;
    const ageLt = ageFilter?.lt;
    const ageGt = ageFilter?.gt;

    const wantedIndustryId = this.getWantedIndustryId(plan);

    for (let index = 0; index < this.personStarts.length; index += 1) {
      if (
        wantedStatusId !== STATUS_UNKNOWN &&
        this.personStatusIds[index] !== wantedStatusId
      ) {
        continue;
      }

      const age = this.personAges[index];

      if (ageLt !== undefined && age >= ageLt) {
        continue;
      }

      if (ageGt !== undefined && age <= ageGt) {
        continue;
      }

      if (wantedIndustryId !== 0) {
        const companyId = this.personCompanyIds[index];

        if (companyId === 0) {
          continue;
        }

        const industryId = this.companyIndustryIds[companyId - 1];

        if (industryId !== wantedIndustryId) {
          continue;
        }
      }

      matches.push({
        index,
        anchor: this.personAnchors[index],
        start: this.personStarts[index],
        end: this.personEnds[index],
        fullName: this.personFullNames[index],
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

    const wantedStatusId = plan.filters.status
      ? statusToId(plan.filters.status)
      : STATUS_UNKNOWN;

    const ageFilter = plan.filters.age || null;
    const ageLt = ageFilter?.lt;
    const ageGt = ageFilter?.gt;

    const wantedIndustryId = this.getWantedIndustryId(plan);

    const candidateCounts = {
      topicMatches: this.personStarts.length,
      statusMatches: 0,
      ageMatches: 0,
      industryMatches: 0,
      finalMatches: 0,
    };

    for (let index = 0; index < this.personStarts.length; index += 1) {
      if (wantedStatusId !== STATUS_UNKNOWN) {
        if (this.personStatusIds[index] !== wantedStatusId) {
          continue;
        }

        candidateCounts.statusMatches += 1;
      } else {
        candidateCounts.statusMatches += 1;
      }

      const age = this.personAges[index];

      if (ageLt !== undefined) {
        if (age >= ageLt) {
          continue;
        }

        candidateCounts.ageMatches += 1;
      } else if (ageGt !== undefined) {
        if (age <= ageGt) {
          continue;
        }

        candidateCounts.ageMatches += 1;
      } else {
        candidateCounts.ageMatches += 1;
      }

      if (wantedIndustryId !== 0) {
        const companyId = this.personCompanyIds[index];

        if (companyId === 0) {
          continue;
        }

        const industryId = this.companyIndustryIds[companyId - 1];

        if (industryId !== wantedIndustryId) {
          continue;
        }

        candidateCounts.industryMatches += 1;
      } else {
        candidateCounts.industryMatches += 1;
      }

      candidateCounts.finalMatches += 1;

      if (matches.length < limit) {
        matches.push({
          index,
          anchor: this.personAnchors[index],
          start: this.personStarts[index],
          end: this.personEnds[index],
          fullName: this.personFullNames[index],
        });
      }
    }

    return {
      matches,
      candidateCounts,
    };
  }

  getWantedIndustryId(plan) {
    const wantedIndustry = plan.relationships.company?.industry;

    if (!wantedIndustry) {
      return 0;
    }

    const normalized = String(wantedIndustry).toLowerCase();

    return this.industryToId.get(normalized) || 0;
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

    const personNode = this.getNodeByAnchorOrRange(
      match.anchor,
      match.start,
      match.end,
    );

    if (!personNode) {
      return {
        answer: null,
      };
    }

    const fullName =
      personNode.name?.full ||
      [personNode.name?.first, personNode.name?.last].filter(Boolean).join(" ") ||
      personNode["#"];

    const compactPersonIndex =
      typeof match.index === "number" ? match.index : -1;

    const companyId =
      compactPersonIndex >= 0 ? this.personCompanyIds[compactPersonIndex] : 0;

    const companyNode =
      companyId > 0
        ? this.getNodeByAnchorOrRange(
            `company:${companyId - 1}`,
            this.companyStarts[companyId - 1],
            this.companyEnds[companyId - 1],
          )
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

  getNodeByAnchorOrRange(anchor, start, end) {
    if (anchor) {
      const cachedNode = this.nodeCache.get(anchor);

      if (cachedNode !== undefined) {
        return cachedNode;
      }
    }

    const node = parseNodeFromRange(this.buffer, start, end);

    if (anchor && node) {
      this.nodeCache.set(anchor, node);
    }

    return node;
  }
}

function parseNodeFromRange(buffer, start, end) {
  try {
    return JSON.parse(buffer.toString("utf8", start, end));
  } catch {
    return null;
  }
}

function getOrCreateIndustryId(value, industryToId, idToIndustry) {
  if (!value) {
    return 0;
  }

  const normalized = String(value).toLowerCase();

  if (industryToId.has(normalized)) {
    return industryToId.get(normalized);
  }

  const id = idToIndustry.length;
  industryToId.set(normalized, id);
  idToIndustry.push(value);

  return id;
}

function statusToId(value) {
  if (!value) return STATUS_UNKNOWN;

  const normalized = String(value).toLowerCase();

  if (normalized === "active") return STATUS_ACTIVE;
  if (normalized === "inactive") return STATUS_INACTIVE;
  if (normalized === "pending") return STATUS_PENDING;

  return STATUS_UNKNOWN;
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

function countObjectValues(object) {
  return Object.values(object).reduce((total, value) => total + value, 0);
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

module.exports = RelayOffsetCompactDB;