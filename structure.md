.
├── BASELINE_COMPARISON_SUMMARY.md
├── OFFSET_READER_COMPARISON_SUMMARY.md
├── RELAYDB_READER_ARCHITECTURE.md
├── bytecode-raw-jsonl-scan.log
├── datasets
│   ├── generated
│   │   ├── companies.1000.jsonl
│   │   ├── companies.10000.jsonl
│   │   ├── companies.5000.jsonl
│   │   ├── merged
│   │   │   ├── people-companies.10000x100000.4tag.merged.jsonl
│   │   │   ├── people-companies.10000x100000.raw.merged.jsonl
│   │   │   ├── people-companies.1000x10000.4tag.merged.jsonl
│   │   │   ├── people-companies.1000x10000.raw.merged.jsonl
│   │   │   ├── people-companies.5000x50000.4tag.merged.jsonl
│   │   │   └── people-companies.5000x50000.raw.merged.jsonl
│   │   ├── people.10000.jsonl
│   │   ├── people.100000.jsonl
│   │   ├── people.50000.jsonl
│   │   └── tagged
│   │       ├── companies.1000.4tag.jsonl
│   │       ├── companies.10000.4tag.jsonl
│   │       ├── companies.5000.4tag.jsonl
│   │       ├── people.10000.4tag.jsonl
│   │       ├── people.100000.4tag.jsonl
│   │       └── people.50000.4tag.jsonl
│   ├── merged
│   │   ├── people-companies.4tag.merged.jsonl
│   │   └── people-companies.raw.merged.jsonl
│   ├── raw
│   │   ├── companies.jsonl
│   │   ├── nobel-prize-winners-by-year.json
│   │   ├── oscar-best-picture-award-winners.json
│   │   ├── people.jsonl
│   │   ├── skate_reddit.jsonl
│   │   └── world-population-by-country-2020.json
│   ├── relay
│   └── tagged
│       ├── companies.4tag.jsonl
│       ├── people.4tag.jsonl
│       └── skate_reddit.4tag.jsonl
├── relaydb_phase_1_benchmark_report.md
├── reports
│   ├── companies.1000.profile.json
│   ├── companies.1000.profile.md
│   ├── companies.4tag.profile.json
│   ├── companies.4tag.profile.md
│   ├── companies.profile.json
│   ├── companies.profile.md
│   ├── people-companies.10000x100000.convert.report.json
│   ├── people-companies.1000x10000.convert.report.json
│   ├── people-companies.4tag.merged.profile.json
│   ├── people-companies.4tag.merged.profile.md
│   ├── people-companies.5000x50000.convert.report.json
│   ├── people-companies.benchmark.json
│   ├── people-companies.benchmark.md
│   ├── people-companies.convert.report.json
│   ├── people-companies.normalized-v2.benchmark.json
│   ├── people-companies.normalized-v2.benchmark.md
│   ├── people-companies.normalized.benchmark.json
│   ├── people-companies.normalized.benchmark.md
│   ├── people-companies.raw.merged.profile.json
│   ├── people-companies.raw.merged.profile.md
│   ├── people-companies.torture-query.benchmark.json
│   ├── people-companies.torture-query.benchmark.md
│   ├── people-companies.torture-query.loc-analysis.json
│   ├── people.10000.profile.json
│   ├── people.10000.profile.md
│   ├── people.4tag.profile.json
│   ├── people.4tag.profile.md
│   ├── people.profile.json
│   ├── people.profile.md
│   ├── reader-benchmarks
│   │   ├── offset-readers-isolated-10000x100000-report.md
│   │   ├── offset-readers-isolated-10000x100000.md
│   │   ├── offset-readers-isolated-10000x100000v2.md
│   │   └── offset-readers-isolated-5000x50000.md
│   ├── skate_reddit.4tag.convert.report.json
│   ├── skate_reddit.4tag.profile.json
│   ├── skate_reddit.4tag.profile.md
│   ├── skate_reddit.jsonl-vs-4tag.benchmark.json
│   ├── skate_reddit.jsonl-vs-4tag.benchmark.md
│   ├── skate_reddit.profile.json
│   ├── skate_reddit.profile.md
│   ├── skate_reddit.query-benchmark.json
│   ├── skate_reddit.query-benchmark.md
│   ├── skate_reddit.query-throughput-benchmark.json
│   ├── skate_reddit.query-throughput-benchmark.md
│   ├── v8
│   │   ├── bytecode-offset-executePlan.log
│   │   ├── bytecode-offset-getNodeByAnchorOrRange.log
│   │   ├── bytecode-offset-getOrBuildPlan.log
│   │   ├── bytecode-offset-hydrateMatch.log
│   │   ├── bytecode-offset-search.log
│   │   ├── v8-compact-offset-opt-deopt.log
│   │   ├── v8-offset-cache-opt-deopt.log
│   │   └── v8-offset-cache-split-exec-opt-deopt.log
│   ├── v8-normalized-opt-deopt.log
│   ├── v8-normalized-v2-opt-deopt.log
│   ├── v8-torture-functions.log
│   └── v8-torture-opt-deopt.log
├── scripts
│   ├── analyze-torture-loc.js
│   ├── benchmark-jsonl.js
│   ├── benchmark-people-companies-normalized-v2.js
│   ├── benchmark-people-companies-normalized.js
│   ├── benchmark-people-companies.js
│   ├── convert-people-companies-v2.js
│   ├── convert-people-companies.js
│   ├── convert-skate-reddit.js
│   ├── four-tag-normalized-runtime-graph-v2.js
│   ├── four-tag-normalized-runtime-graph.js
│   ├── generate-large-raw-dataset.js
│   ├── profile-jsonl.js
│   ├── query-benchmark.js
│   ├── query-throughput-benchmark.js
│   ├── raw-people-companies-normalized-graph-v2.js
│   ├── raw-people-companies-normalized-graph.js
│   ├── relay-search
│   │   ├── benchmark-compact-offset-search.js
│   │   ├── benchmark-normalized-js-graph-v2.js
│   │   ├── benchmark-normalized-js-graph.js
│   │   ├── benchmark-offset-search.js
│   │   ├── benchmark-raw-jsonl-scan.js
│   │   ├── benchmark-reader-isolated.js
│   │   ├── benchmark-search.js
│   │   ├── benchmark-sqlite-baseline.js
│   │   ├── compare-offset-readers-isolated.js
│   │   ├── compare-offset-readers.js
│   │   ├── debug-search.js
│   │   ├── demo-search.js
│   │   ├── relay-db.js
│   │   ├── relay-offset-compact-db.js
│   │   ├── relay-offset-db.js
│   │   ├── result-hydrator.js
│   │   ├── search-executor.js
│   │   ├── search-parser.js
│   │   ├── search-planner.js
│   │   └── tiny-lru.js
│   ├── runtime-shape-factory.js
│   └── torture-query-people-companies.js
├── structure.md
├── test.txt
├── v8-normalized-js-graph-opt-deopt.log
├── v8-normalized-js-graph-v2-opt-deopt.log
└── v8-raw-jsonl-opt-deopt.log

14 directories, 133 files
