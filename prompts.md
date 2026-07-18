# GitHub Copilot implementation prompts for AI-editor-viewer

Repository:

`https://github.com/shubiuh/AI-editor-viewer.git`

## Prompt 0 — Inspect the repository without changing code

```text
You are working in the repository shubiuh/AI-editor-viewer.

Before modifying anything, inspect the complete repository and produce an implementation report.

Tasks:

1. Read:
   - package.json
   - package-lock.json
   - main.js
   - preload.js
   - index.html
   - vite.config.js
   - every file under src/
   - the README
   - the embedded Glance integration
   - existing build and packaging configuration

2. Describe:
   - Electron main-process architecture
   - preload API and IPC channels
   - renderer entry points
   - vtk.js viewer architecture
   - file-loading flow
   - Glance embedding mechanism
   - current security boundaries
   - current build and packaging workflow
   - technical debt that will interfere with a reservoir viewer

3. Run the existing commands:
   - npm ci
   - npm run build

4. Do not modify files.

5. Return:
   - repository map
   - verified build commands
   - current problems
   - recommended migration order
   - files likely to be changed in the next step
   - any assumptions that still need verification

Do not inspect, quote, translate, or use source code from ResInsight or any GPL reservoir application.
```

Acceptance criteria:

* No repository files changed.
* Existing build result is documented.
* Copilot identifies the actual renderer structure rather than assuming one.
* The report identifies whether JavaScript-to-TypeScript migration can be incremental.

---

## Prompt 1 — Add permanent Copilot and clean-room instructions

```text
Create `.github/copilot-instructions.md` for this repository.

The instructions must establish these permanent rules:

PROJECT DIRECTION

- This is a commercial Electron scientific visualization product.
- Use Electron as the desktop shell and vtk.js as the primary 3D renderer.
- Implement reservoir functionality independently.
- Prefer TypeScript for all new renderer, domain, parsing, worker, and test code.
- Existing JavaScript may be migrated incrementally.

CLEAN-ROOM AND LICENSING RULES

- Never inspect, copy, translate, adapt, reproduce, or imitate ResInsight source code.
- Never use ResInsight classes, internal data structures, comments, tests, shaders, constants, naming conventions, or architecture as an implementation source.
- Never add GPL, AGPL, SSPL, BUSL, source-available, or unclear-license dependencies.
- Allowed dependency families are MIT, BSD-2-Clause, BSD-3-Clause, Apache-2.0, ISC, Zlib, and Boost, subject to verification.
- Before adding any dependency, report:
  - package name
  - version
  - license
  - purpose
  - whether it is required or optional
- Prefer implementation from public specifications and published mathematics.
- Keep a record of public specifications used to implement every parser.
- Do not implement proprietary binary formats unless lawful public documentation or a suitably licensed SDK is available.

ARCHITECTURE RULES

- Renderer code must never receive unrestricted Node.js access.
- Keep nodeIntegration disabled.
- Keep contextIsolation enabled.
- Enable Electron sandboxing where compatible.
- Expose narrowly scoped preload functions.
- Validate every IPC request and response.
- Do not transfer large scientific arrays as base64 or ordinary number arrays.
- Use ArrayBuffer and typed arrays.
- Use Web Workers for CPU-intensive parsing and geometry extraction.
- Keep domain models independent of Electron and vtk.js.
- Keep parsing, domain modeling, geometry generation, rendering, and UI in separate modules.
- Preserve original reservoir cell IDs through geometry generation and picking.
- Rebase large coordinates around a documented local origin before sending Float32 positions to WebGL.

QUALITY RULES

- Add tests with every feature.
- Prefer deterministic synthetic fixtures.
- Test malformed input and cancellation paths.
- Do not claim success until tests and `npm run build` pass.
- Do not suppress TypeScript errors.
- Do not use `any` except at isolated third-party boundaries with a comment.
- Avoid giant files; split modules by responsibility.
- Do not rewrite unrelated existing functionality.
- Maintain backward compatibility with the current editor and VTK workflows unless a task explicitly replaces them.

WORKFLOW

For each requested task:

1. Inspect relevant existing files.
2. State a short implementation plan.
3. Make the smallest coherent change.
4. Add or update tests.
5. Run formatting, type checking, tests, and build.
6. Report changed files and command results.
7. Do not commit or push unless explicitly requested.

Also add reusable prompt files under `.github/prompts/`:

- `implement-feature.prompt.md`
- `review-feature.prompt.md`
- `validate-parser.prompt.md`
- `license-audit.prompt.md`

Each prompt file should reinforce the same commercial clean-room policy and require tests and build verification.

Do not implement reservoir functionality in this task.
```

