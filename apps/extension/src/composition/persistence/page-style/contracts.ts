import type { PageStyleAssetKind } from '@sniptale/runtime-contracts/page-style';

export interface PageStyleAssetEntry {
  blob: Blob;
  createdAt: number;
  filename: string;
  height: number | null;
  id: string;
  kind: PageStyleAssetKind;
  mimeType: string;
  size: number;
  updatedAt: number;
  width: number | null;
}
