import type { VideoProjectTextDocument } from '../../../../../features/video/project/text/types';
import { applyVideoProjectTextEdit } from '../../../../../features/video/project/text/authoring';
import {
  createReviewCaptionSettings,
  type editReviewTextFragment,
} from '../../../../../features/video/review/text-document';
import type {
  ReviewCaptionStyle,
  ReviewTextFragment,
} from '../../../../../features/video/review/text-types';
import { translate } from '../../../../../platform/i18n';
import { CaptionStyleFields } from '../../../../../ui/video-text/caption-style';
import { ToggleField } from '../../../../../ui/compact-inspector-controls';
import { InspectorDetails } from '../shared/details';
import { NumberInput } from '../inputs/number';
import type { ProjectTextEditor } from './text-editing';

function CaptionAppearance(props: {
  style: ReviewCaptionStyle;
  onChange(style: ReviewCaptionStyle): void;
}) {
  return (
    <CaptionStyleFields
      {...props}
      dataUi="video-editor.text.caption-style"
      sizeControl={
        <NumberInput
          label={translate('gallery.videoReview.captionSize')}
          value={props.style.fontSize * 100}
          min={1.5}
          max={15}
          step={0.1}
          unit="%"
          onChange={(value) => props.onChange({ ...props.style, fontSize: value / 100 })}
        />
      }
    />
  );
}

export function DocumentCaptions({
  entry,
  editor,
}: {
  entry: VideoProjectTextDocument;
  editor: ProjectTextEditor;
}) {
  const settings = entry.captions ?? createReviewCaptionSettings();
  const change = (captions: typeof settings) =>
    editor.accept((current) => applyVideoProjectTextEdit(current, entry, { captions }));
  return (
    <div className="min-w-0 space-y-2">
      <ToggleField
        label={translate('gallery.videoReview.captionsEnabled')}
        value={settings.enabled}
        onChange={(enabled) => change({ ...settings, enabled })}
      />
      {settings.enabled && (
        <InspectorDetails
          preferenceId="text:caption-style"
          label={translate('gallery.videoReview.captionStyle')}
        >
          <CaptionAppearance
            style={settings.style}
            onChange={(style) => change({ ...settings, style })}
          />
        </InspectorDetails>
      )}
    </div>
  );
}

export function FragmentCaptions({
  entry,
  fragment,
  change,
}: {
  entry: VideoProjectTextDocument;
  fragment: ReviewTextFragment;
  change(patch: Parameters<typeof editReviewTextFragment>[2]): boolean;
}) {
  const settings = entry.captions ?? createReviewCaptionSettings();
  return (
    <>
      <ToggleField
        label={translate('gallery.videoReview.textFragmentShown')}
        value={fragment.showInVideo}
        onChange={(showInVideo) => change({ showInVideo })}
      />
      {fragment.showInVideo && (
        <InspectorDetails
          preferenceId="text:fragment-style"
          label={translate('gallery.videoReview.captionStyle')}
        >
          <ToggleField
            label={translate('gallery.videoReview.captionInherit')}
            value={!fragment.style}
            onChange={() => change({ style: fragment.style ? null : { ...settings.style } })}
          />
          {fragment.style && (
            <CaptionAppearance style={fragment.style} onChange={(style) => change({ style })} />
          )}
        </InspectorDetails>
      )}
    </>
  );
}

/** Accepted command errors use one message policy in the list and phrase contexts. */
export function TextEditFeedback({
  error,
  id,
}: {
  error: ProjectTextEditor['error'];
  id?: string;
}) {
  if (!error) return null;
  return (
    <p id={id} role="alert" className="text-xs text-[var(--sniptale-color-danger)]">
      {translate(
        error === 'gap'
          ? 'gallery.videoReview.textFragmentGap'
          : error === 'alignment'
            ? 'gallery.videoReview.textFragmentSplitHint'
            : error === 'stale'
              ? 'videoEditor.sidebar.textEditStale'
              : 'gallery.videoReview.textFragmentInvalid'
      )}
    </p>
  );
}
