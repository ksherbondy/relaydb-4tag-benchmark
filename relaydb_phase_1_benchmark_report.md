# From Static JSONL to Optimized Runtime Graphs

## Phase I Benchmark Report for RelayDB’s 4-Tag Contract

**Status:** Draft 1  
**Scope:** Prototype benchmark findings  
**Focus:** Static relational JSON/JSONL, 4-tag transformation, runtime normalization, V8 optimization behavior, and developer-runtime burden

---

## Executive Summary

This report documents a Phase I benchmark investigation into whether static, stale, or rarely-changing relational data can be moved out of runtime database/API paths and into local, optimized file-based artifacts for fast client-side lookup.

The goal of RelayDB is **not** to replace databases. Databases remain the correct tool for writes, transactions, authoritative storage, permissions, concurrency, and fresh data. RelayDB’s intended lane is narrower: static relational data that is often stored in a database or served repeatedly through APIs despite changing rarely or never.

The investigation tested raw JSONL, 4-tag JSONL, merged files, split files, relationship-heavy query workloads, line-of-code burden, and V8 optimization/deoptimization behavior. The strongest result came after both raw and tagged data were normalized into the same stable runtime object shapes. Under that condition, the tagged normalized lane slightly outperformed the raw normalized lane while preserving result equivalence.

The key finding is:

> A 4-tag source contract can provide reusable structure for static relational data, while a runtime normalization layer can reshape that structure into optimizer-friendly objects for fast local querying.

The practical product implication is:

> Developers should not need to hand-optimize static relational JSON/JSONL every time a data shape changes. A standardized relationship contract can make optimization reusable, repeatable, and tool-driven.

---

## 1. Project Goal

RelayDB is exploring a build-time read-layer for static relational data.

The intended workflow is:

```text
Raw JSON / JSONL / database export
  ↓
Profile
  ↓
Transform into 4-tag JSONL
  ↓
Validate relationships
  ↓
Normalize / compile
  ↓
Ship as local static artifact
  ↓
Query locally in SPA/PWA/client runtime
```

The goal is to reduce unnecessary runtime work for data that does not need to remain in a live database request path.

Examples of suitable RelayDB-style data include:

```text
documentation graphs
static content catalogs
curriculum/module structures
configuration/reference data
glossaries
small knowledge bases
game data
lookup tables
static product/category metadata
offline-first app bundles
```

RelayDB is not intended for:

```text
write-heavy data
private user records
permission-sensitive server-authoritative data
rapidly mutating data
transactional workflows
large dynamic datasets requiring query planning
```

---

## 2. The 4-Tag Contract

The tested 4-tag model uses four structural markers inside JSONL records:

```text
#  identity / anchor
^  topic / type
@  relationship
~  metadata
```

Example shape:

```json
{
  "#": "person:example",
  "^": "person",
  "@company": "company:example",
  "@household": "household:example",
  "@interests": ["interest:security", "interest:design"],
  "~status": "active",
  "~age": 37,
  "name": {
    "full": "Example Person"
  }
}
```

The 4-tag format is not treated as the final optimized runtime format. Instead, it is treated as a **source contract** that makes identity, topics, relationships, and metadata explicit.

The runtime layer is then allowed to reshape this source contract into faster internal structures.

---

## 3. Datasets Used

The primary multi-file dataset used in the Phase I benchmark was a small `people + companies` dataset.

The raw source files contained:

```text
companies.jsonl: 8 company records
people.jsonl:    30 person records
```

The transformation generated:

```text
Tagged companies: 29 nodes
Tagged people:    72 nodes
Raw merged:        38 records
Tagged merged:     100 nodes
Person-company links: 30 linked
Missing links:        0
```

This dataset is intentionally small. It is useful for correctness, repeatability, relationship-shape validation, and runtime-design iteration. It is not yet sufficient for broad scalability claims.

---

## 4. Benchmark Lanes

The testing evolved through several lanes.

### 4.1 Direct Runtime Lanes

