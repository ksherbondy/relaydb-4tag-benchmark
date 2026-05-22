# Baseline Comparison Summary

**Author:** Kris Sherbondy  
**Date:** 2026-05-22  
**Purpose:** Summarize early external baseline comparisons for RelayDB reader experiments.

---

## 1. Purpose

This document compares several approaches for answering the same relationship-aware lookup question against the same generated dataset.

The goal is not to claim RelayDB replaces mature database engines or data tools.

The goal is to answer a narrower engineering question:

> How does the current RelayDB compact typed-array reader compare against increasingly fair JavaScript baselines for repeated static relational lookup?

---

## 2. Dataset

Largest tested dataset:

```text
Companies:         10,000
People:            100,000
Total nodes:       151,676
Source file size:  92.78 MB
Source format:     4-tag JSONL
```

Benchmark file:

```text
datasets/generated/merged/people-companies.10000x100000.4tag.merged.jsonl
```

---

## 3. Benchmark Question

```text
active agriculture people under 40
```

This query tests a relationship-aware lookup:

```text
person.status = active
person.age < 40
person.company -> company.industry = Agriculture
```

Correct candidate counts for the 100k / 10k dataset:

```text
topicMatches:     100000
statusMatches:     33466
ageMatches:        11275
industryMatches:    1096
finalMatches:       1096
```

---

## 4. Tested Approaches

### A. Naive Raw JSONL Parse/Scan

The raw JSONL benchmark reads the file into memory, splits it into lines, and reparses JSON during each scan.

This represents a low baseline:

```text
read text
split lines
JSON.parse each relevant line every query
build company map every query
scan people every query
hydrate result
```

This is not a fully optimized baseline, but it shows the cost of repeatedly querying source JSONL directly.

---

### B. Normalized JavaScript Graph v1

The first normalized JS graph parses JSONL once and builds reusable JavaScript objects.

This avoids repeated JSON parsing:

```text
read once
parse once
build companiesByAnchor Map
build people array
query preloaded objects repeatedly
```

This is a fairer baseline than raw repeated JSONL parsing.

---

### C. Normalized JavaScript Graph v2

The second normalized JS graph improves the baseline:

```text
parse once
assign numeric company IDs
assign numeric status IDs
assign numeric industry IDs
avoid Map lookup inside the hot person loop
avoid result hydration until after matching
```

This gives the JavaScript object-graph baseline a stronger and fairer shot.

---

### D. RelayDB Object-Row Offset Reader

The object-row offset reader keeps the source bytes and builds offset-based search rows using JavaScript objects.

This was useful as an intermediate architecture, but it is not the long-term direction.

---

### E. RelayDB Compact Typed-Array Offset Reader

The compact reader keeps hot query fields in typed lanes and hydrates final payloads only after matching.

Conceptually:

```text
source bytes / payloads stay cold
hot fields live in typed arrays
relationships become numeric IDs
query scans compact lanes
final result hydrates from byte offsets
```

---

## 5. Timing Results

All times below refer to the warm repeated query path for the tested relationship-aware query.

| Approach | Avg Query Time | Ops/sec | Notes |
|---|---:|---:|---|
| Naive raw JSONL parse/scan | ~210–213 ms | ~4.7 | Repeated parse/scan baseline |
| Normalized JS graph v1 | 0.470211 ms | 2,126.706 | Parse once, object graph query |
| Normalized JS graph v2 | 0.337221 ms | 2,965.415 | Stronger JS graph baseline |
| RelayDB object-row offset reader | 0.785005 ms | 1,273.878 | Offset reader with object rows |
| RelayDB compact typed-array reader | 0.314091 ms | 3,183.795 | Compact typed-lane reader |

---

## 6. Memory Results

Memory deltas during load/open for the largest tested dataset.

| Approach | Load/Open Time | Heap Used Delta | RSS Delta | Notes |
|---|---:|---:|---:|---|
| Naive raw JSONL text load | 37.82 ms | 98.67 MB | 322.03 MB | Text + line splitting only |
| Normalized JS graph v1 | 158.75 ms | 143.20 MB | 410.02 MB | Full object graph |
| Normalized JS graph v2 | 160.21 ms | 127.61 MB | 414.61 MB | Improved graph, still heap-heavy |
| RelayDB object-row offset reader | 168.28 ms | 68.37 MB | 198.22 MB | Object-row offset layout |
| RelayDB compact typed-array reader | 266.06 ms | 26.64 MB | 141.64 MB | Compact typed-lane layout |

