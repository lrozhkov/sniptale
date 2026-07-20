import type { ScenarioElement, ScenarioPoint } from '@sniptale/runtime-contracts/scenario/types/v3';
import type { ScenarioCanvasElementPatch } from '../canvas';
import { clampScenarioNumber, SCENARIO_INSPECTOR_LIMITS } from '../inspector/constraints';
import type {
  ScenarioInspectorElementPatch,
  ScenarioInspectorProjectPresentationPatch,
  ScenarioInspectorSlidePatch,
} from '../inspector';

type ScenarioV3ElementPatch = ScenarioCanvasElementPatch & ScenarioInspectorElementPatch;

export function clampSlidePatch(patch: ScenarioInspectorSlidePatch): ScenarioInspectorSlidePatch {
  const nextPatch: ScenarioInspectorSlidePatch = { ...patch };

  if (patch.canvas) {
    nextPatch.canvas = {
      ...patch.canvas,
      ...(patch.canvas.width !== undefined
        ? { width: clampScenarioNumber(patch.canvas.width, SCENARIO_INSPECTOR_LIMITS.canvasWidth) }
        : {}),
      ...(patch.canvas.height !== undefined
        ? {
            height: clampScenarioNumber(
              patch.canvas.height,
              SCENARIO_INSPECTOR_LIMITS.canvasHeight
            ),
          }
        : {}),
    };
  }

  if (patch.clicks) {
    nextPatch.clicks = {
      ...patch.clicks,
      ...(patch.clicks.count !== undefined
        ? { count: clampScenarioNumber(patch.clicks.count, SCENARIO_INSPECTOR_LIMITS.clickCount) }
        : {}),
      ...(patch.clicks.initialIndex !== undefined
        ? {
            initialIndex: clampScenarioNumber(
              patch.clicks.initialIndex,
              SCENARIO_INSPECTOR_LIMITS.clickCount
            ),
          }
        : {}),
    };
  }

  clampTransitionPatchFields(nextPatch, patch);

  return nextPatch;
}

export function clampPresentationPatch(
  patch: ScenarioInspectorProjectPresentationPatch
): ScenarioInspectorProjectPresentationPatch {
  const nextPatch: ScenarioInspectorProjectPresentationPatch = { ...patch };

  if (patch.grid) {
    nextPatch.grid = {
      ...patch.grid,
      ...(patch.grid.columns !== undefined
        ? {
            columns: clampScenarioNumber(patch.grid.columns, SCENARIO_INSPECTOR_LIMITS.gridColumns),
          }
        : {}),
      ...(patch.grid.rows !== undefined
        ? { rows: clampScenarioNumber(patch.grid.rows, SCENARIO_INSPECTOR_LIMITS.gridRows) }
        : {}),
      ...(patch.grid.gutter !== undefined
        ? { gutter: clampScenarioNumber(patch.grid.gutter, SCENARIO_INSPECTOR_LIMITS.gridGutter) }
        : {}),
      ...(patch.grid.margin !== undefined
        ? { margin: clampScenarioNumber(patch.grid.margin, SCENARIO_INSPECTOR_LIMITS.gridMargin) }
        : {}),
    };
  }

  clampTransitionPatchFields(nextPatch, patch);

  return nextPatch;
}

export function clampElementPatch(element: ScenarioElement, patch: ScenarioV3ElementPatch) {
  const nextPatch: ScenarioV3ElementPatch = { ...patch };
  const lineStrokeLimit =
    element.kind === 'line' || element.kind === 'arrow'
      ? SCENARIO_INSPECTOR_LIMITS.lineStrokeWidth
      : SCENARIO_INSPECTOR_LIMITS.strokeWidth;

  if (patch.animation) {
    nextPatch.animation = clampAnimationPatch(patch.animation);
  }
  if (patch.build) {
    nextPatch.build = clampBuildPatch(patch.build);
  }
  if (patch.connector !== undefined) {
    nextPatch.connector = clampConnectorPatch(patch.connector);
  }
  if (patch.contentTransform) {
    nextPatch.contentTransform = clampContentTransformPatch(patch.contentTransform);
  }
  if (patch.cornerRadius !== undefined) {
    nextPatch.cornerRadius = clampScenarioNumber(
      patch.cornerRadius,
      SCENARIO_INSPECTOR_LIMITS.cornerRadius
    );
  }
  if (patch.end) {
    nextPatch.end = clampPoint(patch.end);
  }
  if (patch.frame) {
    nextPatch.frame = clampFramePatch(patch.frame);
  }
  if (patch.opacity !== undefined) {
    nextPatch.opacity = clampScenarioNumber(patch.opacity, SCENARIO_INSPECTOR_LIMITS.opacity);
  }
  if (patch.panel) {
    nextPatch.panel = clampPanelPatch(patch.panel);
  }
  if (patch.start) {
    nextPatch.start = clampPoint(patch.start);
  }
  if (patch.strokeWidth !== undefined) {
    nextPatch.strokeWidth = clampScenarioNumber(patch.strokeWidth, lineStrokeLimit);
  }
  if (patch.style) {
    nextPatch.style = clampStylePatch(patch.style);
  }

  return nextPatch;
}

function clampAnimationPatch(
  animation: NonNullable<ScenarioV3ElementPatch['animation']>
): NonNullable<ScenarioV3ElementPatch['animation']> {
  return {
    ...animation,
    ...(animation.durationMs !== undefined
      ? {
          durationMs: clampScenarioNumber(
            animation.durationMs,
            SCENARIO_INSPECTOR_LIMITS.animationDuration
          ),
        }
      : {}),
  };
}

