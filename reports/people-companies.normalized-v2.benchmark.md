# People + Companies Normalized Runtime Benchmark V2

Generated: 2026-05-21T09:24:57.774Z

## Configuration

| Metric | Value |
|---|---:|
| Iterations | 5 |
| Query suites per run | 1,000 |
| Queries per suite | 8 |

## Performance Results

| Lane | Records | Nodes | Bytes Loaded | Missing Links | Load + Parse Avg | Split Avg | Normalize Avg | Query Avg | Total Avg |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Raw Normalized Runtime Graph | 38 | N/A | 17.52 KB | 0 | 0.290825 ms | 0.003242 ms | 0.047942 ms | 7.714958 ms | 8.056967 ms |
| Tagged Normalized Runtime Graph | N/A | 100 | 33.08 KB | 0 | 0.334775 ms | 0 ms | 0.141217 ms | 7.650183 ms | 8.126175 ms |

## Result Equivalence

| Comparison | Match? |
|---|---|
| Raw Normalized vs Tagged Normalized | true |

## Query Result Counts

| Query | Raw Normalized | Tagged Normalized |
|---|---:|---:|
| peopleHomeStateDiffersFromCompanyState | 28 | 28 |
| householdsWithMultipleCompanies | 8 | 8 |
| peopleSharingInterestsWithCoworkers | 21 | 21 |
| companiesWithEmployeesAcrossMultipleHomeStates | 8 | 8 |
| activeUnder40AtOldCompanies | 4 | 4 |
| highEarnersInIndustriesAcrossMultipleStates | 12 | 12 |
| householdDiversitySummaries | 12 | 12 |
| contextPackets | 30 | 30 |

## Optimization Model

| Lane | Model |
|---|---|
| Raw Normalized | schema-specific raw normalizer for people + companies dataset |
| Tagged Normalized | generic 4-tag graph normalizer plus people-companies view |

## Notes

- This benchmark gives raw JSONL a fair optimized lane.
- Raw normalization is schema-specific.
- Tagged normalization starts from the generic 4-tag contract.
- This still does not test compiled `.relay` artifacts.
