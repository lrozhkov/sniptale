import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  REQUIRED_RELEASE_LEGAL_PATHS,
  OSS_RELEASE_POLICY_PATH,
  readOssReleasePolicy,
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
  const policy = readOssReleasePolicy(repoRoot);
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
  ].sort();
  policy.legalFiles = await Promise.all(legalPaths.map((entry) => legalFileEntry(repoRoot, entry)));
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