Acceptance criteria:

* `.github/copilot-instructions.md` exists.
* Instructions explicitly prohibit GPL-derived implementation.
* Four reusable prompt files exist.
* Existing application behavior is unchanged.

Suggested commit:

`chore: add commercial clean-room Copilot instructions`

---

## Prompt 2 — Establish TypeScript and automated testing

```text
Incrementally introduce TypeScript and automated testing without breaking the current application.

Requirements:

1. Add TypeScript configuration suitable for:
   - Vite renderer code
   - Web Workers
   - DOM APIs
   - Node/Electron main and preload code
   - strict type checking

2. Add a lightweight permissively licensed test stack:
   - Vitest for unit tests
   - jsdom only where DOM behavior is required
   - avoid adding a full UI framework

3. Add scripts:
   - `typecheck`
   - `test`
   - `test:watch`
   - `test:coverage`
   - `check`, which runs typecheck, tests, and build

4. Do not migrate the entire application at once.

5. Create these initial TypeScript modules:
   - `src/domain/result.ts`
   - `src/domain/units.ts`
   - `src/domain/coordinates.ts`

6. Add tests for:
   - result/error helper behavior
   - unit metadata validation
   - coordinate-origin rebasing and restoration

7. Keep current VTK and editor behavior operational.

8. Update README with verified development commands.

9. Run:
   - npm ci
   - npm run typecheck
   - npm test
   - npm run build

Report exact results and any warnings.
```

Important design requirement:

The coordinate module should distinguish:

* original world coordinates, preferably Float64
* local rendering coordinates, normally Float32
* local origin
* conversion in both directions

Acceptance criteria:

* Strict TypeScript works.
* Tests execute in CI-compatible headless mode.
* Existing build still succeeds.
* No reservoir format code is added yet.

Suggested commit:

`build: add TypeScript and Vitest foundation`

---

## Prompt 3 — Create the independent reservoir data contract

```text
Implement a versioned, renderer-independent reservoir data model.

Create modules under:

`src/reservoir/domain/`

Required types:

1. `CaseMetadata`
   - schemaVersion
   - caseId
   - caseName
   - sourceFormat
   - coordinateReferenceSystem
   - units
   - localOrigin
   - creation metadata

2. `StructuredGridDimensions`
   - nx
   - ny
   - nz
   - totalCellCount

3. `CornerPointGridGeometry`
   - dimensions
   - COORD-like pillar coordinates or normalized equivalent
   - ZCORN-like corner depths or normalized equivalent
   - optional ACTNUM
   - original cell IDs
   - coordinate convention metadata

4. `ExplicitCellGeometry`
   - Float64 or Float32 point coordinates
   - typed connectivity arrays
   - cell offsets
   - cell types
   - original cell IDs

5. `PropertyDescriptor`
   - id
   - keyword
   - displayName
   - unit
   - location: cell or point
   - value type
   - null/undefined representation
   - static or dynamic
   - optional min/max metadata

6. `PropertyFrame`
   - property ID
   - time-step index
   - timestamp or simulation time
   - typed numeric values
   - validity mask where needed

7. `WellTrajectory`
   - well ID and name
   - measured-depth array
   - XYZ array
   - datum and coordinate metadata

8. `WellLogCurve`
   - well ID
   - mnemonic
   - unit
   - description
   - depth reference
   - depth array
   - value array
   - null value
   - validity mask

9. `ReservoirCase`
   - metadata
   - one or more grids
   - property catalog
   - wells
   - time-step catalog

Requirements:

- No Electron imports.
- No vtk.js imports.
- No ordinary `number[]` for large data.
- Validate typed-array lengths and grid dimensions.
- Use discriminated unions where useful.
- Add runtime validation without adding a heavy validation dependency unless justified.
- Add deterministic unit tests.
- Add documentation in `docs/reservoir-data-contract.md`.
- Include binary-transfer considerations and versioning rules.
- Include explicit cell-index convention:
  `cellId = i + nx * (j + ny * k)`
  unless a better convention is already established and documented.

Run typecheck, tests, and build.
```

