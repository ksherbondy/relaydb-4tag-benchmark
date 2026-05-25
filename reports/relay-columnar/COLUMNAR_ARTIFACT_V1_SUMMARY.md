# RelayDB Columnar Artifact v1 Summary

**Author:** Kris Sherbondy  
**Date:** 2026-05-23  
**Branch:** `relay-bitset`  
**Status:** Aligned binary artifact + zero-copy reader milestone

---

## 1. Purpose

This document summarizes the RelayDB columnar artifact v1 milestone.

The v1 work hardened the compiled artifact format after v0 proved that the basic compiler/reader split worked.

The main goal of v1 was:

```text
Keep v0 as the first working proof.
Build v1 as a cleaner binary artifact format.
Add aligned section offsets.
Enable zero-copy typed-array views.
Confirm the stress-test behavior still holds.
```

v1 does not yet make the artifact fully generic. It is still dataset-specific for the people/companies benchmark. The purpose of v1 is binary-layout correctness and reader efficiency.

---

## 2. Background: What v0 Proved

Artifact v0 proved the core compiled-read thesis:

```text
JSONL source
  ↓ compile once
prebuilt columnar artifact
  ↓ open quickly
typed lanes + bitsets already present
  ↓ query through bitset math
hydrate from payload offsets
```

v0 produced strong results:

```text
Open time:       ~9.3 ms
answerOnly avg:  ~0.00146 ms
debugStyle avg:  ~0.0348 ms
heapUsed delta:  ~26 KB
```

However, v0 had a real binary-format flaw:

```text
section starts were not guaranteed to be aligned
Uint32Array views require 4-byte alignment
Uint16Array views require 2-byte alignment
```

This caused the reader to require a workaround:

```text
DataView copy into new aligned typed arrays
```

That workaround was acceptable for v0, but not acceptable for a serious binary artifact format.

---

## 3. v1 Format Improvement

Artifact v1 fixes the section alignment problem.

The v1 artifact layout is:

```text
magic bytes:        RDBC0002
manifest length:   uint32 little-endian
manifest JSON:     UTF-8 JSON
padding:           align to 8-byte boundary
section 1:         aligned typed/binary section
padding
section 2
padding
...
payload section
```

Each section is described inside the manifest:

```json
{
  "offset": 123456,
  "byteLength": 400000,
  "alignment": 8,
  "type": "uint32"
}
```

This allows the reader to create typed-array views directly over the artifact buffer:

```js
new Uint32Array(
  file.buffer,
  file.byteOffset + section.offset,
  section.byteLength / Uint32Array.BYTES_PER_ELEMENT
)
```

No DataView loop is required.

No copy is required.

---

## 4. v1 Files

Compiler:

```text
scripts/relay-columnar/compile-columnar-artifact-v1.js
```

Reader:

```text
scripts/relay-columnar/read-columnar-artifact-v1.js
```

Stress test:

```text
scripts/relay-columnar/stress-read-columnar-artifact-v1.js
```

Compiled artifact:

```text
builds/relay-columnar/people-companies.10000x100000.columnar.v1.relayc
```

Reports:

```text
reports/relay-columnar/compile-columnar-artifact-v1.md
reports/relay-columnar/read-columnar-artifact-v1.md
reports/relay-columnar/stress-read-columnar-artifact-v1-cached.md
reports/relay-columnar/stress-read-columnar-artifact-v1-q8b.md
```

---

## 5. v1 Compile Result

The v1 compiler produced:

```text
Compile time: 455.873708 ms
People:       100,000
Companies:    10,000
Lines:        151,676
Source bytes: 92,778,700
Output bytes: 94,318,188
Alignment:    8 bytes
```

Compared to v0:

```text
v0 output bytes: 94,317,466
v1 output bytes: 94,318,188
difference:     722 bytes
```

The increase is tiny and comes from the added manifest offset/alignment metadata.

That is a good tradeoff.

---

## 6. v1 Reader Result

The v1 reader produced:

```text
Open time:      6.702292 ms
Bytes:          94,318,188
People:         100,000
Companies:      10,000
Alignment:      8 bytes
```

