# RelayDB Columnar Lane Model

**Author:** Kris Sherbondy  
**Date:** 2026-05-22  
**Purpose:** Define the RelayDB columnar lane, shared-index, predicate-bitset, and hydration model.

---

## 1. Why This Model Exists

The current RelayDB search prototypes proved that object-heavy runtime structures are not the long-term direction.

The compact typed-array reader performed better than the object-row offset reader because it moved query-critical data away from JavaScript objects and into compact lanes.

The next architectural step is to make that idea generic.

RelayDB should not be hardcoded around one dataset such as people and companies. It should organize any static relational dataset into aligned, typed, contiguous blocks of data.

This document defines that model.

---

## 2. Core Idea

RelayDB should store runtime-searchable data by **kind**, not by whole record.

Instead of row-style storage:

```text
person 0:
  id
  name
  age
  status
  company

person 1:
  id
  name
  age
  status
  company
```

RelayDB should use lane-style storage:

```text
person.id lane:
  id0, id1, id2, id3...

person.name lane:
  name0, name1, name2, name3...

person.age lane:
  age0, age1, age2, age3...

person.status lane:
  status0, status1, status2, status3...

person.company lane:
  company0, company1, company2, company3...
```

Each lane is a contiguous block of same-kind data.

This allows a query to touch only the data blocks it actually needs.

---

## 3. Shared Record Index

The foundation of the model is the **shared record index**.

For a topic such as `person`, every lane uses the same index.

```text
person index 0 = first person
person index 1 = second person
person index 2 = third person
```

Then every person lane aligns to that same index:

```text
person.ids[0]
person.names[0]
person.ages[0]
person.statusIds[0]
person.companyIds[0]
```

All of those values belong to the same logical person.

This means RelayDB can store data by columns/lanes and still reconstruct full records when needed.

---

## 4. Contiguous Typed Lanes

A **lane** stores one field for all records in a topic.

Example:

```text
person.age lane:
index:  0   1   2   3   4
age:   37  55  22  41  39
```

If the query asks:

```text
people between age 30 and 40
```

the reader only needs to scan the `person.age` lane.

It does not need to touch names, IDs, locations, company links, payloads, or full JSON objects.

This is the key performance idea:

> Queries should read only the contiguous blocks required to answer the question.

---

## 5. Lane Examples

### Numeric lane

```text
person.age:
Uint8Array [37, 55, 22, 41, 39]
```

### Enum lane

```text
person.status:
Uint8Array [1, 2, 1, 1, 1]
```

Where:

```text
1 = active
2 = inactive
```

### Relationship lane

```text
person.company:
Uint32Array [0, 1, 0, 2, 0]
```

Where:

```text
0 = company index 0
1 = company index 1
2 = company index 2
```

### String-offset lane

```text
person.firstName:
Uint32Array [100, 118, 142, 160, 181]
```

Each value points into a string table.

---

## 6. Predicate Bitsets

A **predicate bitset** is a compact yes/no map over a topic's record index.

For example:

```text
person.status.active:
1011101101
```

Each bit corresponds to one person index.

```text
bit 0 -> person 0
bit 1 -> person 1
bit 2 -> person 2
...
```

A `1` means the person satisfies that predicate.

A `0` means the person does not.

Example:

```text
activePeople:
1011101101

under40People:
1010110101

agriculturePeople:
1010100101
```

The query:

```text
active agriculture people under 40
```

becomes:

```text
activePeople AND under40People AND agriculturePeople
```

Result:

```text
combined matches:
1010100101
```

The `1` bits identify matching record indexes.

---

## 7. Why Bitsets Are Fast

Bitsets allow the reader to compare many records at once.

If RelayDB uses `Uint32Array` bitsets, each 32-bit word represents 32 records.

For 100,000 people:

```text
100,000 people / 32 = 3,125 words
```

A bitwise AND can test 32 people at a time:

```js
matches[wordIndex] =
  active[wordIndex] &
  under40[wordIndex] &
  agriculture[wordIndex];
```

This avoids scanning 100,000 full objects.

---

## 8. Search vs Hydration

RelayDB should separate search from hydration.

### Search

Search should use only the lanes and bitsets needed to find matching indexes.

Example:

```text
Need age?
  read person.age lane

Need status?
  read person.status lane or status predicate bitset

Need company industry?
  read person.company lane and company.industry lane, or use a derived bitset
```

Search returns record indexes:

```text
[0, 2, 4, 7, 9]
```

### Hydration

Hydration reconstructs full records only after matches are found.

For person index `0`:

```text
person.ids[0]
person.firstNames[0]
person.lastNames[0]
person.ages[0]
person.statusIds[0]
person.companyIds[0]
```

Then for the relationship:

```text
company index = person.companyIds[0]

company.ids[company index]
company.names[company index]
company.industryIds[company index]
```

This gives the complete result object.

---

## 9. The Gather Operation

Hydration is a **gather** operation.

Given a matched index:

```text
person index 0
```

RelayDB gathers from aligned lanes:

```text
id          = person.ids[0]
firstName   = person.firstNames[0]
lastName    = person.lastNames[0]
age         = person.ages[0]
status      = person.statusIds[0]
companyId   = person.companyIds[0]
```

Then it gathers related company data:

```text
company.name      = company.names[companyId]
company.industry  = company.industryIds[companyId]
```

The full object is created only at the edge of the system.

---

## 10. Manifest-Guided Layout

