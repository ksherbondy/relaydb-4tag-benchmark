# Columnar Bitset Results Summary

**Author:** Kris Sherbondy  
**Date:** 2026-05-22  
**Purpose:** Summarize the RelayDB columnar lane + predicate bitset benchmark results and compare them against prior reader and baseline experiments.

---

## 1. Purpose

This document summarizes the first two RelayDB columnar bitset benchmark implementations:

```text
scripts/relay-columnar/benchmark-columnar-bitset-people-companies.js
scripts/relay-columnar/benchmark-columnar-bitset-v2.js
```

These benchmarks were created to test a new RelayDB runtime model:

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

The goal was to determine whether the "columnar/temporal block" model could improve query speed while preserving a path toward lower memory usage.

---

## 2. Dataset

The benchmark used the generated people/companies dataset:

```text
Dataset file:
datasets/generated/merged/people-companies.10000x100000.4tag.merged.jsonl

Companies:        10,000
People:           100,000
Total lines:      151,676
Source file size: 92,778,700 bytes
```

Benchmark question:

```text
active agriculture people under 40
```

Logical query:

```text
person.status = active
person.age < 40
person.company -> company.industry = Agriculture
```

---

## 3. Columnar Bitset v1

File:

```text
scripts/relay-columnar/benchmark-columnar-bitset-people-companies.js
```

### Design

v1 proved the basic model:

```text
person age lane
person status lane
person company lane
company industry lane

activePeople bitset
under40People bitset
agriculturePeople bitset

query = activePeople AND under40People AND agriculturePeople
```

It kept many strings and hydrated values in JavaScript arrays.

### Result

```text
Open time:      165.820250 ms
RSS delta:      412.14 MB
heapUsed delta: 151.89 MB
arrayBuffers:   1.03 MB

answerOnly avg: 0.011118 ms
debugStyle avg: 0.017863 ms
```

### Interpretation

v1 proved that bitset query execution is extremely fast.

However, memory usage remained high because v1 still retained many JavaScript arrays and strings:

```text
person names
person anchors
person cities
person states
person countries
company names
company locations
temporary arrays
full split lines/text pressure
```

v1 was a speed proof, not a memory-efficient architecture.

---

## 4. Columnar Bitset v2

File:

```text
scripts/relay-columnar/benchmark-columnar-bitset-v2.js
```

### Design Improvements

v2 changed the memory model:

```text
read source as Buffer
avoid full text split-lines array
store payload byte offsets
keep hot query fields in typed lanes
hydrate by parsing payload only after match
use answer-only bitset search
use debug-style bitset counts
```

This moved the model closer to a future compiled `.relay` file.

### Result

```text
Open time:      443.110250 ms
RSS delta:      101.63 MB
heapUsed delta: 3.39 MB
external delta: 90.33 MB
arrayBuffers:   90.33 MB

answerOnly avg: 0.001508 ms
debugStyle avg: 0.032999 ms
```

### Interpretation

v2 dramatically reduced JavaScript heap usage while making the answer-only query path much faster.

The main tradeoff was slower open time because v2 scans/parses the JSONL Buffer twice.

That tradeoff is acceptable for this prototype because a real compiled `.relay` file would store prebuilt lanes and offsets directly, avoiding JSONL parsing at open.

---

## 5. v1 vs v2 Comparison

| Metric | Columnar v1 | Columnar v2 | Change |
|---|---:|---:|---:|
| Open time | 165.820 ms | 443.110 ms | v2 slower open |
| RSS delta | 412.14 MB | 101.63 MB | ~310.51 MB lower |
| heapUsed delta | 151.89 MB | 3.39 MB | ~148.50 MB lower |
| answerOnly avg | 0.011118 ms | 0.001508 ms | ~7.37x faster |
| debugStyle avg | 0.017863 ms | 0.032999 ms | v2 slower debug |

### Key Takeaway

v2 is the better architecture.

It trades slower open time for:

```text
massively lower JS heap
lower RSS
much faster answer-only query
payload hydration only after match
a clearer path toward compiled .relay files
```

---

## 6. Candidate Counts

Columnar v2 produced:

```text
topicMatches:     100000
statusMatches:     33466
ageMatches:        33631
industryMatches:   10140
finalMatches:       1096
```

These counts are independent predicate counts:

```text
statusMatches   = all active people
ageMatches      = all people under 40
industryMatches = all people attached to Agriculture companies
finalMatches    = active AND under40 AND agriculture
```

This differs from some earlier debug outputs that counted progressively filtered subsets.

The columnar interpretation is cleaner for bitset execution because each predicate has its own independent bitset.

---

## 7. Comparison Against Prior Baselines

Known benchmark ladder for the 100k people / 10k companies dataset:

