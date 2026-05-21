# JSONL Profile Report: people.jsonl

Generated: 2026-05-21T08:07:44.754Z

## Summary

| Metric | Value |
|---|---:|
| File size | 15.13 KB |
| Total lines | 30 |
| Valid JSON lines | 30 |
| Invalid JSON lines | 0 |
| Blank lines | 0 |
| Valid JSON ratio | 1 |
| Profile time | 3.074 ms |
| Max nesting depth | 4 |
| Avg top-level fields | 5 |
| Avg record size | 515.5 bytes |

## Top-Level Fields

| Field | Count | Types | Example |
|---|---:|---|---|
| id | 30 | string:30 | <code>"9c24b5ab-a6d9-4d06-bf97-155c3aac80b2"</code> |
| created_at | 30 | string:30 | <code>"2022-02-02T20:06:48.408546Z"</code> |
| status | 30 | string:30 | <code>"pending"</code> |
| household_id | 30 | string:30 | <code>"30bfd16b-cb7b-4ca9-8aab-394354d4d434"</code> |
| person | 30 | object:30 | <code>"{\"name\":{\"first\":\"Daniel\",\"last\":\"Moore\"},\"age\":58,\"gender\":\"male\",\"email\":\"dani...</code> |

## Possible ID Fields

| Field | Count | Types | Example |
|---|---:|---|---|
| id | 30 | string:30 | <code>"9c24b5ab-a6d9-4d06-bf97-155c3aac80b2"</code> |
| household_id | 30 | string:30 | <code>"30bfd16b-cb7b-4ca9-8aab-394354d4d434"</code> |

## Possible Relationship Fields

_None detected._

## Possible Metadata Fields

| Field | Count | Types | Example |
|---|---:|---|---|
| created_at | 30 | string:30 | <code>"2022-02-02T20:06:48.408546Z"</code> |
| status | 30 | string:30 | <code>"pending"</code> |
| person.location.country | 30 | string:30 | <code>"USA"</code> |

## Sample Records

### Sample 1

```json
{
  "id": "9c24b5ab-a6d9-4d06-bf97-155c3aac80b2",
  "created_at": "2022-02-02T20:06:48.408546Z",
  "status": "pending",
  "household_id": "30bfd16b-cb7b-4ca9-8aab-394354d4d434",
  "person": {
    "name": {
      "first": "Daniel",
      "last": "Moore"
    },
    "age": 58,
    "gender": "male",
    "email": "daniel.moore@yahoo.com",
    "phone": "350-267-8573",
    "location": {
      "city": "Columbus",
      "state": "GA",
      "country": "USA"
    },
    "interests": [
      "sports",
      "yoga",
      "gardening",
      "writing"
    ],
    "job": {
      "title": "Data Scientist",
      "company_name": "Smart Labs Inc",
      "salary": 155000
    }
  }
}
```

### Sample 2

```json
{
  "id": "0c53e810-70e7-416a-91ca-1f0ba64c491d",
  "created_at": "2023-09-28T20:06:48.408661Z",
  "status": "active",
  "household_id": "30bfd16b-cb7b-4ca9-8aab-394354d4d434",
  "person": {
    "name": {
      "first": "Betty",
      "last": "Moore"
    },
    "age": 79,
    "gender": "female",
    "email": "betty.moore@outlook.com",
    "phone": "758-569-3340",
    "location": {
      "city": "Columbus",
      "state": "GA",
      "country": "USA"
    },
    "interests": [
      "traveling",
      "yoga",
      "sports"
    ],
    "job": {
      "title": "Administrator",
      "company_name": "Smart Group Co",
      "salary": 166000
    }
  }
}
```

### Sample 3

```json
{
  "id": "8555dfd0-2b06-455e-9077-b29a0d01e7aa",
  "created_at": "2020-09-04T20:06:48.408704Z",
  "status": "active",
  "household_id": "30bfd16b-cb7b-4ca9-8aab-394354d4d434",
  "person": {
    "name": {
      "first": "Joseph",
      "last": "Moore"
    },
    "age": 51,
    "gender": "male",
    "email": "joseph.moore@yahoo.com",
    "phone": "911-796-7916",
    "location": {
      "city": "Columbus",
      "state": "GA",
      "country": "USA"
    },
    "interests": [
      "art"
    ],
    "job": {
      "title": "Electrician",
      "company_name": "Smart Services",
      "salary": 114000
    }
  }
}
```

### Sample 4

```json
{
  "id": "9d9f738b-b9de-4338-b241-86f41bf1739e",
  "created_at": "2021-03-12T20:06:48.408743Z",
  "status": "pending",
  "household_id": "30bfd16b-cb7b-4ca9-8aab-394354d4d434",
  "person": {
    "name": {
      "first": "Drew",
      "last": "Moore"
    },
    "age": 57,
    "gender": "nonbinary",
    "email": "drew.moore56@hotmail.com",
    "phone": "261-564-1053",
    "location": {
      "city": "Columbus",
      "state": "GA",
      "country": "USA"
    },
    "interests": [
      "running",
      "gaming",
      "cooking"
    ],
    "job": {
      "title": "Teacher",
      "company_name": "Smart Labs Inc",
      "salary": 61000
    }
  }
}
```

### Sample 5

```json
{
  "id": "f5ff34dc-9566-4af0-a203-103ab0203d86",
  "created_at": "2024-02-26T20:06:48.408789Z",
  "status": "pending",
  "household_id": "21e1ba9b-a5dc-4986-ac8c-8b3fedb2759c",
  "person": {
    "name": {
      "first": "Donna",
      "last": "Wright"
    },
    "age": 21,
    "gender": "female",
    "email": "donna.wright63@gmail.com",
    "phone": "935-170-9727",
    "location": {
      "city": "Charlotte",
      "state": "NC",
      "country": "USA"
    },
    "interests": [
      "traveling",
      "swimming"
    ],
    "job": {
      "title": "Researcher",
      "company_name": "Elite Group",
      "salary": 77000
    }
  }
}
```