Acceptance criteria:

* Data model compiles independently.
* Invalid array lengths are rejected.
* No rendering or Electron dependencies leak into the domain layer.

Suggested commit:

`feat: define versioned reservoir data contract`

---

## Prompt 4 — Generate synthetic reservoir fixtures

```text
Create an independently generated synthetic reservoir fixture system.

Do not download or use ResInsight test files.

Implement fixture generators under:

`src/reservoir/testing/fixtures/`

Generate:

1. A 1×1×1 orthogonal cell.
2. A 2×2×2 orthogonal grid.
3. A 3×2×2 grid with:
   - one inactive cell
   - one scalar property
   - known IJK-to-cell-ID mapping
4. A faulted corner-point grid with a deliberate pillar/depth discontinuity.
5. A pinched or degenerate cell case.
6. A large-coordinate case centered around realistic map coordinates to test origin rebasing.
7. Invalid fixtures:
   - incorrect ZCORN count
   - incorrect ACTNUM count
   - NaN coordinates
   - negative dimensions
   - inconsistent property length

For every valid fixture, include expected:

- dimensions
- total and active cell counts
- axis-aligned bounds
- visible exterior face count
- original cell IDs
- scalar min/max
- selected known cell centers

Serialize small human-readable fixture descriptions to JSON, but generate large arrays programmatically.

Add unit tests that prove the fixtures themselves are correct.

Add `docs/synthetic-fixtures.md`.
```

Acceptance criteria:

* All expected values are hand-derived or mathematically generated.
* Fixtures do not rely on third-party reservoir implementations.
* Future parser and geometry tests can reuse them.

Suggested commit:

`test: add synthetic reservoir fixtures`

---

## Prompt 5 — Implement boundary and fault face extraction

```text
Implement an independent reservoir surface-extraction engine.

Location:

`src/reservoir/geometry/`

Inputs:

- structured grid dimensions
- eight corners per cell, or equivalent corner-point representation
- ACTNUM/activity mask
- original cell IDs

Outputs:

- renderable point coordinates
- polygon connectivity
- per-face original cell ID
- per-face local face index
- per-face IJK
- face category:
  - exterior
  - inactive-neighbor boundary
  - fault/discontinuity
- optional neighbor cell ID
- model bounds
- geometry statistics

Requirements:

1. Do not render all six faces of every cell.
2. Remove faces shared by geometrically continuous active neighbors.
3. Retain faces where:
   - there is no neighbor
   - the neighbor is inactive
   - corresponding corners differ beyond a documented tolerance
4. Handle degenerate faces safely.
5. Preserve deterministic face ordering.
6. Use typed arrays for output.
7. Keep geometry logic independent of vtk.js.
8. Add cancellation support appropriate for later Web Worker use.
9. Add progress reporting without coupling to UI.
10. Add comprehensive tests using the synthetic fixtures.
11. Include expected face counts for orthogonal, inactive, and faulted cases.
12. Add benchmark scaffolding for a moderately sized generated grid.

Do not optimize prematurely with C++ or WASM. Implement clear TypeScript first.

Run typecheck, tests, benchmark smoke test, and build.
```

Acceptance criteria:

* A 1×1×1 active cell produces six visible faces.
* Adjacent continuous cells do not retain their shared interior face.
* Inactive neighbors expose the appropriate boundary.
* Fault discontinuities are retained.
* Original cell IDs survive extraction.

Suggested commit:

`feat: implement reservoir boundary face extraction`

---

## Prompt 6 — Move geometry processing into a Web Worker

```text
Move reservoir geometry extraction to a dedicated Web Worker.

Requirements:

1. Create a typed worker protocol with:
   - request ID
   - operation type
   - schema version
   - progress messages
   - success result
   - structured error
   - cancellation request

2. Transfer, rather than clone, large ArrayBuffers wherever ownership permits.

3. Support:
   - geometry extraction
   - cancellation
   - progress reporting
   - worker termination and restart
   - stale-result rejection

4. Do not send base64 data.
5. Do not send millions of JavaScript objects.
6. Ensure domain code remains callable directly in unit tests.
7. Add worker integration tests where supported by the test environment.
8. Add a fallback error message if Worker initialization fails.
9. Document buffer ownership rules.
10. Do not connect the worker to Electron IPC yet.

Run typecheck, tests, and build.
```

