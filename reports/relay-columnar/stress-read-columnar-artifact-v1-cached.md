RelayDB Columnar Artifact v1 Stress Test
========================================
Artifact: /Users/sherbondy/Desktop/projects/relaydb-4tag-benchmark/builds/relay-columnar/people-companies.10000x100000.columnar.v1.relayc
Warmup iterations: 1000
Measured iterations: 10000

Open Precompiled Artifact
-------------------------
Open time:  6.978917 ms
Bytes:      94,318,188
People:     100,000
Companies:  10,000

Memory Delta During Open
------------------------
rss               50.00 MB ->    140.19 MB | delta     90.19 MB
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
Q1 active agriculture under40 limit1       total: 14.822250 ms | avg: 0.001482 ms | ops/sec: 674661.404 | blackhole: 2260000

Q2 active agriculture under40 count        warmup blackhole: 1096000
Q2 active agriculture under40 count        total: 103.681000 ms | avg: 0.010368 ms | ops/sec: 96449.687 | blackhole: 10960000

Q3 active under40 count                    warmup blackhole: 11275000
Q3 active under40 count                    total: 86.437958 ms | avg: 0.008644 ms | ops/sec: 115689.915 | blackhole: 112750000

Q4 agriculture under40 count               warmup blackhole: 3428000
Q4 agriculture under40 count               total: 87.406584 ms | avg: 0.008741 ms | ops/sec: 114407.857 | blackhole: 34280000

Q5 inactive over50 count                   warmup blackhole: 16419000
Q5 inactive over50 count                   total: 88.936667 ms | avg: 0.008894 ms | ops/sec: 112439.563 | blackhole: 164190000

Q6 pending agriculture age30to60 count     warmup blackhole: 1654000
Q6 pending agriculture age30to60 count     total: 102.269584 ms | avg: 0.010227 ms | ops/sec: 97780.783 | blackhole: 16540000

Q7 agriculture age18to25 limit10 hydrate   warmup blackhole: 2623000
Q7 agriculture age18to25 limit10 hydrate   total: 202.252833 ms | avg: 0.020225 ms | ops/sec: 49443.065 | blackhole: 26230000

Q8 group by status x agriculture           warmup blackhole: 100000000
Q8 group by status x agriculture           total: 3233.578333 ms | avg: 0.323358 ms | ops/sec: 3092.549 | blackhole: 1000000000

