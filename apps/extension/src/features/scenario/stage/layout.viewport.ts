import type { ScenarioCaptureStep } from '../contracts/types/project';
import type { ScenarioViewportTransform } from '@sniptale/runtime-contracts/scenario/types/geometry';
import type {
  ScenarioAssetDimensions,
  ScenarioStageRenderMode,
  ScenarioStageSize,
} from './layout.types.ts';

export const SCENARIO_STAGE_WIDTH = 720;
export const SCENARIO_STAGE_HEIGHT = 420;
const SCENARIO_EXPORT_STAGE_INSET = 8;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function createDefaultScenarioViewportTransform(): ScenarioViewportTransform {
  return {
    x: 0,
    y: 0,
    width: SCENARIO_STAGE_WIDTH,
    height: SCENARIO_STAGE_HEIGHT,
  };
}

export function normalizeScenarioViewport(
  viewport: ScenarioViewportTransform,
  canvas: ScenarioStageSize
): ScenarioViewportTransform {
  const width = clamp(viewport.width, 120, canvas.width);
  const height = clamp(viewport.height, 120, canvas.height);

  return {
    width,
    height,
    x: clamp(viewport.x, 0, canvas.width - width),
    y: clamp(viewport.y, 0, canvas.height - height),
  };
}

export function resolveScenarioSourceViewport(
  step: ScenarioCaptureStep,
  asset: ScenarioAssetDimensions
) {
  return {
    width: Math.max(step.page.viewport.width || asset.width || 1, 1),
    height: Math.max(step.page.viewport.height || asset.height || 1, 1),
  };
}

function resolveExportViewport(
  viewport: ScenarioViewportTransform,
  canvas: ScenarioStageSize
): ScenarioViewportTransform {
  const availableWidth = Math.max(canvas.width - SCENARIO_EXPORT_STAGE_INSET * 2, 120);
  const availableHeight = Math.max(canvas.height - SCENARIO_EXPORT_STAGE_INSET * 2, 120);
  const scale = Math.min(availableWidth / viewport.width, availableHeight / viewport.height);
  const width = viewport.width * scale;
  const height = viewport.height * scale;

  return {
    x: (canvas.width - width) / 2,
    y: (canvas.height - height) / 2,
    width,
    height,
  };
}

function resolveOriginalViewport(
  asset: ScenarioAssetDimensions,
  canvas: ScenarioStageSize
): ScenarioViewportTransform {
  return {
    x: 0,
    y: 0,
    width: canvas.width || asset.width,
    height: canvas.height || asset.height,
  };
}

export function resolveScenarioViewport(args: {
  asset: ScenarioAssetDimensions;
  canvas: ScenarioStageSize;
  renderMode: ScenarioStageRenderMode;
  stepViewportTransform?: ScenarioViewportTransform;
}) {
  const normalizedViewport = normalizeScenarioViewport(
    args.stepViewportTransform ?? createDefaultScenarioViewportTransform(),
    args.canvas
  );

  if (args.renderMode === 'export') {
    return {
      normalizedViewport,
      viewport: resolveExportViewport(normalizedViewport, args.canvas),
    };
  }

  if (args.renderMode === 'original') {
    return {
      normalizedViewport,
      viewport: resolveOriginalViewport(args.asset, args.canvas),
    };
  }

  return {
    normalizedViewport,
    viewport: normalizedViewport,
  };
}