Acceptance criteria:

* Large arrays cross the worker boundary as transferable buffers.
* Cancellation does not update the application with stale geometry.
* Worker errors are converted to stable application errors.

Suggested commit:

`feat: add reservoir geometry worker`

---

## Prompt 7 — Build the dedicated vtk.js reservoir scene

```text
Create a dedicated vtk.js reservoir viewer without modifying the existing legacy VTK viewer more than necessary.

Suggested location:

`src/reservoir/rendering/`

Implement a `ReservoirViewer` API with:

- attach(container)
- setGeometry(...)
- setProperty(...)
- setVisibility(...)
- setIJKClip(...)
- setRepresentation(...)
- resetCamera()
- setGeologicalView(...)
- pick(x, y)
- resize()
- clear()
- dispose()

Required features:

1. Surface geometry rendering.
2. Cell-property coloring.
3. Lookup table and scalar range.
4. Undefined-value color/visibility behavior.
5. Optional edges.
6. Active/inactive filtering.
7. I, J, and K clipping.
8. Geological camera presets:
   - top
   - bottom
   - north
   - south
   - east
   - west
   - isometric
9. Picking that returns:
   - original cell ID
   - IJK
   - property value
   - world coordinate reconstructed from the local origin
10. Avoid rebuilding geometry when only property values change.
11. Proper disposal of vtk.js objects and event listeners.
12. ResizeObserver integration.
13. Unit-test all non-WebGL logic.
14. Add a development demo using the synthetic 3×2×2 fixture.

Keep vtk.js-specific types out of the domain layer.
```

Acceptance criteria:

* Synthetic grid renders.
* Property changes update scalars without re-extracting faces.
* Picking resolves the original reservoir cell.
* Large-coordinate fixture is displayed using a local origin.

Suggested commit:

`feat: add vtk.js reservoir viewer`

---

## Prompt 8 — Integrate a Reservoir tab into the Electron GUI

```text
Add a new Reservoir workspace tab to the existing Electron application.

Requirements:

1. Preserve current:
   - editor tab
   - legacy VTK tab
   - Glance tab
   - existing file workflows

2. Add:
   - Reservoir tab
   - model summary panel
   - property selector
   - active/inactive toggle
   - edge toggle
   - I/J/K clipping controls
   - camera presets
   - selected-cell inspector
   - progress and cancellation UI
   - clear error state

3. Initially load only synthetic reservoir fixtures.
4. Do not add GRDECL or binary format support yet.
5. Keep UI state separate from rendering state.
6. Do not introduce React, Vue, or another framework unless there is a documented need and explicit approval.
7. Ensure keyboard and resize behavior remain correct.
8. Add UI-level tests for state management where practical.
9. Update README with instructions for opening the synthetic reservoir demo.

Run typecheck, tests, and build.
```

Acceptance criteria:

* All existing tabs still work.
* Reservoir viewer can be tested without external data.
* Loading and cancellation states are visible.
* A selected cell displays IJK and property information.

Suggested commit:

`feat: integrate reservoir workspace`

---

## Prompt 9 — Secure binary file access through Electron IPC

```text
Implement secure reservoir-file access infrastructure without implementing a reservoir parser yet.

Main-process requirements:

1. Add a narrowly scoped open-file dialog for future reservoir files.
2. Return metadata first:
   - path token or internal handle
   - filename
   - extension
   - size
   - modified time
3. Do not expose unrestricted filesystem access to the renderer.
4. Do not return file paths where an opaque session token is sufficient.
5. Support ranged reads:
   - token
   - byte offset
   - byte length
6. Validate:
   - token
   - range
   - maximum request size
   - file still exists
7. Support token release.
8. Prevent arbitrary path injection.
9. Return ArrayBuffer-compatible binary data, not base64.
10. Reject reads beyond file bounds.
11. Add structured error codes.

Preload requirements:

- Expose only explicit methods.
- Freeze or otherwise protect the API.
- Do not expose ipcRenderer directly.

Electron requirements:

- Preserve contextIsolation.
- Preserve nodeIntegration=false.
- Enable sandboxing if compatible.
- Add a restrictive Content Security Policy.
- Review navigation and new-window behavior.

Tests:

- range validation
- invalid token
- released token
- oversized read
- out-of-bounds read
- successful ranged read using a temporary fixture

Do not implement EGRID, INIT, UNRST, or GRDECL parsing in this task.
```

