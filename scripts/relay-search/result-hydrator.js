/**
 * Author: Kris Sherbondy
 * Date: 2026-05-21
 * Purpose:
 *   Hydrate RelayDB search matches into clean render-ready objects.
 */

function hydrateSearchResult(match, graph, searchIndex, options = {}) {
  if (!match) {
    return {
      answer: null,
    };
  }

  if (match.topic === "person") {
    return hydratePersonResult(match, graph, searchIndex, options);
  }

  return {
    answer: null,
  };
}

function hydratePersonResult(match, graph, searchIndex, options) {
  const person = graph.people[match.id];
  const company = graph.companies[person.companyId];

  const answer = person.fullName || person.anchor || `person:${person.id}`;

  if (!options.explain) {
    return {
      answer,
    };
  }

  return {
    answer,
    data: {
      person: {
        name: person.fullName,
        age: person.age,
        status: person.status,
        salary: person.salary,
        location: {
          city: person.city,
          state: person.state,
          country: person.country,
        },
      },
      company: company
        ? {
            name: company.name,
            industry:
              searchIndex.companyIndustryNameById.get(company.id) ||
              company.industry ||
              null,
            founded: company.founded,
            headquarters: {
              city: company.city,
              state: company.state,
              country: company.country,
            },
          }
        : null,
    },
  };
}

module.exports = {
  hydrateSearchResult,
};