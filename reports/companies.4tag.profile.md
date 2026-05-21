# JSONL Profile Report: companies.4tag.jsonl

Generated: 2026-05-21T08:18:04.720Z

## Summary

| Metric | Value |
|---|---:|
| File size | 6.27 KB |
| Total lines | 29 |
| Valid JSON lines | 29 |
| Invalid JSON lines | 0 |
| Blank lines | 0 |
| Valid JSON ratio | 1 |
| Profile time | 2.475 ms |
| Max nesting depth | 2 |
| Avg top-level fields | 7.31 |
| Avg record size | 220.379 bytes |

## Top-Level Fields

| Field | Count | Types | Example |
|---|---:|---|---|
| # | 29 | string:29 | <code>"company:65e832c8-bc4e-454e-be7a-49236b829f86"</code> |
| ^ | 29 | string:29 | <code>"company"</code> |
| ~source | 29 | string:29 | <code>"people_companies"</code> |
| ~name | 21 | string:21 | <code>"Elite Services Inc"</code> |
| @industry | 8 | string:8 | <code>"industry:agriculture"</code> |
| @headquarters | 8 | string:8 | <code>"location:usa:ny:new_york"</code> |
| ~raw_id | 8 | string:8 | <code>"65e832c8-bc4e-454e-be7a-49236b829f86"</code> |
| ~name_anchor | 8 | string:8 | <code>"company_name:elite_services_inc"</code> |
| ~industry | 8 | string:8 | <code>"Agriculture"</code> |
| ~size | 8 | number:8 | <code>3408</code> |
| ~founded | 8 | number:8 | <code>2019</code> |
| name | 8 | string:8 | <code>"Elite Services Inc"</code> |
| headquarters | 8 | object:8 | <code>{"city":"New York","state":"NY","country":"USA"}</code> |
| @company | 8 | string:8 | <code>"company:65e832c8-bc4e-454e-be7a-49236b829f86"</code> |
| ~city | 8 | string:8 | <code>"New York"</code> |
| ~state | 8 | string:8 | <code>"NY"</code> |
| ~country | 8 | string:8 | <code>"USA"</code> |

## Possible ID Fields

| Field | Count | Types | Example |
|---|---:|---|---|
| ~raw_id | 8 | string:8 | <code>"65e832c8-bc4e-454e-be7a-49236b829f86"</code> |

## Possible Relationship Fields

| Field | Count | Types | Example |
|---|---:|---|---|
| ~source | 29 | string:29 | <code>"people_companies"</code> |

## Possible Metadata Fields

| Field | Count | Types | Example |
|---|---:|---|---|
| ~source | 29 | string:29 | <code>"people_companies"</code> |
| headquarters.country | 8 | string:8 | <code>"USA"</code> |
| ~country | 8 | string:8 | <code>"USA"</code> |

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