Acceptance criteria:

* Renderer cannot select arbitrary filesystem paths.
* Large files can later be read incrementally.
* No base64 conversion remains in the new reservoir path.

Suggested commit:

`feat: add secure ranged reservoir file IPC`

---

## Prompt 10 — Implement an independent GRDECL tokenizer

```text
Implement only the lexical layer of an independent GRDECL-style ASCII reader.

Use public format descriptions and user-owned test data only. Do not consult GPL source code.

Create:

`src/reservoir/formats/grdecl/`

Tokenizer responsibilities:

1. Stream text rather than requiring the entire file as one string.
2. Recognize:
   - keywords
   - numbers
   - slash terminators
   - comments
   - quoted strings where applicable
   - repetition syntax such as `10*1.0`
   - default repetitions such as `10*`
   - scientific notation
3. Preserve:
   - line number
   - column
   - byte or character offset
4. Produce structured lexical errors.
5. Enforce configurable limits:
   - token count
   - repetition count
   - numeric array size
6. Support cancellation.
7. Do not interpret grid semantics yet.
8. Do not silently accept malformed repetition syntax.

Tests must cover:

- whitespace variations
- Windows and Unix newlines
- comments
- negative values
- exponent notation
- repetition
- default repetition
- slash termination
- malformed numbers
- unexpected EOF
- excessive repetition
- cancellation

Add a small corpus of independently written fixture files.
```

Acceptance criteria:

* Tokenizer has no vtk.js or Electron dependency.
* It supports streaming/chunk boundaries.
* Error locations are accurate.
* Maliciously large repetition counts are rejected.

Suggested commit:

`feat: add streaming GRDECL tokenizer`

---

## Prompt 11 — Parse the first GRDECL grid subset

```text
Build the semantic parser for this initial GRDECL subset:

- SPECGRID
- DIMENS as an accepted alternative when appropriate
- COORD
- ZCORN
- ACTNUM
- selected numeric cell-property keywords

Requirements:

1. Consume the existing tokenizer.
2. Produce the repository's versioned reservoir data contract.
3. Validate exact expected counts:
   - COORD
   - ZCORN
   - ACTNUM
   - cell properties
4. Clearly document the assumed ordering.
5. Preserve Float64 source geometry.
6. Preserve undefined/default values explicitly.
7. Treat unknown keywords safely:
   - skip only when termination can be determined reliably
   - record warnings
8. Never guess dimensions.
9. Provide precise errors with keyword and source location.
10. Add parser limits for memory safety.
11. Add tests for:
   - valid 1×1×1
   - valid 2×2×2
   - repetition syntax
   - missing keyword
   - incorrect count
   - duplicate dimensions
   - malformed termination
   - unknown keyword
   - inactive cells
   - property arrays
12. Add a parser provenance document listing the public specifications and references used.

Do not implement INCLUDE until secure include-path semantics have been designed.
Do not implement binary Eclipse formats.
```

Acceptance criteria:

* Parsed synthetic grid matches the programmatically generated equivalent.
* Count mismatches fail before rendering.
* Parser diagnostics identify the problematic keyword.

Suggested commit:

`feat: parse core GRDECL grid keywords`

---

## Prompt 12 — Connect GRDECL parsing to the GUI

```text
Connect the independent GRDECL parser to the Reservoir tab.

Flow:

1. User selects a supported ASCII grid file.
2. Main process creates a secure file token.
3. Renderer or parser worker reads the file in bounded chunks.
4. Tokenizer and parser report progress.
5. Parsed domain data is validated.
6. Geometry worker extracts visible faces.
7. Reservoir viewer displays the result.
8. UI displays warnings and model statistics.
9. Cancellation terminates outstanding parsing and geometry work.
10. File token is released when complete, canceled, or failed.

Requirements:

- Do not freeze the renderer.
- Do not load the complete file through base64.
- Prevent stale results if a second file is opened.
- Keep parser errors distinct from geometry and rendering errors.
- Display:
  - dimensions
  - active cell count
  - bounds
  - properties
  - warnings
  - parsing duration
  - geometry duration
- Add an end-to-end integration test using a small fixture.
- Add a manual test checklist.

Run typecheck, tests, and production build.
```

