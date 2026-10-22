import type { VideoCompositionVisualLayer } from '../../../../features/video/composition/types';
import { DEFAULT_CAMERA_APPEARANCE } from '../../../../features/video/project/camera/appearance';
import {
  useEffect,
  useRef,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  clampQuickEditSpotlightArea,
  type QuickEditSpotlight,
} from '../../../../features/video/project/scene/focus-appearance';
import { resolveVideoCompositionVisualLayers } from '../../../../features/video/composition/timeline/frame/layers';
import {
  mapWindowNormalizedPointToVisualLayer,
  mapVisualLayerPointToWindowNormalized,
  type VisualLayerSourcePointMapping,
} from '../../../../features/video/composition/draw/fitted-media';
import { getVideoProjectUtilityLanes } from '../../../../features/video/project/utility-lanes';
import { translate } from '../../../../platform/i18n';
import {
  getCompositionPointStageStyle,
  mapClientPointToCompositionPoint,
  shouldLockPreviewClipToViewport,
} from '../canvas/geometry';
import { AREA_HANDLE_CLASS_NAME } from './shared';
import type { AreaOverlayParams } from './types';

type Area = QuickEditSpotlight['area'];
type Point = { x: number; y: number };
type Corner = 'nw' | 'ne' | 'sw' | 'se';

const FOCUS_AREA_BODY_CLASS_NAME = [
  'pointer-events-auto cursor-move fill-transparent',
  'stroke-[var(--sniptale-color-accent-emphasis)] focus:outline-none',
  'focus:stroke-[var(--sniptale-color-text-primary-strong)]',
].join(' ');
const FOCUS_CORNER_LABELS = {
  nw: 'gallery.videoReview.key_top-left',
  ne: 'gallery.videoReview.key_top-right',
  sw: 'gallery.videoReview.key_bottom-left',
  se: 'gallery.videoReview.key_bottom-right',
} as const;

/** A focus-area gesture presents one disposable draft and commits once against its accepted snapshot. */
export function PreviewStageFocusAreaOverlay(params: AreaOverlayParams) {
  const accepted = params.motionProject ?? params.project;
  const id = params.selectedMotionRegion?.id;
  const region = accepted.motionRegions?.find((item) => item.id === id);
  const displayed = params.project.motionRegions?.find((item) => item.id === id) ?? region;
  const locked = getVideoProjectUtilityLanes(accepted).camera.locked;
  const stage = params.stageRef.current;
  const appearance = region?.border ?? region?.spotlight;
  const displayedAppearance = displayed?.border ?? displayed?.spotlight;
  const mapping = appearance && stage ? focusTargetMapping(params, stage) : null;
  const editing = useFocusAreaEditing(params, mapping);
  if (
    !appearance ||
    !displayedAppearance ||
    !mapping ||
    !editing ||
    locked ||
    !params.onPreviewMotion
  )
    return null;
  const area = displayedAppearance.area;
  const corners = [
    ['nw', { x: area.x, y: area.y }],
    ['ne', { x: area.x + area.width, y: area.y }],
    ['se', { x: area.x + area.width, y: area.y + area.height }],
    ['sw', { x: area.x, y: area.y + area.height }],
  ] as const;
  const positions = corners.map(([corner, point]) => ({ corner, point: mapping.toStage(point) }));
  if (positions.some((item) => !item.point)) return null;
  return (
    <>
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-label={translate(
          region?.border ? 'gallery.videoReview.focusBorder' : 'gallery.videoReview.focusSpotlight'
        )}
      >
        <polygon
          data-preview-stage-focus-area="true"
          role="button"
          tabIndex={0}
          aria-label={translate('videoEditor.sidebar.selectAreaOnStage')}
          points={positions.map(({ point }) => `${point!.x},${point!.y}`).join(' ')}
          className={FOCUS_AREA_BODY_CLASS_NAME}
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
          onPointerDown={(event) => editing.begin(event, 'move')}
          onLostPointerCapture={editing.cancel}
          onKeyDown={(event) => editing.keyboard(event)}
        />
      </svg>
      {positions.map(({ corner, point }) => (
        <button
          key={corner}
          type="button"
          data-preview-stage-focus-handle={corner}
          aria-label={[
            translate('videoEditor.sidebar.resizeAreaOnStage'),
            translate(FOCUS_CORNER_LABELS[corner]),
          ].join(' · ')}
          className={AREA_HANDLE_CLASS_NAME}
          style={{ left: `${point!.x}%`, top: `${point!.y}%`, cursor: `${corner}-resize` }}
          onPointerDown={(event) => editing.begin(event, corner)}
          onLostPointerCapture={editing.cancel}
          onKeyDown={(event) => editing.keyboard(event, corner)}
        />
      ))}
    </>
  );
}

