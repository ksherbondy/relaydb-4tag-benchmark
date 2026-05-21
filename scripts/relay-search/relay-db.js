/**
 * Author: Kris Sherbondy
 * Date: 2026-05-21
 * Purpose:
 *   RelayDB JS search prototype.
 *
 *   Public API:
 *     RelayDB.open(filePath)
 *     db.search(question, options?)
 *     db.debugSearch(question, options?)
 */

const fs = require("fs");
const readline = require("readline");
const { performance } = require("perf_hooks");

const {
  buildFourTagGenericGraphV2,
  buildPeopleCompaniesViewFromFourTagGraphV2,
} = require("../four-tag-normalized-runtime-graph-v2");

const { parseSearchQuestion } = require("./search-parser");
const { buildSearchPlan } = require("./search-planner");
const { executeSearchPlan } = require("./search-executor");
const { hydrateSearchResult } = require("./result-hydrator");
const { buildDebugSearchPacket } = require("./debug-search");

class RelayDB {
  constructor(input) {
    this.filePath = input.filePath;
    this.nodes = input.nodes;
    this.genericGraph = input.genericGraph;
    this.graph = input.graph;
    this.searchIndex = input.searchIndex;
  }

  static async open(filePath) {
    const nodes = await readJsonl(filePath);
    const genericGraph = buildFourTagGenericGraphV2(nodes);
    const graph = buildPeopleCompaniesViewFromFourTagGraphV2(genericGraph);
    const searchIndex = buildSearchIndex(genericGraph, graph);

    return new RelayDB({
      filePath,
      nodes,
      genericGraph,
      graph,
      searchIndex,
    });
  }

  search(question, options = {}) {
    const started = performance.now();

    const limit = options.limit ?? 1;

    const parsed = parseSearchQuestion(question);
    const plan = buildSearchPlan(parsed, this.searchIndex);

    const execution = executeSearchPlan(plan, this.graph, this.searchIndex, {
      limit,
    });

    const hydratedResults = execution.matches.map((match) =>
      hydrateSearchResult(match, this.graph, this.searchIndex, {
        explain: Boolean(options.explain),
      }),
    );

    const ended = performance.now();

    if (limit === 1) {
      return hydratedResults[0] || {
        answer: null,
        timingMs: ended - started,
      };
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
    const execution = executeSearchPlan(plan, this.graph, this.searchIndex, {
      limit: options.limit ?? 1,
    });
    timings.executeMs = performance.now() - executeStart;

    const hydrateStart = performance.now();
    const hydratedResults = execution.matches.map((match) =>
      hydrateSearchResult(match, this.graph, this.searchIndex, {
        explain: true,
      }),
    );
    timings.hydrateMs = performance.now() - hydrateStart;

    timings.totalMs =
      timings.parseMs + timings.planMs + timings.executeMs + timings.hydrateMs;

    return buildDebugSearchPacket({
      question,
      parsed,
      plan,
      execution,
      hydratedResults,
      timings,
    });
  }
}

async function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing file: ${filePath}`);
  }

  const records = [];

  const stream = fs.createReadStream(filePath, {
    encoding: "utf8",
  });

  const rl = readline.createInterface({
    input: stream,
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    const trimmed = line.trim();

    if (!trimmed) continue;

    records.push(JSON.parse(trimmed));
  }

  return records;
}

function buildSearchIndex(genericGraph, graph) {
  const knownIndustries = [];
  const industryNameByAnchor = new Map();
  const companyIndustryNameById = new Map();

  const industryNodeIds = genericGraph.nodeIdsByTopic.get("industry") || [];

  for (const nodeId of industryNodeIds) {
    const node = genericGraph.nodesById[nodeId];
    const raw = node.raw;

    const name =
      raw["~name"] ||
      raw.name ||
      node.anchor.split(":").slice(1).join(":") ||
      node.anchor;

    knownIndustries.push(name);
    industryNameByAnchor.set(node.anchor, name);
  }

  const companyNodeIds = genericGraph.nodeIdsByTopic.get("company") || [];

  for (const companyNodeId of companyNodeIds) {
    const companyNode = genericGraph.nodesById[companyNodeId];
    const companyAnchor = companyNode.anchor;
    const company = graph.companies.find(
      (candidate) => candidate.anchor === companyAnchor,
    );

    if (!company) continue;

    const industryAnchor = companyNode.raw["@industry"];
    const industryName = industryNameByAnchor.get(industryAnchor);

    if (industryName) {
      companyIndustryNameById.set(company.id, industryName);
    }
  }

  return {
    knownIndustries,
    industryNameByAnchor,
    companyIndustryNameById,
  };
}

module.exports = RelayDB;