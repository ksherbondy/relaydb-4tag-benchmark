  statusMatches: 3396,
  ageMatches: 1095,
  industryMatches: 117,
  finalMatches: 117
}

Warmup
------
search                   blackhole: 25000
search explain           blackhole: 318000
search limit 10 explain  blackhole: 3287000
debugSearch              blackhole: 1971166

Benchmark
---------
search                   total: 1.884708 ms | avg: 0.000188 ms | ops/sec: 5305861.704 | blackhole: 250000
search explain           total: 3.569375 ms | avg: 0.000357 ms | ops/sec: 2801610.926 | blackhole: 3180000
search limit 10 explain  total: 18.113625 ms | avg: 0.001811 ms | ops/sec: 552070.610 | blackhole: 32870000
debugSearch              total: 210.779542 ms | avg: 0.021078 ms | ops/sec: 47442.934 | blackhole: 19776840

SUMMARY
=======

object-row offset reader
------------------------
openMs:                18.511166 ms
rss delta:             26.38 MB
heapUsed delta:        7.01 MB
arrayBuffers delta:    8.83 MB
search avg:            0.000205 ms
search explain avg:    0.000369 ms
limit 10 explain avg:  0.001821 ms
debugSearch avg:       0.042507 ms
debugSearch ops/sec:   23525.696

compact typed-array offset reader
---------------------------------
openMs:                27.247666 ms
rss delta:             256.00 KB
heapUsed delta:        6.62 MB
arrayBuffers delta:    9.01 MB
search avg:            0.000188 ms
search explain avg:    0.000357 ms
limit 10 explain avg:  0.001811 ms
debugSearch avg:       0.021078 ms
debugSearch ops/sec:   47442.934

Comparison
----------
heapUsed reduction:     398.03 KB
rss reduction:          26.13 MB
debugSearch speedup:    2.017x
open time difference:   8.736500 ms
sherbondy@Kristophers-MacBook-Pro relaydb-4tag-benchmark % git add scripts/relay-search/compare-offset-readers.js
sherbondy@Kristophers-MacBook-Pro relaydb-4tag-benchmark % git commit -m "Add offset reader comparison benchmark"
[compact-offset-reader 8373a7c] Add offset reader comparison benchmark
 1 file changed, 359 insertions(+)
 create mode 100644 scripts/relay-search/compare-offset-readers.js
sherbondy@Kristophers-MacBook-Pro relaydb-4tag-benchmark % clear
sherbondy@Kristophers-MacBook-Pro relaydb-4tag-benchmark % node scripts/relay-search/compare-offset-readers-isolated.js 1000 10000 datasets/generated/merged/people-companies.1000x10000.4tag.merged.jsonl
RelayDB Isolated Offset Reader Comparison
=========================================
Dataset: /Users/sherbondy/Desktop/projects/relaydb-4tag-benchmark/datasets/generated/merged/people-companies.1000x10000.4tag.merged.jsonl
Warmup iterations: 1000
Measured iterations: 10000

OBJECT-ROW OFFSET READER
========================

Open
----
openMs:         17.779083 ms
readerOpenMs:   17.609041 ms

Stats
-----
bytes:          9,261,455
lines:          15,223
nodes:          15,223
anchors:        15,223
person rows:    10,000

Memory Delta
------------
rss               26.89 MB
heapTotal         11.69 MB
heapUsed           7.04 MB
external           8.83 MB
arrayBuffers       8.83 MB

Correctness
-----------
answer:         James Miller
company:        Summit Dynamics 228-1
industry:       Agriculture

Candidate Counts
----------------
{
  topicMatches: 10000,
  statusMatches: 3396,
  ageMatches: 1095,
  industryMatches: 117,
  finalMatches: 117
}

Benchmarks
----------
search             avg: 0.000194 ms | ops/sec: 5143151.919
search explain     avg: 0.000367 ms | ops/sec: 2725105.278
limit 10 explain   avg: 0.001803 ms | ops/sec: 554609.392
debugSearch        avg: 0.042251 ms | ops/sec: 23667.929

COMPACT TYPED-ARRAY OFFSET READER
=================================

Open
----
openMs:         29.458250 ms
readerOpenMs:   29.270500 ms

Stats
-----
bytes:          9,261,455
lines:          15,223
nodes:          15,223
anchors:        15,223
people:         10,000
companies:      1,000
layout:         compact-typed-arrays

Memory Delta
------------
rss               20.75 MB
heapTotal          4.75 MB
heapUsed           1.52 MB
external           9.01 MB
arrayBuffers       9.01 MB

Correctness
-----------
answer:         James Miller
company:        Summit Dynamics 228-1
industry:       Agriculture

