import { getVideoProjectUtilityLanes } from '../../../../features/video/project/utility-lanes';
import { projectCursorFocusTimelineKeys } from '../../../../features/video/project/cursor-focus-path/timeline';
import {
  resolveCursorSourcePointMapping,
  mapCursorFocusControlPoint,
} from '../../../../features/video/composition/timeline/frame/cursor';
import { useEffect, useRef, useState } from 'react';
import {
  useVideoEditorClipSelectionPort,
  useVideoEditorPlaybackPort,
  useVideoEditorTimelineEditingPort,
} from '../../../runtime/controller/store';
import { resolveProjectCursorFocusPath } from '../../../../features/video/project/cursor-focus-path/projection';
import {
  updateCursorFocusKey,
  cursorFocusOverrideId,
  authoredCursorFocusPath,
} from '../../../../features/video/project/cursor-focus-path/authoring';
import {
  sampleCursorFocusSegment,
  cursorFocusKeyControls,
} from '../../../../features/video/project/cursor-focus-path/evaluator';
import type {
  CursorFocusPath,
  CursorFocusPoint,
  CursorFocusKey,
} from '../../../../features/video/project/cursor-focus-path/types';
import { applyVideoProjectMutationPatch } from '../../../../features/video/project/mutation';
import { translate } from '../../../../platform/i18n';
import { layoutCursorFocusControls } from '../../../../ui/cursor-focus-control-layout';
import type { PointOverlayParams } from './types';
import { getPointHandleStyle, resolvePointFromPointer } from './helpers';
import { resolvePreviewStageViewportMetrics } from '../canvas/geometry';

/** Disposable canvas gesture commits one final path through existing project history. */
function useCursorOverlay(params: PointOverlayParams) {
  const selection = useVideoEditorClipSelectionPort((port) => port.selection);
  const selectCursorSegment = useVideoEditorClipSelectionPort((port) => port.selectCursorSegment);
  const seek = useVideoEditorPlaybackPort((port) => port.setCurrentTime);
  const updateProject = useVideoEditorTimelineEditingPort((port) => port.updateProject);
  const [draft, setDraft] = useState<CursorFocusPath | null>(null);
  const cancel = useRef<(() => void) | null>(null);
  useEffect(() => () => cancel.current?.(), []);
  const stage = params.stageRef.current;
  const path =
    draft ??
    resolveProjectCursorFocusPath(
      params.project,
      selection.kind === 'cursor-segment' ? selection.sampleId : undefined
    );
  if (selection.kind !== 'cursor-segment' || !stage) return null;
  const segment = path.segments.find((item) =>
    item.keys.some((key) => key.id === selection.sampleId)
  );
  const selected = segment?.keys.find((key) => key.id === selection.sampleId);
  if (!segment || !selected) return null;
  const choose = (key: CursorFocusKey) => {
    const occurrence = projectCursorFocusTimelineKeys(params.project)
      .filter((item) => item.id === key.id)
      .toSorted(
        (a, b) => Math.abs(a.time - params.currentTime) - Math.abs(b.time - params.currentTime)
      )[0];
    if (occurrence) {
      selectCursorSegment(key.id);
      seek(occurrence.time);
    }
  };
  const commit = (value: CursorFocusPath) => {
    let accepted = false;
    if (value === path) return accepted;
    updateProject((project) => {
      if (
        project.id !== params.project.id ||
        getVideoProjectUtilityLanes(project).actions.locked ||
        project.cursorFocusPath !== params.project.cursorFocusPath
      )
        return project;
      accepted = true;
      return applyVideoProjectMutationPatch(project, {
        cursorFocusPath: authoredCursorFocusPath(value),
      });
    });
    return accepted;
  };
  const commitGeometry = (next: CursorFocusPath, id: string) => {
    if (!commit(next)) return;
    const override = next.segments
      .flatMap((item) => item.keys)
      .find((item) => item.id === cursorFocusOverrideId(id));
    if (override) selectCursorSegment(override.id);
  };
  const binding = segment.binding;
  const clip =
    binding.kind === 'recording-source'
      ? params.project.clips.find(
          (item) =>
            item.type === 'VIDEO' &&
            (item.sourceInstanceId ?? item.id) === binding.sourceInstanceId &&
            params.currentTime >= item.startTime &&
            params.currentTime < item.startTime + item.duration
        )
      : undefined;
  const mapping = resolveCursorSourcePointMapping(params.project, clip?.id, params.currentTime);
  const mapped = (point: CursorFocusPoint) => {
    const scenePoint = mapping
      ? mapCursorFocusControlPoint(mapping, point)
      : { x: point.x * params.project.width, y: point.y * params.project.height };
    const style = getPointHandleStyle(params.project, scenePoint, params.camera, stage);
    return { x: Number.parseFloat(String(style.left)), y: Number.parseFloat(String(style.top)) };
  };
  const curve = sampleCursorFocusSegment(segment, path.smoothing)
    .map((point) => {
      const value = mapped(point);
      return `${value.x},${value.y}`;
    })
    .join(' ');
  const selectedPoint = mapped(selected);
  const stageBounds = stage.getBoundingClientRect();
  const radius = {
    x: 1200 / Math.max(1, stageBounds.width),
    y: 1200 / Math.max(1, stageBounds.height),
  };
  const boundControl = (point: CursorFocusPoint) => {
    const position = mapped(point);
    return (
      resolveCursorTangent(
        params,
        stageBounds.left + (position.x * stageBounds.width) / 100,
        stageBounds.top + (position.y * stageBounds.height) / 100,
        mapping
      ) ?? point
    );
  };
  const rawControls = cursorFocusKeyControls(segment, selected.id, path.smoothing);
  const controls = layoutProjectCursorControls(params, selected, rawControls, mapping, mapped);
  const begin = createCursorGesture({
    params,
    stage,
    selected,
    controls,
    stageBounds,
    mapping,
    mapped,
    choose,
    commit,
    selectCursorSegment,
    setDraft,
    cancel,
  });
  return {
    curve,
    segment,
    selected,
    selectedPoint,
    radius,
    mapped,
    controls,
    boundControl,
    begin,
    choose,
    path,
    commitGeometry,
    commit,
  };
}

