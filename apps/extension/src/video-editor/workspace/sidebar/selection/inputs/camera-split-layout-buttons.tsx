import { VideoProjectCameraLayout } from '../../../../../features/video/project/camera/placement';
import { translate } from '../../../../../platform/i18n';
import { InspectorActionButton } from '../shared/actions';

const SPLIT_OPTIONS = [
  {
    layout: VideoProjectCameraLayout.SPLIT_LEFT,
    labelKey: 'gallery.videoReview.webcamSplit_left',
    axis: 'horizontal',
    reverse: false,
  },
  {
    layout: VideoProjectCameraLayout.SPLIT_RIGHT,
    labelKey: 'gallery.videoReview.webcamSplit_right',
    axis: 'horizontal',
    reverse: true,
  },
  {
    layout: VideoProjectCameraLayout.SPLIT_TOP,
    labelKey: 'gallery.videoReview.webcamSplit_top',
    axis: 'vertical',
    reverse: false,
  },
  {
    layout: VideoProjectCameraLayout.SPLIT_BOTTOM,
    labelKey: 'gallery.videoReview.webcamSplit_bottom',
    axis: 'vertical',
    reverse: true,
  },
] as const;

export function CameraSplitLayoutButtons({
  layout,
  disabled,
  onChoose,
}: {
  layout: VideoProjectCameraLayout;
  disabled: boolean;
  onChoose(layout: VideoProjectCameraLayout): void;
}) {
  return (
    <>
      {SPLIT_OPTIONS.map((option) => {
        const direction =
          option.axis === 'horizontal'
            ? option.reverse
              ? 'flex-row-reverse'
              : 'flex-row'
            : option.reverse
              ? 'flex-col-reverse'
              : 'flex-col';
        return (
          <InspectorActionButton
            key={option.layout}
            iconOnly
            compact
            tone="toggle"
            active={layout === option.layout}
            aria-pressed={layout === option.layout}
            aria-label={translate(option.labelKey)}
            title={translate(option.labelKey)}
            disabled={disabled}
            data-ui={`video-editor.camera-layout-${option.layout.toLowerCase()}`}
            onClick={() => onChoose(option.layout)}
          >
            <span
              aria-hidden="true"
              className={`flex h-4 w-6 gap-px rounded border border-current p-px ${direction}`}
            >
              <span className="flex-1 rounded-sm bg-current" />
              <span className="flex-1 rounded-sm border border-current" />
            </span>
          </InspectorActionButton>
        );
      })}
      {layout.startsWith('SPLIT_') ? (
        <InspectorActionButton
          compact
          iconOnly
          tone="toggle"
          aria-label={translate('videoEditor.sidebar.cameraLayoutOverlay')}
          title={translate('videoEditor.sidebar.cameraLayoutOverlay')}
          disabled={disabled}
          data-ui="video-editor.camera-layout-overlay"
          onClick={() => onChoose(VideoProjectCameraLayout.OVERLAY)}
        >
          <span aria-hidden="true" className="relative block h-4 w-6 rounded border border-current">
            <span className="absolute bottom-0.5 right-0.5 h-1 w-2 rounded-sm bg-current" />
          </span>
        </InspectorActionButton>
      ) : null}
    </>
  );
}
