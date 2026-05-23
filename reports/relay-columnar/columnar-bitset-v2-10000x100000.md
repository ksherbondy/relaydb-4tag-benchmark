RelayDB Columnar Bitset v2 Benchmark
====================================
Dataset: /Users/sherbondy/Desktop/projects/relaydb-4tag-benchmark/datasets/generated/merged/people-companies.10000x100000.4tag.merged.jsonl
Question: active agriculture people under 40
Warmup iterations: 1000
Measured iterations: 10000

Open / Build Columnar Runtime
-----------------------------
Open time:  443.110250 ms
Bytes:      92,778,700
Lines:      151,676
People:     100,000
Companies:  10,000
Bit words:  3,125

Memory Delta During Open
------------------------
rss               49.95 MB ->    151.58 MB | delta    101.63 MB
heapTotal          4.64 MB ->     10.33 MB | delta      5.69 MB
heapUsed           3.52 MB ->      6.91 MB | delta      3.39 MB
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
  bitsetAndMs: 0.18954099999996288,
  countFinalMs: 0.13237500000002456,
  collectLimitedMs: 0.016374999999982265,
  hydrateMs: 0.06370900000001711,
  totalMs: 0.4019999999999868
}

Warmup
------
answerOnly         blackhole: 256000
debugStyle         blackhole: 1149000

Benchmark
---------
answerOnly         total: 15.075708 ms | avg: 0.001508 ms | ops/sec: 663318.764 | blackhole: 2560000
debugStyle         total: 329.993542 ms | avg: 0.032999 ms | ops/sec: 30303.623 | blackhole: 11490000
