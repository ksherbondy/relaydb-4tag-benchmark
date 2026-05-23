# RelayDB Milestone: First Manifest-Driven Generic Columnar Executor

**Author:** Kris Sherbondy  
**Date:** 2026-05-22  
**Branch:** `relay-bitset`  
**Status:** Working prototype milestone

---

## 1. Milestone Summary

RelayDB has now moved from a hardcoded performance experiment into a manifest-driven columnar query prototype.

The current architecture path is:

```text
4-tag JSONL dataset
  ↓
columnar manifest profiler
  ↓
LaneRegistry
  ↓
query planner
  ↓
generic columnar runtime
  ↓
predicate bitsets
  ↓
bitset-first execution
  ↓
lazy hydration
```

This is a major milestone because the same query that was originally hand-built in the hardcoded columnar benchmark is now planned and executed through a generic manifest/registry path.

---

## 2. Why This Matters

Before this milestone, RelayDB had a fast but specialized prototype.

The hardcoded columnar bitset v2 benchmark proved that a static relational dataset could be searched very quickly using:

```text
typed lanes
predicate bitsets
byte-offset payload hydration
```

However, the code still knew too much about the dataset:

```text
person ages
person status IDs
person company indexes
company industry IDs
```

The generic executor prototype changes that.

Now the system can read a manifest, discover fields, build a query plan, create only the required lanes/bitsets, and execute the query using generic field IDs such as:

```text
person.attribute:status
person.attribute:age
person.relationship:company
company.attribute:industry
```

This is the first real step toward RelayDB behaving like a reusable static-read engine rather than a single optimized demo.

---

## 3. Components Completed

### 3.1 Columnar Lane Model Document

Documented the core architecture:

```text
shared record index
contiguous typed lanes
predicate bitsets
bitwise query execution
lazy hydration/gather
```

File:

```text
docs/RELAYDB_COLUMNAR_LANE_MODEL.md
```

---

### 3.2 Columnar Bitset v1

Implemented the first large-dataset version of the lane + bitset idea.

File:

```text
scripts/relay-columnar/benchmark-columnar-bitset-people-companies.js
```

Result:

```text
answerOnly avg: 0.011118 ms
debugStyle avg: 0.017863 ms
heapUsed delta: 151.89 MB
RSS delta: 412.14 MB
```

Interpretation:

```text
Speed path worked.
Memory was still too object/string heavy.
```

---

### 3.3 Columnar Bitset v2

Improved the memory model by using:

```text
Buffer-backed source bytes
payload byte offsets
typed lanes for hot fields
bitsets for predicates
hydration only after match
```

File:

```text
scripts/relay-columnar/benchmark-columnar-bitset-v2.js
```

Representative result:

```text
answerOnly avg: ~0.0015 ms
debugStyle avg: ~0.033 ms
heapUsed delta: ~3.4 MB
RSS delta: ~101 MB
```

Interpretation:

```text
The answer-only bitset path became extremely fast while JS heap usage dropped dramatically.
```

---

### 3.4 V8 Opt/Deopt Trace

Collected V8 optimization/deoptimization logs for the v2 columnar bitset benchmark.

Result:

```text
The hot query path appeared stable and optimizable.
No major deopt issue was observed in the repeated answer-only path.
```

Relevant hot functions:

```text
answerOnlySearch
findFirstAndMatch
debugSearch
andBitsets
collectSetBitsLimited
countSetBits
hydratePersonCompany
```

Interpretation:

```text
The performance is not just a suspicious timing artifact.
V8 appears able to optimize the hot typed-array/bitset path.
```

---

### 3.5 Columnar Manifest Profiler

Built a profiler that reads a 4-tag JSONL dataset and generates a columnar manifest.

File:

```text
scripts/relay-columnar/profile-columnar-manifest.js
```

Manifest output:

```text
reports/relay-columnar/people-companies.10000x100000.columnar-manifest.v2.json
```

The manifest describes:

```text
topics
record counts
field IDs
source keys
source kinds
field kinds
suggested lane types
searchability
predicate bitset candidates
relationship targets
```

Example discovered fields:

```text
person.attribute:age          -> number, uint8
person.attribute:status       -> enum, uint8
person.relationship:company   -> relationship, uint32
company.attribute:industry    -> enum, uint8
company.relationship:industry -> relationship, uint32
```

---

### 3.6 Manifest v2 Fixes

The first manifest profiler exposed field-collision issues.

Problem:

```text
@industry and ~industry both collapsed into industry
nested objects became [object Object]
```

Manifest v2 fixed this by using source-kind-aware field IDs:

```text
relationship:industry
attribute:industry
anchor:anchor
unknown:headquarters
```

Nested objects are now classified as object fields with sampled keys.

This fixed the schema description layer.

---

### 3.7 LaneRegistry Prototype

Built a generic registry from the manifest.

File:

```text
scripts/relay-columnar/lane-registry-prototype.js
```

The registry can:

```text
list topics
get lane specs
list searchable fields
list predicate candidates
list relationships
produce a query plan
```

The generated query plan for:

```text
active agriculture people under 40
```

became:

```text
person.attribute:status.active
person.attribute:age.lt.40
person.relationship:company.attribute:industry.agriculture
```

Final operation:

```text
bitset-and
```

This proved:

```text
manifest -> registry -> plan
```

---

### 3.8 Generic Columnar Executor Prototype

Built the first generic executor.

File:

```text
scripts/relay-columnar/generic-columnar-executor-prototype.js
```

Report:

```text
reports/relay-columnar/generic-columnar-executor-10000x100000.md
```

The executor uses:

