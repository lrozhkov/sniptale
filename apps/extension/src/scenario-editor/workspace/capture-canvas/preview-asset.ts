import { useEffect, useState } from 'react';
import { blobToDataUrl } from '../../../platform/media-utils/data-url';
import { measureImageBlob } from '@sniptale/platform/browser/media/image-dimensions';
import { getScenarioAssetBlob } from '../../../composition/persistence/scenario/store/public';
import type { ScenarioCaptureStep } from '../../../features/scenario/contracts/types/project';

export interface WorkspacePreviewAssetState {
  dataUrl: string | null;
  dimensions: { width: number; height: number } | null;
  hasLoadError: boolean;
}

function createEmptyAssetState(): WorkspacePreviewAssetState {
  return {
    dataUrl: null,
    dimensions: null,
    hasLoadError: false,
  };
}

function createFailedAssetState(): WorkspacePreviewAssetState {
  return {
    dataUrl: null,
    dimensions: null,
    hasLoadError: true,
  };
}

async function loadWorkspacePreviewAsset(assetId: string): Promise<WorkspacePreviewAssetState> {
  const blob = await getScenarioAssetBlob(assetId);
  if (!blob) {
    return createEmptyAssetState();
  }

  const [dimensions, dataUrl] = await Promise.all([measureImageBlob(blob), blobToDataUrl(blob)]);
  return { dataUrl, dimensions, hasLoadError: false };
}

export function useWorkspacePreviewAsset(step: ScenarioCaptureStep) {
  const [assetState, setAssetState] = useState<WorkspacePreviewAssetState>(createEmptyAssetState);

  useEffect(() => {
    let cancelled = false;

    void loadWorkspacePreviewAsset(step.assetId)
      .then((nextAssetState) => {
        if (cancelled) {
          return;
        }

        setAssetState(nextAssetState);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        setAssetState(createFailedAssetState());
      });

    return () => {
      cancelled = true;
    };
  }, [step.assetId]);

  return assetState;
}