Acceptance criteria:

* A valid synthetic GRDECL file opens in the commercial GUI.
* A malformed file produces a useful error.
* Cancellation works during parsing and geometry generation.
* Existing editor, VTK, and Glance workflows still work.

Suggested commit:

`feat: open GRDECL reservoirs in viewer`

---

## Prompt 13 — Implement trajectory mathematics and CSV import

```text
Implement independent well-trajectory support using published directional-survey mathematics.

Supported inputs:

1. Explicit XYZ plus measured depth.
2. CSV deviation survey containing:
   - measured depth
   - inclination
   - azimuth
3. Configurable:
   - angle units
   - length units
   - azimuth convention
   - north reference
   - surface location
   - datum elevation

Implement the minimum-curvature method.

Requirements:

- Keep raw survey stations.
- Produce Float64 XYZ and MD arrays.
- Handle near-zero dogleg angle stably.
- Validate monotonically increasing measured depth.
- Reject impossible or non-finite values.
- Document coordinate and sign conventions.
- Do not silently infer degrees versus radians.
- Add tests for:
  - vertical well
  - straight deviated well
  - constant-build trajectory
  - azimuth change
  - zero dogleg
  - duplicate MD
  - decreasing MD
  - unit conversion
- Compare test cases against independently calculated analytic or spreadsheet values.
- Do not use ResInsight trajectory code or tests.

Add the resulting trajectory to the domain model but do not render it yet.
```

Acceptance criteria:

* Vertical and straight-line cases agree with analytic results.
* Survey metadata is preserved.
* Numerical handling near zero dogleg is stable.

Suggested commit:

`feat: add independent well trajectory engine`

---

## Prompt 14 — Render and inspect well trajectories

```text
Add well-trajectory rendering to the reservoir viewer.

Features:

- line and tube representations
- configurable radius
- per-well visibility
- per-well color
- well-name labels
- MD-based picking
- nearest trajectory station
- reconstructed world coordinates
- optional MD tick marks
- optional clipping to the reservoir bounds

Requirements:

- Geometry must use local rendering coordinates.
- Preserve Float64 world coordinates in the domain model.
- Do not rebuild reservoir geometry when wells change.
- Properly dispose all vtk.js objects.
- Support multiple wells.
- Avoid one actor per survey station.
- Add a trajectory control panel.
- Add tests for coordinate conversion and picking logic.
- Demonstrate with two synthetic wells crossing the synthetic reservoir.

Run all checks.
```

Acceptance criteria:

* Wells align with the model coordinate system.
* Picking reports well, MD, and world XYZ.
* Hiding a well does not affect reservoir geometry.

Suggested commit:

`feat: render reservoir well trajectories`

---

## Prompt 15 — Implement an independent LAS 2.0 parser

```text
Implement a LAS 2.0 parser based on the publicly available CWLS specification and independently written fixtures.

Do not inspect GPL implementations.

Support:

- version section
- well section
- curve section
- parameter section
- other section preservation
- ASCII data section
- wrapped and unwrapped data
- NULL handling
- mnemonic, unit, value, and description fields
- case-insensitive section names
- comments and blank lines
- depth curve identification
- multiple curves

Output the repository's `WellLogCurve` domain representation.

Requirements:

1. Preserve original metadata.
2. Use Float64Array for depth and values.
3. Represent nulls consistently with a validity mask or documented NaN strategy.
4. Validate row and curve counts.
5. Produce line-specific errors.
6. Add configurable row and curve limits.
7. Support cancellation for large files.
8. Add tests for:
   - minimal LAS 2.0
   - multiple curves
   - wrapped data
   - null values
   - missing version
   - missing ASCII section
   - inconsistent rows
   - duplicate mnemonics
   - unusual whitespace
   - exponent notation
9. Add `docs/las-parser-provenance.md` listing specifications used.
```

Acceptance criteria:

* Parser works without Electron or vtk.js imports.
* Null values never contaminate scalar ranges.
* Wrapped and unwrapped files produce equivalent curve data.

Suggested commit:

`feat: add independent LAS 2.0 parser`

---

## Prompt 16 — Add two-dimensional well-log tracks