Candidate Counts
----------------
{
  topicMatches: 10000,
  statusMatches: 3396,
  ageMatches: 1095,
  industryMatches: 117,
  finalMatches: 117
}

Benchmarks
----------
search             avg: 0.000201 ms | ops/sec: 4979665.536
search explain     avg: 0.000371 ms | ops/sec: 2695811.625
limit 10 explain   avg: 0.001808 ms | ops/sec: 552978.828
debugSearch        avg: 0.021285 ms | ops/sec: 46981.681

COMPARISON
==========

open time difference:     11.679167 ms
rss reduction:            6.14 MB
heapUsed reduction:       5.51 MB
arrayBuffers difference:  185.55 KB
debugSearch speedup:      1.985x
search speed ratio:       0.968x
sherbondy@Kristophers-MacBook-Pro relaydb-4tag-benchmark % git add scripts/relay-search/benchmark-reader-isolated.js scripts/relay-search/compare-offset-readers-isolated.js
sherbondy@Kristophers-MacBook-Pro relaydb-4tag-benchmark % git commit -m "Add isolated offset reader benchmark comparison"
[compact-offset-reader 2a328d9] Add isolated offset reader benchmark comparison
 2 files changed, 447 insertions(+)
 create mode 100644 scripts/relay-search/benchmark-reader-isolated.js
 create mode 100644 scripts/relay-search/compare-offset-readers-isolated.js
sherbondy@Kristophers-MacBook-Pro relaydb-4tag-benchmark % ls scripts
analyze-torture-loc.js                          convert-skate-reddit.js                         raw-people-companies-normalized-graph-v2.js
benchmark-jsonl.js                              four-tag-normalized-runtime-graph-v2.js         raw-people-companies-normalized-graph.js
benchmark-people-companies-normalized-v2.js     four-tag-normalized-runtime-graph.js            relay-search
benchmark-people-companies-normalized.js        generate-large-raw-dataset.js                   runtime-shape-factory.js
benchmark-people-companies.js                   profile-jsonl.js                                torture-query-people-companies.js
convert-people-companies-v2.js                  query-benchmark.js
convert-people-companies.js                     query-throughput-benchmark.js
sherbondy@Kristophers-MacBook-Pro relaydb-4tag-benchmark % ls scripts/relay-search
benchmark-compact-offset-search.js      compare-offset-readers-isolated.js      relay-db.js                             search-executor.js
benchmark-offset-search.js              compare-offset-readers.js               relay-offset-compact-db.js              search-parser.js
benchmark-reader-isolated.js            debug-search.js                         relay-offset-db.js                      search-planner.js
benchmark-search.js                     demo-search.js                          result-hydrator.js                      tiny-lru.js
sherbondy@Kristophers-MacBook-Pro relaydb-4tag-benchmark % find scripts -maxdepth 2 -type f | sort
scripts/analyze-torture-loc.js
scripts/benchmark-jsonl.js
scripts/benchmark-people-companies-normalized-v2.js
scripts/benchmark-people-companies-normalized.js
scripts/benchmark-people-companies.js
scripts/convert-people-companies-v2.js
scripts/convert-people-companies.js
scripts/convert-skate-reddit.js
scripts/four-tag-normalized-runtime-graph-v2.js
scripts/four-tag-normalized-runtime-graph.js
scripts/generate-large-raw-dataset.js
scripts/profile-jsonl.js
scripts/query-benchmark.js
scripts/query-throughput-benchmark.js
scripts/raw-people-companies-normalized-graph-v2.js
scripts/raw-people-companies-normalized-graph.js
scripts/relay-search/benchmark-compact-offset-search.js
scripts/relay-search/benchmark-offset-search.js
scripts/relay-search/benchmark-reader-isolated.js
scripts/relay-search/benchmark-search.js
scripts/relay-search/compare-offset-readers-isolated.js
scripts/relay-search/compare-offset-readers.js
scripts/relay-search/debug-search.js
scripts/relay-search/demo-search.js
scripts/relay-search/relay-db.js
scripts/relay-search/relay-offset-compact-db.js
scripts/relay-search/relay-offset-db.js
scripts/relay-search/result-hydrator.js
scripts/relay-search/search-executor.js
scripts/relay-search/search-parser.js
scripts/relay-search/search-planner.js
scripts/relay-search/tiny-lru.js
scripts/runtime-shape-factory.js
scripts/torture-query-people-companies.js
sherbondy@Kristophers-MacBook-Pro relaydb-4tag-benchmark % node scripts/generate-large-raw-dataset.js

Generated RelayDB raw benchmark dataset
=======================================
Companies: 1000
People:    10000
Company file: /Users/sherbondy/Desktop/projects/relaydb-4tag-benchmark/datasets/generated/companies.1000.jsonl
People file:  /Users/sherbondy/Desktop/projects/relaydb-4tag-benchmark/datasets/generated/people.10000.jsonl

