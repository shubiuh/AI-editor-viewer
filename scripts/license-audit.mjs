import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

const root = process.cwd();
const lockPath = join(root, "package-lock.json");
const policyPath = join(root, "licenses", "license-policy.json");
const inventoryPath = join(root, "licenses", "dependency-license-inventory.json");
const noticesPath = join(root, "THIRD_PARTY_NOTICES.md");
const checkOnly = process.argv.includes("--check");

const policy = JSON.parse(readFileSync(policyPath, "utf8"));
const lock = JSON.parse(readFileSync(lockPath, "utf8"));
const packages = Object.entries(lock.packages ?? {})
  .filter(([packagePath]) => packagePath.startsWith("node_modules/"))
  .map(([packagePath, metadata]) => npmRecord(packagePath, metadata))
  .sort((left, right) => left.name.localeCompare(right.name) || left.version.localeCompare(right.version));
const assets = scanAssets(join(root, "public"));
const inventory = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  generator: "scripts/license-audit.mjs",
  scope: {
    packageLock: "package-lock.json",
    staticAssetRoots: ["public"],
    excluded: ["node_modules contents beyond installed package metadata", "Electron/Chromium runtime subcomponents not enumerated by npm metadata", "remote content loaded at runtime"]
  },
  policy,
  npmPackages: packages,
  staticAssets: assets,
  summary: summarize(packages, assets)
};

if (checkOnly) {
  const violations = packages.filter((entry) => entry.classification === "prohibited" && !policy.reviewedExceptions.includes(exceptionKey(entry)));
  if (violations.length > 0) {
    console.error("Unreviewed prohibited dependency licenses detected:");
    for (const violation of violations) {
      console.error(`- ${exceptionKey(violation)}: ${violation.license ?? "unknown"}`);
    }
    process.exitCode = 1;
  } else {
    console.log("License policy check passed: no unreviewed prohibited npm licenses.");
  }
} else {
  writeFileSync(inventoryPath, `${JSON.stringify(inventory, null, 2)}\n`);
  writeFileSync(noticesPath, renderNotices(inventory));
  console.log(`Wrote ${relative(root, inventoryPath)} and ${relative(root, noticesPath)}.`);
}

function npmRecord(packagePath, metadata) {
  const installedMetadata = readInstalledMetadata(packagePath);
  const packageJson = installedMetadata ?? {};
  const name = metadata.name ?? packagePath.replace(/^node_modules\//, "");
  const license = normalizeLicense(metadata.license ?? packageJson.license);
  const repository = repositoryUrl(packageJson.repository);
  const direct = Boolean(lock.packages?.[""]?.dependencies?.[name] || lock.packages?.[""]?.devDependencies?.[name]);
  const record = {
    type: "npm",
    name,
    version: metadata.version ?? packageJson.version ?? "unknown",
    direct,
    developmentOnly: metadata.dev === true,
    license,
    classification: classify(license),
    packageMetadataLocation: normalizePath(join(packagePath, "package.json")),
    lockfileLocation: "package-lock.json",
    upstreamRepository: repository,
    source: metadata.resolved ?? packageJson._resolved ?? "not recorded",
    notes: license ? [] : ["No SPDX/license value was found in package-lock metadata or installed package.json; manual review required."]
  };
  return record;
}

function readInstalledMetadata(packagePath) {
  const path = join(root, packagePath, "package.json");
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : undefined;
}

function repositoryUrl(repository) {
  if (typeof repository === "string") return repository.replace(/^git\+/, "").replace(/\.git$/, "");
  if (repository && typeof repository.url === "string") return repository.url.replace(/^git\+/, "").replace(/\.git$/, "");
  return undefined;
}

function normalizeLicense(value) {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (value && typeof value.type === "string") return value.type;
  return undefined;
}

function classify(license) {
  if (!license) return "unknown";
  if (policy.allowedLicenses.includes(license)) return "allowed";
  if (policy.prohibitedLicensePatterns.some((pattern) => new RegExp(pattern, "i").test(license))) return "prohibited";
  return "requires-review";
}

function scanAssets(publicRoot) {
  if (!existsSync(publicRoot)) return [];
  return visit(publicRoot).map((path) => {
    const workspacePath = normalizePath(relative(root, path));
    const bytes = readFileSync(path);
    const glance = workspacePath.startsWith("public/glance/");
    const itk = workspacePath.startsWith("public/glance/itk/");
    const known = knownAsset(workspacePath);
    return {
      type: "static-asset",
      path: workspacePath,
      bytes: bytes.byteLength,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      category: assetCategory(workspacePath),
      copiedAsset: glance,
      source: known.source,
      license: known.license,
      licenseLocation: known.licenseLocation,
      classification: known.classification,
      notes: known.notes
    };
  });
}

function visit(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? visit(path) : entry.isFile() ? [path] : [];
  });
}

