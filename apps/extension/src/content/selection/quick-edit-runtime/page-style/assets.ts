import type {
  PageStyleAssetKind,
  PageStyleAssetReference,
} from '@sniptale/runtime-contracts/page-style';
import { getPageStyleAsset } from '../../../../composition/persistence/page-style/assets';
import type { PageStyleAssetEntry } from '../../../../composition/persistence/page-style/contracts';
import type { PageStyleRuntimeDiagnostic } from './diagnostics';
import { createPageStyleRuntimeDiagnostic } from './diagnostics';

type AssetUrlKey = string;

export interface PageStyleAssetResolver {
  dispose: () => void;
  resolveAssetUrl: (
    asset: PageStyleAssetReference,
    ruleId: string
  ) => Promise<{ diagnostics: PageStyleRuntimeDiagnostic[]; url: string | null }>;
}

function createAssetUrlKey(asset: PageStyleAssetReference): AssetUrlKey {
  return `${asset.kind}:${asset.assetId}`;
}

function isUsableAssetEntry(
  entry: PageStyleAssetEntry | undefined,
  asset: PageStyleAssetReference
): entry is PageStyleAssetEntry {
  return Boolean(entry && entry.kind === asset.kind && entry.blob instanceof Blob);
}

export function findPatchAsset(
  assets: PageStyleAssetReference[],
  kind: PageStyleAssetKind
): PageStyleAssetReference | null {
  return assets.find((asset) => asset.kind === kind) ?? null;
}

export function createPageStyleAssetResolver(
  deps: {
    createObjectUrl?: (blob: Blob) => string;
    getAsset?: typeof getPageStyleAsset;
    revokeObjectUrl?: (url: string) => void;
  } = {}
): PageStyleAssetResolver {
  const getAsset = deps.getAsset ?? getPageStyleAsset;
  const createObjectUrl = deps.createObjectUrl ?? URL.createObjectURL.bind(URL);
  const revokeObjectUrl = deps.revokeObjectUrl ?? URL.revokeObjectURL.bind(URL);
  const objectUrls = new Map<AssetUrlKey, string>();

  return {
    dispose: () => {
      objectUrls.forEach((url) => revokeObjectUrl(url));
      objectUrls.clear();
    },
    resolveAssetUrl: async (asset, ruleId) => {
      const key = createAssetUrlKey(asset);
      const cachedUrl = objectUrls.get(key);
      if (cachedUrl) {
        return { diagnostics: [], url: cachedUrl };
      }

      const entry = await getAsset(asset.assetId);
      if (!isUsableAssetEntry(entry, asset)) {
        return {
          diagnostics: [
            createPageStyleRuntimeDiagnostic('warning', 'Page style asset was not found', ruleId),
          ],
          url: null,
        };
      }

      const url = createObjectUrl(entry.blob);
      objectUrls.set(key, url);
      return { diagnostics: [], url };
    },
  };
}