---

## 7. Key Comparisons

### RelayDB Compact vs Naive Raw JSONL

Naive raw JSONL repeated parse/scan:

```text
~210–213 ms
```

RelayDB compact typed-array reader:

```text
0.314091 ms
```

Approximate speed ratio:

```text
~670x faster than the naive repeated raw JSONL parse/scan baseline
```

Important caveat:

The raw JSONL scan is intentionally a low baseline and V8 tracing showed repeated deoptimizations. It should not be used as the main competitive claim by itself.

---

### RelayDB Compact vs Normalized JS Graph v2

Normalized JS graph v2:

```text
0.337221 ms
```

RelayDB compact typed-array reader:

```text
0.314091 ms
```

Approximate speed ratio:

```text
~1.07x faster than normalized JS graph v2
```

This is a much more credible comparison.

The speed gap is small, but RelayDB compact uses much less heap:

```text
Normalized JS graph v2 heapUsed delta: 127.61 MB
RelayDB compact heapUsed delta:        26.64 MB
Approximate heap savings:             100.97 MB
```

RSS difference:

```text
Normalized JS graph v2 RSS delta: 414.61 MB
RelayDB compact RSS delta:        141.64 MB
Approximate RSS savings:          272.97 MB
```

---

## 8. V8 Optimization Notes

The naive raw JSONL scan showed repeated V8 deoptimizations around dynamic object/property access, including:

```text
wrong map
Insufficient type feedback for generic named access
IC changed
```

The normalized JS graph v1 improved query time dramatically but still showed repeated deoptimizations in the hot query path related to generic named access.

The normalized JS graph v2 improved query time further, but the V8 trace still showed repeated deoptimizations around compare-operation type feedback.

The compact typed-array reader is architecturally better aligned with stable numeric lanes and future Rust/WASM implementation.

---

## 9. Interpretation

The benchmark story matured over time.

The first raw JSONL comparison showed that repeated source parsing is extremely expensive.

The normalized JavaScript baselines showed that a competent in-memory graph can become very fast.

The compact RelayDB reader showed that typed-lane layout can remain competitive with an optimized JS graph while using substantially less heap.

The most defensible current claim is:

> RelayDB compact is competitive with an optimized JavaScript in-memory graph on the tested relationship-aware query while using dramatically less JavaScript heap.

This is stronger and more credible than claiming RelayDB simply “beats JSONL by hundreds of times.”

---

## 10. What This Does Not Prove

These tests do not prove RelayDB beats:

```text
SQLite
DuckDB
Postgres
jq
Arrow
Parquet
custom Rust/C readers
well-indexed production databases
```

Those tools are mature, broad, and highly optimized.

These tests only show that the current RelayDB compact typed-array architecture is promising for a narrow static relational lookup workload.

---

## 11. Current Engineering Takeaway

The object-row offset reader should not be treated as the future architecture.

The compact typed-array reader is the stronger direction.

The tested pattern supports continued work around:

```text
typed lanes
integer IDs
offset tables
string tables
relationship tables
lazy hydration
small caches
eventual Rust/WASM reader core
```

---

## 12. Next Baseline Targets

The next fair external comparisons should be:

```text
SQLite imported table query, unindexed
SQLite imported table query, indexed
DuckDB imported table query
DuckDB direct JSONL query
```

SQLite should come first because it is the most obvious local relational comparison point.

---

## 13. Conclusion

The current RelayDB compact typed-array reader is no longer just a conceptual experiment.

For the tested 100,000-person / 10,000-company static relational lookup workload, it:

```text
outperformed the best normalized JavaScript graph baseline by a small margin
used roughly 101 MB less JavaScript heap than normalized JS graph v2
used roughly 273 MB less RSS than normalized JS graph v2
dramatically outperformed naive repeated raw JSONL parse/scan
preserved correct candidate counts
validated the typed-lane architecture direction
```

The best current framing is:

> RelayDB compact does not yet prove superiority over mature databases, but it shows a promising compiled-read architecture: similar-or-better warm query speed than optimized JavaScript object graphs, with dramatically lower heap usage for static relational data.
