# JSONL Query Throughput Benchmark

Generated: 2026-05-21T07:20:40.784Z

## Configuration

| Metric | Value |
|---|---:|
| Iterations | 25 |
| Queries per run | 1,000,000 |
| Raw file size | 12.37 MB |
| 4-tag file size | 18.02 MB |

## Results

| Metric | Raw JSONL | 4-tag JSONL | Winner / Meaning |
|---|---:|---:|---|
| Records | 52,962 | 52,963 | Context |
| Indexed records | 52,962 | 52,962 | Context |
| Date buckets | 2,869 | 2,869 | Context |
| Load + Parse | 26.143063 ms | 47.233828 ms | Raw JSONL |
| Date Index Build | 24.041115 ms | 25.575942 ms | Raw JSONL |
| Setup Total | 50.436405 ms | 73.047807 ms | Raw JSONL |
| Exact Query Throughput | 7.748265 ms | 7.238505 ms | 4-tag JSONL |
| Range Query Throughput | 151.403948 ms | 152.06578 ms | Raw JSONL |
| Query-Only Total | 159.152213 ms | 159.304285 ms | Raw JSONL |
| Total With Setup | 209.588618 ms | 232.352092 ms | Raw JSONL |

## Notes

- This benchmark tests hot query throughput after setup.
- Setup includes load, parse, and date-index construction.
- Query-only time excludes setup and measures repeated exact-date and date-range queries.
- Exact-date queries use Map lookups.
- Range queries use binary search over sorted timestamp arrays.
- This benchmark does not test RelayDB binary artifacts.
