import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import { selectPinnedLicenseSource } from './pinned-source.mjs';

const LICENSE_STEMS = ['license', 'licence', 'copying', 'notice'];
const LICENSE_EXTENSIONS = ['', '.txt', '.md', '.markdown'];
const README_NAMES = ['readme', 'readme.md', 'readme.markdown', 'readme.txt'];
const REVIEWED_TEXT_MARKERS = new Map([
  ['Apache-2.0', /Apache License\s+Version 2\.0/iu],
  ['MIT', /MIT License|Permission is hereby granted, free of charge/iu],
]);

/** Exact legal choices reviewed for the disjunctive expressions in the current production tree. */
export const DEFAULT_REVIEWED_LICENSE_SELECTIONS = [
  { packageName: 'dompurify', selectedLicense: 'Apache-2.0', version: '3.4.12' },
  { packageName: 'jszip', selectedLicense: 'MIT', version: '3.10.1' },
];

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sha256(contents) {
  return createHash('sha256').update(contents).digest('hex');
}

function stripOuterParentheses(expression) {
  const trimmed = expression.trim();
  return trimmed.startsWith('(') && trimmed.endsWith(')') ? trimmed.slice(1, -1) : trimmed;
}

function licenseAlternatives(expression) {
  return stripOuterParentheses(expression)
    .split(/\s+OR\s+/u)
    .map((part) => stripOuterParentheses(part));
}

function resolveSelectedLicense(record, selections) {
  const alternatives = licenseAlternatives(record.licenseExpression);
  if (alternatives.length === 1) return record.licenseExpression;
  const selection = selections.find(
    (candidate) =>
      candidate.packageName === record.packageName && candidate.version === record.version
  );
  if (!selection) {
    const stale = selections.some((candidate) => candidate.packageName === record.packageName);
    const kind = stale ? 'Stale' : 'Missing';
    throw new Error(
      `${kind} reviewed license selection for ${record.packageName}@${record.version}.`
    );
  }
  if (!alternatives.includes(selection.selectedLicense)) {
    throw new Error(
      `Invalid reviewed license selection ${selection.selectedLicense} for ${record.packageName}@${record.version}.`
    );
  }
  return selection.selectedLicense;
}

function candidateRank(fileName) {
  const lowerName = fileName.toLowerCase();
  for (const [stemIndex, stem] of LICENSE_STEMS.entries()) {
    for (const [extensionIndex, extension] of LICENSE_EXTENSIONS.entries()) {
      if (lowerName === `${stem}${extension}`) return stemIndex * 10 + extensionIndex;
    }
  }
  return Number.POSITIVE_INFINITY;
}

async function selectLicenseFile(record) {
  const fileNames = await fs.readdir(record.packageDirectory);
  const candidates = fileNames
    .map((fileName) => ({ fileName, rank: candidateRank(fileName) }))
    .filter((candidate) => Number.isFinite(candidate.rank))
    .sort((left, right) => left.rank - right.rank || compareText(left.fileName, right.fileName));
  if (candidates.length === 0) return undefined;
  const fileName = candidates[0].fileName;
  return {
    contents: await fs.readFile(path.join(record.packageDirectory, fileName), 'utf8'),
    licenseSource: `${record.packagePath}/${fileName}`,
    licenseSourceKind: 'installed-file',
  };
}

