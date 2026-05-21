# People + Companies Benchmark

Generated: 2026-05-21T08:20:39.910Z

## Configuration

| Metric | Value |
|---|---:|
| Iterations | 100 |
| Query loops per run | 1,000,000 |
| Target company name | Smart Labs Inc |
| Target company anchor | company:475dcc3c-d2eb-4750-a8ce-40e6e459409d |

## Performance Results

| Lane | Files | Records | Nodes | Bytes Loaded | Missing Links | Load + Parse Avg | Graph Build Avg | Query Avg | Total Avg |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Raw Split JSONL | 2 | 38 | N/A | 16.72 KB | 0 | 0.224323 ms | 0.006272 ms | 4.340416 ms | 4.571011 ms |
| Raw Merged JSONL | 1 | 38 | N/A | 17.52 KB | 0 | 0.144287 ms | 0.006667 ms | 4.409003 ms | 4.559957 ms |
| Tagged Split JSONL | 2 | N/A | 101 | 33.21 KB | 0 | 0.271793 ms | 0.012438 ms | 11.196211 ms | 11.480441 ms |
| Tagged Merged JSONL | 1 | N/A | 100 | 33.08 KB | 0 | 0.181082 ms | 0.011483 ms | 11.165364 ms | 11.357929 ms |

## Runtime Burden

| Lane | File Loads | Source Split Required | Company Name Map Required | Runtime Relationship Resolution | Runtime Missing Ref Validation | App-Specific Join Logic |
|---|---:|---|---|---|---|---|
| Raw Split JSONL | 2 | No | Yes | Yes | Yes | Yes |
| Raw Merged JSONL | 1 | Yes | Yes | Yes | Yes | Yes |
| Tagged Split JSONL | 2 | No | No | mechanical_anchor_resolution | Yes | No |
| Tagged Merged JSONL | 1 | No | No | mechanical_anchor_resolution | Yes | No |

## Notes

- Raw split JSONL represents the normal multi-file source case.
- Raw merged JSONL gives raw JSONL a fair single-file baseline.
- Tagged split JSONL tests the 4-tag source contract without merging.
- Tagged merged JSONL tests the 4-tag source contract as one graph-like JSONL file.
- This benchmark does not test compiled Relay artifacts yet.