function clampBuildPatch(
  build: NonNullable<ScenarioV3ElementPatch['build']>
): NonNullable<ScenarioV3ElementPatch['build']> {
  return {
    ...build,
    ...(build.order !== undefined
      ? { order: clampScenarioNumber(build.order, SCENARIO_INSPECTOR_LIMITS.buildIndex) }
      : {}),
    ...(build.showAtClick !== undefined
      ? {
          showAtClick: clampScenarioNumber(build.showAtClick, SCENARIO_INSPECTOR_LIMITS.buildIndex),
        }
      : {}),
    ...(build.hideAtClick !== undefined
      ? {
          hideAtClick:
            build.hideAtClick === null
              ? null
              : clampScenarioNumber(build.hideAtClick, SCENARIO_INSPECTOR_LIMITS.buildIndex),
        }
      : {}),
  };
}

function clampConnectorPatch(
  connector: Exclude<ScenarioV3ElementPatch['connector'], undefined>
): Exclude<ScenarioV3ElementPatch['connector'], undefined> {
  if (!connector) {
    return connector;
  }

  return {
    end: clampPoint(connector.end),
    start: clampPoint(connector.start),
  };
}

function clampContentTransformPatch(
  contentTransform: NonNullable<ScenarioV3ElementPatch['contentTransform']>
): NonNullable<ScenarioV3ElementPatch['contentTransform']> {
  return {
    ...contentTransform,
    ...(contentTransform.scale !== undefined
      ? {
          scale: clampScenarioNumber(
            contentTransform.scale,
            SCENARIO_INSPECTOR_LIMITS.contentScale
          ),
        }
      : {}),
    ...(contentTransform.x !== undefined
      ? { x: clampScenarioNumber(contentTransform.x, SCENARIO_INSPECTOR_LIMITS.contentOffset) }
      : {}),
    ...(contentTransform.y !== undefined
      ? { y: clampScenarioNumber(contentTransform.y, SCENARIO_INSPECTOR_LIMITS.contentOffset) }
      : {}),
  };
}

function clampDurationSettings<TSettings extends { durationMs: number }>(
  settings: TSettings,
  limit: { max: number; min: number }
): TSettings {
  return {
    ...settings,
    durationMs: clampScenarioNumber(settings.durationMs, limit),
  };
}

function clampTransitionPatchFields<
  TPatch extends {
    backgroundTransition?: { durationMs: number } | null;
    transition?: { durationMs: number } | null;
  },
>(nextPatch: TPatch, patch: TPatch): void {
  if (patch.transition) {
    nextPatch.transition = clampDurationSettings(
      patch.transition,
      SCENARIO_INSPECTOR_LIMITS.transitionDuration
    );
  }
  if (patch.backgroundTransition) {
    nextPatch.backgroundTransition = clampDurationSettings(
      patch.backgroundTransition,
      SCENARIO_INSPECTOR_LIMITS.transitionDuration
    );
  }
}

function clampFramePatch(
  frame: NonNullable<ScenarioV3ElementPatch['frame']>
): NonNullable<ScenarioV3ElementPatch['frame']> {
  return {
    ...frame,
    ...(frame.x !== undefined
      ? { x: clampScenarioNumber(frame.x, SCENARIO_INSPECTOR_LIMITS.coordinate) }
      : {}),
    ...(frame.y !== undefined
      ? { y: clampScenarioNumber(frame.y, SCENARIO_INSPECTOR_LIMITS.coordinate) }
      : {}),
    ...(frame.width !== undefined
      ? { width: clampScenarioNumber(frame.width, SCENARIO_INSPECTOR_LIMITS.elementWidth) }
      : {}),
    ...(frame.height !== undefined
      ? { height: clampScenarioNumber(frame.height, SCENARIO_INSPECTOR_LIMITS.elementHeight) }
      : {}),
  };
}

function clampPanelPatch(
  panel: NonNullable<ScenarioV3ElementPatch['panel']>
): NonNullable<ScenarioV3ElementPatch['panel']> {
  return {
    ...panel,
    ...(panel.borderWidth !== undefined
      ? {
          borderWidth: clampScenarioNumber(
            panel.borderWidth,
            SCENARIO_INSPECTOR_LIMITS.borderWidth
          ),
        }
      : {}),
  };
}

function clampPoint(point: ScenarioPoint): ScenarioPoint {
  return {
    x: clampScenarioNumber(point.x, SCENARIO_INSPECTOR_LIMITS.coordinate),
    y: clampScenarioNumber(point.y, SCENARIO_INSPECTOR_LIMITS.coordinate),
  };
}

function clampStylePatch(
  style: NonNullable<ScenarioV3ElementPatch['style']>
): NonNullable<ScenarioV3ElementPatch['style']> {
  return {
    ...style,
    ...(style.fontSize !== undefined
      ? { fontSize: clampScenarioNumber(style.fontSize, SCENARIO_INSPECTOR_LIMITS.fontSize) }
      : {}),
    ...('fontWeight' in style && typeof style.fontWeight !== 'undefined'
      ? {
          fontWeight: clampScenarioNumber(style.fontWeight, SCENARIO_INSPECTOR_LIMITS.fontWeight),
        }
      : {}),
  };
}