```text
Raw split JSONL
Raw merged JSONL
Tagged split JSONL
Tagged merged JSONL
```

These lanes measured whether raw or tagged JSONL was faster when queried directly after loading and graph-building.

### 4.2 Normalized Runtime Lanes

```text
Raw normalized runtime graph
Tagged normalized runtime graph
```

These lanes measured whether both raw and tagged data could be converted into optimized runtime structures before query execution.

### 4.3 Normalized v2 Runtime Lanes

```text
Raw normalized runtime graph v2
Tagged normalized runtime graph v2
```

The v2 benchmark introduced shared runtime object factories so both raw and tagged normalized lanes emitted the same property order and runtime object shapes.

This was intended to make V8 optimization fairer and more stable.

---

## 5. Torture Query Benchmark

A relationship-heavy torture query benchmark was created to test more than simple lookup speed.

Each query suite contained 8 graph-shaped queries:

```text
1. People whose home state differs from company HQ state
2. Households with people working at multiple companies
3. People sharing interests with coworkers
4. Companies with employees across multiple home states
5. Active people under 40 at companies founded before 2000
6. High earners in industries with companies across multiple states
7. Household diversity summaries
8. Context packets per person
```

The benchmark ran 10,000 query suites per run over 100 iterations.

### Torture Query Results

```text
Raw split total avg:         109.646717 ms
Raw merged total avg:        108.562714 ms
Tagged split total avg:      111.871897 ms
Tagged merged total avg:     112.755662 ms

Raw split query avg:         109.290605 ms
Raw merged query avg:        108.308420 ms
Tagged split query avg:      111.500623 ms
Tagged merged query avg:     112.469507 ms
```

The tagged lanes were slightly slower, but they remained close to raw on relationship-heavy workloads.

### Result Equivalence

All lanes produced matching query results:

```text
Raw Split vs Raw Merged:     true
Raw Split vs Tagged Split:   true
Raw Split vs Tagged Merged:  true
```

The matching query result counts were:

```text
peopleHomeStateDiffersFromCompanyState:          28
householdsWithMultipleCompanies:                 8
peopleSharingInterestsWithCoworkers:             21
companiesWithEmployeesAcrossMultipleHomeStates:  8
activeUnder40AtOldCompanies:                     4
highEarnersInIndustriesAcrossMultipleStates:     12
householdDiversitySummaries:                     12
contextPackets:                                  30
```

The important conclusion was not that tagged JSONL was faster. It was that tagged JSONL could answer the same graph-shaped questions correctly while using a standardized relationship model.

---

## 6. Runtime Burden and LOC Analysis

A line-of-code analysis was performed on the torture query benchmark.

The script contained:

```text
Physical lines: 1286
Logical LOC:    1014
Function count: 45
```

Runtime logic breakdown:

```text
Raw runtime logic:     336 LOC / 15 functions
Tagged runtime logic:  316 LOC / 13 functions
Shared harness:        166 LOC / 15 functions
Reporting:             119 LOC / 2 functions
```

This is not a huge LOC reduction by itself. However, the type of logic matters.

Raw logic was schema-specific. It had to know paths such as:

```text
person.person.job.company_name
company.name
company.headquarters.state
person.household_id
person.person.interests
```

Tagged logic operated through the 4-tag contract:

```text
# identity
^ topic/type
@ relationships
~ metadata
```

The stronger finding is therefore:

> Raw optimization is possible, but it is usually schema-specific. Tagged optimization can be contract-driven and reusable.

---

## 7. V8 Optimization / Deoptimization Investigation

V8 tracing was used to inspect optimization and deoptimization behavior.

The earlier direct-style torture benchmark showed raw-side functions deoptimizing with `wrong map` bailouts. This indicated hidden-class or object-shape instability in the raw query paths.

Functions affected included:

