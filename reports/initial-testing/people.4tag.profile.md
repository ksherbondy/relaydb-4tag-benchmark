# JSONL Profile Report: people.4tag.jsonl

Generated: 2026-05-21T08:18:13.385Z

## Summary

| Metric | Value |
|---|---:|
| File size | 26.94 KB |
| Total lines | 72 |
| Valid JSON lines | 72 |
| Invalid JSON lines | 0 |
| Blank lines | 0 |
| Valid JSON ratio | 1 |
| Profile time | 3.365 ms |
| Max nesting depth | 3 |
| Avg top-level fields | 10.583 |
| Avg record size | 382.139 bytes |

## Top-Level Fields

| Field | Count | Types | Example |
|---|---:|---|---|
| # | 72 | string:72 | <code>"person:9c24b5ab-a6d9-4d06-bf97-155c3aac80b2"</code> |
| ^ | 72 | string:72 | <code>"person"</code> |
| ~source | 72 | string:72 | <code>"people_companies"</code> |
| ~raw_id | 42 | string:42 | <code>"9c24b5ab-a6d9-4d06-bf97-155c3aac80b2"</code> |
| @household | 30 | string:30 | <code>"household:30bfd16b-cb7b-4ca9-8aab-394354d4d434"</code> |
| @company | 30 | string:30 | <code>"company:475dcc3c-d2eb-4750-a8ce-40e6e459409d"</code> |
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
| name | 30 | object:30 | <code>{"first":"Daniel","last":"Moore","full":"Daniel Moore"}</code> |
| contact | 30 | object:30 | <code>{"email":"daniel.moore@yahoo.com","phone":"350-267-8573"}</code> |
| ~name | 18 | string:18 | <code>"sports"</code> |
| ~city | 12 | string:12 | <code>"Columbus"</code> |
| ~state | 12 | string:12 | <code>"GA"</code> |
| ~country | 12 | string:12 | <code>"USA"</code> |

## Possible ID Fields

| Field | Count | Types | Example |
|---|---:|---|---|
| ~raw_id | 42 | string:42 | <code>"9c24b5ab-a6d9-4d06-bf97-155c3aac80b2"</code> |
| ~household_id | 30 | string:30 | <code>"30bfd16b-cb7b-4ca9-8aab-394354d4d434"</code> |

## Possible Relationship Fields

| Field | Count | Types | Example |
|---|---:|---|---|
| ~source | 72 | string:72 | <code>"people_companies"</code> |

## Possible Metadata Fields

| Field | Count | Types | Example |
|---|---:|---|---|
| ~source | 72 | string:72 | <code>"people_companies"</code> |
| ~created_at | 30 | string:30 | <code>"2022-02-02T20:06:48.408546Z"</code> |
| ~created_year | 30 | number:30 | <code>2022</code> |
| ~status | 30 | string:30 | <code>"pending"</code> |
| ~country | 12 | string:12 | <code>"USA"</code> |

## Sample Records

### Sample 1

```json
{
  "#": "person:9c24b5ab-a6d9-4d06-bf97-155c3aac80b2",
  "^": "person",
  "@household": "household:30bfd16b-cb7b-4ca9-8aab-394354d4d434",
  "@company": "company:475dcc3c-d2eb-4750-a8ce-40e6e459409d",
  "@company_name": "company_name:smart_labs_inc",
  "@location": "location:usa:ga:columbus",
  "@interests": [
    "interest:sports",
    "interest:yoga",
    "interest:gardening",
    "interest:writing"
  ],
  "~source": "people_companies",
  "~raw_id": "9c24b5ab-a6d9-4d06-bf97-155c3aac80b2",
  "~created_at": "2022-02-02T20:06:48.408546Z",
  "~created_year": 2022,
  "~status": "pending",
  "~household_id": "30bfd16b-cb7b-4ca9-8aab-394354d4d434",
  "~age": 58,
  "~gender": "male",
  "~job_title": "Data Scientist",
  "~salary": 155000,
  "name": {
    "first": "Daniel",
    "last": "Moore",
    "full": "Daniel Moore"
  },
  "contact": {
    "email": "daniel.moore@yahoo.com",
    "phone": "350-267-8573"
  }
}
```

### Sample 2