export function PreviewCursorPathOverlay(params: PointOverlayParams) {
  const model = useCursorOverlay(params);
  if (!model) return null;
  const {
    curve,
    segment,
    selected,
    selectedPoint,
    radius,
    mapped,
    begin,
    choose,
    path,
    commitGeometry,
  } = model;
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      data-ui="cursorFocusPath.overlay"
      aria-label={translate('videoEditor.sidebar.cursorFocusPathTitle')}
    >
      <polyline
        points={curve}
        fill="none"
        stroke="var(--sniptale-color-accent)"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
      {segment.keys
        .filter(
          (_key, index) =>
            Math.abs(index - segment.keys.findIndex((item) => item.id === selected.id)) === 1
        )
        .map((key) => {
          const point = mapped(key);
          return (
            <ellipse
              key={key.id}
              data-cursor-focus-key={key.id}
              data-authored={key.anchor === 'manual' || key.authored ? 'true' : 'false'}
              cx={point.x}
              cy={point.y}
              rx={radius.x * 0.7}
              ry={radius.y * 0.7}
              fill="color-mix(in srgb, var(--sniptale-color-accent) 18%, transparent)"
              aria-pressed="false"
              stroke="var(--sniptale-color-text-secondary)"
              strokeWidth="1.5"
              vectorEffect="non-scaling-stroke"
              role="button"
              tabIndex={0}
              aria-label={`${translate('videoEditor.sidebar.cursorFocusKey')} ${key.time.toFixed(2)}`}
              className="pointer-events-auto cursor-pointer"
              onPointerDown={(event) => begin(event, key)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  event.stopPropagation();
                  choose(key);
                }
              }}
            />
          );
        })}
      <ellipse
        data-cursor-focus-key={selected.id}
        data-authored={selected.anchor === 'manual' || selected.authored ? 'true' : 'false'}
        cx={selectedPoint.x}
        cy={selectedPoint.y}
        rx={radius.x}
        ry={radius.y}
        fill="color-mix(in srgb, var(--sniptale-color-accent) 35%, transparent)"
        aria-pressed="true"
        stroke="var(--sniptale-color-accent)"
        strokeWidth="3"
        vectorEffect="non-scaling-stroke"
        className="pointer-events-auto cursor-grab"
        role="button"
        tabIndex={0}
        aria-label={translate('videoEditor.sidebar.cursorFocusPathTitle')}
        onPointerDown={(event) => begin(event, selected)}
        onKeyDown={(event) => {
          if (event.key.startsWith('Arrow')) {
            event.preventDefault();
            event.stopPropagation();
            commitGeometry(
              updateCursorFocusKey(path, selected.id, {
                x:
                  selected.x +
                  (event.key === 'ArrowRight' ? 0.01 : event.key === 'ArrowLeft' ? -0.01 : 0),
                y:
                  selected.y +
                  (event.key === 'ArrowDown' ? 0.01 : event.key === 'ArrowUp' ? -0.01 : 0),
              }),
              selected.id
            );
          }
        }}
      />
      <ellipse
        cx={selectedPoint.x}
        cy={selectedPoint.y}
        rx={radius.x * 0.22}
        ry={radius.y * 0.22}
        fill="var(--sniptale-color-accent)"
      />
      <PreviewCursorTangents model={model} />
    </svg>
  );
}