Memory delta:

```text
rss delta:          90.19 MB
heapUsed delta:     24.27 KB
external delta:     89.95 MB
arrayBuffers delta: 89.95 MB
```

Alignment check:

```text
Aligned: true
Sections checked: 12
```

Query result:

```text
Answer:   David Jackson
Company:  BrightPath Labs 2922-1
Industry: Agriculture
```

Benchmark:

```text
answerOnly avg: 0.001474 ms
debugStyle avg: 0.034774 ms
```

---

## 7. v0 vs v1 Reader Comparison

| Metric | v0 Reader | v1 Reader | Notes |
|---|---:|---:|---|
| Magic | RDBC0001 | RDBC0002 | v1 format marker |
| Section offsets | sequential after manifest | explicit manifest offsets | v1 is safer |
| Alignment | not guaranteed | 8-byte aligned | v1 fixed binary layout |
| Typed views | copied via DataView workaround | zero-copy typed views | v1 is structurally better |
| Open time | ~9.28 ms | ~6.70 ms | v1 faster |
| answerOnly avg | ~0.00146 ms | ~0.00147 ms | equivalent |
| debugStyle avg | ~0.0348 ms | ~0.0348 ms | equivalent |
| JS heap delta | ~26 KB | ~24 KB | equivalent |

v1 is the better artifact format.

The main win is not only speed. The main win is that v1 creates a real binary layout contract.

---

## 8. v1 Stress Test Result

The v1 cached stress test confirmed that broader query behavior still holds.

Open:

```text
Open time:  6.978917 ms
Heap delta: 24.88 KB
Aligned:    true
Sections:   12
```

Stress query results:

```text
Q1 active agriculture under40 limit1       avg: 0.001482 ms
Q2 active agriculture under40 count        avg: 0.010368 ms
Q3 active under40 count                    avg: 0.008644 ms
Q4 agriculture under40 count               avg: 0.008741 ms
Q5 inactive over50 count                   avg: 0.008894 ms
Q6 pending agriculture age30to60 count     avg: 0.010227 ms
Q7 agriculture age18to25 limit10 hydrate   avg: 0.020225 ms
Q8 group by status x agriculture           avg: 0.323358 ms
```

This confirmed:

```text
v1 retained the v0 performance tiers.
v1 alignment did not break correctness.
v1 zero-copy typed views work.
```

---

## 9. Q8 Weak Spot and Q8b Improvement

The original Q8 was a row-scan group operation:

```text
for every person:
  read status
  check agriculture bit
  increment one counter
```

That scanned all 100,000 people every time.

Q8 result:

```text
Q8 group by status x agriculture
avg: 0.311085 ms
ops/sec: 3,214.555
```

A new Q8b query reframed the group-by question as bitset math.

Instead of scanning every person, it used:

```text
activeAgriculture   = count(activePeople AND agriculturePeople)
activeOther         = count(activePeople) - activeAgriculture

inactiveAgriculture = count(inactivePeople AND agriculturePeople)
inactiveOther       = count(inactivePeople) - inactiveAgriculture

pendingAgriculture  = count(pendingPeople AND agriculturePeople)
pendingOther        = count(pendingPeople) - pendingAgriculture
```

Q8b result:

```text
Q8b group by status x agriculture bitsets
avg: 0.023573 ms
ops/sec: 42,421.219
```

Speedup:

```text
0.311085 / 0.023573 ≈ 13.2x faster
```

The Q8 and Q8b results matched exactly:

```text
activeAgriculture:    3,297
activeOther:         30,169
inactiveAgriculture:  3,367
inactiveOther:       29,823
pendingAgriculture:   3,476
pendingOther:        29,868
unknownAgriculture:       0
unknownOther:             0
```

This is an important architecture lesson:

```text
Do not ask 100,000 records one-by-one when the same question can be asked through bitset overlap.
```

---

## 10. Performance Tiers After Q8b

Current v1 performance tiers:

### Tier 1: Find-first over prebuilt/cached bitsets

