RelayDB Generic Columnar Executor Prototype
===========================================
Dataset:  /Users/sherbondy/Desktop/projects/relaydb-4tag-benchmark/datasets/generated/merged/people-companies.10000x100000.4tag.merged.jsonl
Manifest: /Users/sherbondy/Desktop/projects/relaydb-4tag-benchmark/reports/relay-columnar/people-companies.10000x100000.columnar-manifest.v2.json
Question: active agriculture people under 40
Warmup iterations: 1000
Measured iterations: 10000

Open / Build Generic Runtime
----------------------------
Open time:  314.239000 ms
Bytes:      92,778,700
Lines:      151,676
Topics:     7
People:     100,000
Companies:  10,000

Memory Delta During Open
------------------------
rss               50.02 MB ->    215.84 MB | delta    165.83 MB
heapTotal          4.64 MB ->     68.45 MB | delta     63.81 MB
heapUsed           4.02 MB ->     49.19 MB | delta     45.17 MB
external           1.56 MB ->     91.82 MB | delta     90.26 MB
arrayBuffers      22.23 KB ->     90.28 MB | delta     90.26 MB

Query Plan
----------
{
  "kind": "relaydb-columnar-query-plan",
  "topic": "person",
  "executionModel": "bitset-first",
  "limit": 1,
  "hydrate": true,
  "steps": [
    {
      "type": "direct-predicate",
      "topic": "person",
      "fieldId": "attribute:status",
      "operator": "eq",
      "value": "active",
      "lane": {
        "topic": "person",
        "fieldId": "attribute:status",
        "kind": "enum",
        "suggestedLane": "uint8",
        "searchable": true
      },
      "strategy": "precomputed-predicate-bitset",
      "predicateName": "attribute:status.active",
      "outputBitset": "person.attribute:status.active"
    },
    {
      "type": "direct-predicate",
      "topic": "person",
      "fieldId": "attribute:age",
      "operator": "lt",
      "value": 40,
      "lane": {
        "topic": "person",
        "fieldId": "attribute:age",
        "kind": "number",
        "suggestedLane": "uint8",
        "searchable": true
      },
      "strategy": "scan-lane-build-runtime-bitset",
      "outputBitset": "person.attribute:age.lt.40"
    },
    {
      "type": "relationship-predicate",
      "sourceTopic": "person",
      "relationshipFieldId": "relationship:company",
      "targetTopic": "company",
      "targetFieldId": "attribute:industry",
      "operator": "eq",
      "value": "Agriculture",
      "relationshipLane": {
        "topic": "person",
        "fieldId": "relationship:company",
        "kind": "relationship",
        "suggestedLane": "uint32",
        "searchable": true
      },
      "targetLane": {
        "topic": "company",
        "fieldId": "attribute:industry",
        "kind": "enum",
        "suggestedLane": "uint8",
        "searchable": true
      },
      "targetPredicate": {
        "strategy": "precomputed-target-bitset",
        "predicateName": "attribute:industry.agriculture",
        "bitset": "company.attribute:industry.agriculture"
      },
      "strategy": "derive-source-bitset-through-relationship",
      "outputBitset": "person.relationship:company.attribute:industry.agriculture"
    }
  ],
  "finalOperation": {
    "type": "bitset-and",
    "inputs": [
      "person.attribute:status.active",
      "person.attribute:age.lt.40",
      "person.relationship:company.attribute:industry.agriculture"
    ]
  },
  "output": {
    "type": "hydrated-records",
    "topic": "person"
  }
}

Correctness
-----------
Answer:   David Jackson
Company:  BrightPath Labs 2922-1
Industry: Agriculture

Candidate Counts
----------------
{
  topicMatches: 100000,
  finalMatches: 1096,
  'person.attribute:status.active': 33466,
  'person.attribute:age.lt.40': 33631,
  'person.relationship:company.attribute:industry.agriculture': 10140
}

Warmup
------
answerOnly         blackhole: 226000
debugStyle         blackhole: 1119000

Benchmark
---------
answerOnly         total: 16.646375 ms | avg: 0.001665 ms | ops/sec: 600731.390 | blackhole: 2260000
debugStyle         total: 375.686375 ms | avg: 0.037569 ms | ops/sec: 26617.947 | blackhole: 11190000
