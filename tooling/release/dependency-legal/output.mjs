import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function requireText(value, label) {
  if (typeof value !== 'string' || !value) throw new Error(`${label} is required.`);
  return value;
}

function requireSha256(value, label) {
  const digest = requireText(value, label);
  if (!/^[a-f0-9]{64}$/u.test(digest)) throw new Error(`${label} must be a SHA-256 digest.`);
  return digest;
}

function validateManrope(manrope) {
  if (!manrope || typeof manrope !== 'object') throw new Error('Manrope metadata is required.');
  const artifacts = Array.isArray(manrope.artifacts) ? manrope.artifacts : [];
  if (artifacts.length === 0) throw new Error('Manrope artifact hashes are required.');
  return {
    artifacts: artifacts
      .map((artifact) => ({
        path: requireText(artifact.path, 'Manrope artifact path'),
        sha256: requireSha256(artifact.sha256, 'Manrope artifact SHA-256'),
        sourcePath: requireText(artifact.sourcePath, 'Manrope artifact source path'),
      }))
      .sort((left, right) => compareText(left.path, right.path)),
    copyright: requireText(manrope.copyright, 'Manrope copyright'),
    license: requireText(manrope.license, 'Manrope license'),
    licensePath: requireText(manrope.licensePath, 'Manrope license path'),
    sourcePackage: requireText(manrope.sourcePackage, 'Manrope source package'),
    version: requireText(manrope.version, 'Manrope version'),
  };
}

function formatManropeSection(manrope) {
  const artifactRows = manrope.artifacts
    .map(
      (artifact) => `| \`${artifact.path}\` | \`${artifact.sourcePath}\` | \`${artifact.sha256}\` |`
    )
    .join('\n');
  return `## Manrope bundled font

- Source package: \`${manrope.sourcePackage}\` ${manrope.version}
- License: \`${manrope.license}\`
- Copyright: ${manrope.copyright}
- License text: [\`${manrope.licensePath}\`](${manrope.licensePath})

| Bundled file | Installed source | SHA-256 |
| --- | --- | --- |
${artifactRows}

The font files remain under ${manrope.license}. The rest of Sniptale is not relicensed by the font license.`;
}

function formatDependencySection(entry) {
  const sourceLine = entry.correspondingSourceUrl
    ? `\n- MPL-2.0 corresponding source: ${entry.correspondingSourceUrl}`
    : '';
  const provenanceLines = entry.licenseProvenance
    ? `
- Immutable license origin: ${entry.licenseProvenance.originUrl}
- Upstream license version: \`${entry.licenseProvenance.upstreamVersion}\`
- Pinned source SHA-256: \`${entry.licenseProvenance.sha256}\``
    : '';
  return `### \`${entry.packageName}\` ${entry.version}

- Installed path: \`${entry.packagePath}\`
- Declared license expression: \`${entry.licenseExpression}\`
- Selected license: \`${entry.selectedLicense}\`
- License source class: \`${entry.licenseSourceKind}\`
- License source: \`${entry.licenseSource}\`
- License storage: \`${entry.licenseStorageKind}\`
- Redistributed license text: [\`${entry.archivePath}\`](${entry.archivePath})
- License text SHA-256: \`${entry.sha256}\`
- Repository/source: ${entry.sourceUrl}${provenanceLines}${sourceLine}`;
}

/** Formats the deterministic notices document for the complete production dependency closure. */
export function formatThirdPartyNotices({ entries, manrope }) {
  const normalizedManrope = validateManrope(manrope);
  const dependencySections = [...entries]
    .sort(
      (left, right) =>
        compareText(left.packageName, right.packageName) ||
        compareText(left.packagePath, right.packagePath)
    )
    .map(formatDependencySection)
    .join('\n\n');
  return `# Third-party notices

This file is generated from the installed production dependency closure, package-lock, and reviewed pinned sources.

${formatManropeSection(normalizedManrope)}

## Production dependency licenses

${dependencySections}
`;
}

function resolveOutputPath(outputRoot, relativePath) {
  if (path.isAbsolute(relativePath) || relativePath.split(/[\\/]/u).includes('..')) {
    throw new Error(`Dependency legal output path must stay relative: ${relativePath}`);
  }
  return path.resolve(outputRoot, relativePath);
}

