# JSONL Profile Report: people.10000.jsonl

Generated: 2026-05-21T15:37:27.296Z

## Summary

| Metric | Value |
|---|---:|
| File size | 4.83 MB |
| Total lines | 10,000 |
| Valid JSON lines | 10,000 |
| Invalid JSON lines | 0 |
| Blank lines | 0 |
| Valid JSON ratio | 1 |
| Profile time | 71.019 ms |
| Max nesting depth | 4 |
| Avg top-level fields | 5 |
| Avg record size | 505.381 bytes |

## Top-Level Fields

| Field | Count | Types | Example |
|---|---:|---|---|
| id | 10,000 | string:10000 | <code>"d52442ae-e418-437d-8df6-c7b60acd958b"</code> |
| created_at | 10,000 | string:10000 | <code>"2021-04-11T01:13:32.972Z"</code> |
| status | 10,000 | string:10000 | <code>"inactive"</code> |
| household_id | 10,000 | string:10000 | <code>"117a3cee-411d-4511-8ca7-7076474f2278"</code> |
| person | 10,000 | object:10000 | <code>"{\"name\":{\"first\":\"Jennifer\",\"last\":\"Brown\"},\"age\":38,\"gender\":\"female\",\"email\":\"...</code> |

## Possible ID Fields

| Field | Count | Types | Example |
|---|---:|---|---|
| id | 10,000 | string:10000 | <code>"d52442ae-e418-437d-8df6-c7b60acd958b"</code> |
| household_id | 10,000 | string:10000 | <code>"117a3cee-411d-4511-8ca7-7076474f2278"</code> |

## Possible Relationship Fields

_None detected._

## Possible Metadata Fields

| Field | Count | Types | Example |
|---|---:|---|---|
| created_at | 10,000 | string:10000 | <code>"2021-04-11T01:13:32.972Z"</code> |
| status | 10,000 | string:10000 | <code>"inactive"</code> |
| person.location.country | 10,000 | string:10000 | <code>"USA"</code> |

## Sample Records

### Sample 1

```json
{
  "id": "d52442ae-e418-437d-8df6-c7b60acd958b",
  "created_at": "2021-04-11T01:13:32.972Z",
  "status": "inactive",
  "household_id": "117a3cee-411d-4511-8ca7-7076474f2278",
  "person": {
    "name": {
      "first": "Jennifer",
      "last": "Brown"
    },
    "age": 38,
    "gender": "female",
    "email": "jennifer.brown.0.0@yahoo.com",
    "phone": "442-993-1267",
    "location": {
      "city": "Boulder",
      "state": "CO",
      "country": "USA"
    },
    "interests": [
      "fitness",
      "woodworking",
      "sports",
      "music"
    ],
    "job": {
      "title": "HR Coordinator",
      "company_name": "Skyline Logistics 586-1",
      "salary": 118597
    }
  }
}
```

### Sample 2

```json
{
  "id": "a13069b9-3279-4b0a-925f-def4c1a81fae",
  "created_at": "2023-05-17T17:45:58.975Z",
  "status": "pending",
  "household_id": "eaecfb2b-8f6d-45eb-8ca2-722585c8d5d5",
  "person": {
    "name": {
      "first": "Charles",
      "last": "Thomas"
    },
    "age": 26,
    "gender": "male",
    "email": "charles.thomas.1.0@outlook.com",
    "phone": "666-460-2010",
    "location": {
      "city": "Atlanta",
      "state": "GA",
      "country": "USA"
    },
    "interests": [
      "photography",
      "fitness",
      "coding",
      "writing"
    ],
    "job": {
      "title": "Systems Engineer",
      "company_name": "Riverstone Services 2-1",
      "salary": 129342
    }
  }
}
```

### Sample 3

```json
{
  "id": "d1df06fa-761f-4132-8389-8e3a07823bc9",
  "created_at": "2023-06-01T09:02:50.974Z",
  "status": "pending",
  "household_id": "baad13a2-6fc0-4208-b9e9-98e06f07ee59",
  "person": {
    "name": {
      "first": "Mary",
      "last": "Rodriguez"
    },
    "age": 80,
    "gender": "female",
    "email": "mary.rodriguez.2.0@example.com",
    "phone": "583-645-4774",
    "location": {
      "city": "Boulder",
      "state": "CO",
      "country": "USA"
    },
    "interests": [
      "gaming",
      "writing"
    ],
    "job": {
      "title": "Product Designer",
      "company_name": "BrightPath Transportation 312-1",
      "salary": 187218
    }
  }
}
```

### Sample 4

```json
{
  "id": "9da5e67a-c1a0-49e9-8169-039e6e0ef6a7",
  "created_at": "2025-08-14T11:23:55.465Z",
  "status": "pending",
  "household_id": "06286e24-5b66-4b38-a117-27264da3d7d2",
  "person": {
    "name": {
      "first": "Kimberly",
      "last": "Lopez"
    },
    "age": 20,
    "gender": "female",
    "email": "kimberly.lopez.3.0@gmail.com",
    "phone": "734-553-1462",
    "location": {
      "city": "Tacoma",
      "state": "WA",
      "country": "USA"
    },
    "interests": [
      "hiking",
      "photography",
      "music"
    ],
    "job": {
      "title": "Operations Manager",
      "company_name": "Golden Plains Finance 304-1",
      "salary": 141858
    }
  }
}
```

### Sample 5

```json
{
  "id": "4bf385c2-d319-4783-928c-d9f948fe6467",
  "created_at": "2023-11-06T21:06:38.416Z",
  "status": "active",
  "household_id": "d0f6a42b-562e-4d15-a11d-5fe027a4fbb0",
  "person": {
    "name": {
      "first": "Michelle",
      "last": "Thomas"
    },
    "age": 46,
    "gender": "female",
    "email": "michelle.thomas.4.0@outlook.com",
    "phone": "498-784-6782",
    "location": {
      "city": "Tacoma",
      "state": "WA",
      "country": "USA"
    },
    "interests": [
      "cooking",
      "painting",
      "photography",
      "gardening"
    ],
    "job": {
      "title": "Data Scientist",
      "company_name": "Silver Oak Partners 768-1",
      "salary": 42706
    }
  }
}
```
