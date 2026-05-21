# JSONL Profile Report: people-companies.4tag.merged.jsonl

Generated: 2026-05-21T08:18:21.397Z

## Summary

| Metric | Value |
|---|---:|
| File size | 33.08 KB |
| Total lines | 100 |
| Valid JSON lines | 100 |
| Invalid JSON lines | 0 |
| Blank lines | 0 |
| Valid JSON ratio | 1 |
| Profile time | 3.528 ms |
| Max nesting depth | 3 |
| Avg top-level fields | 9.68 |
| Avg record size | 337.69 bytes |

## Top-Level Fields

| Field | Count | Types | Example |
|---|---:|---|---|
| # | 100 | string:100 | <code>"company:65e832c8-bc4e-454e-be7a-49236b829f86"</code> |
| ^ | 100 | string:100 | <code>"company"</code> |
| ~source | 100 | string:100 | <code>"people_companies"</code> |
| ~raw_id | 50 | string:50 | <code>"65e832c8-bc4e-454e-be7a-49236b829f86"</code> |
| ~name | 39 | string:39 | <code>"Elite Services Inc"</code> |
| name | 38 | string:8, object:30 | <code>"Elite Services Inc"</code> |
| @company | 38 | string:38 | <code>"company:475dcc3c-d2eb-4750-a8ce-40e6e459409d"</code> |
| @household | 30 | string:30 | <code>"household:30bfd16b-cb7b-4ca9-8aab-394354d4d434"</code> |
| @company_name | 30 | string:30 | <code>"company_name:smart_labs_inc"</code> |
| @location | 30 | string:30 | <code>"location:usa:ga:columbus"</code> |
| @interests | 30 | array:30 | <code>["interest:sports","interest:yoga","interest:gardening","interest:writing"]</code> |
| ~created_at | 30 | string:30 | <code>"2022-02-02T20:06:48.408546Z"</code> |
| ~created_year | 30 | number:30 | <code>2022</code> |
| ~status | 30 | string:30 | <code>"pending"</code> |
| ~household_id | 30 | string:30 | <code>"30bfd16b-cb7b-4ca9-8aab-394354d4d434"</code> |
| ~age | 30 | number:30 | <code>58</code> |
| ~gender | 30 | string:30 | <code>"male"</code> |
| ~job_title | 30 | string:30 | <code>"Data Scientist"</code> |
| ~salary | 30 | number:30 | <code>155000</code> |
| contact | 30 | object:30 | <code>{"email":"daniel.moore@yahoo.com","phone":"350-267-8573"}</code> |
| ~city | 19 | string:19 | <code>"New York"</code> |
| ~state | 19 | string:19 | <code>"NY"</code> |
| ~country | 19 | string:19 | <code>"USA"</code> |
| @industry | 8 | string:8 | <code>"industry:agriculture"</code> |
| @headquarters | 8 | string:8 | <code>"location:usa:ny:new_york"</code> |

## Possible ID Fields

| Field | Count | Types | Example |
|---|---:|---|---|
| ~raw_id | 50 | string:50 | <code>"65e832c8-bc4e-454e-be7a-49236b829f86"</code> |
| ~household_id | 30 | string:30 | <code>"30bfd16b-cb7b-4ca9-8aab-394354d4d434"</code> |

## Possible Relationship Fields

| Field | Count | Types | Example |
|---|---:|---|---|
| ~source | 100 | string:100 | <code>"people_companies"</code> |

## Possible Metadata Fields

| Field | Count | Types | Example |
|---|---:|---|---|
| ~source | 100 | string:100 | <code>"people_companies"</code> |
| ~created_at | 30 | string:30 | <code>"2022-02-02T20:06:48.408546Z"</code> |
| ~created_year | 30 | number:30 | <code>2022</code> |
| ~status | 30 | string:30 | <code>"pending"</code> |
| ~country | 19 | string:19 | <code>"USA"</code> |
| headquarters.country | 8 | string:8 | <code>"USA"</code> |

## Sample Records

### Sample 1

```json
{
  "#": "company:65e832c8-bc4e-454e-be7a-49236b829f86",
  "^": "company",
  "@industry": "industry:agriculture",
  "@headquarters": "location:usa:ny:new_york",
  "~source": "people_companies",
  "~raw_id": "65e832c8-bc4e-454e-be7a-49236b829f86",
  "~name": "Elite Services Inc",
  "~name_anchor": "company_name:elite_services_inc",
  "~industry": "Agriculture",
  "~size": 3408,
  "~founded": 2019,
  "name": "Elite Services Inc",
  "headquarters": {
    "city": "New York",
    "state": "NY",
    "country": "USA"
  }
}
```

### Sample 2

```json
{
  "#": "company:3c92e335-8372-40d0-a967-7dce318ebec9",
  "^": "company",
  "@industry": "industry:transportation",
  "@headquarters": "location:usa:ny:syracuse",
  "~source": "people_companies",
  "~raw_id": "3c92e335-8372-40d0-a967-7dce318ebec9",
  "~name": "Tech Solutions Inc",
  "~name_anchor": "company_name:tech_solutions_inc",
  "~industry": "Transportation",
  "~size": 19776,
  "~founded": 1953,
  "name": "Tech Solutions Inc",
  "headquarters": {
    "city": "Syracuse",
    "state": "NY",
    "country": "USA"
  }
}
```

### Sample 3

```json
{
  "#": "company:dc21495f-dd86-4b7c-8251-7be67a306e74",
  "^": "company",
  "@industry": "industry:consulting",
  "@headquarters": "location:usa:nc:raleigh",
  "~source": "people_companies",
  "~raw_id": "dc21495f-dd86-4b7c-8251-7be67a306e74",
  "~name": "Elite Group",
  "~name_anchor": "company_name:elite_group",
  "~industry": "Consulting",
  "~size": 7273,
  "~founded": 2007,
  "name": "Elite Group",
  "headquarters": {
    "city": "Raleigh",
    "state": "NC",
    "country": "USA"
  }
}
```

### Sample 4

```json
{
  "#": "company:475dcc3c-d2eb-4750-a8ce-40e6e459409d",
  "^": "company",
  "@industry": "industry:agriculture",
  "@headquarters": "location:usa:mi:warren",
  "~source": "people_companies",
  "~raw_id": "475dcc3c-d2eb-4750-a8ce-40e6e459409d",
  "~name": "Smart Labs Inc",
  "~name_anchor": "company_name:smart_labs_inc",
  "~industry": "Agriculture",
  "~size": 13898,
  "~founded": 1993,
  "name": "Smart Labs Inc",
  "headquarters": {
    "city": "Warren",
    "state": "MI",
    "country": "USA"
  }
}
```

### Sample 5

```json
{
  "#": "company:2bc745e6-618d-4865-a2f6-a060c736930a",
  "^": "company",
  "@industry": "industry:consulting",
  "@headquarters": "location:usa:il:springfield",
  "~source": "people_companies",
  "~raw_id": "2bc745e6-618d-4865-a2f6-a060c736930a",
  "~name": "Global Labs LLC",
  "~name_anchor": "company_name:global_labs_llc",
  "~industry": "Consulting",
  "~size": 3219,
  "~founded": 1995,
  "name": "Global Labs LLC",
  "headquarters": {
    "city": "Springfield",
    "state": "IL",
    "country": "USA"
  }
}
```
