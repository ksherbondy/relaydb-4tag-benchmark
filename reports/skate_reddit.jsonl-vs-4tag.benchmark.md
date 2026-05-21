# JSONL vs 4-Tag Benchmark Report

Generated: 2026-05-21T07:06:37.714Z

## Configuration

| Metric | Value |
|---|---:|
| Iterations | 25 |
| Lookup iterations per run | 1,000,000 |
| Raw file size | 12.37 MB |
| 4-tag file size | 18.02 MB |

## Summary

| Metric | Raw JSONL | 4-tag JSONL | Winner / Meaning |
|---|---:|---:|---|
| Records / Nodes | 52,962 | 52,963 | Context |
| Edges | 52,962 | 52,962 | Same |
| Groups | 1 | 2 | Context |
| Load + Parse | 25.794 ms | 47.162 ms | Raw JSONL |
| Structure Build | 27.549 ms | 19.825 ms | 4-tag JSONL |
| Lookup Stress | 25.022 ms | 24.264 ms | 4-tag JSONL |
| Total | 78.468 ms | 91.332 ms | Raw JSONL |

## Notes

- This benchmark compares raw JSONL post-parse structure work against 4-tag JSONL post-parse structure work.
- It does not test RelayDB binary artifacts.
- The raw JSONL path manually synthesizes IDs and subreddit edges.
- The 4-tag path reads identity from #, topic from ^, relationships from @ fields, and metadata from ~ fields.
- The 4-tag file is larger because it carries explicit identity, relationship, topic, and metadata fields.
