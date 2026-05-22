# RelayDB Reader Architecture

**Author:** Kris Sherbondy  
**Date:** 2026-05-22  
**Purpose:** Define the working architecture for RelayDB as a compiled static data artifact plus a fast local reader.

---

## 1. Core Mental Model

RelayDB should be understood as a small data system with three layers:

```text
.relay file = SSD / hard drive
reader RAM  = local memory view, hot lanes, caches, offsets
reader CPU  = parser, planner, executor, hydrator, optimizer
```

The `.relay` file is passive. It does not execute logic, optimize itself, learn, or move data around.

The reader is active. It opens the file, builds or maps efficient memory views, runs queries, caches hot paths, hydrates results, and exposes a clean API to applications.

---

## 2. Layer Responsibilities

### 2.1 Compiler

The compiler converts source data into a validated RelayDB artifact.

Responsibilities:

```text
read source files
validate structure
validate relationships
assign stable IDs
build string tables
build node/topic/relationship tables
build metadata lanes
build payload offsets
write checksums/integrity data
emit .relay file
```

The compiler should do correctness work and structural packing. It should not try to predict every runtime optimization.

### 2.2 `.relay` File

The `.relay` file is a compiled storage container.

It should be:

```text
passive
compact
versioned
validated
addressable
cacheable
reader-friendly
```

It should not be:

```text
a database
an API
a runtime
a scripting engine
a self-modifying file
a place for secrets/private client data
```

The file’s purpose is to store structured static data in a way the reader can use efficiently.

A future `.relay` file may contain sections like:

```text
Header
Version / format metadata
String table
Node table
Topic table
Tag flag lane
Relationship table
Metadata hot lanes
Payload offset table
Payload bytes
Integrity / checksum section
Optional precompiled indexes
```

The file is the cartridge. The reader is the machine.

### 2.3 Reader RAM

Reader RAM is the local runtime memory view built from the `.relay` file.

This layer should be optimized for fast repeated reads.

Possible structures:

```text
nodeFlags: Uint8Array
topicIds: Uint16Array
payloadStarts: Uint32Array
payloadLengths: Uint32Array
personAges: Uint8Array
personStatusIds: Uint8Array
personCompanyIds: Uint32Array
companyIndustryIds: Uint16Array
anchorId maps
string tables
small LRU caches
temporary runtime indexes
```

The compact JS prototype showed that moving from object-heavy rows to typed arrays dramatically reduced heap usage and improved honest scan speed.

The reader RAM layer should separate:

```text
hot data:
  fields needed for filtering/searching

cold data:
  full payloads used only after a match
```

Example:

```text
hot:
  age
  status
  company id
  industry id
  byte offsets

cold:
  full JSON payload
  full SVG payload
  large descriptions
  large asset metadata
```

### 2.4 Reader CPU

The reader CPU is the query engine.

Responsibilities:

```text
parse query
build query plan
choose execution path
scan hot lanes
follow relationships
hydrate final payloads
record cache/heat information
return clean result
return debug result when requested
```

Current prototype pieces:

```text
search-parser.js       -> parser
search-planner.js      -> planner
executeFastPlan()      -> fast public search path
executeDebugPlan()     -> honest diagnostic path
hydrateMatch()         -> payload hydration
TinyLRU                -> temporal locality cache
compact typed arrays   -> RAM-friendly hot lanes
```

The public API should stay small:

```js
db.search(question, options?)
db.debugSearch(question, options?)
```

The API should be chunky, not chatty. This matters especially for future WASM use because crossing the JS/WASM boundary repeatedly can erase performance gains.

---

## 3. Source Format vs Compiled Artifact vs Runtime Layout

RelayDB has three different representations:

```text
1. Source format
   Human-readable 4-tag JSONL or other importable data.

2. Compiled artifact
   Passive .relay file.

3. Runtime memory layout
   Reader-owned typed arrays, offsets, caches, and query structures.
```

The 4-tag format is not the final optimized storage. The 4-tag format is the source contract.

Pipeline:

```text
raw data
  ↓
4-tag JSONL source contract
  ↓
RelayDB compiler
  ↓
.relay compiled artifact
  ↓
reader RAM + CPU
  ↓
search/debugSearch API
```

---

## 4. 4-Tag Source Contract

The current conceptual source tags are:

```text
# = identity / anchor
^ = topic / type
@ = relationship
~ = metadata / searchable field
```

The source format should remain easy to inspect, write, validate, and debug.

The compiler is allowed to reshape this source into compact internal structures.

Important principle:

> The 4-tag format gives us truth and structure. The runtime layer should be allowed to reshape it for speed.

---

## 5. Flag and Lane Model

RelayDB should eventually use bit flags internally.

Example:

```text
00000001 = has anchor
00000010 = has topic
00000100 = has relationship
00001000 = has metadata
00010000 = is alias
00100000 = is searchable
01000000 = has payload
10000000 = reserved
```

A node with anchor + topic + metadata could be:

```text
00001011
```

This enables fast structural checks without string/property lookups.

The broader concept:

```text
bit flag = meaning
storage lane = where related values live
```

Example hot lanes:

```text
nodeFlags
topicIds
relationshipKindIds
statusIds
ages
companyIds
industryIds
payloadOffsets
```

This shifts RelayDB from:

```text
objects that contain fields
```

to:

```text
IDs and flags routed through hot storage lanes
```

---

## 6. Hot / Warm / Cold Runtime Model

The `.relay` file does not move data around.

The reader may promote data between runtime tiers.

