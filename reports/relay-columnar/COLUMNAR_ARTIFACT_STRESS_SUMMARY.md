# RelayDB Columnar Artifact Stress Test Summary

**Author:** Kris Sherbondy  
**Date:** 2026-05-22  
**Branch:** `relay-bitset`  
**Status:** Stress-test checkpoint

---

## 1. Purpose

This document summarizes the first stress test of the prototype RelayDB compiled columnar artifact reader.

The goal was to move beyond a single benchmark query and test whether the compiled artifact model holds up under several SQL-like query shapes.

The stress test focused on:

```text
precompiled predicate bitsets
runtime-built predicate bitsets
cached runtime predicate bitsets
range predicates
relationship-derived predicates
count-only queries
limit/hydration queries
group-like aggregation
```

This was necessary because the earlier `active agriculture people under 40` benchmark showed extremely fast performance, but a single query is not enough to evaluate the architecture.

---

## 2. Artifact Tested

Compiled artifact:

```text
builds/relay-columnar/people-companies.10000x100000.columnar.relayc
```

Source dataset:

```text
datasets/generated/merged/people-companies.10000x100000.4tag.merged.jsonl
```

Dataset size:

```text
People:     100,000
Companies:  10,000
Lines:      151,676
Artifact:   94,317,466 bytes
```

Reader:

```text
scripts/relay-columnar/stress-read-columnar-artifact-v0.js
```

Reports:

```text
reports/relay-columnar/stress-read-columnar-artifact-v0.md
reports/relay-columnar/stress-read-columnar-artifact-v0-cached.md
```

---

## 3. Open-Time Result

The compiled artifact opened quickly and used almost no JavaScript heap.

Representative cached stress-test open result:

```text
Open time:  9.416917 ms
Bytes:      94,317,466
People:     100,000
Companies:  10,000
```

Memory delta:

```text
rss delta:          95.98 MB
heapUsed delta:     27.36 KB
external delta:     91.41 MB
arrayBuffers delta: 91.41 MB
```

Interpretation:

```text
The reader is not rebuilding the dataset into JavaScript objects.
The artifact lives mostly in Buffer/ArrayBuffer-backed memory.
The JS heap remains nearly unchanged.
```

This confirms the compile-once/open-fast direction is working.

---

## 4. Stress Queries

The stress test used eight SQL-like query shapes.

```text
Q1 active agriculture under40 limit1
Q2 active agriculture under40 count
Q3 active under40 count
Q4 agriculture under40 count
Q5 inactive over50 count
Q6 pending agriculture age30to60 count
Q7 agriculture age18to25 limit10 hydrate
Q8 group by status x agriculture
```

These queries were chosen to cover several execution patterns:

```text
limit 1 lookup
count all matches
bitset AND
range predicates
runtime bitset creation
relationship-derived filters
hydration of result records
full-pass grouping
```

---

## 5. Correctness / Sanity Results

The cached stress test produced these sanity results:

```text
Q1 active agriculture under40 limit1
  index=213, answer=David Jackson

Q2 active agriculture under40 count
  count=1,096

Q3 active under40 count
  count=11,275

Q4 agriculture under40 count
  count=3,428

Q5 inactive over50 count
  count=16,419

Q6 pending agriculture age30to60 count
  count=1,654

Q7 agriculture age18to25 limit10 hydrate
  count=10
  indexes=[53, 150, 164, 171, 263, 343, 349, 367, 373, 380]

Q8 group by status x agriculture
  activeAgriculture:    3,297
  activeOther:         30,169
  inactiveAgriculture:  3,367
  inactiveOther:       29,823
  pendingAgriculture:   3,476
  pendingOther:        29,868
  unknownAgriculture:       0
  unknownOther:             0
```

The counts are internally consistent:

```text
activeAgriculture + inactiveAgriculture + pendingAgriculture = 10,140
activeOther + inactiveOther + pendingOther = 89,860
total = 100,000
```

This matches the known agriculture person count from prior tests:

```text
agriculturePeople = 10,140
```

---

## 6. Uncached Stress-Test Results

The first stress test rebuilt some runtime bitsets on every iteration.

Representative uncached results:

```text
Q1 active agriculture under40 limit1       avg: 0.001475 ms
Q2 active agriculture under40 count        avg: 0.010521 ms
Q3 active under40 count                    avg: 0.008769 ms
Q4 agriculture under40 count               avg: 0.008869 ms
Q5 inactive over50 count                   avg: 0.443742 ms
Q6 pending agriculture age30to60 count     avg: 0.449486 ms
Q7 agriculture age18to25 limit10 hydrate   avg: 0.119559 ms
Q8 group by status x agriculture           avg: 0.292291 ms
```

Interpretation:

```text
Queries using prebuilt bitsets were extremely fast.
Queries that rebuilt predicate bitsets from typed lanes every iteration were much slower.
Full-pass grouping remained slower because it scanned all 100,000 records every run.
```

The important observation:

```text
Q5 and Q6 were not slow because bitset execution failed.
They were slower because they repeatedly rebuilt the same predicate bitsets.
```

---

## 7. Runtime Bitset Cache

A runtime bitset cache was added to test whether repeated ad hoc predicates could be promoted after first use.

Cached bitsets:

```text
person.status.eq.2
person.age.gt.50
person.status.eq.3
person.age.between.30.60
person.age.between.18.25
```

The model:

```text
first query:
  build missing predicate bitset from typed lane
  store it in runtime cache

later queries:
  reuse cached bitset
  perform bitset AND/count/hydrate
```

This models the intended RelayDB behavior for repeated ad hoc predicates.

