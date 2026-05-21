/**
 * Author: Kris Sherbondy
 * Date: 2026-05-21
 * Purpose:
 *   Build a generic 4-tag normalized graph, then project it into the same
 *   shared runtime object shapes used by the raw normalized v2 lane.
 *
 *   Generic 4-tag contract:
 *     #  identity / anchor
 *     ^  topic / type
 *     @  relationship
 *     ~  metadata
 */

const {
  makeRuntimeCompany,
  makeRuntimePerson,
  makeRuntimeGraph,
} = require("./runtime-shape-factory");

function buildFourTagGenericGraphV2(nodes) {
  const nodeIdByAnchor = new Map();
  const anchorByNodeId = [];
  const nodesById = [];
  const nodeIdsByTopic = new Map();

  for (const node of nodes) {
    const anchor = node["#"];
    const topic = node["^"];

    if (!anchor || !topic) continue;

    const nodeId = nodesById.length;

    nodeIdByAnchor.set(anchor, nodeId);
    anchorByNodeId.push(anchor);

    const runtimeNode = {
      id: nodeId,
      anchor,
      topic,
      raw: node,
      meta: {},
      refs: {},
      refArrays: {},
    };

    for (const [key, value] of Object.entries(node)) {
      if (key.startsWith("~")) {
        runtimeNode.meta[key.slice(1)] = value;
      } else if (key.startsWith("@")) {
        const refName = key.slice(1);

        if (Array.isArray(value)) {
          runtimeNode.refArrays[refName] = value;
        } else {
          runtimeNode.refs[refName] = value;
        }
      }
    }

    nodesById.push(runtimeNode);

    if (!nodeIdsByTopic.has(topic)) {
      nodeIdsByTopic.set(topic, []);
    }

    nodeIdsByTopic.get(topic).push(nodeId);
  }

  return {
    nodesById,
    nodeIdByAnchor,
    anchorByNodeId,
    nodeIdsByTopic,
  };
}

function buildPeopleCompaniesViewFromFourTagGraphV2(genericGraph) {
  const industryIdByAnchor = new Map();
  const householdIdByAnchor = new Map();
  const interestIdByAnchor = new Map();
  const companyIdByNodeId = new Map();

  const companies = [];
  const people = [];

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

  const companyNodeIds = genericGraph.nodeIdsByTopic.get("company") ?? [];
  const personNodeIds = genericGraph.nodeIdsByTopic.get("person") ?? [];

  for (const companyNodeId of companyNodeIds) {
    const node = genericGraph.nodesById[companyNodeId];
    const raw = node.raw;

    const industryAnchor = raw["@industry"] ?? null;
    const industryId = getOrCreateId(industryIdByAnchor, industryAnchor);

    const headquartersAnchor = raw["@headquarters"] ?? null;
    const locationNodeId = headquartersAnchor
      ? genericGraph.nodeIdByAnchor.get(headquartersAnchor)
      : undefined;

    const locationNode =
      locationNodeId !== undefined
        ? genericGraph.nodesById[locationNodeId]
        : null;

    const companyId = companies.length;
    companyIdByNodeId.set(companyNodeId, companyId);

    const runtimeCompany = makeRuntimeCompany({
      id: companyId,
      rawId: null,
      nodeId: companyNodeId,
      anchor: node.anchor,
      name: raw.name ?? raw["~name"] ?? null,
      industryId,
      industry: raw["~industry"] ?? null,
      industryAnchor,
      founded: raw["~founded"] ?? null,
      state: locationNode?.meta?.state ?? null,
      city: locationNode?.meta?.city ?? null,
      country: locationNode?.meta?.country ?? null,
    });

    companies.push(runtimeCompany);

    if (!companiesByIndustryId.has(industryId)) {
      companiesByIndustryId.set(industryId, []);
    }

    companiesByIndustryId.get(industryId).push(companyId);
  }

  for (const personNodeId of personNodeIds) {
    const node = genericGraph.nodesById[personNodeId];
    const raw = node.raw;

    const companyAnchor = raw["@company"] ?? null;
    const companyNodeId = companyAnchor
      ? genericGraph.nodeIdByAnchor.get(companyAnchor)
      : undefined;

    const companyId =
      companyNodeId !== undefined ? companyIdByNodeId.get(companyNodeId) : -1;

    if (companyId === undefined || companyId === -1) {
      missingCompanyLinks.push({
        personAnchor: node.anchor,
        companyAnchor,
        reason: "company_anchor_not_found",
      });
    }

    const householdAnchor = raw["@household"] ?? "unknown";
    const householdId = getOrCreateId(householdIdByAnchor, householdAnchor);

    const locationAnchor = raw["@location"] ?? null;
    const locationNodeId = locationAnchor
      ? genericGraph.nodeIdByAnchor.get(locationAnchor)
      : undefined;

    const locationNode =
      locationNodeId !== undefined
        ? genericGraph.nodesById[locationNodeId]
        : null;

    const interestIds = [];

    for (const interestAnchor of raw["@interests"] ?? []) {
      const interestId = getOrCreateId(interestIdByAnchor, interestAnchor);
      interestIds.push(interestId);

      if (!peopleByInterestId.has(interestId)) {
        peopleByInterestId.set(interestId, []);
      }
    }

    const runtimePerson = makeRuntimePerson({
      id: people.length,
      rawId: null,
      nodeId: personNodeId,
      anchor: node.anchor,
      fullName: raw.name?.full ?? raw["~name"] ?? null,
      companyId: companyId ?? -1,
      householdId,
      interestIds,
      status: raw["~status"] ?? null,
      age: raw["~age"] ?? null,
      salary: raw["~salary"] ?? 0,
      state: locationNode?.meta?.state ?? null,
      city: locationNode?.meta?.city ?? null,
      country: locationNode?.meta?.country ?? null,
    });

    people.push(runtimePerson);

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
    companies,
    people,
    peopleByCompanyId,
    peopleByHouseholdId,
    peopleByInterestId,
    companiesByIndustryId,
    missingCompanyLinks,
    sourceModel: "four-tag-generic-normalized-v2",
  });
}

module.exports = {
  buildFourTagGenericGraphV2,
  buildPeopleCompaniesViewFromFourTagGraphV2,
};