function extractLicenseSection(markdown) {
  const lines = markdown.split(/\r?\n/u);
  const start = lines.findIndex((line) => /^#{1,6}\s+licen[cs]e\s*$/iu.test(line.trim()));
  if (start < 0) return undefined;
  const headingLevel = /^#+/u.exec(lines[start].trim())[0].length;
  const endOffset = lines.slice(start + 1).findIndex((line) => {
    const heading = /^(#+)\s+/u.exec(line.trim());
    return heading && heading[1].length <= headingLevel;
  });
  const end = endOffset < 0 ? lines.length : start + 1 + endOffset;
  const section = lines
    .slice(start + 1, end)
    .join('\n')
    .trim();
  return section ? `${section}\n` : undefined;
}

async function selectReadmeLicense(record) {
  const fileNames = (await fs.readdir(record.packageDirectory)).sort(compareText);
  for (const readmeName of README_NAMES) {
    const fileName = fileNames.find((candidate) => candidate.toLowerCase() === readmeName);
    if (!fileName) continue;
    const section = extractLicenseSection(
      await fs.readFile(path.join(record.packageDirectory, fileName), 'utf8')
    );
    if (section) {
      return {
        contents: section,
        licenseSource: `${record.packagePath}/${fileName}#license`,
        licenseSourceKind: 'readme-section',
      };
    }
  }
  return undefined;
}

function normalizeRepositoryUrl(repository) {
  const rawUrl = typeof repository === 'string' ? repository : repository?.url;
  if (typeof rawUrl !== 'string' || !rawUrl) return undefined;
  return rawUrl
    .replace(/^git\+https:/u, 'https:')
    .replace(/^git:\/\//u, 'https://')
    .replace(/^git\+ssh:\/\/git@github\.com\//u, 'https://github.com/');
}

function sourceUrl(record) {
  return (
    normalizeRepositoryUrl(record.installedMetadata.repository) ??
    record.installedMetadata.homepage ??
    record.resolved
  );
}

function assertReviewedLicenseText(record, selectedLicense, contents) {
  if (licenseAlternatives(record.licenseExpression).length === 1) return;
  const marker = REVIEWED_TEXT_MARKERS.get(selectedLicense);
  if (!marker || !marker.test(contents)) {
    throw new Error(
      `Reviewed license text drift for ${record.packageName}@${record.version}: ${selectedLicense}.`
    );
  }
}

function generatedArchivePath(record) {
  const ownerPath = record.packagePath
    .replace(/^node_modules\//u, '')
    .replaceAll('/node_modules/', '__nested__')
    .replaceAll('/', '__')
    .replace(/[^A-Za-z0-9@._-]/gu, '_');
  return `LICENSES/dependencies/${ownerPath}-${record.version}.txt`;
}

function canonicalAlias(record, aliases) {
  return aliases.find(
    (alias) => alias.packageName === record.packageName && alias.version === record.version
  );
}

async function createLegalMaterial(record, selections, pinnedSources, canonicalLicenseAliases) {
  const selectedLicense = resolveSelectedLicense(record, selections);
  const selectedText =
    (await selectLicenseFile(record)) ??
    (await selectReadmeLicense(record)) ??
    (await selectPinnedLicenseSource(record, selectedLicense, pinnedSources));
  if (!selectedText) {
    throw new Error(`Installed package has no redistributable license text: ${record.packagePath}`);
  }
  assertReviewedLicenseText(record, selectedLicense, selectedText.contents);
  const resolvedSourceUrl = sourceUrl(record);
  if (typeof resolvedSourceUrl !== 'string' || !resolvedSourceUrl) {
    throw new Error(`Installed package has no repository or source URL: ${record.packagePath}`);
  }
  const correspondingSourceUrl = selectedLicense.includes('MPL-2.0') ? record.resolved : undefined;
  if (selectedLicense.includes('MPL-2.0') && !correspondingSourceUrl) {
    throw new Error(`MPL package has no exact corresponding-source URL: ${record.packagePath}`);
  }
  const alias = canonicalAlias(record, canonicalLicenseAliases);
  const digest = sha256(selectedText.contents);
  if (alias && alias.sha256 !== digest) {
    throw new Error(
      `Canonical dependency license digest drift for ${record.packageName}@${record.version}.`
    );
  }
  const outputPath = alias?.archivePath ?? generatedArchivePath(record);
  const licenseStorageKind = alias ? 'canonical-file' : 'generated-copy';
  return {
    entry: {
      archivePath: outputPath,
      correspondingSourceUrl,
      licenseExpression: record.licenseExpression,
      licenseProvenance: selectedText.licenseProvenance,
      licenseSource: selectedText.licenseSource,
      licenseSourceKind: selectedText.licenseSourceKind,
      licenseStorageKind,
      packageName: record.packageName,
      packagePath: record.packagePath,
      selectedLicense,
      sha256: digest,
      sourceUrl: resolvedSourceUrl,
      version: record.version,
    },
    licenseFile: alias ? undefined : { archivePath: outputPath, contents: selectedText.contents },
  };
}

function sortMaterials(materials) {
  return materials.sort((left, right) => {
    const nameOrder = compareText(left.entry.packageName, right.entry.packageName);
    return nameOrder || compareText(left.entry.packagePath, right.entry.packagePath);
  });
}

function validateCanonicalLicenseAliases(records, aliases) {
  const identities = aliases.map((alias) => `${alias?.packageName ?? ''}@${alias?.version ?? ''}`);
  const paths = aliases.map((alias) => alias?.archivePath);
  if (new Set(identities).size !== identities.length || new Set(paths).size !== paths.length) {
    throw new Error('Canonical dependency license aliases must be one-to-one.');
  }
  for (const alias of aliases) {
    const valid =
      typeof alias?.packageName === 'string' &&
      typeof alias?.version === 'string' &&
      typeof alias?.archivePath === 'string' &&
      !alias.archivePath.startsWith('LICENSES/dependencies/') &&
      !alias.archivePath.startsWith('/') &&
      !alias.archivePath.split('/').includes('..') &&
      /^[a-f0-9]{64}$/u.test(alias?.sha256 ?? '');
    if (!valid) throw new Error('Invalid canonical dependency license alias.');
    const exactPackage = records.some(
      (record) => record.packageName === alias.packageName && record.version === alias.version
    );
    if (!exactPackage) {
      throw new Error(
        `Stale canonical dependency license alias for ${alias.packageName}@${alias.version}.`
      );
    }
  }
}

function validateExactPolicyRecords(records, candidates, descriptor, versionField) {
  for (const candidate of candidates) {
    const exactPackage = records.some(
      (record) =>
        record.packageName === candidate.packageName && record.version === candidate[versionField]
    );
    if (!exactPackage) {
      throw new Error(
        `Stale ${descriptor} for ${candidate.packageName}@${candidate[versionField]}.`
      );
    }
  }
}

/** Selects and hashes the installed license material for a discovered package closure. */
export async function selectDependencyLegalMaterials(records, options = {}) {
  const selections =
    options.reviewedSelections ??
    DEFAULT_REVIEWED_LICENSE_SELECTIONS.filter((selection) =>
      records.some((record) => record.packageName === selection.packageName)
    );
  const pinnedSources = options.pinnedSources ?? [];
  const canonicalLicenseAliases = options.canonicalLicenseAliases ?? [];
  validateCanonicalLicenseAliases(records, canonicalLicenseAliases);
  validateExactPolicyRecords(
    records,
    pinnedSources,
    'pinned dependency license source',
    'packageVersion'
  );
  if (options.reviewedSelections) {
    validateExactPolicyRecords(records, selections, 'reviewed license selection', 'version');
  }
  const materials = await Promise.all(
    records.map((record) =>
      createLegalMaterial(record, selections, pinnedSources, canonicalLicenseAliases)
    )
  );
  const sorted = sortMaterials(materials);
  const archivePaths = sorted.map((material) => material.entry.archivePath);
  if (new Set(archivePaths).size !== archivePaths.length) {
    throw new Error('Dependency license archive paths are not one-to-one.');
  }
  return {
    entries: sorted.map((material) => material.entry),
    licenseFiles: sorted.map((material) => material.licenseFile).filter(Boolean),
  };
}
