import { useEffect, useMemo, useState } from 'react';
import { blobToDataUrl } from '../../../../platform/media-utils/data-url';
import { measureImageBlob } from '@sniptale/platform/browser/media/image-dimensions';
import { buildScenarioCaptureSvgMarkup } from '../../../project/stage-render/svg';
import { getScenarioAssetBlob } from '../../../../composition/persistence/scenario/store/public';
import type { ScenarioCaptureStep } from '../../../../features/scenario/contracts/types/project';
import { AnnotatableImageSurface } from '@sniptale/ui/annotatable-image-surface';

async function loadScenarioAsset(
  step: ScenarioCaptureStep,
  assetBlob?: Blob | null
): Promise<{
  dimensions: { width: number; height: number } | null;
  dataUrl: string | null;
}> {
  const blob = assetBlob ?? (await getScenarioAssetBlob(step.assetId));
  if (!blob) {
    return {
      dimensions: null,
      dataUrl: null,
    };
  }

  const [dimensions, dataUrl] = await Promise.all([measureImageBlob(blob), blobToDataUrl(blob)]);
  return {
    dimensions,
    dataUrl,
  };
}

function useScenarioCaptureAssetState(step: ScenarioCaptureStep, assetBlob?: Blob | null) {
  const [assetState, setAssetState] = useState<{
    dataUrl: string | null;
    dimensions: { width: number; height: number } | null;
  }>({
    dataUrl: null,
    dimensions: null,
  });

  useEffect(() => {
    let cancelled = false;

    void loadScenarioAsset(step, assetBlob)
      .then((nextAssetState) => {
        if (!cancelled) {
          setAssetState(nextAssetState);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAssetState({
            dataUrl: null,
            dimensions: null,
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [assetBlob, step]);

  return assetState;
}

function useScenarioCaptureImageUrl(svgMarkup: string): string {
  const imageUrl = useMemo(
    () => URL.createObjectURL(new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' })),
    [svgMarkup]
  );

  useEffect(() => {
    return () => {
      URL.revokeObjectURL(imageUrl);
    };
  }, [imageUrl]);

  return imageUrl;
}

export function ScenarioCaptureStage(props: {
  step: ScenarioCaptureStep;
  assetBlob?: Blob | null;
  selectedOverlayId?: string | null;
  missingLabel?: string;
  altLabel?: string;
  className?: string;
}) {
  const assetState = useScenarioCaptureAssetState(props.step, props.assetBlob);

  const svgMarkup = useMemo(
    () =>
      buildScenarioCaptureSvgMarkup({
        step: props.step,
        ...(assetState.dataUrl === null ? {} : { assetDataUrl: assetState.dataUrl }),
        ...(assetState.dimensions === null ? {} : { assetDimensions: assetState.dimensions }),
        ...(props.selectedOverlayId === undefined
          ? {}
          : { selectedOverlayId: props.selectedOverlayId }),
        ...(props.missingLabel === undefined ? {} : { missingLabel: props.missingLabel }),
      }),
    [
      assetState.dataUrl,
      assetState.dimensions,
      props.missingLabel,
      props.selectedOverlayId,
      props.step,
    ]
  );

  const imageUrl = useScenarioCaptureImageUrl(svgMarkup);

  return (
    <AnnotatableImageSurface
      {...(props.className === undefined ? {} : { className: props.className })}
    >
      <img
        src={imageUrl}
        alt={props.step.title || props.altLabel || ''}
        draggable={false}
        className="block h-auto w-full select-none"
      />
    </AnnotatableImageSurface>
  );
}
