import type { ScenarioCaptureStep } from '../../../../features/scenario/contracts/types/project';
import {
  createDefaultScenarioViewportTransform,
  resolveScenarioStageLayout,
  SCENARIO_STAGE_HEIGHT,
  SCENARIO_STAGE_WIDTH,
  type ScenarioAssetDimensions,
  type ScenarioStageRenderMode,
} from '../../../../features/scenario/stage/layout';
import { escapeSvgAttribute, formatNumber } from './format';
import { buildScenarioDefs } from './defs';
import { buildMissingAssetSvg } from './missing-asset';
import { buildScenarioImageMarkup } from './image-markup';
import { buildScenarioOverlayMarkup } from './overlays';
import { buildSvgOpenTag } from './open-tag';

const FALLBACK_BACKGROUND_COLOR = '#f3ede2';

function resolveScenarioSvgCanvas(args: {
  assetDimensions?: ScenarioAssetDimensions | null;
  renderMode?: ScenarioStageRenderMode;
}) {
  return args.renderMode === 'original' && args.assetDimensions
    ? { width: args.assetDimensions.width, height: args.assetDimensions.height }
    : { width: SCENARIO_STAGE_WIDTH, height: SCENARIO_STAGE_HEIGHT };
}

function buildScenarioViewportChrome(viewport: {
  height: number;
  width: number;
  x: number;
  y: number;
}): string {
  return [
    `<rect x="${formatNumber(viewport.x)}" y="${formatNumber(viewport.y)}"`,
    ` width="${formatNumber(viewport.width)}" height="${formatNumber(viewport.height)}"`,
    ' rx="18" ry="18" fill="rgba(255,255,255,0.65)"',
    ' stroke="rgba(120,113,108,0.22)" stroke-width="1.5" />',
  ].join('');
}

export function buildScenarioCaptureSvgMarkup(args: {
  step: ScenarioCaptureStep;
  assetDataUrl?: string | null;
  assetDimensions?: ScenarioAssetDimensions | null;
  backgroundColor?: string;
  selectedOverlayId?: string | null;
  missingLabel?: string;
  renderMode?: ScenarioStageRenderMode;
}): string {
  const canvas = resolveScenarioSvgCanvas(args);
  const backgroundColor = args.backgroundColor ?? FALLBACK_BACKGROUND_COLOR;

  if (!args.assetDataUrl || !args.assetDimensions) {
    return buildMissingAssetSvg(canvas, backgroundColor, args.missingLabel);
  }

  const layout = resolveScenarioStageLayout(
    {
      ...args.step,
      viewportTransform: args.step.viewportTransform ?? createDefaultScenarioViewportTransform(),
    },
    args.assetDimensions,
    canvas,
    args.renderMode ?? 'editor'
  );
  const viewport = layout.viewport;
  const viewportClipId = 'sniptaleScenarioViewportClip';
  const showViewportChrome = (args.renderMode ?? 'editor') === 'editor';
  const overlays = buildScenarioOverlayMarkup(
    args.assetDataUrl,
    layout,
    args.step,
    args.selectedOverlayId
  );

  return [
    buildSvgOpenTag(canvas),
    buildScenarioDefs(viewportClipId, viewport),
    `<rect width="${canvas.width}" height="${canvas.height}" fill="${escapeSvgAttribute(
      backgroundColor
    )}" />`,
    showViewportChrome ? buildScenarioViewportChrome(viewport) : '',
    `<g clip-path="url(#${viewportClipId})">`,
    buildScenarioImageMarkup(args.assetDataUrl, layout),
    overlays,
    '</g>',
    '</svg>',
  ].join('');
}

export {
  buildScenarioDefs,
  buildMissingAssetSvg,
  buildScenarioImageMarkup,
  buildScenarioOverlayMarkup,
  buildSvgOpenTag,
  createDefaultScenarioViewportTransform,
  resolveScenarioStageLayout,
  SCENARIO_STAGE_HEIGHT,
  SCENARIO_STAGE_WIDTH,
};
