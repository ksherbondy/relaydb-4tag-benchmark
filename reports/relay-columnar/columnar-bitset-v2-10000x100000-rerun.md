RelayDB Columnar Bitset v2 Benchmark
====================================
Dataset: /Users/sherbondy/Desktop/projects/relaydb-4tag-benchmark/datasets/generated/merged/people-companies.10000x100000.4tag.merged.jsonl
Question: active agriculture people under 40
Warmup iterations: 1000
Measured iterations: 10000

Open / Build Columnar Runtime
-----------------------------
Open time:  442.752500 ms
Bytes:      92,778,700
Lines:      151,676
People:     100,000
Companies:  10,000
Bit words:  3,125

Memory Delta During Open
------------------------
rss               49.88 MB ->    151.31 MB | delta    101.44 MB
heapTotal          4.64 MB ->     10.33 MB | delta      5.69 MB
heapUsed           3.52 MB ->      7.01 MB | delta      3.49 MB
external           1.56 MB ->     91.89 MB | delta     90.33 MB
arrayBuffers      22.23 KB ->     90.35 MB | delta     90.33 MB

Correctness
-----------
Answer:   person:fe993b58-1a27-4c47-966c-8ead8257141f
Company:  BrightPath Labs 2922-1
Industry: Agriculture

Candidate Counts
----------------
{
  topicMatches: 100000,
  statusMatches: 33466,
  ageMatches: 33631,
  industryMatches: 10140,
  finalMatches: 1096
}

Initial Timings
---------------
{
  bitsetAndMs: 0.19258299999995643,
  countFinalMs: 0.12029200000000628,
  collectLimitedMs: 0.01591600000000426,
  hydrateMs: 0.06708400000002257,
  totalMs: 0.39587499999998954
}

Warmup
------
answerOnly         blackhole: 256000
debugStyle         blackhole: 1149000

Benchmark
---------
answerOnly         total: 14.791459 ms | avg: 0.001479 ms | ops/sec: 676065.830 | blackhole: 2560000
debugStyle         total: 332.148791 ms | avg: 0.033215 ms | ops/sec: 30106.989 | blackhole: 11490000
