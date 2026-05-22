## Conclusion

The compact typed-array reader is the stronger architecture for RelayDB’s long-term direction.

At 100,000 people and 10,000 companies, it reduced JS heap usage by 41.73 MB, reduced RSS by 56.58 MB, and improved the honest uncached `debugSearch()` path by 2.499x compared to the object-row offset reader. The tradeoff was a slower open time of approximately 97.78 ms.

This supports the architectural direction of using compact typed lanes, integer IDs, byte-backed storage, and lazy payload hydration rather than object-heavy JavaScript row structures.







sherbondy@Kristophers-MacBook-Pro relaydb-4tag-benchmark % node scripts/relay-search/compare-offset-readers-isolated.js 1000 10000 datasets/generated/merged/people-companies.10000x100000.4tag.merged.jsonl
RelayDB Isolated Offset Reader Comparison
=========================================
Dataset: /Users/sherbondy/Desktop/projects/relaydb-4tag-benchmark/datasets/generated/merged/people-companies.10000x100000.4tag.merged.jsonl
Warmup iterations: 1000
Measured iterations: 10000

OBJECT-ROW OFFSET READER
========================

Open
----
openMs:         168.278542 ms
readerOpenMs:   168.069875 ms

Stats
-----
bytes:          92,778,700
lines:          151,676
nodes:          151,676
anchors:        151,676
person rows:    100,000

Memory Delta
------------
rss              198.22 MB
heapTotal        100.19 MB
heapUsed          68.37 MB
external          88.48 MB
arrayBuffers      88.48 MB

Correctness
-----------
answer:         David Jackson
company:        BrightPath Labs 2922-1
industry:       Agriculture

Candidate Counts
----------------
{
  topicMatches: 100000,
  statusMatches: 33466,
  ageMatches: 11275,
  industryMatches: 1096,
  finalMatches: 1096
}

Benchmarks
----------
search             avg: 0.000210 ms | ops/sec: 4759733.417
search explain     avg: 0.000361 ms | ops/sec: 2773828.924
limit 10 explain   avg: 0.001820 ms | ops/sec: 549601.539
debugSearch        avg: 0.785005 ms | ops/sec: 1273.878

COMPACT TYPED-ARRAY OFFSET READER
=================================

Open
----
openMs:         266.057916 ms
readerOpenMs:   265.829541 ms

Stats
-----
bytes:          92,778,700
lines:          151,676
nodes:          151,676
anchors:        151,676
people:         100,000
companies:      10,000
layout:         compact-typed-arrays

Memory Delta
------------
rss              141.64 MB
heapTotal         43.48 MB
heapUsed          26.64 MB
external          90.29 MB
arrayBuffers      90.29 MB

Correctness
-----------
answer:         David Jackson
company:        BrightPath Labs 2922-1
industry:       Agriculture

Candidate Counts
----------------
{
  topicMatches: 100000,
  statusMatches: 33466,
  ageMatches: 11275,
  industryMatches: 1096,
  finalMatches: 1096
}

Benchmarks
----------
search             avg: 0.000186 ms | ops/sec: 5374055.778
search explain     avg: 0.000360 ms | ops/sec: 2780320.226
limit 10 explain   avg: 0.001776 ms | ops/sec: 563138.370
debugSearch        avg: 0.314091 ms | ops/sec: 3183.795

COMPARISON
==========

open time difference:     97.779374 ms
rss reduction:            56.58 MB
heapUsed reduction:       41.73 MB
arrayBuffers difference:  1.81 MB
debugSearch speedup:      2.499x
search speed ratio:       1.129x