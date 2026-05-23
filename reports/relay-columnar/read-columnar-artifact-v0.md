RelayDB Columnar Artifact Reader v0
===================================
Artifact: /Users/sherbondy/Desktop/projects/relaydb-4tag-benchmark/builds/relay-columnar/people-companies.10000x100000.columnar.relayc
Question: active agriculture people under 40
Warmup iterations: 1000
Measured iterations: 10000

Open Precompiled Artifact
-------------------------
Open time:  9.279458 ms
Bytes:      94,317,466
People:     100,000
Companies:  10,000

Memory Delta During Open
------------------------
rss               49.91 MB ->    145.92 MB | delta     96.02 MB
heapTotal          4.64 MB ->      4.89 MB | delta    256.00 KB
heapUsed           3.51 MB ->      3.54 MB | delta     26.79 KB
external           1.56 MB ->     92.98 MB | delta     91.41 MB
arrayBuffers      22.23 KB ->     91.44 MB | delta     91.41 MB

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
answerOnly         total: 14.640792 ms | avg: 0.001464 ms | ops/sec: 683023.159 | blackhole: 2260000
debugStyle         total: 347.894167 ms | avg: 0.034789 ms | ops/sec: 28744.374 | blackhole: 11190000
