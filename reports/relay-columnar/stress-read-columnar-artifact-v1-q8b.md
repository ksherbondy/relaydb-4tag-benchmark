RelayDB Columnar Artifact v1 Stress Test
========================================
Artifact: /Users/sherbondy/Desktop/projects/relaydb-4tag-benchmark/builds/relay-columnar/people-companies.10000x100000.columnar.v1.relayc
Warmup iterations: 1000
Measured iterations: 10000

Open Precompiled Artifact
-------------------------
Open time:  7.308375 ms
Bytes:      94,318,188
People:     100,000
Companies:  10,000

Memory Delta During Open
------------------------
rss               49.98 MB ->    140.17 MB | delta     90.19 MB
heapTotal          4.64 MB ->      4.89 MB | delta    256.00 KB
heapUsed           3.52 MB ->      3.55 MB | delta     24.88 KB
external           1.56 MB ->     91.51 MB | delta     89.95 MB
arrayBuffers      22.23 KB ->     89.97 MB | delta     89.95 MB

Section Alignment Check
-----------------------
Aligned: true
Sections checked: 12

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
Q8b group by status x agriculture bitsets
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
Q1 active agriculture under40 limit1       total: 14.586959 ms | avg: 0.001459 ms | ops/sec: 685543.848 | blackhole: 2260000

Q2 active agriculture under40 count        warmup blackhole: 1096000
Q2 active agriculture under40 count        total: 104.579166 ms | avg: 0.010458 ms | ops/sec: 95621.340 | blackhole: 10960000

Q3 active under40 count                    warmup blackhole: 11275000
Q3 active under40 count                    total: 87.891625 ms | avg: 0.008789 ms | ops/sec: 113776.483 | blackhole: 112750000

Q4 agriculture under40 count               warmup blackhole: 3428000
Q4 agriculture under40 count               total: 87.793583 ms | avg: 0.008779 ms | ops/sec: 113903.541 | blackhole: 34280000

Q5 inactive over50 count                   warmup blackhole: 16419000
Q5 inactive over50 count                   total: 89.238791 ms | avg: 0.008924 ms | ops/sec: 112058.892 | blackhole: 164190000

Q6 pending agriculture age30to60 count     warmup blackhole: 1654000
Q6 pending agriculture age30to60 count     total: 104.141875 ms | avg: 0.010414 ms | ops/sec: 96022.853 | blackhole: 16540000

Q7 agriculture age18to25 limit10 hydrate   warmup blackhole: 2623000
Q7 agriculture age18to25 limit10 hydrate   total: 205.389875 ms | avg: 0.020539 ms | ops/sec: 48687.892 | blackhole: 26230000

Q8 group by status x agriculture           warmup blackhole: 100000000
Q8 group by status x agriculture           total: 3110.850875 ms | avg: 0.311085 ms | ops/sec: 3214.555 | blackhole: 1000000000

Q8b group by status x agriculture bitsets  warmup blackhole: 100000000
Q8b group by status x agriculture bitsets  total: 235.731084 ms | avg: 0.023573 ms | ops/sec: 42421.219 | blackhole: 1000000000

