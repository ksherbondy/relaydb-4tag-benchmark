/**
 * Author: Kris Sherbondy
 * Date: 2026-05-21
 * Purpose:
 *   Demo the first RelayDB search/debugSearch prototype.
 *
 * Usage:
 *   node scripts/relay-search/demo-search.js
 */

const path = require("path");
const RelayDB = require("./relay-db");

async function main() {
  const filePath = path.join(
    process.cwd(),
    "datasets",
    "merged",
    "people-companies.4tag.merged.jsonl",
  );

  const db = await RelayDB.open(filePath);

  const question = "active agriculture people under 40";

  console.log("");
  console.log("Question:");
  console.log(question);

  console.log("");
  console.log("Default search:");
  console.log(db.search(question));

  console.log("");
  console.log("Explain search:");
  console.dir(
    db.search(question, {
      explain: true,
    }),
    {
      depth: null,
    },
  );

  console.log("");
  console.log("Debug search:");
  console.dir(db.debugSearch(question), {
    depth: null,
  });

  console.log("");
}

main().catch((error) => {
  console.error("RelayDB search demo failed.");
  console.error(error);
  process.exit(1);
});