function knownAsset(path) {
  if (path === "public/glance/itk/package.json" || path === "public/glance/itk/LICENSE" || path.startsWith("public/glance/itk/")) {
    const topLevelItkRecord = path === "public/glance/itk/package.json" || path === "public/glance/itk/LICENSE";
    return {
      source: "https://github.com/InsightSoftwareConsortium/itk-js (package metadata identifies itk 13.1.4)",
      license: "Apache-2.0",
      licenseLocation: "public/glance/itk/LICENSE",
      classification: topLevelItkRecord ? "allowed" : "requires-review",
      notes: [topLevelItkRecord
        ? "Top-level ITK package metadata and Apache-2.0 license are present."
        : "Copied ITK generated/binary asset; verify its source release and included third-party notices before commercial release."]
    };
  }
  if (path === "public/glance/vendors.9bac376696ed4f321f8f.js.LICENSE.txt") {
    return {
      source: "Embedded Glance vendor bundle; individual bundled notices",
      license: "mixed",
      licenseLocation: path,
      classification: "requires-review",
      notes: ["Bundle notice identifies JSZip dual MIT/GPLv3, pako MIT, js-cookie MIT, Vue MIT, Vuex MIT, buffer MIT, and regenerator-runtime MIT; exact source revision and selected JSZip license are not recorded."]
    };
  }
  if (path.startsWith("public/glance/")) {
    return {
      source: "Candidate upstream: https://github.com/Kitware/glance; exact upstream tag/commit and copy source are not recorded",
      license: "BSD-3-Clause candidate",
      licenseLocation: "Candidate upstream: https://github.com/Kitware/glance/blob/master/LICENSE; no copied LICENSE is present",
      classification: "requires-review",
      notes: ["Copied embedded-Glance asset has no per-file provenance record. The SHA-256 is retained for source/release matching before distribution."]
    };
  }
  return { source: "Repository-authored or provenance not recorded", license: undefined, licenseLocation: undefined, classification: "unknown", notes: ["Confirm ownership or add a provenance record before distribution."] };
}

function assetCategory(path) {
  const extension = path.split(".").pop()?.toLowerCase();
  if (["woff", "woff2", "ttf", "eot"].includes(extension)) return "font";
  if (["svg", "png", "jpg", "jpeg", "gif", "webp"].includes(extension)) return "image-or-icon";
  if (["js", "cjs", "mjs"].includes(extension)) return "script";
  if (extension === "wasm") return "wasm";
  if (extension === "css") return "stylesheet";
  return "other";
}

function summarize(packages, assets) {
  return {
    npmPackages: summarizeClassification(packages),
    staticAssets: summarizeClassification(assets),
    directPackages: packages.filter((entry) => entry.direct).map((entry) => ({ name: entry.name, version: entry.version, license: entry.license, classification: entry.classification }))
  };
}

function summarizeClassification(entries) {
  return Object.fromEntries(["allowed", "requires-review", "prohibited", "unknown"].map((classification) => [classification, entries.filter((entry) => entry.classification === classification).length]));
}

function renderNotices(inventory) {
  const direct = inventory.summary.directPackages.map((entry) => `| ${entry.name} | ${entry.version} | ${entry.license ?? "Unknown"} | ${entry.classification} |`).join("\n");
  const reviewed = inventory.npmPackages.filter((entry) => entry.classification !== "allowed").map((entry) => `- ${entry.name}@${entry.version}: ${entry.license ?? "Unknown"} (${entry.classification})`).join("\n") || "- None";
  return `# Third-Party Notices\n\nGenerated from package-lock metadata and installed package metadata by \`npm run audit:licenses\`. This document is an attribution and inventory aid, not legal advice and not a finding that distribution is legally risk-free.\n\n## Direct Dependencies and Tools\n\n| Package | Version | License metadata | Audit class |\n| --- | --- | --- | --- |\n${direct}\n\n## Review-Required npm Records\n\n${reviewed}\n\n## Copied Assets\n\nThe complete hash-addressed copied-asset inventory, including source and license-location fields, is in \`licenses/dependency-license-inventory.json\`. The embedded Glance distribution includes ITK assets under Apache-2.0 at \`public/glance/itk/LICENSE\`, plus a vendor-bundle notice at \`public/glance/vendors.9bac376696ed4f321f8f.js.LICENSE.txt\`. Other Glance assets have unresolved per-file provenance and must be reviewed before commercial distribution.\n\n## Generated Scope\n\n- npm dependency tree: ${inventory.npmPackages.length} lockfile packages\n- copied/static assets: ${inventory.staticAssets.length} files under \`public\`\n- policy: \`licenses/license-policy.json\`\n`;
}

function exceptionKey(entry) {
  return `${entry.name}@${entry.version}`;
}

function normalizePath(path) {
  return path.split(sep).join("/");
}