```text
Create a two-dimensional well-log viewer integrated with the Reservoir workspace.

Do not use a large charting dependency unless a license and bundle-size justification is provided.

Features:

- shared vertical depth axis
- multiple tracks
- linear and logarithmic horizontal scales
- configurable curve ranges
- grid lines
- curve legend
- unit labels
- cursor depth
- zoom and pan
- null-gap handling
- curve visibility
- synchronized selected depth
- MD/TVD choice only when conversion data exists

Architecture:

- domain curves remain renderer-independent
- plotting module receives typed arrays
- interactions emit a typed selected-depth event
- reservoir viewer and log viewer share a small synchronization controller

Tests:

- logarithmic-scale validation
- null-gap segmentation
- depth-range clipping
- synchronized selection
- unit/range formatting

Add a synthetic LAS fixture and demonstrate synchronization with a synthetic trajectory.
```

Acceptance criteria:

* Selecting a log depth highlights the corresponding trajectory location.
* Selecting a trajectory position updates the log cursor.
* Missing MD coverage is handled explicitly.

Suggested commit:

`feat: add synchronized well-log tracks`

---

## Prompt 17 — Add dynamic property frame infrastructure

```text
Implement format-independent dynamic reservoir property infrastructure.

Do not implement UNRST parsing.

Implement:

- time-step catalog
- property-frame provider interface
- asynchronous frame loading
- cancellation
- bounded LRU frame cache
- prefetch of adjacent frames
- memory-budget accounting
- play/pause controller
- playback speed
- dropped-frame policy
- missing-frame behavior
- property changes without geometry rebuild

Create a synthetic frame provider generating pressure and saturation over time.

Requirements:

- Memory budget configurable in bytes.
- Cache reports current bytes and entries.
- Requests are deduplicated.
- Stale property requests cannot update the viewer.
- Playback pauses on unrecoverable errors.
- Add tests for:
  - eviction
  - deduplication
  - cancellation
  - stale responses
  - property switching
  - memory accounting
- Add performance instrumentation.

Integrate the synthetic provider into the Reservoir tab.
```

Acceptance criteria:

* Animation updates scalar arrays only.
* Cache never intentionally exceeds its configured budget except for one documented oversized frame policy.
* Rapid property changes do not show stale frames.

Suggested commit:

`feat: add dynamic reservoir frame pipeline`

---

## Prompt 18 — Performance profiling before native optimization

```text
Create a repeatable reservoir performance benchmark and profiling framework.

Generate test cases at increasing sizes, for example:

- small: approximately 10,000 cells
- medium: approximately 100,000 cells
- large: approximately 1,000,000 cells, when system memory permits

Measure separately:

- fixture generation
- parsing
- geometry extraction
- worker transfer
- vtk.js dataset construction
- first render
- property update
- picking
- peak estimated memory

Requirements:

- Do not claim exact GPU memory unless measured by a reliable API.
- Report transferred bytes and typed-array sizes.
- Run benchmarks outside ordinary unit tests.
- Produce machine-readable JSON and a Markdown summary.
- Identify the top three bottlenecks from evidence.
- Do not introduce C++, native modules, or WASM in this task.
- Recommend native/WASM work only if measurements justify it.
- Add regression thresholds that are generous enough for CI variability.
```

Acceptance criteria:

* Performance numbers are separated by pipeline stage.
* Bottlenecks are evidence-based.
* A baseline report is committed.

Suggested commit:

`perf: add reservoir pipeline benchmarks`

---

## Prompt 19 — Dependency, license, and package audit

```text
Audit the complete commercial product dependency tree and bundled assets.

Inspect:

- direct npm dependencies
- transitive npm dependencies
- Electron
- vtk.js
- Monaco
- Vite
- embedded Glance files
- ITK-related bundled assets
- build tooling
- test tooling
- copied static assets
- fonts, icons, shaders, and sample data

Produce:

1. `THIRD_PARTY_NOTICES.md`
2. machine-readable dependency/license inventory
3. `docs/license-audit.md`
4. list of:
   - allowed
   - requires review
   - prohibited
   - unknown
5. exact source and license location for copied assets
6. unresolved embedded-Glance concerns
7. recommendation on whether to retain or replace Glance

Requirements:

- Do not state that the application is legally risk-free.
- Flag ambiguous licenses.
- Do not automatically remove dependencies.
- Verify licenses from package metadata and upstream repositories.
- Add a CI command that fails for newly introduced prohibited licenses, with an explicit reviewed allowlist for exceptions.
- Record limitations of automated license identification.
```