```text
Q1 active agriculture under40 limit1
avg: ~0.00146–0.00148 ms
```

### Tier 2: Bitset AND + count

```text
Q2–Q6 count queries
avg: ~0.0086–0.0105 ms
```

### Tier 3: Hydration of multiple records

```text
Q7 hydrate 10 records
avg: ~0.0202 ms
```

### Tier 4: Bitset group-by

```text
Q8b group by status x agriculture bitsets
avg: ~0.0236 ms
```

### Tier 5: Row-scan group-by

```text
Q8 row scan group-by
avg: ~0.31–0.32 ms
```

This tiering is useful because it tells us where RelayDB is strongest and where planning matters.

---

## 11. Core Architectural Lesson

The v1 artifact and stress testing reinforced the main RelayDB strategy:

```text
1. Move parsing and lane construction to compile time.
2. Store hot fields as compact typed lanes.
3. Store common predicates as bitsets.
4. Cache repeated ad hoc predicates as runtime bitsets.
5. Answer filters with bitset math.
6. Hydrate only after a match.
7. Convert group-like questions into bitset overlap when possible.
8. Use row scans only when no better plan exists.
```

This is the current performance model.

---

## 12. What v1 Proves

v1 proves:

```text
Aligned binary sections work.
Explicit section offsets work.
Zero-copy typed-array views work.
The compiled artifact opens in about 6–7 ms.
The reader uses almost no JS heap.
The main query stays around 0.0015 ms.
Stress queries preserve the expected performance tiers.
Bitset grouping can replace slower row-scan grouping.
```

This is a strong proof that the compiled artifact direction is worth continuing.

---

## 13. What v1 Does Not Prove

v1 does not yet prove:

```text
fully generic compiled sections
multiple arbitrary datasets
general SQL support
writes or transactions
complex joins
sorting
large pagination flows
production durability
query optimization across many possible plans
memory-mapped file behavior
cross-language readers
```

v1 is still a dataset-specific binary proof.

The next milestone is to make artifact sections generic by field ID.

---

## 14. Next Major Engineering Step

The next architectural step is:

```text
dataset-specific v1 sections
  personAges
  personStatusIds
  personCompanyIndexes
  companyIndustryIds

become generic manifest field-ID sections
  person.attribute:age
  person.attribute:status
  person.relationship:company
  company.attribute:industry
```

That would move RelayDB from:

```text
clean binary proof
```

to:

```text
real manifest-driven artifact design
```

Expected next files:

```text
scripts/relay-columnar/compile-columnar-artifact-v2-generic.js
scripts/relay-columnar/read-columnar-artifact-v2-generic.js
reports/relay-columnar/compile-columnar-artifact-v2-generic.md
reports/relay-columnar/read-columnar-artifact-v2-generic.md
```

---

## 15. Suggested Commit

```text
Add columnar artifact v1 summary
```

Files:

```text
scripts/relay-columnar/compile-columnar-artifact-v1.js
scripts/relay-columnar/read-columnar-artifact-v1.js
scripts/relay-columnar/stress-read-columnar-artifact-v1.js
reports/relay-columnar/compile-columnar-artifact-v1.md
reports/relay-columnar/read-columnar-artifact-v1.md
reports/relay-columnar/stress-read-columnar-artifact-v1-cached.md
reports/relay-columnar/stress-read-columnar-artifact-v1-q8b.md
reports/relay-columnar/COLUMNAR_ARTIFACT_V1_SUMMARY.md
builds/relay-columnar/people-companies.10000x100000.columnar.v1.relayc
```

---

## 16. Milestone Statement

Formal milestone statement:

> RelayDB columnar artifact v1 introduced an aligned binary layout with explicit section offsets and zero-copy typed-array views. It preserved the v0 query performance while reducing open time to roughly 6–7 ms and keeping JavaScript heap growth near zero. The v1 stress test confirmed that prebuilt/cached predicate bitsets remain extremely fast, and the Q8b bitset grouping experiment improved a row-scan group-by from roughly 0.31 ms to roughly 0.024 ms while producing identical counts.