function useFocusAreaEditing(
  params: AreaOverlayParams,
  mapping: ReturnType<typeof focusTargetMapping>
) {
  const accepted = params.motionProject ?? params.project;
  const id = params.selectedMotionRegion?.id;
  const region = accepted.motionRegions?.find((item) => item.id === id);
  const locked = getVideoProjectUtilityLanes(accepted).camera.locked;
  const session = useRef<(() => void) | null>(null);
  const live = useRef(params);
  live.current = params;
  useEffect(() => () => session.current?.(), [accepted, id, locked, params.currentTime]);
  const appearance = region?.border ?? region?.spotlight;
  if (!region || !appearance || !mapping) return null;
  const kind = region.border ? 'border' : 'spotlight';
  const preview = (next: Area | null) =>
    params.onPreviewMotion?.(
      next
        ? {
            project: accepted,
            regionId: region.id,
            kind: 'focus',
            edit: { kind, settings: { area: next } },
          }
        : null
    );
  const isCurrent = () =>
    (live.current.motionProject ?? live.current.project) === accepted &&
    live.current.selectedMotionRegion?.id === region.id &&
    !getVideoProjectUtilityLanes(live.current.motionProject ?? live.current.project).camera.locked;
  const commit = (next: Area) => {
    preview(null);
    if (
      isCurrent() &&
      Object.keys(next).some(
        (key) => next[key as keyof Area] !== appearance.area[key as keyof Area]
      )
    )
      params.onUpdateMotionRegion(region.id, {
        focusEdit: { kind, settings: { area: next } },
      });
  };
  const begin = (
    event: ReactPointerEvent<SVGPolygonElement | HTMLButtonElement>,
    mode: 'move' | Corner
  ) => {
    if (event.button !== 0) return;
    const start = mapping.fromClient({ x: event.clientX, y: event.clientY });
    if (!start) return;
    event.preventDefault();
    event.stopPropagation();
    session.current?.();
    const node = event.currentTarget;
    node.focus();
    const pointerId = event.pointerId;
    const origin = appearance.area;
    let next = origin;
    const cleanup = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', cancelPointer);
      window.removeEventListener('keydown', key, true);
      session.current = null;
      if (node.hasPointerCapture?.(pointerId)) node.releasePointerCapture(pointerId);
    };
    const cancel = () => {
      cleanup();
      preview(null);
    };
    const cancelPointer = (input: PointerEvent) => {
      if (input.pointerId === pointerId) cancel();
    };
    const move = (input: PointerEvent) => {
      if (input.pointerId !== pointerId || !isCurrent()) return;
      const point = mapping.fromClient({ x: input.clientX, y: input.clientY });
      if (!point) return;
      const dx = point.x - start.x,
        dy = point.y - start.y;
      next =
        mode === 'move'
          ? clampQuickEditSpotlightArea({ ...origin, x: origin.x + dx, y: origin.y + dy })
          : resizeFocusArea(origin, mode, dx, dy);
      preview(next);
    };
    const finish = (input: PointerEvent) => {
      if (input.pointerId !== pointerId) return;
      move(input);
      cleanup();
      commit(next);
    };
    const key = (input: globalThis.KeyboardEvent) => {
      if (input.key === 'Escape') {
        input.preventDefault();
        input.stopPropagation();
        cancel();
      }
    };
    session.current = cancel;
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', cancelPointer);
    window.addEventListener('keydown', key, true);
    node.setPointerCapture?.(pointerId);
  };
  const keyboard = (event: KeyboardEvent, corner?: Corner) => {
    if (event.altKey || event.ctrlKey || event.metaKey || session.current) return;
    const amount = event.shiftKey ? 0.01 : 0.001;
    const dx = event.key === 'ArrowLeft' ? -amount : event.key === 'ArrowRight' ? amount : 0;
    const dy = event.key === 'ArrowUp' ? -amount : event.key === 'ArrowDown' ? amount : 0;
    if (!dx && !dy) return;
    event.preventDefault();
    event.stopPropagation();
    const origin = appearance.area;
    commit(
      corner
        ? resizeFocusArea(origin, corner, dx, dy)
        : clampQuickEditSpotlightArea({ ...origin, x: origin.x + dx, y: origin.y + dy })
    );
  };
  return { begin, keyboard, cancel: () => session.current?.() };
}

