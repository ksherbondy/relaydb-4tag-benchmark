RelayDB Columnar Artifact v0 Stress Test
========================================
Artifact: /Users/sherbondy/Desktop/projects/relaydb-4tag-benchmark/builds/relay-columnar/people-companies.10000x100000.columnar.relayc
Warmup iterations: 1000
Measured iterations: 10000

Open Precompiled Artifact
-------------------------
Open time:  9.416917 ms
Bytes:      94,317,466
People:     100,000
Companies:  10,000

Memory Delta During Open
------------------------
rss               50.02 MB ->    146.00 MB | delta     95.98 MB
heapTotal          4.64 MB ->      4.89 MB | delta    256.00 KB
heapUsed           3.52 MB ->      3.55 MB | delta     27.36 KB
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

Runtime Bitset Cache
--------------------
Cached bitsets: 5
  person.status.eq.2
  person.age.gt.50
  person.status.eq.3
  person.age.between.30.60
  person.age.between.18.25

Benchmarks
----------
Q1 active agriculture under40 limit1       warmup blackhole: 226000
Q1 active agriculture under40 limit1       total: 14.479375 ms | avg: 0.001448 ms | ops/sec: 690637.545 | blackhole: 2260000

Q2 active agriculture under40 count        warmup blackhole: 1096000
Q2 active agriculture under40 count        total: 104.302667 ms | avg: 0.010430 ms | ops/sec: 95874.826 | blackhole: 10960000

Q3 active under40 count                    warmup blackhole: 11275000
Q3 active under40 count                    total: 85.697167 ms | avg: 0.008570 ms | ops/sec: 116689.972 | blackhole: 112750000

Q4 agriculture under40 count               warmup blackhole: 3428000
Q4 agriculture under40 count               total: 84.924625 ms | avg: 0.008492 ms | ops/sec: 117751.477 | blackhole: 34280000

Q5 inactive over50 count                   warmup blackhole: 16419000
Q5 inactive over50 count                   total: 89.518708 ms | avg: 0.008952 ms | ops/sec: 111708.493 | blackhole: 164190000

Q6 pending agriculture age30to60 count     warmup blackhole: 1654000
Q6 pending agriculture age30to60 count     total: 104.290083 ms | avg: 0.010429 ms | ops/sec: 95886.394 | blackhole: 16540000

Q7 agriculture age18to25 limit10 hydrate   warmup blackhole: 2623000
Q7 agriculture age18to25 limit10 hydrate   total: 201.833417 ms | avg: 0.020183 ms | ops/sec: 49545.809 | blackhole: 26230000

Q8 group by status x agriculture           warmup blackhole: 100000000
Q8 group by status x agriculture           total: 3052.470000 ms | avg: 0.305247 ms | ops/sec: 3276.035 | blackhole: 1000000000