To make this generic, a RelayDB file should include a manifest/header that describes its topics and lanes.

Example:

```json
{
  "format": "relaydb",
  "version": "0.1.0",
  "topics": {
    "person": {
      "count": 100000,
      "lanes": {
        "age": {
          "kind": "number",
          "type": "uint8",
          "searchable": true
        },
        "status": {
          "kind": "enum",
          "type": "uint8",
          "searchable": true
        },
        "company": {
          "kind": "relationship",
          "target": "company",
          "type": "uint32",
          "searchable": true
        }
      },
      "bitsets": {
        "status.active": {
          "kind": "predicate-bitset",
          "wordType": "uint32",
          "lengthBits": 100000
        },
        "age.under40": {
          "kind": "predicate-bitset",
          "wordType": "uint32",
          "lengthBits": 100000
        }
      }
    },
    "company": {
      "count": 10000,
      "lanes": {
        "industry": {
          "kind": "enum",
          "type": "uint16",
          "searchable": true
        }
      }
    }
  }
}
```

The reader does not need hardcoded knowledge of `person` or `company`.

It only needs to understand:

```text
topic
record count
lane name
lane type
lane offset
lane length
relationship target
enum dictionary
bitset name
bitset length
```

---

## 11. Generic Reader Contract

A generic RelayDB reader should be able to answer these questions:

```text
What topics exist?
How many records does each topic contain?
What lanes exist for each topic?
What type is each lane?
What relationships exist?
What bitsets exist?
Where is each lane stored?
How do I hydrate record index X?
```

The reader should expose APIs such as:

```js
db.getLane("person", "age");
db.getLane("person", "status");
db.getRelationshipLane("person", "company");
db.getBitset("person", "status.active");
db.hydrate("person", 0);
```

---

## 12. Query Model

The planner converts a query into lane and bitset operations.

Example query:

```text
active agriculture people under 40
```

Possible plan:

```text
topic: person

predicates:
  person.status.active
  person.age.under40
  person.company.industry.Agriculture

execution:
  bitset AND:
    person.status.active
    person.age.under40
    person.company.industry.Agriculture

hydrate:
  matched person indexes
```

The important design rule:

> Search should operate on lanes, IDs, and bitsets. Hydration should happen only after matching.

---

## 13. Relationship-Derived Bitsets

Some bitsets may be derived from relationships.

Example:

```text
company.industry.Agriculture
```

This identifies company indexes.

But a people query needs:

```text
person.company.industry.Agriculture
```

That means:

```text
For each person:
  look up person.companyId
  check whether that company is Agriculture
  set person bit if true
```

The result is a person-level bitset:

```text
person.company.industry.Agriculture:
1010100101
```

This can be cached as a runtime accelerator or stored as a compiled bitset if the compiler determines it is valuable.

---

## 14. Runtime vs File-Stored Bitsets

Not every possible predicate bitset should be stored in the file.

RelayDB can use three levels:

### Required lanes

These are needed to reconstruct and query records.

```text
person.age
person.status
person.company
company.industry
```

### Common compiled bitsets

These may be included in the file if useful.

```text
person.status.active
company.industry.Agriculture
```

### Lazy runtime bitsets

These are built on demand when queries need them.

```text
person.age.30_to_40
person.company.industry.Agriculture
```

This avoids bloating the file too early while still allowing hot queries to become fast.

---

## 15. Why This Solves the Overfitting Problem

The current compact reader was manually tuned for:

```text
person.age
person.status
person.company
company.industry
```

The columnar lane model makes the pattern generic.

The compiler/profiler discovers fields and creates a manifest.

The reader uses the manifest to build lanes and bitsets.

The query planner uses the manifest to resolve query terms to lanes.

The same model can support:

```text
parts.width
parts.category
lessons.difficulty
assets.spriteX
gameItems.rarity
documents.author
```

RelayDB should be schema-guided, not schema-hardcoded.

---

## 16. Benefits

This model gives RelayDB:

```text
lower JavaScript object pressure
contiguous memory access
field-specific scanning
fast boolean filtering through bitsets
lazy record hydration
generic dataset support through manifests
a clearer path to Rust/WASM
```

---

## 17. Current Mock

The first mock implementation lives at:

```text
scripts/relay-columnar/mock-lane-bitset-model.js
```

It demonstrates:

```text
aligned person lanes
aligned company lanes
active/under40/agriculture predicate bitsets
bitwise AND query execution
hydration by gathering matching indexes
```

Example output:

```text
activePeople:        1011101101
under40People:       1010110101
agriculturePeople:   1010100101
combined matches:    1010100101
```

Matched person indexes:

```text
[0, 2, 4, 7, 9]
```

---

## 18. Next Implementation Step

The next script should scale this model to the generated benchmark dataset:

```text
scripts/relay-columnar/benchmark-columnar-bitset-people-companies.js
```

It should:

```text
read the 100k / 10k generated JSONL dataset
build person and company lanes
build predicate bitsets
execute active AND under40 AND agriculture query
hydrate matching records
measure load time
measure memory
measure query time
compare against compact offset reader
```

---

## 19. Conclusion

The RelayDB columnar lane model is the bridge between the current hardcoded compact reader and a generic high-performance RelayDB architecture.

The core model is:

```text
shared record index
  +
contiguous typed lanes
  +
predicate bitsets
  +
bitwise query execution
  +
lazy hydration/gather
```

This model preserves the speed advantages discovered in the compact reader while creating a path toward dataset-agnostic optimization.
