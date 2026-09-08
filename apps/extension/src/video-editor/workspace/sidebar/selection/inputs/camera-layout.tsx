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
    position: 'left-1 top-1',
  },
  {
    placement: VideoProjectCameraPlacement.TOP_RIGHT,
    labelKey: 'videoEditor.sidebar.cameraPlacementTopRight',
    position: 'right-1 top-1',
  },
  {
    placement: VideoProjectCameraPlacement.BOTTOM_LEFT,
    labelKey: 'videoEditor.sidebar.cameraPlacementBottomLeft',
    position: 'left-1 bottom-1',
  },
  {
    placement: VideoProjectCameraPlacement.BOTTOM_RIGHT,
    labelKey: 'videoEditor.sidebar.cameraPlacementBottomRight',
    position: 'right-1 bottom-1',
  },
] as const;

interface CameraLayoutControlsProps {
  clip: VideoProjectVideoClip;
  project: VideoProject;
  disabled: boolean;
  canSplitCameraInterval?: boolean;
  onApplyCameraLayout?: (
    clipId: string,
    layout: VideoProjectCameraLayout,
    placement?: VideoProjectCameraPlacement
  ) => void;
  onSplitCameraInterval?: (clipId: string) => void;
}

export function CameraLayoutControls(props: CameraLayoutControlsProps) {
  const layout = resolveVideoProjectCameraLayout(props.project, props.clip);
  const asset = props.project.assets.find((item) => item.id === props.clip.assetId);
  const disabled = props.disabled || !props.onApplyCameraLayout;
  return (
    <div className="space-y-3" data-ui="video-editor.camera-placement-controls">
      <div
        className="grid grid-cols-3 gap-1"
        role="group"
        aria-label={translate('videoEditor.sidebar.cameraLayoutLabel')}
      >
        {LAYOUT_OPTIONS.map((option) => (
          <ProductActionButton
            key={option.layout}
            compact
            tone="toggle"
            active={layout === option.layout}
            aria-pressed={layout === option.layout}
            disabled={disabled}
            data-ui={`video-editor.camera-layout-${option.layout.toLowerCase()}`}
            onClick={() => props.onApplyCameraLayout?.(props.clip.id, option.layout)}
          >
            {translate(option.labelKey)}
          </ProductActionButton>
        ))}
      </div>
      <div
        className="grid grid-cols-4 gap-1"
        role="group"
        aria-label={translate('videoEditor.sidebar.cameraPlacementLabel')}
      >
        {PLACEMENT_OPTIONS.map((option) => {
          const expected = resolveVideoProjectCameraPlacement({
            placement: option.placement,
            projectWidth: props.project.width,
            projectHeight: props.project.height,
            sourceWidth: asset?.metadata.width ?? props.clip.transform.width,
            sourceHeight: asset?.metadata.height ?? props.clip.transform.height,
          });
          const active =
            layout === VideoProjectCameraLayout.OVERLAY &&
            props.clip.transform.rotation === 0 &&
            Math.abs(expected.x - props.clip.transform.x) < 0.01 &&
            Math.abs(expected.y - props.clip.transform.y) < 0.01 &&
            Math.abs(expected.width - props.clip.transform.width) < 0.01 &&
            Math.abs(expected.height - props.clip.transform.height) < 0.01;
          return (
            <ProductActionButton
              key={option.placement}
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
                className="relative block h-7 w-10 rounded border border-current opacity-80"
              >
                <span className={`absolute h-2 w-3 rounded-sm bg-current ${option.position}`} />
              </span>
            </ProductActionButton>
          );
        })}
      </div>
      <ProductActionButton
        compact
        tone="secondary"
        className="self-end"
        disabled={props.disabled || !props.onSplitCameraInterval || !props.canSplitCameraInterval}
        data-ui="video-editor.camera-split-interval"
        onClick={() => props.onSplitCameraInterval?.(props.clip.id)}
      >
        {translate('videoEditor.sidebar.cameraSplitInterval')}
      </ProductActionButton>
    </div>
  );
}
