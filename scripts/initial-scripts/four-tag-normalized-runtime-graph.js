/**
 * Author: Kris Sherbondy
 * Date: 2026-05-21
 * Purpose:
 *   Build a generic optimized runtime graph from any 4-tag node list.
 *
 *   This file should not know the original raw schema.
 *
 *   Generic 4-tag contract:
 *     #  identity / anchor
 *     ^  topic / type
 *     @  relationship
 *     ~  metadata
 *
 *   The normalized graph converts symbolic 4-tag structure into stable
 *   runtime objects, maps, and integer IDs for faster traversal.
 */

function buildFourTagNormalizedRuntimeGraph(nodes) {
  const nodeIdByAnchor = new Map();
  const anchorByNodeId = [];
  const nodesById = [];
  const nodeIdsByTopic = new Map();
  const forwardRefsByNodeId = new Map();
  const reverseRefsByNodeId = new Map();

  for (const node of nodes) {
    const anchor = node["#"];
    const topic = node["^"];

    if (!anchor || !topic) continue;

    const nodeId = nodesById.length;

    nodeIdByAnchor.set(anchor, nodeId);
    anchorByNodeId.push(anchor);

    const normalizedNode = {
      id: nodeId,
      anchor,
      topic,
      source: node["~source"] || null,
      raw: node,
      meta: {},
      refs: {},
      refArrays: {},
    };

    for (const [key, value] of Object.entries(node)) {
      if (key.startsWith("~")) {
        normalizedNode.meta[key.slice(1)] = value;
      }

      if (key.startsWith("@")) {
        const refName = key.slice(1);

        if (Array.isArray(value)) {
          normalizedNode.refArrays[refName] = value;
        } else {
          normalizedNode.refs[refName] = value;
        }
      }
    }

    nodesById.push(normalizedNode);

    if (!nodeIdsByTopic.has(topic)) {
      nodeIdsByTopic.set(topic, []);
    }

    nodeIdsByTopic.get(topic).push(nodeId);
  }

  for (const node of nodesById) {
    const forwardRefs = [];

    for (const [refName, anchor] of Object.entries(node.refs)) {
      const targetId = nodeIdByAnchor.get(anchor);

      if (targetId !== undefined) {
        forwardRefs.push({
          name: refName,
          targetId,
        });

        addReverseRef(reverseRefsByNodeId, targetId, node.id, refName);
      }
    }

    for (const [refName, anchors] of Object.entries(node.refArrays)) {
      for (const anchor of anchors) {
        const targetId = nodeIdByAnchor.get(anchor);

        if (targetId !== undefined) {
          forwardRefs.push({
            name: refName,
            targetId,
          });

          addReverseRef(reverseRefsByNodeId, targetId, node.id, refName);
        }
      }
    }

    forwardRefsByNodeId.set(node.id, forwardRefs);
  }

  return {
    nodesById,
    nodeIdByAnchor,
    anchorByNodeId,
    nodeIdsByTopic,
    forwardRefsByNodeId,
    reverseRefsByNodeId,
  };
}

function addReverseRef(reverseRefsByNodeId, targetId, sourceId, refName) {
  if (!reverseRefsByNodeId.has(targetId)) {
    reverseRefsByNodeId.set(targetId, []);
  }

  reverseRefsByNodeId.get(targetId).push({
    sourceId,
    name: refName,
  });
}

function buildPeopleCompaniesViewFromFourTagGraph(graph) {
  const locationIdByAnchor = new Map();
  const companyIdByNodeId = new Map();
  const householdIdByAnchor = new Map();
  const interestIdByAnchor = new Map();
  const industryIdByAnchor = new Map();

  const companies = [];
  const people = [];

  const peopleByCompanyId = new Map();
  const peopleByHouseholdId = new Map();
  const peopleByInterestId = new Map();
  const companiesByIndustryId = new Map();

  const missingCompanyLinks = [];

  const locationNodeIds = graph.nodeIdsByTopic.get("location") || [];
  const companyNodeIds = graph.nodeIdsByTopic.get("company") || [];
  const personNodeIds = graph.nodeIdsByTopic.get("person") || [];

  for (const locationNodeId of locationNodeIds) {
    const locationNode = graph.nodesById[locationNodeId];
    locationIdByAnchor.set(locationNode.anchor, locationNodeId);
  }

  function getOrCreateId(map, key) {
    if (!map.has(key)) {
      map.set(key, map.size);
    }

    return map.get(key);
  }

  for (const companyNodeId of companyNodeIds) {
    const node = graph.nodesById[companyNodeId];
    const raw = node.raw;

    const industryAnchor = raw["@industry"] || "unknown";
    const industryId = getOrCreateId(industryIdByAnchor, industryAnchor);

    const headquartersAnchor = raw["@headquarters"] || null;
    const locationNodeId = headquartersAnchor
      ? graph.nodeIdByAnchor.get(headquartersAnchor)
      : undefined;

    const locationNode =
      locationNodeId !== undefined ? graph.nodesById[locationNodeId] : null;

    const companyId = companies.length;

    companyIdByNodeId.set(companyNodeId, companyId);

    const normalizedCompany = {
      id: companyId,
      nodeId: companyNodeId,
      anchor: node.anchor,
      name: raw.name || raw["~name"] || null,
      industryId,
      industryAnchor,
      founded: raw["~founded"] ?? null,
      state: locationNode?.meta?.state || null,
      city: locationNode?.meta?.city || null,
      country: locationNode?.meta?.country || null,
    };

    companies.push(normalizedCompany);

    if (!companiesByIndustryId.has(industryId)) {
      companiesByIndustryId.set(industryId, []);
    }

    companiesByIndustryId.get(industryId).push(companyId);
  }

  for (const personNodeId of personNodeIds) {
    const node = graph.nodesById[personNodeId];
    const raw = node.raw;

    const companyAnchor = raw["@company"] || null;
    const companyNodeId = companyAnchor
      ? graph.nodeIdByAnchor.get(companyAnchor)
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

    const householdAnchor = raw["@household"] || "unknown";
    const householdId = getOrCreateId(householdIdByAnchor, householdAnchor);

    const locationAnchor = raw["@location"] || null;
    const locationNodeId = locationAnchor
      ? graph.nodeIdByAnchor.get(locationAnchor)
      : undefined;

    const locationNode =
      locationNodeId !== undefined ? graph.nodesById[locationNodeId] : null;

    const interestIds = [];

    for (const interestAnchor of raw["@interests"] || []) {
      const interestId = getOrCreateId(interestIdByAnchor, interestAnchor);
      interestIds.push(interestId);

      if (!peopleByInterestId.has(interestId)) {
        peopleByInterestId.set(interestId, []);
      }
    }

    const normalizedPerson = {
      id: people.length,
      nodeId: personNodeId,
      anchor: node.anchor,
      fullName: raw.name?.full || raw["~name"] || null,
      companyId: companyId ?? -1,
      householdId,
      interestIds,
      status: raw["~status"] || null,
      age: raw["~age"] ?? null,
      salary: raw["~salary"] ?? 0,
      state: locationNode?.meta?.state || null,
      city: locationNode?.meta?.city || null,
      country: locationNode?.meta?.country || null,
    };

    people.push(normalizedPerson);

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
    companies,
    people,
    peopleByCompanyId,
    peopleByHouseholdId,
    peopleByInterestId,
    companiesByIndustryId,
    missingCompanyLinks,
    genericGraph: graph,
  };
}

module.exports = {
  buildFourTagNormalizedRuntimeGraph,
  buildPeopleCompaniesViewFromFourTagGraph,
};