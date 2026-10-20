import type { ReviewTextFragment } from '../../features/video/review/text-types';
import { ReviewDetails } from './controls';
import { ToggleField } from '../../ui/compact-inspector-controls';
import {
  createReviewCaptionSettings,
  type ReviewCaptionSettings,
  type ReviewCaptionStyle,
} from '../../features/video/review/text-document';
import { translate } from '../../platform/i18n';
import { CaptionStyleFields } from '../../ui/video-text/caption-style';
import { DraftNumericRow as ReviewNumberRow } from '../../ui/compact-inspector-controls/numeric-preview';

/** Scene defaults and fragment overrides share the existing compact inspector controls. */
function ReviewCaptionStyleControls(props: {
  style: ReviewCaptionStyle;
  disabled?: boolean;
  onChange(style: ReviewCaptionStyle): void;
}) {
  return (
    <CaptionStyleFields
      {...props}
      dataUi="gallery.videoReview.captionStyle"
      sizeControl={
        <ReviewNumberRow
          label={translate('gallery.videoReview.captionSize')}
          unit="%"
          value={props.style.fontSize * 100}
          min={1.5}
          max={15}
          step={0.1}
          precision={1}
          disabled={props.disabled ?? false}
          onChange={(value) => props.onChange({ ...props.style, fontSize: value / 100 })}
        />
      }
    />
  );
}

/** The scene owns burn-in enablement independently from timeline visibility. */
export function ReviewCaptionSceneControls(props: {
  settings: ReviewCaptionSettings | undefined;
  disabled?: boolean;
  onChange(settings: ReviewCaptionSettings): void;
}) {
  const settings = props.settings ?? createReviewCaptionSettings();
  return (
    <div className="min-w-0 space-y-2" data-ui="gallery.videoReview.captionScene">
      <ToggleField
        value={settings.enabled}
        disabled={props.disabled}
        label={translate('gallery.videoReview.captionsEnabled')}
        onChange={(enabled) => props.onChange({ ...settings, enabled })}
      />
      {settings.enabled && (
        <ReviewCaptionStyleControls
          style={settings.style}
          disabled={!!props.disabled}
          onChange={(style) => props.onChange({ ...settings, style })}
        />
      )}
    </div>
  );
}

/** Fragment visibility and inherited/local style form one compact authoring section. */
export function ReviewFragmentCaptionControls(props: {
  fragment: ReviewTextFragment;
  settings: ReviewCaptionSettings;
  disabled: boolean;
  onChange(patch: { showInVideo?: boolean; style?: ReviewCaptionStyle | null }): void;
}) {
  const { fragment } = props;
  return (
    <>
      <ToggleField
        label={translate('gallery.videoReview.textFragmentShown')}
        value={fragment.showInVideo}
        disabled={props.disabled}
        onChange={(showInVideo) => props.onChange({ showInVideo })}
      />
      {fragment.showInVideo && (
        <ReviewDetails
          preferenceId="group:text-style"
          label={translate('gallery.videoReview.captionStyle')}
        >
          <ToggleField
            value={!fragment.style}
            disabled={props.disabled}
            label={translate('gallery.videoReview.captionInherit')}
            onChange={() =>
              props.onChange({
                style: fragment.style ? null : { ...props.settings.style },
              })
            }
          />
          {fragment.style && (
            <ReviewCaptionStyleControls
              style={fragment.style}
              disabled={props.disabled}
              onChange={(style) => props.onChange({ style })}
            />
          )}
        </ReviewDetails>
      )}
    </>
  );
}
