# Offset Reader Comparison Summary

**Author:** Kris Sherbondy  
**Date:** 2026-05-22  
**Purpose:** Summarize isolated benchmark results comparing the object-row offset reader against the compact typed-array offset reader.

---

## 1. Benchmark Question

```text
active agriculture people under 40
```

This query tests a relationship-aware lookup:

```text
person.status = active
person.age < 40
person.company -> company.industry = Agriculture
```

The goal was not to prove RelayDB beats mature database engines. The goal was to test whether the compact typed-array reader architecture performs better than the object-row offset reader as dataset size increases.

---

## 2. Tested Readers

### Object-Row Offset Reader

The object-row reader keeps search-critical data in normal JavaScript objects.

Conceptually:

```text
personSearchRows = [
  {
    anchor,
    fullName,
    age,
    status,
    companyAnchor,
    start,
    end
  }
]
```

This is easy to write and reason about, but it puts more pressure on the JavaScript heap and depends more heavily on object property access.

### Compact Typed-Array Offset Reader

The compact reader keeps search-critical data in typed lanes.

Conceptually:

```text
personStarts:       Uint32Array
personEnds:         Uint32Array
personAges:         Uint8Array
personStatusIds:    Uint8Array
personCompanyIds:   Uint32Array
companyIndustryIds: Uint16Array
```

Full payloads stay cold until a final result needs to be hydrated.

This is closer to RelayDB’s long-term architecture:

```text
byte-backed storage
integer IDs
offset tables
typed lanes
lazy hydration
small caches
```

---

## 3. Summary Results

| Dataset | Reader | Open Time | Heap Used Delta | RSS Delta | debugSearch Avg | Notes |
|---:|---|---:|---:|---:|---:|---|
| 10k people / 1k companies | Object-row | 17.78 ms | 7.04 MB | 26.89 MB | 0.042251 ms | Baseline |
| 10k people / 1k companies | Compact typed-array | 29.46 ms | 1.52 MB | 20.75 MB | 0.021285 ms | 1.985x faster debug path |
| 50k people / 5k companies | Object-row | 82.19 ms | 26.12 MB | 108.50 MB | 0.283965 ms | Baseline |
| 50k people / 5k companies | Compact typed-array | 130.30 ms | 11.64 MB | 74.38 MB | 0.149183 ms | 1.903x faster debug path |
| 100k people / 10k companies | Object-row | 168.28 ms | 68.37 MB | 198.22 MB | 0.785005 ms | Baseline |
| 100k people / 10k companies | Compact typed-array | 266.06 ms | 26.64 MB | 141.64 MB | 0.314091 ms | 2.499x faster debug path |

---

## 4. Largest Scale Test

At the largest tested scale:

```text
Dataset:              100,000 people / 10,000 companies
Total nodes:          151,676
Source file size:     92.78 MB
Benchmark question:   active agriculture people under 40
```

The compact typed-array reader produced:

```text
Heap reduction:       41.73 MB
RSS reduction:        56.58 MB
debugSearch speedup:  2.499x
Open time cost:       +97.78 ms
```

The compact reader opened more slowly, but it used substantially less JavaScript heap and ran the honest uncached diagnostic query path much faster.

---

## 5. Scaling Pattern

The compact reader advantage survived each scale increase.

| Dataset | Heap Reduction | debugSearch Speedup | Open Time Cost |
|---:|---:|---:|---:|
| 10k people / 1k companies | 5.51 MB | 1.985x | +11.68 ms |
| 50k people / 5k companies | 14.49 MB | 1.903x | +48.11 ms |
| 100k people / 10k companies | 41.73 MB | 2.499x | +97.78 ms |

The important pattern is that the compact layout continued to hold its advantage as the data grew.

This suggests the improvement is architectural, not random benchmark noise.

---

## 6. Interpretation

The object-row reader pays for normal JavaScript object overhead.

The compact typed-array reader shifts the runtime model toward:

```text
large payload bytes     -> external / ArrayBuffer-backed storage
query-critical fields   -> compact typed lanes
final display data      -> hydrated only after a match
```

That is the design direction RelayDB should continue pursuing.

The compact reader is closer to the intended RelayDB model:

```text
source JSONL / 4-tag data
  ↓
compiled or compact offset layout
  ↓
typed lanes for hot fields
  ↓
byte-backed cold payloads
  ↓
small app-facing search API
```

---

## 7. What `debugSearch()` Represents

The cached public `search()` path is extremely fast for both readers because repeated exact queries hit the result cache.

For architecture evaluation, `debugSearch()` is the more honest measurement because it walks the underlying data and reports candidate counts.

The 100k-person compact reader result:

```text
debugSearch avg: 0.314091 ms
```

This means the compact reader can answer the tested relationship-aware query across 100,000 people and 10,000 companies in well under one millisecond after opening.

That is a useful early signal.

---

## 8. Correctness Check

The benchmark confirmed both readers returned the same answer and the same candidate counts at each tested scale.

For the 100k / 10k dataset:

```text
Answer:   David Jackson
Company:  BrightPath Labs 2922-1
Industry: Agriculture
```

Candidate counts:

```text
topicMatches:    100000
statusMatches:   33466
ageMatches:      11275
industryMatches: 1096
finalMatches:    1096
```

This matters because speed without correctness is not useful.

---

## 9. Architectural Lesson

The tests support the memory-hierarchy-inspired direction:

```text
.relay file / source bytes = storage
reader typed lanes        = RAM-friendly hot fields
reader query engine       = CPU-like execution layer
small caches              = temporal locality support
```

The practical lesson:

> RelayDB should not treat static relational data as a pile of JavaScript objects. It should treat it as addressable storage with compact runtime lanes and lazy hydration.

This validates the move away from object-heavy row structures and toward:

```text
integer IDs
byte offsets
typed arrays
string tables
relationship tables
flag lanes
lazy hydration
small caches
```

---

## 10. Honest Competitive Framing

These benchmarks do not prove RelayDB beats SQLite, DuckDB, jq, Arrow, Parquet, or any mature database/data tooling.

They prove something narrower and still valuable:

> For this static relational lookup workload, the compact RelayDB reader architecture is meaningfully better than the object-row RelayDB reader and performs well enough to justify further development.

RelayDB’s current lane is not “database replacement.”

RelayDB’s current lane is:

> A compiled local read layer for static relational data.

---

## 11. Next Benchmark Targets

To understand where RelayDB stands against existing tools, future comparisons should include:

```text
raw JSONL scan in Node
normalized JavaScript object graph
SQLite unindexed query
SQLite indexed query
DuckDB imported-table query
DuckDB direct JSONL query
```

The first external baseline should likely be SQLite because it is the most obvious local relational comparison point.

---

## 12. Conclusion

The compact typed-array reader is the stronger architecture for RelayDB’s long-term direction.

At 100,000 people and 10,000 companies, it reduced JavaScript heap usage by 41.73 MB, reduced RSS by 56.58 MB, and improved the honest uncached `debugSearch()` path by 2.499x compared to the object-row offset reader.

The tradeoff was a slower open time of approximately 97.78 ms.

For a static, read-heavy artifact that may be queried many times after opening, that tradeoff is defensible.

This supports continuing RelayDB development around compact typed lanes, integer IDs, byte offsets, build-time validation, and lazy payload hydration.
