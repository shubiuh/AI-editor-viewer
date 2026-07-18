# Commercial Dependency and Asset License Audit

This is a technical inventory and policy screen, not legal advice and not a conclusion that the application is legally risk-free. A qualified reviewer must confirm release obligations, commercial terms, trademark use, export restrictions, notices, and the provenance of copied material before distribution.

Generated data is in [dependency-license-inventory.json](../licenses/dependency-license-inventory.json). Run `npm run audit:licenses` after lockfile or public-asset changes. CI should run `npm run audit:licenses:check`; it fails for a newly introduced prohibited npm license unless the exact `name@version` is explicitly present in `licenses/license-policy.json` as a reviewed exception.

## Scope and Sources

The inventory reads all 507 `package-lock.json` package records and each installed package's `package.json`, including direct and transitive dependencies. Every file under `public` is listed with byte size and SHA-256. It covers the application build inputs, not a legal audit of the operating system or remote resources.

Direct package verification used installed metadata plus the following upstream project license locations:

| Component | Installed version | License | Upstream license/source |
| --- | --- | --- | --- |
| vtk.js | 36.5.0 | BSD-3-Clause | https://github.com/Kitware/vtk-js/blob/master/LICENSE |
| Monaco Editor | 0.53.0 | MIT | https://github.com/microsoft/monaco-editor/blob/main/LICENSE |
| Electron | 43.1.1 | MIT | https://github.com/electron/electron/blob/main/LICENSE |
| Vite | 8.1.5 | MIT | https://github.com/vitejs/vite/blob/main/LICENSE |
| Vitest | 4.1.10 | MIT | https://github.com/vitest-dev/vitest/blob/main/LICENSE |
| Electron Builder | 26.15.3 | MIT | `node_modules/electron-builder/package.json` and its declared repository |
| TypeScript | 7.0.2 | Apache-2.0 | `node_modules/typescript/package.json` and https://github.com/microsoft/TypeScript |
| jsdom | 29.1.1 | MIT | `node_modules/jsdom/package.json` and its declared repository |

The project is packaged by Electron Builder from `main.js`, `preload.js`, `electron/**`, `package.json`, and `dist/**`. Build tooling and test tooling are therefore captured in the npm inventory; their runtime inclusion still depends on the package configuration and produced installer.

## Policy Classes

The policy is intentionally conservative and lives in `licenses/license-policy.json`.

- **Allowed:** exact metadata licenses on the policy allowlist: Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC, MIT, MIT-0, 0BSD, CC0-1.0, Python-2.0, Unlicense, and WTFPL. The current npm inventory has 479 allowed records.
- **Requires review:** 27 npm records with licenses outside the allowlist, including CC-BY-4.0 (`caniuse-lite`), MPL-2.0 (`lightningcss` and platform packages), BlueOak-1.0.0 packages, and dual expressions such as `(MIT AND Zlib)`, `WTFPL OR ISC`, and `MIT OR CC0-1.0`. These may be commercially usable, but the policy does not auto-approve them.
- **Prohibited:** license strings matching AGPL, GPL, SSPL, BUSL, or Business Source. The current npm inventory contains zero prohibited records.
- **Unknown:** one npm record (`rechoir@0.6.2`) has no detected license field. It requires manual upstream verification. Copied Glance assets have unresolved per-file provenance and are deliberately not promoted to allowed.

The generated JSON is the authoritative complete list; this document highlights the material exceptions rather than duplicating hundreds of permissive transitive records.

## Copied Static Assets

The asset manifest records every file's exact repository path, byte count, SHA-256, source field, license field, and license-location field. This gives an exact lookup key even where the source revision is missing.

| Copied asset set | Exact local paths | Claimed/candidate source | License location | Status |
| --- | --- | --- | --- | --- |
| ITK JavaScript distribution and 34 WebAssembly bindings | `public/glance/itk/**` | https://github.com/InsightSoftwareConsortium/itk-js, identified by `public/glance/itk/package.json` as `itk@13.1.4` | `public/glance/itk/LICENSE` | Apache-2.0 metadata/license present; review included generated/binary subcomponents and notices before release. |
| Embedded Glance application, runtime, styles, icons, fonts, photos, ParaView image, Workbox/ITK external bundles | `public/glance/**` excluding the ITK subtree and the vendor notice | Candidate: https://github.com/Kitware/glance; `public/glance/version.js` says only `master` | Candidate upstream: https://github.com/Kitware/glance/blob/master/LICENSE; no copied Glance `LICENSE`/`COPYRIGHT` is present | Requires review. Exact tag/commit, acquisition source, and per-file provenance are not recorded. |
| Vendor-bundle notices | `public/glance/vendors.9bac376696ed4f321f8f.js.LICENSE.txt` | Embedded Glance vendor bundle | Same local file | Requires review: it identifies JSZip dual MIT/GPLv3, pako MIT, js-cookie MIT, Vue/Vuex MIT, buffer MIT, and regenerator-runtime MIT, but does not identify a complete dependency graph or chosen JSZip license. |

The `public/glance` folder contains 34 `.wasm` files, 28 webfont files, 11 SVGs, 9 JPEGs, JavaScript bundles, source maps, and other copied artifacts. Treat fonts, images, icons, shaders if introduced later, and sample data as independently licensable unless the source distribution proves otherwise.

## Embedded Glance Concerns

1. `GLANCE_VERSION` is `master`, not a pinned release/tag/commit. Source equivalence to the copied hashes has not been demonstrated.
2. The copied distribution omits Glance's own `LICENSE` and `COPYRIGHT`; the upstream repository is BSD-3-Clause, but that is candidate provenance, not verified source correspondence.
3. The vendor license file is partial and identifies a dual-licensed JSZip component. The selected license and complete bundle dependency versions are not recorded.
4. ITK's package metadata and Apache-2.0 license are present, but the generated WASM/ImageIO binaries may include additional upstream components and notices not represented in the top-level package file.
5. Photos, fonts, SVGs, the ParaView image, service-worker assets, and source maps lack per-file source attribution. Hashes alone do not establish rights.
6. Electron's packaged Chromium/FFmpeg/Node components are not fully enumerated by `package-lock.json`; a release audit must collect notices from the exact Electron binary used in the installer.

## Recommendation

Do **not** treat the current embedded Glance copy as release-ready for a commercial product. Retain it only temporarily for development or after legal approval that is tied to a pinned, reproducible Glance release and complete notice bundle. Prefer replacing it with the application-owned reservoir viewer unless Glance provides an essential workflow that cannot be replicated.

If retained, first replace `public/glance` with a documented upstream release artifact; record upstream tag/commit, archive hash, acquisition date, complete `LICENSE`/`COPYRIGHT`/`NOTICE` files, the generated asset manifest, and all ITK/VTK/Workbox/vendor obligations. This is not a recommendation to remove dependencies automatically.

## Automation Limitations

Automated identification reads declared metadata, not source-code semantics. It can miss custom licenses, malformed SPDX expressions, vendored dependencies, generated code, platform-specific Electron contents, binary/WASM internals, font/image licenses, patents, trademarks, export controls, and obligations imposed by distribution contracts. A policy match is not legal clearance; absence of a prohibited string is not proof of compatibility.