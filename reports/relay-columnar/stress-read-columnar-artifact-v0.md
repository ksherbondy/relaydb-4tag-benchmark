RelayDB Columnar Artifact v0 Stress Test
========================================
Artifact: /Users/sherbondy/Desktop/projects/relaydb-4tag-benchmark/builds/relay-columnar/people-companies.10000x100000.columnar.relayc
Warmup iterations: 1000
Measured iterations: 10000

Open Precompiled Artifact
-------------------------
Open time:  9.133625 ms
Bytes:      94,317,466
People:     100,000
Companies:  10,000

Memory Delta During Open
------------------------
rss               50.02 MB ->    146.00 MB | delta     95.98 MB
heapTotal          4.64 MB ->      4.89 MB | delta    256.00 KB
heapUsed           3.52 MB ->      3.54 MB | delta     26.80 KB
external           1.56 MB ->     92.98 MB | delta     91.41 MB
arrayBuffers      22.23 KB ->     91.44 MB | delta     91.41 MB

Correctness / Sanity
--------------------
Q1 active agriculture under40 limit1
  result: index=213, answer=David Jackson
Q2 active agriculture under40 count
  result: count=1,096
Q3 active under40 count
  result: count=11,275
Q4 agriculture under40 count
  result: count=3,428
Q5 inactive over50 count
  result: count=16,419
Q6 pending agriculture age30to60 count
  result: count=1,654
Q7 agriculture age18to25 limit10 hydrate
  result: count=10, indexes=[53, 150, 164, 171, 263, 343, 349, 367, 373, 380]
Q8 group by status x agriculture
  result: {"activeAgriculture":3297,"activeOther":30169,"inactiveAgriculture":3367,"inactiveOther":29823,"pendingAgriculture":3476,"pendingOther":29868,"unknownAgriculture":0,"unknownOther":0}

Benchmarks
----------
Q1 active agriculture under40 limit1       warmup blackhole: 226000
Q1 active agriculture under40 limit1       total: 14.751291 ms | avg: 0.001475 ms | ops/sec: 677906.768 | blackhole: 2260000

Q2 active agriculture under40 count        warmup blackhole: 1096000
Q2 active agriculture under40 count        total: 105.209125 ms | avg: 0.010521 ms | ops/sec: 95048.790 | blackhole: 10960000

Q3 active under40 count                    warmup blackhole: 11275000
Q3 active under40 count                    total: 87.687625 ms | avg: 0.008769 ms | ops/sec: 114041.177 | blackhole: 112750000

Q4 agriculture under40 count               warmup blackhole: 3428000
Q4 agriculture under40 count               total: 88.694375 ms | avg: 0.008869 ms | ops/sec: 112746.722 | blackhole: 34280000

Q5 inactive over50 count                   warmup blackhole: 16419000
Q5 inactive over50 count                   total: 4437.415041 ms | avg: 0.443742 ms | ops/sec: 2253.564 | blackhole: 164190000

Q6 pending agriculture age30to60 count     warmup blackhole: 1654000
Q6 pending agriculture age30to60 count     total: 4494.855334 ms | avg: 0.449486 ms | ops/sec: 2224.766 | blackhole: 16540000

Q7 agriculture age18to25 limit10 hydrate   warmup blackhole: 2623000
Q7 agriculture age18to25 limit10 hydrate   total: 1195.587125 ms | avg: 0.119559 ms | ops/sec: 8364.091 | blackhole: 26230000

Q8 group by status x agriculture           warmup blackhole: 100000000
Q8 group by status x agriculture           total: 2922.906542 ms | avg: 0.292291 ms | ops/sec: 3421.252 | blackhole: 1000000000