```text
manifest
LaneRegistry
query plan
generic topic runtimes
required field lanes
enum dictionaries
relationship resolution
predicate bitsets
bitset-first execution
lazy hydration
```

This proved:

```text
manifest -> registry -> plan -> generic lanes -> generic bitset execution
```

---

## 4. Benchmark Dataset

Dataset:

```text
datasets/generated/merged/people-companies.10000x100000.4tag.merged.jsonl
```

Size:

```text
Bytes:      92,778,700
Lines:      151,676
People:     100,000
Companies:  10,000
Topics:     7
```

Benchmark question:

```text
active agriculture people under 40
```

Logical query:

```text
person.attribute:status = active
person.attribute:age < 40
person.relationship:company -> company.attribute:industry = Agriculture
```

---

## 5. Generic Executor Result

From the generic executor report:

```text
Open time:  314.239000 ms
RSS delta:  165.83 MB
heapUsed:   45.17 MB
```

Correctness:

```text
Answer:   David Jackson
Company:  BrightPath Labs 2922-1
Industry: Agriculture
```

Candidate counts:

```text
topicMatches: 100000
finalMatches: 1096
person.attribute:status.active: 33466
person.attribute:age.lt.40: 33631
person.relationship:company.attribute:industry.agriculture: 10140
```

Benchmark:

```text
answerOnly total: 16.646375 ms
answerOnly avg:   0.001665 ms
answerOnly ops:   600,731.390 ops/sec

debugStyle total: 375.686375 ms
debugStyle avg:   0.037569 ms
debugStyle ops:   26,617.947 ops/sec
```

---

## 6. Why This Is Important

The hardcoded v2 answer-only path was approximately:

```text
0.0015 ms
```

The generic manifest-driven executor answer-only path was:

```text
0.001665 ms
```

That means the generic architecture preserved near-hardcoded bitset performance.

This is the core milestone.

The project moved from:

```text
fast hardcoded demo
```

to:

```text
generic manifest-driven execution prototype
```

without losing the performance shape.

---

## 7. Current Performance Ladder

Approximate benchmark ladder:

```text
Raw JSONL repeated parse/scan:       ~213 ms
Optimized JS graph / compact reader: ~0.3 ms
Columnar bitset v1 answerOnly:       ~0.011 ms
Columnar bitset v2 answerOnly:       ~0.0015 ms
Generic columnar executor:           ~0.0017 ms
SQLite indexed answer-only:          ~0.0047 ms
```

Careful interpretation:

```text
RelayDB is not a general SQL database.
SQLite remains a mature, general-purpose embedded database.
RelayDB is testing a specialized static-read path for compiled relational artifacts.
```

The correct claim:

> For this narrow static-read query, the manifest-driven columnar/bitset prototype preserved near-hardcoded performance and stayed in the low-microsecond range for repeated warm answer-only execution.

---

## 8. Architectural Meaning

This milestone validates the central RelayDB idea:

```text
A static relational dataset can be profiled into a manifest,
compiled into typed columnar lanes,
accelerated with predicate bitsets,
queried through a generic plan,
and hydrated only after match.
```

That is the current RelayDB thesis.

---

## 9. What A Senior Developer Will Likely Ask

A senior developer will probably ask:

```text
Is the benchmark fair?
How much is precomputed?
How generic is the executor?
What happens with different datasets?
What happens with different queries?
How expensive is open/build time?
Can this become a real binary format?
Can the memory be reduced?
Can the hot path survive V8 deopt inspection?
How does this compare to SQLite/DuckDB honestly?
```

Current answers:

```text
The benchmark is narrow and should be framed that way.
Predicate bitsets are precomputed or runtime-built before repeated query timing.
The first generic manifest-driven executor now works.
The generic version stayed close to hardcoded v2 performance.
Open/build memory still needs improvement.
The next stage should move from JSONL runtime parsing toward compiled .relay layout.
```

---

## 10. Known Weaknesses

The generic executor is still a prototype.

Current weaknesses:

```text
higher heap usage than hardcoded v2
runtime still parses JSONL
manifest object remains in memory
generic maps add overhead
relationship raw anchor arrays are retained
only one query shape has been tested deeply
not yet a compiled .relay binary format
not yet a production API
```

These are expected prototype limitations.

---

## 11. Next Engineering Targets

Recommended next steps:

```text
1. Reduce generic executor memory.
2. Avoid retaining raw relationship anchors after resolution.
3. Replace JS anchor arrays with offset/string table strategy.
4. Add more query shapes.
5. Add randomized benchmark queries.
6. Add limit 1 / limit 10 / count-only / full count modes.
7. Extract shared LaneRegistry into a reusable module.
8. Design compiled .relay columnar file sections.
9. Build a binary writer/reader for the columnar model.
10. Compare compiled .relay open time against JSONL runtime build time.
```

---

## 12. Milestone Statement

Formal milestone statement:

> RelayDB now has a working manifest-driven generic columnar executor. It can profile a 4-tag JSONL dataset, generate a columnar manifest, build a lane registry, plan a query, construct required typed lanes and predicate bitsets, execute a bitset-first query, and hydrate matching records. On the 100k people / 10k companies benchmark, the generic executor preserved near-hardcoded answer-only performance at approximately 0.001665 ms per repeated warm query.

---

## 13. Commit Recommendation

Recommended commit message:

```text
Add generic columnar executor milestone summary
```

Files to include:

```text
scripts/relay-columnar/generic-columnar-executor-prototype.js
reports/relay-columnar/generic-columnar-executor-10000x100000.md
reports/relay-columnar/GENERIC_EXECUTOR_MILESTONE.md
```