function resizeFocusArea(area: Area, corner: Corner, dx: number, dy: number): Area {
  const right = area.x + area.width,
    bottom = area.y + area.height;
  const x = corner.endsWith('w') ? Math.max(0, Math.min(right - 0.01, area.x + dx)) : area.x;
  const y = corner.startsWith('n') ? Math.max(0, Math.min(bottom - 0.01, area.y + dy)) : area.y;
  return {
    x,
    y,
    width: corner.endsWith('w') ? right - x : Math.min(1 - x, Math.max(0.01, area.width + dx)),
    height: corner.startsWith('n') ? bottom - y : Math.min(1 - y, Math.max(0.01, area.height + dy)),
  };
}

/** Each concrete video's resolved visual layer supplies the same fit and affine transform as paint. */
function focusTargetMapping(params: AreaOverlayParams, stage: HTMLDivElement) {
  const region = params.selectedMotionRegion;
  if (!region) return null;
  const project = params.project;
  let mapping: VisualLayerSourcePointMapping | null = null;
  let lock = true;
  const target = region.border ? region.borderTarget : region.spotlightTarget;
  if (target === 'window' || target === 'scene') {
    const layer = resolveVideoCompositionVisualLayers(project, params.currentTime ?? 0).find(
      (item) => item.clipId === region.sourceBinding?.clipId && item.kind === 'video'
    );
    if (!layer || layer.kind !== 'video') return null;
    mapping = focusWindowMapping(project, layer);
    if (region.sourceBinding?.coordinateSpace)
      mapping.coordinateSpace = region.sourceBinding.coordinateSpace;
    lock = shouldLockPreviewClipToViewport(layer.clip, params.camera, project);
  }
  return {
    toStage(point: Point): Point | null {
      const scene = mapping
        ? mapWindowNormalizedPointToVisualLayer({ ...mapping, point })
        : { x: point.x * project.width, y: point.y * project.height };
      if (!scene) return null;
      const style = getCompositionPointStageStyle(project, scene, params.camera, lock, stage);
      if (style.display === 'none') return null;
      return { x: parseFloat(String(style.left)), y: parseFloat(String(style.top)) };
    },
    fromClient(point: Point): Point | null {
      const scene = mapClientPointToCompositionPoint({
        project,
        stage,
        camera: params.camera,
        clientX: point.x,
        clientY: point.y,
        lockToViewport: lock,
        clampToViewport: false,
      });
      if (!scene) return null;
      if (mapping) return mapVisualLayerPointToWindowNormalized({ ...mapping, point: scene });
      return { x: scene.x / project.width, y: scene.y / project.height };
    },
  };
}

function focusWindowMapping(
  project: AreaOverlayParams['project'],
  layer: Extract<VideoCompositionVisualLayer, { kind: 'video' }>
): VisualLayerSourcePointMapping {
  const metadata = project.assets.find((asset) => asset.id === layer.clip.assetId)?.metadata;
  const mapping: VisualLayerSourcePointMapping = {
    point: { x: 0, y: 0 },
    frame: {
      x: layer.x,
      y: layer.y,
      width: layer.width,
      height: layer.height,
      rotation: layer.rotation,
    },
    renderState: layer.renderState ?? { translateX: 0, translateY: 0, scaleX: 1, scaleY: 1 },
    fitMode: layer.clip.fitMode,
    sourceWidth: metadata?.width ?? layer.width,
    sourceHeight: metadata?.height ?? layer.height,
    ...(layer.clip.sourceCrop ? { sourceCrop: layer.clip.sourceCrop } : {}),
  };
  if (layer.trackRole === 'CAMERA')
    mapping.cameraAppearance = layer.clip.cameraAppearance ?? DEFAULT_CAMERA_APPEARANCE;
  else if (layer.clip.windowHeader) mapping.windowHeader = layer.clip.windowHeader;
  return mapping;
}
