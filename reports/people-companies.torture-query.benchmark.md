# People + Companies Torture Query Benchmark

Generated: 2026-05-21T08:45:26.756Z

## Configuration

| Metric | Value |
|---|---:|
| Iterations | 5 |
| Query suites per run | 1,000 |
| Queries per suite | 8 |

## Performance Results

| Lane | Files | Records | Nodes | Bytes Loaded | Missing Links | Load + Parse Avg | Graph Build Avg | Query Suite Avg | Total Avg |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Raw Split JSONL | 2 | 38 | N/A | 16.72 KB | 0 | 0.320734 ms | 0.018058 ms | 11.153108 ms | 11.4919 ms |
| Raw Merged JSONL | 1 | 38 | N/A | 17.52 KB | 0 | 0.17 ms | 0.020417 ms | 11.071067 ms | 11.261484 ms |
| Tagged Split JSONL | 2 | N/A | 101 | 33.21 KB | 0 | 0.398333 ms | 0.025475 ms | 11.336542 ms | 11.76035 ms |
| Tagged Merged JSONL | 1 | N/A | 100 | 33.08 KB | 0 | 0.264108 ms | 0.027625 ms | 13.344342 ms | 13.636075 ms |

## Result Equivalence

| Comparison | Match? |
|---|---|
| Raw Split vs Raw Merged | true |
| Raw Split vs Tagged Split | true |
| Raw Split vs Tagged Merged | true |

## Query Result Counts

| Query | Raw Split | Raw Merged | Tagged Split | Tagged Merged |
|---|---:|---:|---:|---:|
| peopleHomeStateDiffersFromCompanyState | 28 | 28 | 28 | 28 |
| householdsWithMultipleCompanies | 8 | 8 | 8 | 8 |
| peopleSharingInterestsWithCoworkers | 21 | 21 | 21 | 21 |
| companiesWithEmployeesAcrossMultipleHomeStates | 8 | 8 | 8 | 8 |
| activeUnder40AtOldCompanies | 4 | 4 | 4 | 4 |
| highEarnersInIndustriesAcrossMultipleStates | 12 | 12 | 12 | 12 |
| householdDiversitySummaries | 12 | 12 | 12 | 12 |
| contextPackets | 30 | 30 | 30 | 30 |

## Runtime Burden

| Lane | File Loads | Source Split Required | App-Specific Join Logic | Runtime Relationship Resolution | Runtime Missing Ref Validation | Relationship Model |
|---|---:|---|---|---|---|---|
| Raw Split JSONL | 2 | No | Yes | Yes | Yes | company name joins and custom maps |
| Raw Merged JSONL | 1 | Yes | Yes | Yes | Yes | record type branching, company name joins, and custom maps |
| Tagged Split JSONL | 2 | No | No | mechanical anchor traversal | Yes | # anchors, ^ topics, @ relationships, ~ metadata |
| Tagged Merged JSONL | 1 | No | No | mechanical anchor traversal | Yes | # anchors, ^ topics, @ relationships, ~ metadata |

## Notes

- This benchmark intentionally runs relationship-heavy queries.
- Each query suite contains 8 graph-shaped questions.
- The goal is to test runtime assembly burden, not only simple lookup speed.
- This benchmark does not test compiled Relay artifacts yet.
