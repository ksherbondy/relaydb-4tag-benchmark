RelayDB LaneRegistry Prototype
==============================

Manifest: /Users/sherbondy/Desktop/projects/relaydb-4tag-benchmark/reports/relay-columnar/people-companies.10000x100000.columnar-manifest.v2.json
Format:   relaydb-columnar-manifest
Version:  0.2.0

Topics
------
company                  count: 10,000
company_name_alias       count: 10,000
household                count: 31,631
industry                 count: 10
interest                 count: 15
location                 count: 20
person                   count: 100,000

Known Lane Specs
----------------
person.attribute:age: kind=number, lane=uint8, searchable=true
person.attribute:status: kind=enum, lane=uint8, searchable=true
person.relationship:company: kind=relationship, lane=uint32, searchable=true
company.attribute:industry: kind=enum, lane=uint8, searchable=true
company.relationship:industry: kind=relationship, lane=uint32, searchable=true

Searchable Fields: person
-------------------------
anchor:anchor                    kind: anchor        lane: uint32-offset
attribute:age                    kind: number        lane: uint8
attribute:created_year           kind: number        lane: uint16
attribute:gender                 kind: enum          lane: uint8
attribute:job_title              kind: enum          lane: uint8
attribute:salary                 kind: number        lane: uint32
attribute:source                 kind: enum          lane: uint8
attribute:status                 kind: enum          lane: uint8
relationship:company             kind: relationship  lane: uint32
relationship:company_name        kind: relationship  lane: uint32
relationship:household           kind: relationship  lane: uint32
relationship:interests           kind: relationship  lane: uint32
relationship:location            kind: relationship  lane: uint32

Predicate Candidates: person
----------------------------
attribute:age.under40                            field: attribute:age value: 40
attribute:created_year.recent                    field: attribute:created_year value: 2000
attribute:gender.female                          field: attribute:gender value: female
attribute:gender.male                            field: attribute:gender value: male
attribute:job_title.account_manager              field: attribute:job_title value: Account Manager
attribute:job_title.administrator                field: attribute:job_title value: Administrator
attribute:job_title.data_scientist               field: attribute:job_title value: Data Scientist
attribute:job_title.financial_analyst            field: attribute:job_title value: Financial Analyst
attribute:job_title.hr_coordinator               field: attribute:job_title value: HR Coordinator
attribute:job_title.logistics_planner            field: attribute:job_title value: Logistics Planner
attribute:job_title.marketing_specialist         field: attribute:job_title value: Marketing Specialist
attribute:job_title.operations_manager           field: attribute:job_title value: Operations Manager
attribute:job_title.product_designer             field: attribute:job_title value: Product Designer
attribute:job_title.project_manager              field: attribute:job_title value: Project Manager
attribute:job_title.research_analyst             field: attribute:job_title value: Research Analyst
attribute:job_title.security_analyst             field: attribute:job_title value: Security Analyst
attribute:job_title.software_developer           field: attribute:job_title value: Software Developer
attribute:job_title.systems_engineer             field: attribute:job_title value: Systems Engineer
attribute:job_title.technical_writer             field: attribute:job_title value: Technical Writer
attribute:source.generated_people_companies      field: attribute:source value: generated_people_companies
attribute:status.active                          field: attribute:status value: active
attribute:status.inactive                        field: attribute:status value: inactive
attribute:status.pending                         field: attribute:status value: pending

Relationship Fields: person
---------------------------
relationship:company             target: company              targetFound: true
relationship:company_name        target: company_name         targetFound: false
relationship:household           target: household            targetFound: false
relationship:interests           target: interests            targetFound: false
relationship:location            target: location             targetFound: false

Query Plan Prototype
--------------------
{
  "kind": "relaydb-columnar-query-plan",
  "topic": "person",
  "executionModel": "bitset-first",
  "limit": 1,
  "hydrate": true,
  "steps": [
    {
      "type": "direct-predicate",
      "topic": "person",
      "fieldId": "attribute:status",
      "operator": "eq",
      "value": "active",
      "lane": {
        "topic": "person",
        "fieldId": "attribute:status",
        "kind": "enum",
        "suggestedLane": "uint8",
        "searchable": true
      },
      "strategy": "precomputed-predicate-bitset",
      "predicateName": "attribute:status.active",
      "outputBitset": "person.attribute:status.active"
    },
    {
      "type": "direct-predicate",
      "topic": "person",
      "fieldId": "attribute:age",
      "operator": "lt",
      "value": 40,
      "lane": {
        "topic": "person",
        "fieldId": "attribute:age",
        "kind": "number",
        "suggestedLane": "uint8",
        "searchable": true
      },
      "strategy": "scan-lane-build-runtime-bitset",
      "outputBitset": "person.attribute:age.lt.40"
    },
    {
      "type": "relationship-predicate",
      "sourceTopic": "person",
      "relationshipFieldId": "relationship:company",
      "targetTopic": "company",
      "targetFieldId": "attribute:industry",
      "operator": "eq",
      "value": "Agriculture",
      "relationshipLane": {
        "topic": "person",
        "fieldId": "relationship:company",
        "kind": "relationship",
        "suggestedLane": "uint32",
        "searchable": true
      },
      "targetLane": {
        "topic": "company",
        "fieldId": "attribute:industry",
        "kind": "enum",
        "suggestedLane": "uint8",
        "searchable": true
      },
      "targetPredicate": {
        "strategy": "precomputed-target-bitset",
        "predicateName": "attribute:industry.agriculture",
        "bitset": "company.attribute:industry.agriculture"
      },
      "strategy": "derive-source-bitset-through-relationship",
      "outputBitset": "person.relationship:company.attribute:industry.agriculture"
    }
  ],
  "finalOperation": {
    "type": "bitset-and",
    "inputs": [
      "person.attribute:status.active",
      "person.attribute:age.lt.40",
      "person.relationship:company.attribute:industry.agriculture"
    ]
  },
  "output": {
    "type": "hydrated-records",
    "topic": "person"
  }
}
