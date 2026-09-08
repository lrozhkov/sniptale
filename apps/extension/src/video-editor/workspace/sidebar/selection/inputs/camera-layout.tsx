import { CompactSelect } from '../../../../../ui/compact-inspector-controls';
import { formatPreciseTime } from '../../../../contracts/time-format';
import { Plus, Trash2 } from 'lucide-react';
import { activeCameraPosition } from '../../../../../features/video/project/camera/animation';
import { SelectInput } from '../shared/controls';
import { NumberInput } from './number';
import type { CameraPositionEdit } from '../../../../../features/video/project/camera/animation';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { translate } from '../../../../../platform/i18n';
import {
  resolveVideoProjectCameraLayout,
  resolveVideoProjectCameraPlacement,
  VideoProjectCameraLayout,
  VideoProjectCameraPlacement,
} from '../../../../../features/video/project/camera/placement';
import type {
  VideoProject,
  VideoProjectVideoClip,
} from '../../../../../features/video/project/types';

const LAYOUT_OPTIONS = [
  { layout: VideoProjectCameraLayout.OVERLAY, labelKey: 'videoEditor.sidebar.cameraLayoutOverlay' },
  {
    layout: VideoProjectCameraLayout.FULLFRAME,
    labelKey: 'videoEditor.sidebar.cameraLayoutFullframe',
  },
  { layout: VideoProjectCameraLayout.HIDDEN, labelKey: 'videoEditor.sidebar.cameraLayoutHidden' },
] as const;

const PLACEMENT_OPTIONS = [
  {
    placement: VideoProjectCameraPlacement.TOP_LEFT,
    labelKey: 'videoEditor.sidebar.cameraPlacementTopLeft',
    position: 'left-0.5 top-0.5',
  },
  {
    placement: VideoProjectCameraPlacement.TOP_RIGHT,
    labelKey: 'videoEditor.sidebar.cameraPlacementTopRight',
    position: 'right-0.5 top-0.5',
  },
  {
    placement: VideoProjectCameraPlacement.BOTTOM_LEFT,
    labelKey: 'videoEditor.sidebar.cameraPlacementBottomLeft',
    position: 'left-0.5 bottom-0.5',
  },
  {
    placement: VideoProjectCameraPlacement.BOTTOM_RIGHT,
    labelKey: 'videoEditor.sidebar.cameraPlacementBottomRight',
    position: 'right-0.5 bottom-0.5',
  },
] as const;

interface CameraLayoutControlsProps {
  clip: VideoProjectVideoClip;
  project: VideoProject;
  disabled: boolean;
  currentTime?: number;
  canAddCameraPosition?: boolean;
  onApplyCameraLayout?: (
    clipId: string,
    layout: VideoProjectCameraLayout,
    placement?: VideoProjectCameraPlacement
  ) => void;
  onEditCameraPosition?: (clipId: string, edit: CameraPositionEdit) => void;
}

export function CameraLayoutControls(props: CameraLayoutControlsProps) {
  const currentTime = props.currentTime ?? props.clip.startTime;
  const position = activeCameraPosition(props.clip, currentTime);
  const clip = position
    ? { ...props.clip, transform: position.transform, fitMode: position.fitMode }
    : props.clip;
  const layout = resolveVideoProjectCameraLayout(props.project, clip);
  const asset = props.project.assets.find((item) => item.id === props.clip.assetId);
  const disabled = props.disabled || !props.onApplyCameraLayout;
  return (
    <div className="space-y-3" data-ui="video-editor.camera-placement-controls">
      <CameraPositionNavigation {...props} />
      <SelectInput
        label={translate('videoEditor.sidebar.cameraLayoutLabel')}
        value={layout}
        disabled={disabled}
        options={LAYOUT_OPTIONS.map((option) => ({
          value: option.layout,
          label: translate(option.labelKey),
        }))}
        onChange={(value) => props.onApplyCameraLayout?.(props.clip.id, value)}
      />
      <div
        className="flex justify-end gap-1"
        role="group"
        aria-label={translate('videoEditor.sidebar.cameraPlacementLabel')}
      >
        {PLACEMENT_OPTIONS.map((option) => {
          const expected = resolveVideoProjectCameraPlacement({
            placement: option.placement,
            projectWidth: props.project.width,
            projectHeight: props.project.height,
            sourceWidth: asset?.metadata.width ?? clip.transform.width,
            sourceHeight: asset?.metadata.height ?? clip.transform.height,
          });
          const active =
            layout === VideoProjectCameraLayout.OVERLAY &&
            clip.transform.rotation === 0 &&
            Math.abs(expected.x - clip.transform.x) < 0.01 &&
            Math.abs(expected.y - clip.transform.y) < 0.01 &&
            Math.abs(expected.width - clip.transform.width) < 0.01 &&
            Math.abs(expected.height - clip.transform.height) < 0.01;
          return (
            <ProductActionButton
              key={option.placement}
              className="h-7! min-h-7! w-9! rounded-md! p-0!"
              compact
              tone="toggle"
              active={active}
              aria-pressed={active}
              aria-label={translate(option.labelKey)}
              title={translate(option.labelKey)}
              disabled={disabled}
              data-ui={`video-editor.camera-placement-${option.placement.toLowerCase()}`}
              onClick={() =>
                props.onApplyCameraLayout?.(
                  props.clip.id,
                  VideoProjectCameraLayout.OVERLAY,
                  option.placement
                )
              }
            >
              <span
                aria-hidden="true"
                className="relative block h-4 w-6 rounded border border-current opacity-80"
              >
                <span className={`absolute h-1 w-2 rounded-sm bg-current ${option.position}`} />
              </span>
            </ProductActionButton>
          );
        })}
      </div>
      <CameraTransitionFields {...props} />
    </div>
  );
}

