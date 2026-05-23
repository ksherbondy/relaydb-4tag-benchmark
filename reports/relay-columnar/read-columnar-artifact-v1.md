RelayDB Columnar Artifact Reader v1
===================================
Artifact: /Users/sherbondy/Desktop/projects/relaydb-4tag-benchmark/builds/relay-columnar/people-companies.10000x100000.columnar.v1.relayc
Question: active agriculture people under 40
Warmup iterations: 1000
Measured iterations: 10000

Open Precompiled Artifact
-------------------------
Open time:  6.702292 ms
Bytes:      94,318,188
People:     100,000
Companies:  10,000
Alignment:  8 bytes

Memory Delta During Open
------------------------
rss               50.00 MB ->    140.19 MB | delta     90.19 MB
heapTotal          4.64 MB ->      4.89 MB | delta    256.00 KB
heapUsed           3.51 MB ->      3.54 MB | delta     24.27 KB
external           1.56 MB ->     91.51 MB | delta     89.95 MB
arrayBuffers      22.23 KB ->     89.97 MB | delta     89.95 MB

Section Alignment Check
-----------------------
Aligned: true
Sections checked: 12

Correctness
-----------
Answer:   David Jackson
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
answerOnly         blackhole: 226000
debugStyle         blackhole: 1119000

Benchmark
---------
answerOnly         total: 14.736500 ms | avg: 0.001474 ms | ops/sec: 678587.181 | blackhole: 2260000
debugStyle         total: 347.736625 ms | avg: 0.034774 ms | ops/sec: 28757.396 | blackhole: 11190000