function createCursorGesture(context: {
  params: PointOverlayParams;
  stage: NonNullable<PointOverlayParams['stageRef']['current']>;
  selected: CursorFocusKey;
  controls: ReturnType<typeof cursorFocusKeyControls>;
  stageBounds: DOMRect;
  mapping: ReturnType<typeof resolveCursorSourcePointMapping>;
  mapped(point: CursorFocusPoint): { x: number; y: number };
  choose(key: CursorFocusKey): void;
  commit(path: CursorFocusPath): boolean;
  selectCursorSegment(id: string): void;
  setDraft(path: CursorFocusPath | null): void;
  cancel: { current: (() => void) | null };
}) {
  const {
    params,
    stage,
    selected,
    controls,
    stageBounds,
    mapping,
    mapped,
    choose,
    commit,
    selectCursorSegment,
    setDraft,
    cancel,
  } = context;
  return (
    event: React.PointerEvent<SVGElement>,
    key: CursorFocusKey,
    handle?: 'incoming' | 'outgoing'
  ) => {
    if (key.id === selected.id) {
      const distance = (point: CursorFocusPoint) => {
        const position = mapped(point);
        return Math.hypot(
          event.clientX - stageBounds.left - (position.x * stageBounds.width) / 100,
          event.clientY - stageBounds.top - (position.y * stageBounds.height) / 100
        );
      };
      const candidates = (['incoming', 'outgoing'] as const)
        .filter((name) => controls[name] !== undefined)
        .map((name) => ({ name, distance: distance(controls[name]!) }))
        .filter((item) => item.distance <= 14)
        .toSorted((a, b) => a.distance - b.distance);
      const activated = candidates.find((item) => item.name === handle);
      handle =
        candidates[0] && candidates[0].distance < distance(selected)
          ? activated && Math.abs(activated.distance - candidates[0].distance) < 0.01
            ? handle
            : candidates[0].name
          : undefined;
    }
    if (!handle && key.id !== selected.id) {
      event.preventDefault();
      event.stopPropagation();
      choose(key);
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const base = resolveProjectCursorFocusPath(params.project, selected.id);
    let next = base;
    const move = (pointer: PointerEvent) => {
      const point = resolvePointFromPointer(
        pointer.clientX,
        pointer.clientY,
        stage,
        params.project,
        params.camera,
        !!handle
      );
      if (!point) return;
      const normalized = handle
        ? resolveCursorTangent(params, pointer.clientX, pointer.clientY, mapping)
        : mapping
          ? mapCursorFocusControlPoint(mapping, point, true)
          : { x: point.x / params.project.width, y: point.y / params.project.height };
      if (!normalized) return;
      next = updateCursorFocusKey(base, key.id, handle ? { [handle]: normalized } : normalized);
      setDraft(next);
    };
    const cleanup = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', abort);
      window.removeEventListener('blur', abort);
      window.removeEventListener('keydown', escape);
      cancel.current = null;
      setDraft(null);
    };
    const finish = () => {
      cleanup();
      if (next !== base && commit(next)) {
        const override = next.segments
          .flatMap((item) => item.keys)
          .find((item) => item.id === cursorFocusOverrideId(key.id));
        if (!handle && override) selectCursorSegment(override.id);
      }
    };
    const abort = () => cleanup();
    const escape = (keyboard: KeyboardEvent) => {
      if (keyboard.key === 'Escape') {
        keyboard.preventDefault();
        keyboard.stopPropagation();
        abort();
      }
    };
    cancel.current?.();
    cancel.current = abort;
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', abort);
    window.addEventListener('blur', abort);
    window.addEventListener('keydown', escape);
  };
}