function CameraTransitionFields(props: CameraLayoutControlsProps) {
  const position = activeCameraPosition(props.clip, props.currentTime ?? props.clip.startTime);
  const rate = props.clip.playbackRate ?? 1;
  const edit = (value: CameraPositionEdit) => props.onEditCameraPosition?.(props.clip.id, value);
  return (
    <>
      {' '}
      {position ? (
        <div className="space-y-1 border-t border-[var(--sniptale-color-border-soft)] pt-2">
          <NumberInput
            label={translate('videoEditor.sidebar.cameraPositionTime')}
            value={Math.max(0, (position.sourceTime - props.clip.sourceStart) / rate)}
            min={0}
            max={props.clip.duration}
            step={1 / props.project.fps}
            unit="s"
            disabled={props.disabled}
            onChange={(value) =>
              edit({
                kind: 'update',
                id: position.id,
                sourceTime: props.clip.sourceStart + value * rate,
              })
            }
          />
          <SelectInput
            label={translate('videoEditor.sidebar.cameraTransition')}
            value={position.transition.kind}
            disabled={props.disabled}
            options={[
              { value: 'instant', label: translate('videoEditor.sidebar.cameraTransitionInstant') },
              { value: 'smooth', label: translate('videoEditor.sidebar.cameraTransitionSmooth') },
              { value: 'shrink', label: translate('videoEditor.sidebar.cameraTransitionShrink') },
            ]}
            onChange={(kind) =>
              edit({
                kind: 'update',
                id: position.id,
                transition: { ...position.transition, kind },
              })
            }
          />
          {position.transition.kind !== 'instant' ? (
            <NumberInput
              label={translate('videoEditor.sidebar.cameraTransitionDuration')}
              value={position.transition.duration / rate}
              min={1 / props.project.fps}
              max={props.clip.duration}
              step={0.1}
              unit="s"
              disabled={props.disabled}
              onChange={(value) =>
                edit({
                  kind: 'update',
                  id: position.id,
                  transition: { ...position.transition, duration: value * rate },
                })
              }
            />
          ) : null}
        </div>
      ) : null}
    </>
  );
}

function CameraPositionNavigation(props: CameraLayoutControlsProps) {
  const position = activeCameraPosition(props.clip, props.currentTime ?? props.clip.startTime);
  const initial = activeCameraPosition(props.clip, props.clip.startTime);
  const rate = props.clip.playbackRate ?? 1;
  const edit = (value: CameraPositionEdit) => props.onEditCameraPosition?.(props.clip.id, value);
  return (
    <div className="flex min-w-0 items-center gap-1" data-ui="video-editor.camera-positions">
      <div className="min-w-0 flex-1">
        <CompactSelect
          appearance="plain"
          className="px-0!"
          aria-label={translate('videoEditor.sidebar.cameraPosition')}
          value={position?.id ?? ''}
          options={[
            {
              value: initial?.id ?? '',
              label: translate('videoEditor.sidebar.cameraPositionInitial'),
            },
            ...(props.clip.cameraPositions ?? [])
              .filter(
                (item) =>
                  item.sourceTime > props.clip.sourceStart &&
                  item.sourceTime < props.clip.sourceStart + props.clip.sourceDuration
              )
              .map((item) => ({
                value: item.id,
                label: formatPreciseTime(
                  Math.max(0, (item.sourceTime - props.clip.sourceStart) / rate)
                ),
              })),
          ]}
          disabled={props.disabled || !props.onEditCameraPosition}
          onChange={(id) => edit({ kind: 'select', id: id || null })}
        />
      </div>
      <ProductActionButton
        compact
        className="h-7! min-h-7! w-7! rounded-md! shrink-0 p-0!"
        tone="secondary"
        aria-label={translate('videoEditor.sidebar.cameraAddPosition')}
        title={translate('videoEditor.sidebar.cameraAddPosition')}
        disabled={props.disabled || !props.onEditCameraPosition || !props.canAddCameraPosition}
        data-ui="video-editor.camera-add-position"
        onClick={() => edit({ kind: 'add' })}
      >
        <Plus size={14} />
      </ProductActionButton>
      <ProductActionButton
        compact
        className="h-7! min-h-7! w-7! rounded-md! shrink-0 p-0!"
        tone="secondary"
        aria-label={translate('videoEditor.sidebar.cameraRemovePosition')}
        disabled={props.disabled || !position || !props.onEditCameraPosition}
        onClick={() => position && edit({ kind: 'remove', id: position.id })}
      >
        <Trash2 size={14} />
      </ProductActionButton>
    </div>
  );
}