```text
rawPeopleHomeStateDiffersFromCompanyState
rawHouseholdsWithMultipleCompanies
rawPeopleSharingInterestsWithCoworkers
rawCompaniesWithEmployeesAcrossMultipleHomeStates
rawActiveUnder40AtOldCompanies
rawHighEarnersInIndustriesAcrossMultipleStates
rawHouseholdDiversitySummary
rawContextPackets
getRawFullName
```

This suggested that raw was winning speed despite V8 seeing unstable object shapes in some paths.

The working hypothesis became:

> If both raw and tagged data are normalized into stable runtime object shapes, query performance may improve and deoptimization may decrease.

---

## 8. Normalized Runtime Graph v1

The first normalized benchmark introduced runtime graph normalization for both raw and tagged data.

Results:

```text
Raw normalized total avg:       77.325981 ms
Tagged normalized total avg:    78.086116 ms

Raw normalized query avg:       77.070706 ms
Tagged normalized query avg:    77.689751 ms

Raw normalized normalize avg:   0.023282 ms
Tagged normalized normalize avg:0.121425 ms

Result equivalence: true
```

This reduced query time substantially compared to the direct torture benchmark, but raw still slightly won overall.

A trace run also showed that tagged query time could edge raw query time, but total time still favored raw because tagged normalization was heavier.

---

## 9. Normalized Runtime Graph v2

The v2 benchmark introduced shared runtime object factories for both raw and tagged normalized lanes.

The purpose was to ensure both lanes emitted the same runtime object shapes and property order.

### Shared Runtime Shape Strategy

Both raw and tagged data were normalized into shared object structures such as:

```js
{
  id,
  rawId,
  nodeId,
  anchor,
  fullName,
  companyId,
  householdId,
  interestIds,
  status,
  age,
  salary,
  state,
  city,
  country
}
```

and:

```js
{
  id,
  rawId,
  nodeId,
  anchor,
  name,
  industryId,
  industry,
  industryAnchor,
  founded,
  state,
  city,
  country
}
```

### Normalized v2 Results

```text
Raw normalized total avg:       72.464385 ms
Tagged normalized total avg:    71.501597 ms

Raw normalized query avg:       72.211128 ms
Tagged normalized query avg:    71.141395 ms

Raw normalized normalize avg:   0.021990 ms
Tagged normalized normalize avg:0.090637 ms

Result equivalence: true
```

This was the strongest performance result in the Phase I investigation.

After both raw and tagged data were normalized into identical runtime shapes, the tagged normalized lane slightly outperformed raw normalized on both query time and total time.

### V8 v2 Result

The v2 V8 trace did not produce deoptimization matches from the `grep -i "deopt"` check. The log showed the hot functions being marked hot/stable and optimized through V8’s Maglev/TurboFan pipeline.

This supports the conclusion that stable runtime object shapes improved engine behavior.

---

## 10. Interpretation of the Win

This is a real engineering win, but it has specific boundaries.

It does **not** prove:

```text
RelayDB replaces databases.
RelayDB beats SQL databases.
RelayDB scales to large production datasets.
RelayDB is faster than all raw JSONL usage.
```

It does show:

```text
The 4-tag contract can preserve relationship correctness.
Tagged data can answer graph-shaped questions equivalent to raw data.
Runtime normalization substantially improves query performance.
Shared runtime object shapes can remove V8 deoptimization symptoms.
Tagged normalized data can compete with and slightly beat raw normalized data in this prototype.
```

The most important conclusion is architectural:

> The 4-tag format gives the system truth and structure. The runtime layer should be allowed to reshape that truth for speed.

---

## 11. Why This Matters for Static Data

A large amount of web application data is treated dynamically even when it is effectively static.

When static or stale relational data is repeatedly fetched from APIs or databases, systems pay unnecessary costs:

```text
network latency
API routing overhead
server compute
database reads
serialization/deserialization
cloud function invocation
repeated relationship assembly
```

RelayDB’s intended value is to move this work out of runtime request paths.

For SPAs and PWAs, the model is especially attractive:

