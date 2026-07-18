---
description: Validate a clean-room scientific data parser
---

Validate the requested parser for this commercial Electron scientific visualization product.

Follow `.github/copilot-instructions.md`. This is clean-room work: do not inspect, copy, translate, adapt, reproduce, or imitate ResInsight source code, classes, internal data structures, comments, tests, shaders, constants, naming conventions, or architecture. Validate that the parser is based only on lawful public specifications, a suitably licensed SDK, or published mathematics. Record the exact public specifications used. Do not implement proprietary binary formats without lawful public documentation or a suitably licensed SDK.

1. Inspect the parser, its domain model, geometry boundary, worker boundary, fixtures, and public specification record.
2. State a concise validation plan and identify format assumptions, byte order, units, coordinate conventions, scalar associations, and limits.
3. Verify validation and error messages for malformed, truncated, inconsistent, unsupported, and oversized input.
4. Verify cancellation, progress, worker messaging, transferables, typed arrays, deterministic output, preservation of original cell IDs, and documented coordinate rebasing where applicable.
5. Verify the domain model remains independent of Electron and vtk.js.
6. Add or update deterministic synthetic fixtures and tests when changes are requested.
7. Run formatting, type checking, parser tests, and `npm run build`. Do not claim success until they pass.

Report changed files, test/build results, remaining assumptions, and any dependencies added with package name, version, verified license, purpose, and required/optional status. Never add GPL, AGPL, SSPL, BUSL, source-available, or unclear-license dependencies. Do not commit or push unless explicitly requested.