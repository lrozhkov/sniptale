import {
  isPagePackageEntryPath,
  isPagePackageMimeType,
  MAX_PAGE_PACKAGE_ENTRY_BYTES,
  type PagePackageComponentId,
} from '@sniptale/runtime-contracts/page-package';
import { assertSafeArchivePath } from '../../composition/archive-transfer/path';

const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export interface PagePackageContribution<Source> {
  component: PagePackageComponentId;
  mimeType: string;
  path: string;
  sha256: string;
  size: number;
  source: Source;
}

export function assertPagePackageContribution<Source>(
  contribution: PagePackageContribution<Source>
): void {
  assertSafeArchivePath(contribution.path);
  if (
    !isPagePackageMimeType(contribution.mimeType) ||
    !Number.isSafeInteger(contribution.size) ||
    contribution.size < 0 ||
    contribution.size > MAX_PAGE_PACKAGE_ENTRY_BYTES ||
    !SHA256_PATTERN.test(contribution.sha256) ||
    !isPagePackageEntryPath(contribution.component, contribution.path, contribution.mimeType)
  ) {
    throw new Error(`Invalid Page Package contribution: ${contribution.path}.`);
  }
}

export function assertUniquePagePackagePaths<Source>(
  contributions: readonly PagePackageContribution<Source>[]
): void {
  const paths = new Set<string>();
  for (const contribution of contributions) {
    assertPagePackageContribution(contribution);
    const collisionKey = contribution.path.toLocaleLowerCase('en-US');
    if (paths.has(collisionKey)) {
      throw new Error(`Duplicate Page Package path: ${contribution.path}.`);
    }
    paths.add(collisionKey);
  }
}