---

## 8. Cached Stress-Test Results

After adding runtime bitset caching:

```text
Q1 active agriculture under40 limit1       avg: 0.001448 ms
Q2 active agriculture under40 count        avg: 0.010430 ms
Q3 active under40 count                    avg: 0.008570 ms
Q4 agriculture under40 count               avg: 0.008492 ms
Q5 inactive over50 count                   avg: 0.008952 ms
Q6 pending agriculture age30to60 count     avg: 0.010429 ms
Q7 agriculture age18to25 limit10 hydrate   avg: 0.020183 ms
Q8 group by status x agriculture           avg: 0.305247 ms
```

This result shows a clear performance tiering.

---

## 9. Before vs After Cache

| Query | Before Cache | After Cache | Approx. Improvement |
|---|---:|---:|---:|
| Q5 inactive over50 count | 0.443742 ms | 0.008952 ms | ~49.6x faster |
| Q6 pending agriculture age30to60 count | 0.449486 ms | 0.010429 ms | ~43.1x faster |
| Q7 agriculture age18to25 limit10 hydrate | 0.119559 ms | 0.020183 ms | ~5.9x faster |

The cache validated the architecture.

Repeated range and status predicates can be promoted from typed-lane scans into reusable bitsets.

---

## 10. Performance Tiers

The stress test revealed three practical performance tiers.

### Tier 1: Find-first over prebuilt/cached bitsets

```text
Q1 active agriculture under40 limit1
avg: 0.001448 ms
```

This is the fastest path.

It performs:

```text
bitset AND
find first set bit
hydrate one record
```

---

### Tier 2: Bitset AND + count

```text
Q2 active agriculture under40 count        avg: 0.010430 ms
Q3 active under40 count                    avg: 0.008570 ms
Q4 agriculture under40 count               avg: 0.008492 ms
Q5 inactive over50 count                   avg: 0.008952 ms
Q6 pending agriculture age30to60 count     avg: 0.010429 ms
```

These queries operate almost entirely on bitsets.

They are slower than limit-one because they count all matching bits, but they remain very fast.

---

### Tier 3: Hydration and full-pass aggregation

```text
Q7 agriculture age18to25 limit10 hydrate   avg: 0.020183 ms
Q8 group by status x agriculture           avg: 0.305247 ms
```

Q7 is slower because it hydrates 10 records.

Q8 is slower because it performs a full 100,000-record scan/group operation rather than a pure bitset operation.

This gives an honest boundary:

```text
RelayDB is strongest at static-read predicate/filter paths.
Full aggregations still require scans unless aggregate indexes or precomputed group sections are added.
```

---

## 11. Architectural Lesson

The stress test clarified the RelayDB performance strategy:

```text
Hot known predicates:
  compile into the artifact as prebuilt bitsets

Repeated ad hoc predicates:
  build once from typed lanes and cache as runtime bitsets

Cold one-off predicates:
  scan typed lanes and build temporary bitsets

Hydration:
  perform only after match, and only for requested result count

Aggregations:
  either scan typed lanes or use future precomputed aggregate sections
```

This is the most important result of the stress test.

---

## 12. What This Proves

The compiled artifact is not merely good at one narrow query.

It can support several SQL-like read patterns:

```text
WHERE status = active
WHERE age < 40
WHERE company.industry = Agriculture
WHERE age BETWEEN 30 AND 60
WHERE status = pending
WHERE status = inactive AND age > 50
LIMIT 1
LIMIT 10
COUNT(*)
GROUP-like pass over status and agriculture flag
```

The result is not uniformly microsecond-level for all query types, but the performance behavior is explainable and tunable.

That is the key.

---

## 13. What This Does Not Prove

This stress test does not prove that RelayDB is a general-purpose database.

It does not yet prove:

```text
joins beyond simple relationship index traversal
arbitrary SQL support
writes or transactions
complex aggregations
sorting
pagination over large result sets
multi-column indexes beyond bitset composition
query optimization across many possible plans
generic compiled artifact layout
production durability
```

RelayDB remains a specialized static-read artifact experiment.

The correct framing:

> RelayDB is exploring whether mostly-static relational data can be compiled into compact, fast, read-only columnar artifacts with typed lanes, predicate bitsets, and lazy hydration.

---

## 14. Honest Summary

The stress test strengthened the RelayDB case.

It showed:

```text
compiled artifact open time around 9 ms
near-zero JavaScript heap growth during open
prebuilt/cached predicate queries in ~0.001–0.010 ms range
runtime cache improves repeated ad hoc predicates by ~40–50x
hydration cost is visible but manageable
full aggregation scans remain meaningfully slower
```

This is a strong and defensible result.

---

## 15. Recommended Next Steps

Recommended next engineering steps:

```text
1. Commit stress test and cached stress report.
2. Add this summary document.
3. Build artifact v1 with aligned section offsets.
4. Replace DataView copy workaround with zero-copy typed views.
5. Move from dataset-specific artifact sections to manifest field-ID sections.
6. Add cold/warm benchmark separation.
7. Add randomized predicate tests.
8. Add more query families.
9. Add optional compiled aggregate sections for group-like queries.
10. Document honest benchmark methodology.
```

---

## 16. Suggested Commit

```text
Add columnar artifact stress test summary
```

Files:

```text
scripts/relay-columnar/stress-read-columnar-artifact-v0.js
reports/relay-columnar/stress-read-columnar-artifact-v0.md
reports/relay-columnar/stress-read-columnar-artifact-v0-cached.md
reports/relay-columnar/COLUMNAR_ARTIFACT_STRESS_SUMMARY.md
```
