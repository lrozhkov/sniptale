import type { ScenarioCaptureStep } from '../contracts/types/project';
import type { ScenarioRect } from '@sniptale/runtime-contracts/scenario/types/geometry';
import type { ScenarioAssetDimensions, ScenarioStageRenderMode } from './layout.types.ts';

const SCENARIO_EXPORT_IMAGE_SCALE = 0.96;

export function resolveScenarioImageRect(args: {
  asset: ScenarioAssetDimensions;
  imageTransform: ScenarioCaptureStep['imageTransform'];
  normalizedViewport: ScenarioCaptureStep['viewportTransform'];
  renderMode: ScenarioStageRenderMode;
  viewport: ScenarioCaptureStep['viewportTransform'];
}): ScenarioRect {
  const exportImageScale = args.renderMode === 'export' ? SCENARIO_EXPORT_IMAGE_SCALE : 1;
  const offsetScaleX = args.viewport.width / args.normalizedViewport.width;
  const offsetScaleY = args.viewport.height / args.normalizedViewport.height;
  const baseScale = Math.min(
    args.viewport.width / args.asset.width,
    args.viewport.height / args.asset.height
  );
  const drawScale =
    args.renderMode === 'original' ? 1 : baseScale * args.imageTransform.scale * exportImageScale;
  const drawWidth = args.asset.width * drawScale;
  const drawHeight = args.asset.height * drawScale;
  const imageX =
    args.renderMode === 'original'
      ? 0
      : args.viewport.x +
        (args.viewport.width - drawWidth) / 2 +
        args.imageTransform.x * offsetScaleX;
  const imageY =
    args.renderMode === 'original'
      ? 0
      : args.viewport.y +
        (args.viewport.height - drawHeight) / 2 +
        args.imageTransform.y * offsetScaleY;

  return {
    x: imageX,
    y: imageY,
    width: drawWidth,
    height: drawHeight,
  };
}
