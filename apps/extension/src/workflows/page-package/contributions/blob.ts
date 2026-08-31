import {
  isPagePackageMimeType,
  type PagePackageComponentId,
} from '@sniptale/runtime-contracts/page-package';
import { assertPagePackageContribution, type PagePackageContribution } from '../paths';

const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export type PagePackageBlobDigest = (blob: Blob) => Promise<string>;

export function normalizeContributionMimeType(value: string | null | undefined): string {
  const normalized = value?.split(';', 1)[0]?.trim().toLowerCase() ?? '';
  return isPagePackageMimeType(normalized) ? normalized : 'application/octet-stream';
}

export async function createBlobContribution(args: {
  blob: Blob;
  component: PagePackageComponentId;
  digest: PagePackageBlobDigest;
  mimeType: string;
  path: string;
}): Promise<PagePackageContribution<Blob>> {
  const contribution = {
    component: args.component,
    mimeType: args.mimeType,
    path: args.path,
    sha256: '0'.repeat(64),
    size: args.blob.size,
    source: args.blob,
  };
  assertPagePackageContribution(contribution);
  const sha256 = await args.digest(args.blob);
  if (!SHA256_PATTERN.test(sha256)) {
    throw new Error('Page Package Blob digest is not a lowercase SHA-256 value.');
  }
  return { ...contribution, sha256 };
}
