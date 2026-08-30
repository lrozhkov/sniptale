/**
 * Deterministic design-system guardrail.
 * Run from repo root with
 * `node tooling/qa/guards/product-contracts/verify-design-system.mjs`.
 * Exits non-zero when registry, preview, canonical-owner, or theme closure is incomplete.
 */

import path from 'node:path';

import {
  getDesignSystemThemeFailures,
  collectPreviewComponentIds,
  collectRegistryEntries,
  getCanonicalOwnershipFailures,
  getRegistryCoverageFailures,
  getRegistryReferenceFailures,
} from './design-system/design-system-verifier.mjs';
import { isExecutedAsScript } from '../../runtime/process/shared-cli.mjs';
import { projectAstGrepReceipt } from '../../audits/ast-grep/ast-grep.mjs';

const repoRoot = process.cwd();
const extensionSrcRoot = path.join(repoRoot, 'apps', 'extension', 'src');
const designSystemRoot = path.join(extensionSrcRoot, 'design-system');
const registryRoot = path.join(designSystemRoot, 'catalog', 'registry');
const previewRoot = path.join(designSystemRoot, 'previews');
const packageJsonPath = path.join(repoRoot, 'packages', 'ui', 'package.json');

export function runDesignSystemCheck({
  astGrepReceipt = null,
  designSystemRootOverride = designSystemRoot,
  registryRootOverride = registryRoot,
  previewRootOverride = previewRoot,
  packageJsonPathOverride = packageJsonPath,
  repoRootOverride = repoRoot,
} = {}) {
  const registryEntries = collectRegistryEntries(registryRootOverride);
  const previewComponentIds = collectPreviewComponentIds(previewRootOverride);
  const syntaxFailures = astGrepReceipt
    ? projectAstGrepReceipt(astGrepReceipt, ['design-system']).violations.map(
        ({ file, line, message }) => `${file}${line ? `:${line}` : ''} ${message}`
      )
    : [];

  return [
    ...syntaxFailures,
    ...getRegistryCoverageFailures({ registryEntries, previewComponentIds }),
    ...getRegistryReferenceFailures({
      packageJsonPath: packageJsonPathOverride,
      registryEntries,
      repoRoot: repoRootOverride,
    }),
    ...getCanonicalOwnershipFailures(registryEntries),
    ...getDesignSystemThemeFailures(designSystemRootOverride),
  ];
}

if (isExecutedAsScript(import.meta.url)) {
  const failures = runDesignSystemCheck();

  if (failures.length > 0) {
    console.error('design-system guardrail violations found:\n');
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exitCode = 1;
  } else {
    console.log('design-system guardrail passed');
  }
}