function validateEntryStorage(entry, licenseFile, canonicalEntries) {
  if (entry.licenseStorageKind === 'generated-copy') {
    if (!entry.archivePath.startsWith('LICENSES/dependencies/')) {
      throw new Error(
        `Generated dependency license path is outside its owner: ${entry.archivePath}`
      );
    }
    const digest = licenseFile && createHash('sha256').update(licenseFile.contents).digest('hex');
    if (digest !== entry.sha256) {
      throw new Error(`Dependency license digest drift: ${entry.archivePath}`);
    }
    return;
  }
  if (entry.licenseStorageKind === 'canonical-file') {
    if (entry.archivePath.startsWith('LICENSES/dependencies/') || licenseFile) {
      throw new Error(
        `Canonical dependency license alias is not deduplicated: ${entry.archivePath}`
      );
    }
    canonicalEntries.push(entry);
    return;
  }
  throw new Error(`Dependency license storage kind is invalid: ${entry.archivePath}`);
}

function normalizeClosure(closure) {
  if (!Array.isArray(closure?.entries) || !Array.isArray(closure?.licenseFiles)) {
    throw new Error('Dependency legal closure must contain entries and license files.');
  }
  const entries = [...closure.entries].sort(
    (left, right) =>
      compareText(left.packageName, right.packageName) ||
      compareText(left.packagePath, right.packagePath)
  );
  const filesByPath = new Map(
    closure.licenseFiles.map((licenseFile) => [licenseFile.archivePath, licenseFile])
  );
  const entryPaths = new Set(entries.map((entry) => entry.archivePath));
  if (entryPaths.size !== entries.length || filesByPath.size !== closure.licenseFiles.length) {
    throw new Error('Dependency legal closure license paths must be one-to-one.');
  }
  const canonicalEntries = [];
  for (const entry of entries) {
    const licenseFile = filesByPath.get(entry.archivePath);
    validateEntryStorage(entry, licenseFile, canonicalEntries);
    if (
      entry.licenseProvenance &&
      (entry.licenseSourceKind !== 'pinned-upstream' ||
        entry.licenseProvenance.sourcePath !== entry.licenseSource ||
        entry.licenseProvenance.sha256 !== entry.sha256)
    ) {
      throw new Error(`Dependency license provenance drift: ${entry.archivePath}`);
    }
  }
  if (filesByPath.size !== entries.length - canonicalEntries.length) {
    throw new Error('Dependency legal closure has orphaned generated license files.');
  }
  return { canonicalEntries, entries, filesByPath };
}

async function assertCanonicalLicenseFiles(outputRoot, entries) {
  for (const entry of entries) {
    let contents;
    try {
      contents = await fs.readFile(resolveOutputPath(outputRoot, entry.archivePath));
    } catch {
      throw new Error(`Canonical dependency license file is missing: ${entry.archivePath}`);
    }
    if (createHash('sha256').update(contents).digest('hex') !== entry.sha256) {
      throw new Error(`Canonical dependency license digest drift: ${entry.archivePath}`);
    }
  }
}

/** Writes a generated manifest, notices document, and exact dependency license directory. */
export async function writeDependencyLegalClosure({
  closure,
  manifestPath = 'THIRD_PARTY_DEPENDENCIES.json',
  manrope,
  noticesPath = 'THIRD_PARTY_NOTICES.md',
  outputRoot,
}) {
  const normalized = normalizeClosure(closure);
  await assertCanonicalLicenseFiles(outputRoot, normalized.canonicalEntries);
  const licenseRoot = resolveOutputPath(outputRoot, 'LICENSES/dependencies');
  await fs.rm(licenseRoot, { force: true, recursive: true });
  await fs.mkdir(licenseRoot, { recursive: true });
  for (const licenseFile of normalized.filesByPath.values()) {
    const destination = resolveOutputPath(outputRoot, licenseFile.archivePath);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, licenseFile.contents);
  }
  const manifest = { entries: normalized.entries, schemaVersion: 1 };
  await fs.writeFile(
    resolveOutputPath(outputRoot, manifestPath),
    `${JSON.stringify(manifest, null, 2)}\n`
  );
  await fs.writeFile(
    resolveOutputPath(outputRoot, noticesPath),
    formatThirdPartyNotices({ entries: normalized.entries, manrope })
  );
}