Acceptance criteria:

* Every distributed dependency or asset has a known status or is explicitly flagged.
* Glance and its bundled dependencies are not treated as one package without inspection.
* CI detects future prohibited-license additions.

Suggested commit:

`chore: add dependency license audit`

---

## Prompt 20 — Security review and release gate

```text
Perform a release-oriented security review of the Electron application.

Review and improve:

- nodeIntegration
- contextIsolation
- sandbox
- preload API scope
- IPC sender validation
- IPC payload validation
- Content Security Policy
- navigation control
- new-window control
- file-token lifecycle
- path traversal risk
- oversized file and allocation attacks
- parser repetition bombs
- malformed binary/text inputs
- worker termination
- renderer error isolation
- dependency vulnerabilities
- production source maps
- packaging contents
- accidental inclusion of test data or local paths

Add:

- security checklist
- automated tests where feasible
- packaging-content verification
- release-gate script
- `SECURITY.md`
- threat model under `docs/threat-model.md`

Do not weaken existing security to make development easier.

Run:

- npm audit or the repository-approved equivalent
- typecheck
- tests
- build
- package dry run if practical

Document unresolved issues honestly.
```

Electron specifically recommends keeping Node integration disabled for untrusted content, enabling context isolation and sandboxing, defining a restrictive Content Security Policy, and carefully controlling navigation and permissions.

Acceptance criteria:

* Security controls are documented and testable.
* Release gate fails on critical known problems.
* Renderer does not obtain generic filesystem or IPC access.

Suggested commit:

`security: harden Electron reservoir workflows`

---

# Reusable prompt for every later feature

Use this before asking Copilot to implement any additional reservoir feature:

```text
Implement the requested feature in shubiuh/AI-editor-viewer under the repository's clean-room commercial-development rules.

Before editing:

1. Read `.github/copilot-instructions.md`.
2. Inspect the relevant current code and tests.
3. Confirm that the feature can be implemented from public specifications, published mathematics, or user-owned data.
4. Do not inspect or use ResInsight or other GPL source code.
5. List any proposed new dependency with its exact license and explain why it is necessary.
6. Give a short file-level implementation plan.

During implementation:

- Keep domain, parser, geometry, worker, vtk.js rendering, Electron IPC, and UI responsibilities separate.
- Use strict TypeScript.
- Use typed arrays for scientific data.
- Preserve original cell and well identifiers.
- Add cancellation and structured errors to long-running operations.
- Add deterministic tests, including malformed input.
- Avoid unrelated refactoring.

Before finishing:

1. Run typecheck.
2. Run all tests.
3. Run the production build.
4. Report exact command outcomes.
5. List changed files.
6. Explain important design decisions.
7. State unresolved limitations.
8. Do not commit or push unless explicitly requested.
```

# Reusable Copilot review prompt

```text
Review the current branch as a commercial scientific-software code reviewer.

Check:

- accidental GPL-derived or unclear-license dependencies
- violations of the clean-room policy
- Electron security boundary violations
- unrestricted preload or IPC exposure
- missing payload validation
- base64 or ordinary-array transfer of large numerical data
- typed-array ownership bugs
- coordinate precision loss
- lost original cell IDs
- wrong IJK/cell indexing
- interior-face duplication
- incorrect fault-face handling
- null-value contamination
- worker cancellation races
- stale asynchronous result updates
- vtk.js resource leaks
- geometry rebuilds during scalar-only changes
- insufficient malformed-input tests
- unbounded allocations
- missing disposal and cleanup
- changes that break editor, VTK, or Glance behavior

Do not modify files initially.

Return findings ordered by severity with:

- file and line
- failure scenario
- technical consequence
- recommended correction
- missing test

After presenting findings, implement only confirmed high- and medium-severity fixes, then run typecheck, tests, and build.
```

# Features that should remain deferred

Do not ask Copilot to implement these until lawful documentation or a suitably licensed commercial SDK has been identified:

* EGRID binary parsing
* INIT binary parsing
* UNRST binary parsing
* proprietary fault or well formats
* direct compatibility based on reverse engineering another application's source
* ResInsight runtime integration
* copied ResInsight algorithms or visual behavior
* opaque native libraries with unclear redistribution terms

```
```