```text
Cold:
  payload bytes remain in file/buffer

Warm:
  offsets, IDs, flags, typed lanes

Hot:
  cached query plans
  cached result packets
  cached hydrated nodes
  temporary indexes
```

Data “heating up” means the reader creates a faster local representation. The original `.relay` file remains unchanged.

Example:

```text
Repeated agriculture queries
  -> reader may build agriculture -> personIds runtime index

Repeated same query
  -> reader caches result packet

Repeated same node hydration
  -> reader keeps parsed node in LRU cache
```

This should be a future feature, not a v1 requirement.

---

## 7. Multiple Relay Files and Lazy Loading

RelayDB should not assume one giant file.

Better deployment model:

```text
critical.relay
catalog-index.relay
category-fittings.relay
category-electrical.relay
sprites.relay
docs.relay
```

This allows developers to control:

```text
initial load size
critical path
lazy loading
cache behavior
data splitting
repeat visit performance
```

Possible future API:

```js
const db = await RelayDB.open('/data/critical.relay');

await db.attach('/data/catalog-index.relay');
await db.attach('/data/categories/fittings.relay');

const result = db.search('3 inch brass elbow fitting');
```

RelayDB can be thought of as data code-splitting for static relational data.

---

## 8. Web Deployment Model

For client-side use:

```text
Browser downloads:
  app JavaScript
  RelayDB WASM engine
  one or more .relay files
  external assets such as sprite sheets/images/SVGs
```

Then searches happen locally.

This can reduce repeated server/API/database requests for public static data.

Important boundary:

> Only send `.relay` files to the browser if the client is allowed to possess that data.

Client-side RelayDB is appropriate for public/static/cacheable data, not secrets or private records.

---

## 9. Most Common Initial Use Case

The first practical use case should be narrow:

```text
static catalogs / documentation / reference data
```

Good examples:

```text
parts catalogs
product metadata
documentation graphs
training content
asset manifests
offline reference apps
public lookup tables
game item metadata
```

The first demo should likely be a parts/product catalog:

```text
load critical relay
search locally
show part metadata
show related parts
show sprite/image metadata
avoid repeated API calls
```

This use case is easy to understand and easy to benchmark.

---

## 10. What RelayDB Is Not

RelayDB is not:

```text
a full database replacement
a write-heavy system
a transaction engine
a permissions engine
a private data hiding mechanism
a live data synchronization system
a replacement for backend APIs where fresh/private data is required
```

A backend/database is still better for:

```text
writes
transactions
private data
server-authoritative data
permissions
auditing
fresh/live information
collaborative editing
```

RelayDB’s lane is static or rarely changing relational data that benefits from fast local reads.

---

## 11. Rust / WASM Direction

The JS prototype is proving the shape.

The long-term implementation should likely be:

```text
Rust compiler
Rust reader core
WASM browser/Node wrapper
thin JavaScript API
```

Rust is better suited for:

```text
byte offsets
typed memory layout
integer IDs
bit flags
string tables
relationship tables
low-allocation hot paths
predictable memory structures
native mmap-style reading
WASM linear memory views
```

JavaScript should remain the steering wheel. Rust/WASM should become the engine.

Possible npm package shape:

```text
relaydb/
├── package.json
├── dist/
│   ├── index.js
│   ├── relaydb_bg.wasm
│   └── relaydb_bg.js
├── types/
│   └── index.d.ts
└── README.md
```

Developer-facing API:

```js
import { RelayDB } from 'relaydb';

const db = await RelayDB.open('/data/site.relay');

const result = db.search('active agriculture people under 40', {
  explain: true,
});
```

---

## 12. Optimization Principles

RelayDB should optimize by being boring and ruthless:

```text
less parsing
less allocation
fewer objects
fewer strings
fewer branches
more typed arrays
more integer IDs
more locality
more precomputed structure
hydrate only final results
```

Do not optimize everything. Optimize only what benchmarks prove matters.

---

## 13. Current Prototype Findings

The prototype experiments produced several important findings.

### Object-row offset reader

Pros:

```text
simple
fast enough
easy to reason about
```

Cons:

```text
higher JS heap use
object overhead
string/property lookup overhead
```

### Compact typed-array offset reader

Pros:

```text
much lower heap use
faster honest debug scan
preserved correctness
preserved candidate counts
kept cached search extremely fast
```

Tradeoff:

```text
slower open time because the prototype scans/parses twice
```

The compact reader is currently the most promising experimental path.

---

## 14. Near-Term Roadmap

### Now

```text
1. Preserve current compact reader experiment.
2. Keep architecture narrow and documented.
3. Build a practical product demo.
```

### Next technical tests

```text
larger generated dataset
memory scaling comparison
cold vs hot search benchmark
multiple relay-file/lazy-load experiment
simple asset/sprite metadata demo
```

### Not yet

```text
adaptive hot/cold memory manager
SVG compiler
game-specific engine
math computation cache
custom query bytecode VM
full binary .relay implementation
```

Those ideas are valid, but they are future lanes.

---

## 15. Core Product Statement

RelayDB is:

> A compiled local read layer for static relational data.

More specifically:

> RelayDB lets developers ship static relational data as cacheable, lazy-loadable client-side or local artifacts, reducing repeated API/database requests while preserving fast relationship-aware lookup and clean debug visibility.

---

## 16. Design Rule

The `.relay` file should be arranged like storage, but shaped for the reader’s RAM layout.

The reader should act like the CPU/RAM layer:

```text
open storage
map/load useful sections
search hot lanes
follow relationships
hydrate only final results
cache repeated work
debug honestly
```

This is the spine of RelayDB.
