sherbondy@Kristophers-MacBook-Pro relaydb-4tag-benchmark % node --expose-gc scripts/relay-columnar/benchmark-columnar-bitset-people-companies.js 1000 10000 datasets/generated/merged/people-companies.10000x100000.4tag.merged.jsonl
RelayDB Columnar Bitset Benchmark
=================================
Dataset: /Users/sherbondy/Desktop/projects/relaydb-4tag-benchmark/datasets/generated/merged/people-companies.10000x100000.4tag.merged.jsonl
Question: active agriculture people under 40
Warmup iterations: 1000
Measured iterations: 10000

Open / Build Columnar Runtime
-----------------------------
Open time:  165.820250 ms
Bytes:      92,778,700
Lines:      151,676
People:     100,000
Companies:  10,000
Bit words:  3,125

Memory Delta During Open
------------------------
rss               51.03 MB ->    463.17 MB | delta    412.14 MB
heapTotal          4.64 MB ->    189.78 MB | delta    185.14 MB
heapUsed           3.65 MB ->    155.55 MB | delta    151.89 MB
external           1.65 MB ->      2.68 MB | delta      1.03 MB
arrayBuffers      22.23 KB ->      1.05 MB | delta      1.03 MB

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

Warmup
------
answerOnly         blackhole: 1000
debugStyle         blackhole: 1106000

Benchmark
---------
answerOnly         total: 111.179334 ms | avg: 0.011118 ms | ops/sec: 89944.773 | blackhole: 10000
debugStyle         total: 178.629083 ms | avg: 0.017863 ms | ops/sec: 55981.925 | blackhole: 11060000