```text
ship static relational artifact once
cache it with the application
query locally
avoid repeated backend/API/database calls for stale data
```

This does not eliminate the backend. It removes unnecessary backend work for data that does not need to be live.

---

## 12. Product Implication

Most developers will not manually perform:

```text
schema profiling
relationship extraction
4-tag transformation
result equivalence testing
runtime shape normalization
integer ID mapping
V8 opt/deopt inspection
query benchmark reporting
```

The product opportunity is to make this automatic.

Potential future commands:

```bash
relay profile data/
relay transform data/
relay validate data/
relay normalize data/
relay compile data/
relay benchmark data/
relay audit build/app.relay
```

The intended developer experience could become:

```js
const db = await RelayDB.open("/data/app.relay");
const result = db.query(...);
```

The cultural goal is:

> Make optimized static relational data handling second nature for ordinary developers.

---

## 13. Limitations

This Phase I investigation has important limitations.

```text
The tested multi-file dataset is tiny.
No large-scale memory analysis has been performed yet.
No compiled .relay artifact was included in the final benchmark lanes.
The benchmark uses JavaScript only.
The query suite is synthetic, though relationship-heavy.
No real SPA/PWA deployment metrics have been collected yet.
No CDN/cache/API-cost comparison has been measured yet.
```

These limitations are not failures. They define the next test phase.

---

## 14. Next Phase

The next phase should test the same model against larger and more realistic static datasets.

Recommended next tests:

```text
1. Larger multi-file JSONL datasets
2. Multiple relationship types across separate files
3. Memory usage measurements
4. Payload size and compression tests
5. Browser-side benchmark inside an actual SPA/PWA
6. Service worker caching behavior
7. API-call reduction comparison
8. Compiled .relay artifact benchmark
9. Raw normalized vs tagged normalized vs compiled Relay
10. LOC burden when adding a brand-new dataset
```

The most important product test should be inside Althing Hall or a similar SPA/PWA:

```text
Baseline version:
  fetch JSON / API / multiple files
  assemble relationships at runtime

RelayDB version:
  load static artifact
  query locally
  measure speed, LOC, API calls removed, and cache behavior
```

---

## 15. Final Phase I Conclusion

The Phase I work does not prove RelayDB is a database replacement. It does not attempt to be one.

Instead, it supports a narrower and more defensible claim:

> For static relational data, a standardized 4-tag contract can preserve relationship truth, enable reusable optimization, and be normalized into runtime-friendly structures that perform competitively with schema-specific raw JSONL optimization.

The most meaningful result is the normalized v2 benchmark:

```text
Raw normalized total avg:       72.464385 ms
Tagged normalized total avg:    71.501597 ms

Raw normalized query avg:       72.211128 ms
Tagged normalized query avg:    71.141395 ms

Result equivalence: true
```

This suggests that the broader RelayDB architecture is worth continuing:

```text
4-tag JSONL = source truth
normalized runtime graph = fast local execution
.relay artifact = future compiled static read layer
```

The work should continue into larger datasets, real SPA/PWA integration, and compiled Relay artifact testing.

---

## Appendix A: Summary Table

| Test Stage | Result | Interpretation |
|---|---:|---|
| Direct simple lookup | Raw won hard | Tagged source format is not ideal as direct hot-loop runtime format |
| Torture graph queries | Raw won slightly | Tagged remained close and preserved correctness |
| LOC analysis | Tagged slightly lower LOC | More important: tagged logic was contract-driven, raw was schema-specific |
| V8 direct trace | Raw showed wrong-map deopts | Raw was faster despite optimizer instability |
| Normalized v1 | Raw won slightly | Normalization greatly improved both lanes |
| Normalized v2 | Tagged won slightly | Shared stable runtime shapes improved tagged performance and removed deopt matches |

---

## Appendix B: Core Design Principle

> Do not make 4-tag JSONL carry the full burden of runtime speed. Let it carry truth and structure. Then let the runtime reader or compiler reshape that truth into fast execution forms.

