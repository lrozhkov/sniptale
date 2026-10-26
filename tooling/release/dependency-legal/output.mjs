import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { releaseLegalArchivePath } from '../policy/oss-release-policy.mjs';

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

function validateInterfaceFont(interfaceFont) {
  if (!interfaceFont || typeof interfaceFont !== 'object')
    throw new Error('Interface font metadata is required.');
  const artifacts = Array.isArray(interfaceFont.artifacts) ? interfaceFont.artifacts : [];
  if (artifacts.length === 0) throw new Error('Interface font artifact hashes are required.');
  return {
    artifacts: artifacts
      .map((artifact) => ({
        path: requireText(artifact.path, 'Interface font artifact path'),
        sha256: requireSha256(artifact.sha256, 'Interface font artifact SHA-256'),
        sourcePath: requireText(artifact.sourcePath, 'Interface font artifact source path'),
      }))
      .sort((left, right) => compareText(left.path, right.path)),
    copyright: requireText(interfaceFont.copyright, 'Interface font copyright'),
    license: requireText(interfaceFont.license, 'Interface font license'),
    licensePath: requireText(interfaceFont.licensePath, 'Interface font license path'),
    sourcePackage: requireText(interfaceFont.sourcePackage, 'Interface font source package'),
    version: requireText(interfaceFont.version, 'Interface font version'),
  };
}

function formatInterfaceFontSection(interfaceFont, family = 'Golos UI') {
  const artifactRows = interfaceFont.artifacts
    .map(
      (artifact) => `| \`${artifact.path}\` | \`${artifact.sourcePath}\` | \`${artifact.sha256}\` |`
    )
    .join('\n');
  return (
    `## ${family} bundled font

- Source package: \`${interfaceFont.sourcePackage}\`
- Font version: \`${interfaceFont.version}\`
- License: \`${interfaceFont.license}\`
- Copyright: ${interfaceFont.copyright}
- License text: [\`${releaseLegalArchivePath(interfaceFont.licensePath)}\`](` +
    `${releaseLegalArchivePath(interfaceFont.licensePath)})

| Bundled file | Source file | SHA-256 |
| --- | --- | --- |
${artifactRows}

The font files remain under ${interfaceFont.license}. The rest of Sniptale is not relicensed by the font license.`
  );
}

function formatDependencySection(entry) {
  const sourceLine = entry.correspondingSourceUrl
    ? `\n- MPL-2.0 corresponding source: ${entry.correspondingSourceUrl}`
    : '';
  const modificationLines = entry.modifiedSource
    ? [
        `\n- Modified source archive: [${entry.modifiedSource.archive.file}](${entry.modifiedSource.archive.url})\n`,
        '- Files inside that source archive (combine with upstream source above):\n',
        String(
          entry.modifiedSource.files
            .map((file) => `  - \`${file.archivePath}\` (SHA-256: ${file.sha256})`)
            .join('\n')
        ),
        '\n- Original package integrity: ',
        String(entry.modifiedSource.upstreamIntegrity),
      ].join('')
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
- Repository/source: ${entry.sourceUrl}${provenanceLines}${sourceLine}${modificationLines}`;
}

/** Formats the deterministic notices document for the complete production dependency closure. */
export function formatThirdPartyNotices({ entries, interfaceFont, documentFont }) {
  const normalizedInterfaceFont = validateInterfaceFont(interfaceFont);
  const documentSection = documentFont
    ? `\n\n${formatInterfaceFontSection(validateInterfaceFont(documentFont), 'Golos Text')}`
    : '';
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

${formatInterfaceFontSection(normalizedInterfaceFont)}${documentSection}

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
  const sourceFiles = closure.sourceFiles ?? [];
  const expectedSourceFiles = entries.flatMap((entry) => entry.modifiedSource?.files ?? []);
  if (
    sourceFiles.length !== expectedSourceFiles.length ||
    new Set(sourceFiles.map((file) => file.archivePath)).size !== sourceFiles.length
  )
    throw new Error('Modified dependency source inventory mismatch.');
  for (const file of sourceFiles) {
    const expected = expectedSourceFiles.find((entry) => entry.archivePath === file.archivePath);
    if (
      !expected ||
      !file.archivePath.startsWith('LICENSES/dependencies/') ||
      filesByPath.has(file.archivePath) ||
      createHash('sha256').update(file.contents).digest('hex') !== expected.sha256
    )
      throw new Error('Modified dependency source content drift.');
  }
  return { canonicalEntries, entries, filesByPath, sourceFiles };
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
  interfaceFont,
  documentFont,
  noticesPath = 'THIRD_PARTY_NOTICES.md',
  outputRoot,
}) {
  const normalized = normalizeClosure(closure);
  await assertCanonicalLicenseFiles(outputRoot, normalized.canonicalEntries);
  const licenseRoot = resolveOutputPath(outputRoot, 'LICENSES/dependencies');
  await fs.rm(licenseRoot, { force: true, recursive: true });
  await fs.mkdir(licenseRoot, { recursive: true });
  for (const licenseFile of [...normalized.filesByPath.values(), ...normalized.sourceFiles]) {
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
    formatThirdPartyNotices({ entries: normalized.entries, interfaceFont, documentFont })
  );
}
