# Copilot Instructions

## Project Direction

- This is a commercial Electron scientific visualization product.
- Use Electron as the desktop shell and vtk.js as the primary 3D renderer.
- Implement reservoir functionality independently.
- Prefer TypeScript for all new renderer, domain, parsing, worker, and test code.
- Existing JavaScript may be migrated incrementally.

## Clean-Room and Licensing Rules

- Never inspect, copy, translate, adapt, reproduce, or imitate ResInsight source code.
- Never use ResInsight classes, internal data structures, comments, tests, shaders, constants, naming conventions, or architecture as an implementation source.
- Never add GPL, AGPL, SSPL, BUSL, source-available, or unclear-license dependencies.
- Allowed dependency families are MIT, BSD-2-Clause, BSD-3-Clause, Apache-2.0, ISC, Zlib, and Boost, subject to verification.
- Before adding any dependency, report its package name, version, license, purpose, and whether it is required or optional.
- Prefer implementation from public specifications and published mathematics.
- Keep a record of public specifications used to implement every parser.
- Do not implement proprietary binary formats unless lawful public documentation or a suitably licensed SDK is available.

## Architecture Rules

- Renderer code must never receive unrestricted Node.js access.
- Keep `nodeIntegration` disabled.
- Keep `contextIsolation` enabled.
- Enable Electron sandboxing where compatible.
- Expose narrowly scoped preload functions.
- Validate every IPC request and response.
- Use `ArrayBuffer` and typed arrays for binary data.
- Use Web Workers for CPU-intensive parsing and geometry extraction.
- Keep domain models independent of Electron and vtk.js.
- Keep parsing, domain modeling, geometry generation, rendering, and UI in separate modules.
- Preserve original reservoir cell IDs through geometry generation and picking.
- Rebase large coordinates around a documented local origin before sending Float32 positions to WebGL.

## Quality Rules

- Add tests with every feature.
- Prefer deterministic synthetic fixtures.
- Test malformed input and cancellation paths.
- Do not claim success until tests and `npm run build` pass.
- Do not suppress TypeScript errors.
- Do not use `any` except at isolated third-party boundaries with a comment.
- Avoid giant files; split modules by responsibility.
- Do not rewrite unrelated existing functionality.
- Maintain backward compatibility with the current editor and VTK workflows unless a task explicitly replaces them.

## Workflow

For each requested task:

1. Inspect relevant existing files.
2. State a short implementation plan.
3. Make the smallest coherent change.
4. Add or update tests.
5. Run formatting, type checking, tests, and build.
6. Report changed files and command results.
7. Do not commit or push unless explicitly requested.