function PreviewCursorTangents({
  model,
}: {
  model: Pick<
    NonNullable<ReturnType<typeof useCursorOverlay>>,
    | 'controls'
    | 'boundControl'
    | 'selected'
    | 'mapped'
    | 'selectedPoint'
    | 'radius'
    | 'begin'
    | 'commit'
    | 'path'
  >;
}) {
  const { controls, boundControl, selected, mapped, selectedPoint, radius, begin, commit, path } =
    model;
  return (
    <>
      {' '}
      {(['incoming', 'outgoing'] as const).map((handle) => {
        const control = controls[handle];
        if (!control) return null;
        const position = mapped(control);
        return (
          <g key={handle}>
            <line
              x1={selectedPoint.x}
              y1={selectedPoint.y}
              x2={position.x}
              y2={position.y}
              stroke="var(--sniptale-color-text-secondary)"
              strokeWidth="0.2"
              strokeDasharray="0.5 0.5"
            />
            <ellipse
              cx={position.x}
              cy={position.y}
              rx={radius.x}
              ry={radius.y}
              fill="transparent"
              className="pointer-events-auto cursor-grab"
              role="button"
              tabIndex={0}
              aria-label={translate(
                handle === 'incoming'
                  ? 'videoEditor.sidebar.cursorFocusIncoming'
                  : 'videoEditor.sidebar.cursorFocusOutgoing'
              )}
              onPointerDown={(event) => begin(event, selected, handle)}
              onKeyDown={(event) => {
                if (event.key.startsWith('Arrow')) {
                  event.preventDefault();
                  commit(
                    updateCursorFocusKey(path, selected.id, {
                      [handle]: boundControl({
                        x:
                          control.x +
                          (event.key === 'ArrowRight'
                            ? 0.01
                            : event.key === 'ArrowLeft'
                              ? -0.01
                              : 0),
                        y:
                          control.y +
                          (event.key === 'ArrowDown' ? 0.01 : event.key === 'ArrowUp' ? -0.01 : 0),
                      }),
                    })
                  );
                }
              }}
            />
            <rect
              x={position.x - radius.x * 0.325}
              y={position.y - radius.y * 0.325}
              width={radius.x * 0.65}
              height={radius.y * 0.65}
              rx={radius.x * 0.12}
              fill="color-mix(in srgb, var(--sniptale-color-accent) 25%, transparent)"
              stroke="var(--sniptale-color-accent)"
              strokeWidth="1.5"
              vectorEffect="non-scaling-stroke"
            />
          </g>
        );
      })}
    </>
  );
}

/** Visible canvas bounds constrain authoring without rewriting imported control geometry. */
function resolveCursorTangent(
  params: PointOverlayParams,
  clientX: number,
  clientY: number,
  mapping: ReturnType<typeof resolveCursorSourcePointMapping>
): CursorFocusPoint | null {
  const stage = params.stageRef.current;
  if (!stage) return null;
  const { bounds, viewport } = resolvePreviewStageViewportMetrics(stage, params.project);
  const insetX = Math.min(14, viewport.width / 2);
  const insetY = Math.min(14, viewport.height / 2);
  const point = resolvePointFromPointer(
    Math.max(
      bounds.left + viewport.offsetX + insetX,
      Math.min(bounds.left + viewport.offsetX + viewport.width - insetX, clientX)
    ),
    Math.max(
      bounds.top + viewport.offsetY + insetY,
      Math.min(bounds.top + viewport.offsetY + viewport.height - insetY, clientY)
    ),
    stage,
    params.project,
    params.camera,
    true
  );
  return !point
    ? null
    : mapping
      ? mapCursorFocusControlPoint(mapping, point, true)
      : { x: point.x / params.project.width, y: point.y / params.project.height };
}

function layoutProjectCursorControls(
  params: PointOverlayParams,
  selected: CursorFocusKey,
  controls: ReturnType<typeof cursorFocusKeyControls>,
  mapping: ReturnType<typeof resolveCursorSourcePointMapping>,
  mapped: (point: CursorFocusPoint) => { x: number; y: number }
) {
  const stage = params.stageRef.current;
  if (!stage) return controls;
  const { bounds, viewport } = resolvePreviewStageViewportMetrics(stage, params.project);
  const display = (point: CursorFocusPoint) => {
    const value = mapped(point);
    return { x: (value.x * bounds.width) / 100, y: (value.y * bounds.height) / 100 };
  };
  const visible = (point: CursorFocusPoint | undefined) =>
    point && Math.hypot(point.x - selected.x, point.y - selected.y) > Number.EPSILON
      ? display(point)
      : undefined;
  const layout = layoutCursorFocusControls({
    point: display(selected),
    controls: { incoming: visible(controls.incoming), outgoing: visible(controls.outgoing) },
    bounds: {
      left: viewport.offsetX,
      top: viewport.offsetY,
      right: viewport.offsetX + viewport.width,
      bottom: viewport.offsetY + viewport.height,
    },
  });
  const source = (point: CursorFocusPoint | undefined) =>
    point
      ? (resolveCursorTangent(params, bounds.left + point.x, bounds.top + point.y, mapping) ??
        undefined)
      : undefined;
  return { incoming: source(layout.incoming), outgoing: source(layout.outgoing) };
}