```json
{
  "#": "person:0c53e810-70e7-416a-91ca-1f0ba64c491d",
  "^": "person",
  "@household": "household:30bfd16b-cb7b-4ca9-8aab-394354d4d434",
  "@company": "company:bf2615bd-f6a2-4b13-aa7d-3548c80fd49e",
  "@company_name": "company_name:smart_group_co",
  "@location": "location:usa:ga:columbus",
  "@interests": [
    "interest:traveling",
    "interest:yoga",
    "interest:sports"
  ],
  "~source": "people_companies",
  "~raw_id": "0c53e810-70e7-416a-91ca-1f0ba64c491d",
  "~created_at": "2023-09-28T20:06:48.408661Z",
  "~created_year": 2023,
  "~status": "active",
  "~household_id": "30bfd16b-cb7b-4ca9-8aab-394354d4d434",
  "~age": 79,
  "~gender": "female",
  "~job_title": "Administrator",
  "~salary": 166000,
  "name": {
    "first": "Betty",
    "last": "Moore",
    "full": "Betty Moore"
  },
  "contact": {
    "email": "betty.moore@outlook.com",
    "phone": "758-569-3340"
  }
}
```

### Sample 3

```json
{
  "#": "person:8555dfd0-2b06-455e-9077-b29a0d01e7aa",
  "^": "person",
  "@household": "household:30bfd16b-cb7b-4ca9-8aab-394354d4d434",
  "@company": "company:6951b0da-5434-4101-a387-5a053f2cbab1",
  "@company_name": "company_name:smart_services",
  "@location": "location:usa:ga:columbus",
  "@interests": [
    "interest:art"
  ],
  "~source": "people_companies",
  "~raw_id": "8555dfd0-2b06-455e-9077-b29a0d01e7aa",
  "~created_at": "2020-09-04T20:06:48.408704Z",
  "~created_year": 2020,
  "~status": "active",
  "~household_id": "30bfd16b-cb7b-4ca9-8aab-394354d4d434",
  "~age": 51,
  "~gender": "male",
  "~job_title": "Electrician",
  "~salary": 114000,
  "name": {
    "first": "Joseph",
    "last": "Moore",
    "full": "Joseph Moore"
  },
  "contact": {
    "email": "joseph.moore@yahoo.com",
    "phone": "911-796-7916"
  }
}
```

### Sample 4

```json
{
  "#": "person:9d9f738b-b9de-4338-b241-86f41bf1739e",
  "^": "person",
  "@household": "household:30bfd16b-cb7b-4ca9-8aab-394354d4d434",
  "@company": "company:475dcc3c-d2eb-4750-a8ce-40e6e459409d",
  "@company_name": "company_name:smart_labs_inc",
  "@location": "location:usa:ga:columbus",
  "@interests": [
    "interest:running",
    "interest:gaming",
    "interest:cooking"
  ],
  "~source": "people_companies",
  "~raw_id": "9d9f738b-b9de-4338-b241-86f41bf1739e",
  "~created_at": "2021-03-12T20:06:48.408743Z",
  "~created_year": 2021,
  "~status": "pending",
  "~household_id": "30bfd16b-cb7b-4ca9-8aab-394354d4d434",
  "~age": 57,
  "~gender": "nonbinary",
  "~job_title": "Teacher",
  "~salary": 61000,
  "name": {
    "first": "Drew",
    "last": "Moore",
    "full": "Drew Moore"
  },
  "contact": {
    "email": "drew.moore56@hotmail.com",
    "phone": "261-564-1053"
  }
}
```

### Sample 5

```json
{
  "#": "person:f5ff34dc-9566-4af0-a203-103ab0203d86",
  "^": "person",
  "@household": "household:21e1ba9b-a5dc-4986-ac8c-8b3fedb2759c",
  "@company": "company:dc21495f-dd86-4b7c-8251-7be67a306e74",
  "@company_name": "company_name:elite_group",
  "@location": "location:usa:nc:charlotte",
  "@interests": [
    "interest:traveling",
    "interest:swimming"
  ],
  "~source": "people_companies",
  "~raw_id": "f5ff34dc-9566-4af0-a203-103ab0203d86",
  "~created_at": "2024-02-26T20:06:48.408789Z",
  "~created_year": 2024,
  "~status": "pending",
  "~household_id": "21e1ba9b-a5dc-4986-ac8c-8b3fedb2759c",
  "~age": 21,
  "~gender": "female",
  "~job_title": "Researcher",
  "~salary": 77000,
  "name": {
    "first": "Donna",
    "last": "Wright",
    "full": "Donna Wright"
  },
  "contact": {
    "email": "donna.wright63@gmail.com",
    "phone": "935-170-9727"
  }
}
```
