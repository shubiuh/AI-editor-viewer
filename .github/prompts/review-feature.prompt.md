---
description: Review a feature for commercial clean-room, security, and quality risks
---

Review the requested feature in this commercial Electron scientific visualization product. Lead with actionable findings ordered by severity, then list assumptions and remaining test gaps.

Apply the repository instructions in `.github/copilot-instructions.md`. Treat clean-room and licensing compliance as release-blocking: do not inspect, copy, translate, adapt, reproduce, or imitate ResInsight source code or its classes, internal data structures, comments, tests, shaders, constants, naming conventions, or architecture. Verify that parser implementations use lawful public specifications or published mathematics, retain a record of those specifications, and do not implement proprietary binary formats without lawful documentation or a suitably licensed SDK.

Check every added dependency for an allowed, verified license: MIT, BSD-2-Clause, BSD-3-Clause, Apache-2.0, ISC, Zlib, or Boost. Flag GPL, AGPL, SSPL, BUSL, source-available, unclear-license dependencies, or missing dependency reports containing package name, version, license, purpose, and required/optional status.

Review for Electron security, narrow and validated IPC, renderer isolation, typed-array and worker use, domain independence from Electron and vtk.js, stable original cell IDs, coordinate rebasing, TypeScript quality, focused module boundaries, backward compatibility, deterministic tests, malformed input handling, cancellation, and build verification. Run relevant tests and `npm run build` when possible. Do not modify code unless specifically requested, and do not commit or push.