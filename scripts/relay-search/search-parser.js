/**
 * Author: Kris Sherbondy
 * Date: 2026-05-21
 * Purpose:
 *   Parse a plain-language RelayDB search question into simple tokens
 *   and search hints.
 */

function parseSearchQuestion(question) {
  const raw = String(question || "").trim();
  const normalized = raw.toLowerCase();

  const tokens = normalized
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  const hints = {
    topic: null,
    status: null,
    age: null,
    possibleValues: [],
  };

  if (tokens.includes("people") || tokens.includes("person")) {
    hints.topic = "person";
  }

  if (tokens.includes("companies") || tokens.includes("company")) {
    hints.topic = "company";
  }

  if (tokens.includes("active")) {
    hints.status = "active";
  }

  if (tokens.includes("inactive")) {
    hints.status = "inactive";
  }

  const underMatch = normalized.match(/\bunder\s+(\d+)\b/);
  if (underMatch) {
    hints.age = {
      lt: Number(underMatch[1]),
    };
  }

  const overMatch = normalized.match(/\bover\s+(\d+)\b/);
  if (overMatch) {
    hints.age = {
      gt: Number(overMatch[1]),
    };
  }

  const ignored = new Set([
    "find",
    "show",
    "give",
    "me",
    "the",
    "a",
    "an",
    "and",
    "or",
    "people",
    "person",
    "persons",
    "company",
    "companies",
    "active",
    "inactive",
    "under",
    "over",
    "at",
    "in",
    "with",
    "who",
    "that",
    "are",
    "is",
  ]);

  for (const token of tokens) {
    if (!ignored.has(token) && !/^\d+$/.test(token)) {
      hints.possibleValues.push(token);
    }
  }

  return {
    raw,
    normalized,
    tokens,
    hints,
  };
}

module.exports = {
  parseSearchQuestion,
};