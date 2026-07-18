---
description: Implement a commercial clean-room feature with verification
---

Implement the requested feature for this commercial Electron scientific visualization product.

Follow the repository instructions in `.github/copilot-instructions.md`. Do not inspect, copy, translate, adapt, reproduce, or imitate ResInsight source code, architecture, naming, tests, shaders, constants, or data structures. Implement reservoir functionality independently from lawful public specifications and published mathematics. Record every public specification used by a parser. Do not implement proprietary binary formats without lawful public documentation or a suitably licensed SDK.

Before adding a dependency, report its package name, version, verified license, purpose, and whether it is required or optional. Use only dependencies with verified MIT, BSD-2-Clause, BSD-3-Clause, Apache-2.0, ISC, Zlib, or Boost licenses. Do not add GPL, AGPL, SSPL, BUSL, source-available, or unclear-license dependencies.

1. Inspect the relevant existing files and state a short plan.
2. Make the smallest coherent change. Prefer TypeScript for new renderer, domain, parser, worker, and test code; migrate existing JavaScript incrementally only when useful.
3. Keep Electron security boundaries intact: no unrestricted renderer Node.js access, `nodeIntegration` disabled, `contextIsolation` enabled, narrow validated preload IPC, and sandboxing where compatible.
4. Keep parsing, domain, geometry, rendering, and UI separate. Use typed arrays, workers for CPU-intensive work, stable reservoir cell IDs, and documented coordinate rebasing when applicable.
5. Add deterministic tests, including malformed input and cancellation paths where relevant.
6. Run formatting, type checking, tests, and `npm run build`. Do not claim success until they pass.
7. Report changed files and command results. Do not commit or push unless explicitly requested.