| Approach | Avg Query Time | Notes |
|---|---:|---|
| Naive raw JSONL parse/scan | ~213 ms | Repeated JSON parsing |
| Normalized JS graph v2 | 0.337221 ms | Optimized JS object graph |
| RelayDB compact offset debugSearch | 0.314091 ms | Compact typed-array offset reader |
| Columnar bitset v1 answerOnly | 0.011118 ms | First bitset implementation |
| SQLite unindexed answer-only | 0.014542 ms | SQLite native C engine, no explicit indexes |
| SQLite indexed answer-only | 0.004729 ms | SQLite native C engine with indexes |
| Columnar bitset v2 answerOnly | 0.001508 ms | Precomputed bitset answer path |

---

## 8. SQLite Comparison

Earlier SQLite indexed answer-only result:

```text
SQLite indexed avg: 0.004729 ms
```

Columnar bitset v2 answer-only result:

```text
Columnar v2 answerOnly avg: 0.001508 ms
```

Approximate ratio:

```text
0.004729 / 0.001508 ≈ 3.14x
```

### Careful Interpretation

This does **not** mean RelayDB generally beats SQLite.

SQLite is a mature C database engine with a full SQL planner, B-tree indexes, joins, transactions, and a wide general-purpose feature set.

Columnar bitset v2 is doing a much narrower operation:

```text
precomputed predicate bitsets
bitwise AND
find first matching record index
hydrate one result
```

The correct claim is:

> For this narrow precomputed predicate-bitset answer-only path, the JavaScript columnar prototype outperformed the earlier SQLite indexed LIMIT 1 timing on the same dataset.

That is a promising signal, not a broad database claim.

---

## 9. Memory Interpretation

Columnar v2 memory profile:

```text
heapUsed delta:     3.39 MB
arrayBuffers delta: 90.33 MB
RSS delta:          101.63 MB
```

This is much healthier than v1 because the large source file lives in Buffer/ArrayBuffer-backed memory rather than exploding into JavaScript objects and strings.

This supports the architectural direction:

```text
source/payload bytes -> external / ArrayBuffer-backed storage
hot query fields     -> compact typed lanes
predicate filters    -> small bitsets
result objects       -> hydrated only at the edge
```

---

## 10. Open-Time Tradeoff

Columnar v2 open time:

```text
443.110250 ms
```

This is slower than v1 and slower than several earlier prototypes.

Reason:

```text
v2 parses JSONL from Buffer
v2 scans twice
v2 builds company dictionary first
v2 fills person lanes and bitsets second
```

This is a prototype limitation.

In a compiled `.relay` file, the lanes, bitsets, dictionaries, and payload offsets should already be built.

A future compiled open path should be closer to:

```text
read header
read manifest
map lane sections
map bitset sections
map payload section
start querying
```

Instead of reparsing JSONL.

---

## 11. Architectural Lesson

The columnar bitset model is the strongest architecture discovered so far.

The key design is:

```text
Search:
  operate on typed lanes and bitsets

Hydration:
  gather matched indexes from payload offsets only after search
```

This separates matching from object creation.

That separation is what allowed v2 to reach:

```text
answerOnly avg: 0.001508 ms
heapUsed delta: 3.39 MB
```

---

## 12. Why This Matters

The early compact offset reader proved that typed lanes were better than object rows.

The columnar bitset model takes that further:

```text
object row scan
  ↓
typed lane scan
  ↓
predicate bitset execution
```

This is the first RelayDB prototype that clearly shows a path toward very fast static-read queries in JavaScript while keeping heap usage low.

---

## 13. Risks and Caveats

The current columnar benchmark is still specialized to the people/companies dataset.

The next architectural challenge is to make this generic through:

```text
manifest/header
topic registry
lane registry
field kind detection
enum dictionaries
relationship lanes
predicate bitset registry
generic planner
generic hydrator
```

Without that, the implementation remains a powerful demo rather than a general RelayDB engine.

---

## 14. Next Steps

Recommended next steps:

```text
1. Commit the v2 benchmark and report.
2. Add V8 opt/deopt inspection for columnar v2.
3. Create a generic manifest profiler.
4. Create a generic LaneRegistry.
5. Rebuild the people/company query using generic lanes instead of hardcoded fields.
6. Add lazy runtime bitset generation.
7. Design the compiled .relay file header/manifest layout.
```

---

## 15. Conclusion

Columnar bitset v2 is the strongest RelayDB JS prototype so far.

It produced:

```text
answerOnly avg: 0.001508 ms
debugStyle avg: 0.032999 ms
heapUsed delta: 3.39 MB
RSS delta: 101.63 MB
```

The most important result is not that it beat SQLite on one narrow answer-only benchmark.

The important result is that the architecture now has a clear shape:

```text
manifest-guided columnar lanes
  +
predicate bitsets
  +
byte-offset payload hydration
  +
generic query planning
```

This is the clearest path from RelayDB prototype to a real compiled static-read artifact.
