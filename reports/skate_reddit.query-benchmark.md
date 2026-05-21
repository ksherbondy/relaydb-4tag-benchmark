# JSONL Date Query Benchmark

Generated: 2026-05-21T07:16:18.524Z

## Configuration

| Metric | Value |
|---|---:|
| Iterations | 25 |
| Exact date | 2012-03-25 |
| Range start | 2012-03-25 |
| Range end exclusive | 2012-04-01 |
| Raw file size | 12.37 MB |
| 4-tag file size | 18.02 MB |

## Results

| Metric | Raw JSONL | 4-tag JSONL | Winner / Meaning |
|---|---:|---:|---|
| Records | 52,962 | 52,963 | Context |
| Indexed timestamp records | 52,962 | 52,962 | Context |
| Date buckets | 2,869 | 2,869 | Context |
| Count on 2012-03-25 | 16 | 16 | Same result |
| Count 2012-03-25 to 2012-04-01 | 127 | 127 | Same result |
| Load + Parse | 26.419375 ms | 47.871358 ms | Raw JSONL |
| Date Index Build | 24.681048 ms | 24.455113 ms | 4-tag JSONL |
| Exact Date Query | 0.000725 ms | 0.00075 ms | Raw JSONL |
| Range Query | 0.001792 ms | 0.001523 ms | 4-tag JSONL |
| Total | 51.113553 ms | 72.33836 ms | Raw JSONL |

## Notes

- This benchmark compares date-query behavior over raw JSONL and 4-tag JSONL.
- Raw JSONL reads timestamps from meta.created_utc.
- 4-tag JSONL reads timestamps from ~created_utc and filters to ^ = reddit_comment.
- Both paths build a date bucket index and a sorted timestamp index before querying.
- Exact-date queries use a Map lookup.
- Range queries use binary search over the sorted timestamp index.
