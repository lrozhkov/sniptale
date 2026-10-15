import type { ReviewTextFragment } from '../../features/video/review/text-types';
import { ReviewDetails } from './controls';
import { ProductGlassSwitch } from '@sniptale/ui/product-glass-controls';
import { ColorField, SegmentedRow } from '../../ui/compact-inspector-controls';
import {
  createReviewCaptionSettings,
  type ReviewCaptionSettings,
  type ReviewCaptionStyle,
} from '../../features/video/review/text-document';
import { translate } from '../../platform/i18n';
import { reviewSelectFieldClassName } from './controls';
import { ReviewNumberRow } from './number-row';

/** Scene defaults and fragment overrides share the existing compact inspector controls. */
function ReviewCaptionStyleControls(props: {
  style: ReviewCaptionStyle;
  disabled?: boolean;
  onChange(style: ReviewCaptionStyle): void;
}) {
  const patch = (value: Partial<ReviewCaptionStyle>) =>
    props.onChange({ ...props.style, ...value });
  return (
    <fieldset
      disabled={props.disabled}
      className="min-w-0 space-y-1"
      data-ui="gallery.videoReview.captionStyle"
    >
      <SegmentedRow
        ariaLabel={translate('gallery.videoReview.captionPosition')}
        columns={2}
        label={translate('gallery.videoReview.captionPosition')}
        value={props.style.position}
        options={[
          { value: 'bottom' as const, label: translate('gallery.videoReview.captionBottom') },
          { value: 'top' as const, label: translate('gallery.videoReview.captionTop') },
        ]}
        onChange={(position) => patch({ position })}
      />
      <ReviewNumberRow
        label={translate('gallery.videoReview.captionSize')}
        unit="%"
        value={props.style.fontSize * 100}
        min={1.5}
        max={15}
        step={0.1}
        precision={1}
        disabled={props.disabled ?? false}
        onChange={(value) => patch({ fontSize: value / 100 })}
      />
      <ColorField
        className={reviewSelectFieldClassName}
        label={translate('gallery.videoReview.captionColor')}
        title={translate('gallery.videoReview.captionColor')}
        value={props.style.color}
        disabled={props.disabled ?? false}
        onChange={(color) => patch({ color })}
      />
      <ColorField
        className={reviewSelectFieldClassName}
        label={translate('gallery.videoReview.captionBackground')}
        title={translate('gallery.videoReview.captionBackground')}
        value={props.style.background}
        disabled={props.disabled ?? false}
        onChange={(background) => patch({ background })}
      />
    </fieldset>
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
      <div className="flex min-h-8 items-center justify-between gap-2 text-xs">
        <span>{translate('gallery.videoReview.captionsEnabled')}</span>
        <ProductGlassSwitch
          on={settings.enabled}
          disabled={props.disabled}
          role="switch"
          aria-checked={settings.enabled}
          aria-label={translate('gallery.videoReview.captionsEnabled')}
          onClick={() => props.onChange({ ...settings, enabled: !settings.enabled })}
        />
      </div>
      {settings.enabled && (
        <ReviewCaptionStyleControls
          style={settings.style}
          disabled={props.disabled ?? false}
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
      <div
        className={[
          'flex min-h-8 items-center justify-between gap-2 text-xs',
          'text-[var(--sniptale-color-text-secondary)]',
        ].join(' ')}
      >
        <span>{translate('gallery.videoReview.textFragmentShown')}</span>
        <ProductGlassSwitch
          role="switch"
          aria-label={translate('gallery.videoReview.textFragmentShown')}
          aria-checked={fragment.showInVideo}
          on={fragment.showInVideo}
          disabled={props.disabled}
          onClick={() => props.onChange({ showInVideo: !fragment.showInVideo })}
        />
      </div>
      {fragment.showInVideo && (
        <ReviewDetails
          preferenceId="group:text-style"
          label={translate('gallery.videoReview.captionStyle')}
        >
          <div className="flex min-h-8 items-center justify-between gap-2 text-xs">
            <span>{translate('gallery.videoReview.captionInherit')}</span>
            <ProductGlassSwitch
              on={!fragment.style}
              disabled={props.disabled}
              role="switch"
              aria-checked={!fragment.style}
              aria-label={translate('gallery.videoReview.captionInherit')}
              onClick={() =>
                props.onChange({
                  style: fragment.style ? null : { ...props.settings.style },
                })
              }
            />
          </div>
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
