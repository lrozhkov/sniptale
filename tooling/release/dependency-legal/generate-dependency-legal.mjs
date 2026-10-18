import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  REQUIRED_RELEASE_LEGAL_PATHS,
  OSS_RELEASE_POLICY_PATH,
  CANONICAL_LICENSE_DIGESTS,
  releaseLegalArchivePath,
  sha256,
} from '../policy/oss-release-policy.mjs';
import { generateDependencyLegalClosure, writeDependencyLegalClosure } from './index.mjs';

function interfaceFontMetadata(policy) {
  const interfaceFont = policy.bundledAssets.find((asset) => asset.id === 'golos-ui');
  if (!interfaceFont) throw new Error('OSS release policy is missing Interface font metadata.');
  return { ...interfaceFont, licensePath: 'packages/ui/src/styles/golos-ui/LICENSE.txt' };
}

async function legalFileEntry(repoRoot, relativePath) {
  return {
    archivePath: relativePath,
    sha256: sha256(await readFile(path.resolve(repoRoot, relativePath))),
    source: relativePath,
  };
}

/** Regenerates the exact production legal closure and updates only its policy-owned digest index. */
export async function generateRepositoryDependencyLegal(repoRoot = process.cwd()) {
  const policy = JSON.parse(
    await readFile(path.resolve(repoRoot, OSS_RELEASE_POLICY_PATH), 'utf8')
  );
  for (const asset of policy.bundledAssets) {
    if (!asset.licensePath || releaseLegalArchivePath(asset.licensePath) === asset.licensePath)
      continue;
    const contents = await readFile(path.resolve(repoRoot, asset.licensePath));
    if (sha256(contents) !== CANONICAL_LICENSE_DIGESTS.get(asset.licensePath))
      throw new Error('Canonical font license digest drift.');
    const target = path.resolve(repoRoot, releaseLegalArchivePath(asset.licensePath));
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, contents);
  }
  const closure = await generateDependencyLegalClosure({
    canonicalLicenseAliases: policy.dependencyLegal.canonicalLicenseAliases,
    pinnedSources: policy.dependencyLegal.pinnedSources,
    modifiedSources: policy.dependencyLegal.modifiedSources,
    repoRoot,
    reviewedSelections: policy.dependencyLegal.reviewedSelections,
  });
  await writeDependencyLegalClosure({
    closure,
    manifestPath: policy.dependencyLegal.manifestPath,
    interfaceFont: interfaceFontMetadata(policy),
    documentFont: policy.bundledAssets.find((asset) => asset.id === 'golos-text'),
    outputRoot: repoRoot,
  });
  const legalPaths = [
    ...new Set([
      ...REQUIRED_RELEASE_LEGAL_PATHS,
      ...policy.bundledAssets.flatMap((asset) => (asset.licensePath ? [asset.licensePath] : [])),
      policy.dependencyLegal.manifestPath,
      ...closure.entries.map((entry) => entry.archivePath),
      ...(closure.sourceFiles ?? []).map((file) => file.archivePath),
    ]),
  ]
    .map(releaseLegalArchivePath)
    .sort();
  const sourceOnly = new Set(
    (closure.sourceFiles ?? [])
      .filter((file) => !/\/(?:LICENSE|README\.md)$/u.test(file.archivePath))
      .map((file) => file.archivePath)
  );
  policy.legalFiles = await Promise.all(
    legalPaths.map(async (entry) => ({
      ...(await legalFileEntry(repoRoot, entry)),
      ...(sourceOnly.has(entry) ? { distribution: 'source' } : {}),
    }))
  );
  await writeFile(
    path.resolve(repoRoot, OSS_RELEASE_POLICY_PATH),
    `${JSON.stringify(policy, null, 2)}\n`
  );
  return closure;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const closure = await generateRepositoryDependencyLegal();
  process.stdout.write(`Dependency legal closure: ${closure.entries.length} packages\n`);
}
