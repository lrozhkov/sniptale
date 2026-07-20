import type {
  ScenarioCaptureStep,
  ScenarioProject,
} from '../../features/scenario/contracts/types/project';
import type { ScenarioOverlay } from '../../features/scenario/contracts/types/overlays';
import type { VideoProjectCursorSample } from '../../features/video/project/types';

export interface CaptureStepTimelineEntry {
  end: number;
  start: number;
  step: ScenarioCaptureStep;
}

function getScenarioCaptureSteps(project: ScenarioProject): ScenarioCaptureStep[] {
  return project.steps.filter((step): step is ScenarioCaptureStep => step.kind === 'capture');
}

export function buildCaptureStepTimeline(
  project: ScenarioProject,
  stepDuration: number
): CaptureStepTimelineEntry[] {
  let currentTime = 0;

  return getScenarioCaptureSteps(project).map((step) => {
    const start = currentTime;
    const end = start + stepDuration;
    currentTime = end;

    return {
      end,
      start,
      step,
    };
  });
}

function resolveScenarioOverlayCursorPoint(step: ScenarioCaptureStep) {
  const cursorOverlay = step.overlays.find(
    (overlay): overlay is Extract<ScenarioOverlay, { kind: 'cursor' }> => overlay.kind === 'cursor'
  );

  return cursorOverlay?.point ?? null;
}

function resolveCursorPoint(step: ScenarioCaptureStep) {
  return step.cursorPoint ?? resolveScenarioOverlayCursorPoint(step);
}

export function resolveInteractionPoint(step: ScenarioCaptureStep) {
  const clickRingOverlay = step.overlays.find(
    (overlay): overlay is Extract<ScenarioOverlay, { kind: 'click-ring' }> =>
      overlay.kind === 'click-ring'
  );

  return clickRingOverlay?.point ?? step.interactionPoint ?? null;
}

export function buildCursorSamples(
  entries: CaptureStepTimelineEntry[]
): VideoProjectCursorSample[] {
  return entries.flatMap<VideoProjectCursorSample>((entry) => {
    const cursorPoint = resolveCursorPoint(entry.step);
    if (!cursorPoint) {
      return [
        {
          id: `${entry.step.id}:cursor:hidden:start`,
          time: entry.start,
          visible: false,
          x: 0,
          y: 0,
        },
      ];
    }

    return [
      {
        id: `${entry.step.id}:cursor:start`,
        time: entry.start,
        visible: true,
        x: cursorPoint.x,
        y: cursorPoint.y,
      },
      {
        id: `${entry.step.id}:cursor:end`,
        time: Math.max(entry.start, entry.end - 0.01),
        visible: true,
        x: cursorPoint.x,
        y: cursorPoint.y,
      },
    ];
  });
}
