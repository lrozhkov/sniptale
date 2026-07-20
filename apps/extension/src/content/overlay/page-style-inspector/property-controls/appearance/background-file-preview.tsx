import { ImageIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { PageStyleAssetReference } from '@sniptale/runtime-contracts/page-style';
import { getPageStyleAsset } from '../../../../../composition/persistence/page-style/assets';

export function BackgroundAssetPreview(props: { asset: PageStyleAssetReference | null }) {
  const previewUrl = useBackgroundAssetPreviewUrl(props.asset);
  const className = [
    'inline-flex h-8 w-8 items-center justify-center overflow-hidden rounded-[8px]',
    'bg-[var(--sniptale-color-surface-panel)] text-[var(--sniptale-color-text-secondary)]',
  ].join(' ');

  if (previewUrl && props.asset) {
    return (
      <img
        src={previewUrl}
        alt={props.asset.filename ?? ''}
        className={`${className} object-cover`}
      />
    );
  }

  return (
    <span aria-hidden="true" className={className}>
      <ImageIcon size={15} />
    </span>
  );
}

function useBackgroundAssetPreviewUrl(asset: PageStyleAssetReference | null): string | null {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    setPreviewUrl(null);
    if (!asset || typeof URL.createObjectURL !== 'function') {
      return;
    }

    const currentAsset = asset;
    let disposed = false;
    let objectUrl: string | null = null;

    async function loadPreview() {
      try {
        const entry = await getPageStyleAsset(currentAsset.assetId);
        if (disposed || entry?.kind !== currentAsset.kind || !(entry.blob instanceof Blob)) {
          return;
        }

        objectUrl = URL.createObjectURL(entry.blob);
        setPreviewUrl(objectUrl);
      } catch {
        // Preview is advisory; upload/clear actions still expose authoritative errors.
      }
    }

    void loadPreview();
    return () => {
      disposed = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [asset]);

  return previewUrl;
}