sherbondy@Kristophers-MacBook-Pro relaydb-4tag-benchmark % node scripts/convert-people-companies-v2.js

People + Companies v2 conversion complete.
-------------------------------------------
Status:                 complete
Convert time:           109.277 ms

Raw companies:          1000 records
Raw people:             10000 records

Tagged companies:       2030 nodes
Tagged people:          13184 nodes
Raw merged:             11000 records
Tagged merged:          15194 nodes

Duplicate company ids:  0
Duplicate company names:0
Duplicate person ids:   0
Duplicate person emails:0

Person-company links:   10000 linked
Missing company links:  0 missing

Unique anchors:         15194
Duplicate anchors:      0

Tagged merged size:     8.83 MB
Raw merged size:        5.67 MB

Report:                 /Users/sherbondy/Desktop/projects/relaydb-4tag-benchmark/reports/people-companies.1000x10000.convert.report.json

sherbondy@Kristophers-MacBook-Pro relaydb-4tag-benchmark % node scripts/relay-search/compare-offset-readers-isolated.js 1000 10000 datasets/generated/merged/people-companies.5000x50000.4tag.merged.jsonl
RelayDB Isolated Offset Reader Comparison
=========================================
Dataset: /Users/sherbondy/Desktop/projects/relaydb-4tag-benchmark/datasets/generated/merged/people-companies.5000x50000.4tag.merged.jsonl
Warmup iterations: 1000
Measured iterations: 10000


{"readerKind":"object","label":"object-row offset reader","error":"Missing file: /Users/sherbondy/Desktop/projects/relaydb-4tag-benchmark/datasets/generated/merged/people-companies.5000x50000.4tag.merged.jsonl","stack":"Error: Missing file: /Users/sherbondy/Desktop/projects/relaydb-4tag-benchmark/datasets/generated/merged/people-companies.5000x50000.4tag.merged.jsonl\n    at RelayOffsetDB.open (/Users/sherbondy/Desktop/projects/relaydb-4tag-benchmark/scripts/relay-search/relay-offset-db.js:54:13)\n    at main (/Users/sherbondy/Desktop/projects/relaydb-4tag-benchmark/scripts/relay-search/benchmark-reader-isolated.js:67:32)\n    at Object.<anonymous> (/Users/sherbondy/Desktop/projects/relaydb-4tag-benchmark/scripts/relay-search/benchmark-reader-isolated.js:50:1)\n    at Module._compile (node:internal/modules/cjs/loader:1829:14)\n    at Object..js (node:internal/modules/cjs/loader:1969:10)\n    at Module.load (node:internal/modules/cjs/loader:1552:32)\n    at Module._load (node:internal/modules/cjs/loader:1354:12)\n    at wrapModuleLoad (node:internal/modules/cjs/loader:255:19)\n    at Module.executeUserEntryPoint [as runMain] (node:internal/modules/run_main:154:5)\n    at node:internal/main/run_main_module:33:47"}

/Users/sherbondy/Desktop/projects/relaydb-4tag-benchmark/scripts/relay-search/compare-offset-readers-isolated.js:78
    throw new Error(`Child benchmark failed for reader: ${readerKind}`);
    ^

Error: Child benchmark failed for reader: object
    at runChild (/Users/sherbondy/Desktop/projects/relaydb-4tag-benchmark/scripts/relay-search/compare-offset-readers-isolated.js:78:11)
    at main (/Users/sherbondy/Desktop/projects/relaydb-4tag-benchmark/scripts/relay-search/compare-offset-readers-isolated.js:45:24)
    at Object.<anonymous> (/Users/sherbondy/Desktop/projects/relaydb-4tag-benchmark/scripts/relay-search/compare-offset-readers-isolated.js:35:1)
    at Module._compile (node:internal/modules/cjs/loader:1829:14)
    at Object..js (node:internal/modules/cjs/loader:1969:10)
    at Module.load (node:internal/modules/cjs/loader:1552:32)
    at Module._load (node:internal/modules/cjs/loader:1354:12)
    at wrapModuleLoad (node:internal/modules/cjs/loader:255:19)
    at Module.executeUserEntryPoint [as runMain] (node:internal/modules/run_main:154:5)
    at node:internal/main/run_main_module:33:47

Node.js v25.8.2
sherbondy@Kristophers-MacBook-Pro relaydb-4tag-benchmark % node scripts/generate-large-raw-dataset.js 5000 50000

Generated RelayDB raw benchmark dataset
=======================================
Companies: 5000
People:    50000
Company file: /Users/sherbondy/Desktop/projects/relaydb-4tag-benchmark/datasets/generated/companies.5000.jsonl
People file:  /Users/sherbondy/Desktop/projects/relaydb-4tag-benchmark/datasets/generated/people.50000.jsonl

