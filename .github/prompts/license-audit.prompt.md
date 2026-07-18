---
description: Audit dependency licensing for commercial clean-room use
---

Perform a license and clean-room audit for this commercial Electron scientific visualization product.

Follow `.github/copilot-instructions.md`. Do not inspect, copy, translate, adapt, reproduce, or imitate ResInsight source code or its classes, internal data structures, comments, tests, shaders, constants, naming conventions, or architecture. Reservoir functionality must remain independently implemented from public specifications and published mathematics. Do not implement proprietary binary formats without lawful public documentation or a suitably licensed SDK.

For every proposed or newly added dependency, report:

- Package name
- Exact version
- Verified license and evidence source
- Purpose
- Required or optional status

Allow only verified MIT, BSD-2-Clause, BSD-3-Clause, Apache-2.0, ISC, Zlib, and Boost licenses. Flag and reject GPL, AGPL, SSPL, BUSL, source-available, unclear-license, incompatible, or unverified dependencies. Identify transitive dependency risks, bundled assets, generated code, native binaries, and license-notice obligations.

Inspect the dependency manifests and lockfile, state a short audit plan, and preserve backward compatibility without unrelated rewrites. Add or update audit tests or checks when applicable. Run available verification, including `npm run build`, before claiming success. Report the audited files, findings, dependency table, command results, unresolved assumptions, and any required follow-up. Do not commit or push unless explicitly requested.