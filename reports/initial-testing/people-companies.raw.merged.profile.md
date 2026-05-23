# JSONL Profile Report: people-companies.raw.merged.jsonl

Generated: 2026-05-21T08:11:54.204Z

## Summary

| Metric | Value |
|---|---:|
| File size | 17.52 KB |
| Total lines | 38 |
| Valid JSON lines | 38 |
| Invalid JSON lines | 0 |
| Blank lines | 0 |
| Valid JSON ratio | 1 |
| Profile time | 2.833 ms |
| Max nesting depth | 4 |
| Avg top-level fields | 7.211 |
| Avg record size | 471.237 bytes |

## Top-Level Fields

| Field | Count | Types | Example |
|---|---:|---|---|
| __source_file | 38 | string:38 | <code>"companies.jsonl"</code> |
| __record_type | 38 | string:38 | <code>"company"</code> |
| id | 38 | string:38 | <code>"65e832c8-bc4e-454e-be7a-49236b829f86"</code> |
| created_at | 30 | string:30 | <code>"2022-02-02T20:06:48.408546Z"</code> |
| status | 30 | string:30 | <code>"pending"</code> |
| household_id | 30 | string:30 | <code>"30bfd16b-cb7b-4ca9-8aab-394354d4d434"</code> |
| person | 30 | object:30 | <code>"{\"name\":{\"first\":\"Daniel\",\"last\":\"Moore\"},\"age\":58,\"gender\":\"male\",\"email\":\"dani...</code> |
| name | 8 | string:8 | <code>"Elite Services Inc"</code> |
| industry | 8 | string:8 | <code>"Agriculture"</code> |
| headquarters | 8 | object:8 | <code>{"city":"New York","state":"NY","country":"USA"}</code> |
| size | 8 | number:8 | <code>3408</code> |
| founded | 8 | number:8 | <code>2019</code> |

## Possible ID Fields

| Field | Count | Types | Example |
|---|---:|---|---|
| id | 38 | string:38 | <code>"65e832c8-bc4e-454e-be7a-49236b829f86"</code> |
| household_id | 30 | string:30 | <code>"30bfd16b-cb7b-4ca9-8aab-394354d4d434"</code> |

## Possible Relationship Fields

| Field | Count | Types | Example |
|---|---:|---|---|
| __source_file | 38 | string:38 | <code>"companies.jsonl"</code> |

## Possible Metadata Fields

| Field | Count | Types | Example |
|---|---:|---|---|
| __source_file | 38 | string:38 | <code>"companies.jsonl"</code> |
| __record_type | 38 | string:38 | <code>"company"</code> |
| created_at | 30 | string:30 | <code>"2022-02-02T20:06:48.408546Z"</code> |
| status | 30 | string:30 | <code>"pending"</code> |
| person.location.country | 30 | string:30 | <code>"USA"</code> |
| headquarters.country | 8 | string:8 | <code>"USA"</code> |

## Sample Records

### Sample 1

```json
{
  "__source_file": "companies.jsonl",
  "__record_type": "company",
  "id": "65e832c8-bc4e-454e-be7a-49236b829f86",
  "name": "Elite Services Inc",
  "industry": "Agriculture",
  "headquarters": {
    "city": "New York",
    "state": "NY",
    "country": "USA"
  },
  "size": 3408,
  "founded": 2019
}
```

### Sample 2

```json
{
  "__source_file": "companies.jsonl",
  "__record_type": "company",
  "id": "3c92e335-8372-40d0-a967-7dce318ebec9",
  "name": "Tech Solutions Inc",
  "industry": "Transportation",
  "headquarters": {
    "city": "Syracuse",
    "state": "NY",
    "country": "USA"
  },
  "size": 19776,
  "founded": 1953
}
```

### Sample 3

```json
{
  "__source_file": "companies.jsonl",
  "__record_type": "company",
  "id": "dc21495f-dd86-4b7c-8251-7be67a306e74",
  "name": "Elite Group",
  "industry": "Consulting",
  "headquarters": {
    "city": "Raleigh",
    "state": "NC",
    "country": "USA"
  },
  "size": 7273,
  "founded": 2007
}
```

### Sample 4

```json
{
  "__source_file": "companies.jsonl",
  "__record_type": "company",
  "id": "475dcc3c-d2eb-4750-a8ce-40e6e459409d",
  "name": "Smart Labs Inc",
  "industry": "Agriculture",
  "headquarters": {
    "city": "Warren",
    "state": "MI",
    "country": "USA"
  },
  "size": 13898,
  "founded": 1993
}
```

### Sample 5

```json
{
  "__source_file": "companies.jsonl",
  "__record_type": "company",
  "id": "2bc745e6-618d-4865-a2f6-a060c736930a",
  "name": "Global Labs LLC",
  "industry": "Consulting",
  "headquarters": {
    "city": "Springfield",
    "state": "IL",
    "country": "USA"
  },
  "size": 3219,
  "founded": 1995
}
```