sherbondy@Kristophers-MacBook-Pro relaydb-4tag-benchmark % node scripts/convert-people-companies-v2.js 5000 50000

People + Companies v2 conversion complete.
-------------------------------------------
Status:                 complete
Convert time:           535.045 ms

Raw companies:          5000 records
Raw people:             50000 records

Tagged companies:       10030 nodes
Tagged people:          65877 nodes
Raw merged:             55000 records
Tagged merged:          75887 nodes

Duplicate company ids:  0
Duplicate company names:0
Duplicate person ids:   0
Duplicate person emails:0

Person-company links:   50000 linked
Missing company links:  0 missing

Unique anchors:         75887
Duplicate anchors:      0

Tagged merged size:     44.24 MB
Raw merged size:        28.43 MB

Report:                 /Users/sherbondy/Desktop/projects/relaydb-4tag-benchmark/reports/people-companies.5000x50000.convert.report.json

sherbondy@Kristophers-MacBook-Pro relaydb-4tag-benchmark % ls -lh datasets/generated/merged | grep 5000x50000
-rw-r--r--@ 1 sherbondy  staff    44M May 22 15:50 people-companies.5000x50000.4tag.merged.jsonl
-rw-r--r--@ 1 sherbondy  staff    28M May 22 15:50 people-companies.5000x50000.raw.merged.jsonl
sherbondy@Kristophers-MacBook-Pro relaydb-4tag-benchmark % node scripts/relay-search/compare-offset-readers-isolated.js 1000 10000 datasets/generated/merged/people-companies.5000x50000.4tag.merged.jsonl
RelayDB Isolated Offset Reader Comparison
=========================================
Dataset: /Users/sherbondy/Desktop/projects/relaydb-4tag-benchmark/datasets/generated/merged/people-companies.5000x50000.4tag.merged.jsonl
Warmup iterations: 1000
Measured iterations: 10000

OBJECT-ROW OFFSET READER
========================

Open
----
openMs:         82.187292 ms
readerOpenMs:   82.008250 ms

Stats
-----
bytes:          46,393,080
lines:          75,887
nodes:          75,887
anchors:        75,887
person rows:    50,000

Memory Delta
------------
rss              108.50 MB
heapTotal         56.41 MB
heapUsed          26.12 MB
external          44.24 MB
arrayBuffers      44.24 MB

Correctness
-----------
answer:         Jessica Jackson
company:        Liberty Industries 987-1
industry:       Agriculture

Candidate Counts
----------------
{
  topicMatches: 50000,
  statusMatches: 16682,
  ageMatches: 5673,
  industryMatches: 512,
  finalMatches: 512
}

Benchmarks
----------
search             avg: 0.000205 ms | ops/sec: 4884202.876
search explain     avg: 0.000358 ms | ops/sec: 2796811.635
limit 10 explain   avg: 0.001812 ms | ops/sec: 551899.223
debugSearch        avg: 0.283965 ms | ops/sec: 3521.563

COMPACT TYPED-ARRAY OFFSET READER
=================================

Open
----
openMs:         130.299000 ms
readerOpenMs:   130.083458 ms

Stats
-----
bytes:          46,393,080
lines:          75,887
nodes:          75,887
anchors:        75,887
people:         50,000
companies:      5,000
layout:         compact-typed-arrays

Memory Delta
------------
rss               74.38 MB
heapTotal         22.27 MB
heapUsed          11.64 MB
external          45.15 MB
arrayBuffers      45.15 MB

Correctness
-----------
answer:         Jessica Jackson
company:        Liberty Industries 987-1
industry:       Agriculture

Candidate Counts
----------------
{
  topicMatches: 50000,
  statusMatches: 16682,
  ageMatches: 5673,
  industryMatches: 512,
  finalMatches: 512
}

Benchmarks
----------
search             avg: 0.000192 ms | ops/sec: 5206524.608
search explain     avg: 0.000365 ms | ops/sec: 2740132.168
limit 10 explain   avg: 0.001806 ms | ops/sec: 553708.599
debugSearch        avg: 0.149183 ms | ops/sec: 6703.189

COMPARISON
==========

open time difference:     48.111708 ms
rss reduction:            34.13 MB
heapUsed reduction:       14.49 MB
arrayBuffers difference:  927.73 KB
debugSearch speedup:      1.903x
search speed ratio:       1.066x
sherbondy@Kristophers-MacBook-Pro relaydb-4tag-benchmark % cat > reports/reader-benchmarks/offset-readers-isolated-5000x50000.md
^C
sherbondy@Kristophers-MacBook-Pro relaydb-4tag-benchmark % 