import { useEffect, useState, type ComponentType } from 'react';
import { RotateCcw } from 'lucide-react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import {
  parseBookendImagePresentation,
  parseBookendVideoPresentation,
  type BookendMediaFraming,
  type BookendImagePresentation,
  type BookendVideoPresentation,
} from '../features/video/project/scene/bookend-media';
import { translate, useAppLocale } from '../platform/i18n';
import { ColorField, SegmentedRow, ToggleField } from './compact-inspector-controls';
import { PreviewNumericRow } from './compact-inspector-controls/numeric-preview';
import type { InspectorDisclosureProps } from './compact-inspector-controls/shared';

type MediaPatch = Partial<BookendImagePresentation & BookendVideoPresentation>;
type Message =
  keyof typeof import('../platform/i18n/messages/gallery/video-review-presentation').galleryVideoReviewPresentationMessages;
const label = (key: Message) => translate(`gallery.videoReview.${key}`);

type Props = {
  Details: ComponentType<InspectorDisclosureProps>;
  preferenceId: string;
  colorClassName?: string;
} & (
  | {
      kind: 'image';
      value: BookendImagePresentation;
      onChange(value: BookendImagePresentation): void;
      onPreview(value: BookendImagePresentation | null): void;
    }
  | {
      kind: 'video';
      value: BookendVideoPresentation;
      sourceDuration: number;
      hasAudio: boolean;
      onChange(value: BookendVideoPresentation): void;
      onPreview(value: BookendVideoPresentation | null): void;
    }
);

/** Shared media parameters; each editor retains source acquisition, preview and history. */
export function PresentationMediaFields(props: Props) {
  useAppLocale();
  const { Details, value } = props;
  const [invalid, setInvalid] = useState(false);
  useEffect(() => setInvalid(false), [value]);
  const propose = (patch: MediaPatch | null, preview: boolean) => {
    if (patch === null) {
      setInvalid(false);
      props.onPreview(null);
      return;
    }
    if (props.kind === 'image') {
      const next = parseBookendImagePresentation({ ...props.value, ...patch });
      setInvalid(!next);
      if (preview) props.onPreview(next);
      else if (next) props.onChange(next);
    } else {
      const next = parseBookendVideoPresentation(
        { ...props.value, ...patch },
        props.sourceDuration
      );
      setInvalid(!next);
      if (preview) props.onPreview(next);
      else if (next) props.onChange(next);
    }
  };
  const number = (
    name: Message,
    current: number,
    min: number,
    max: number,
    step: number,
    patch: (next: number) => MediaPatch,
    unit: 's' | '%',
    scrub?: { min: number; max: number }
  ) => (
    <PreviewNumericRow
      label={label(name)}
      value={current}
      min={min}
      max={max}
      step={step}
      unit={unit}
      precision={step === 0.001 ? Math.max(3, decimalPrecision(current)) : 2}
      {...(scrub ? { scrubMin: scrub.min, scrubMax: scrub.max } : {})}
      onChange={(next) => propose(patch(next), false)}
      onPreview={(next) => propose(next === null ? null : patch(next), true)}
    />
  );
  return (
    <div className="min-w-0 space-y-1" data-ui="shared.ui.presentation-media-fields">
      {props.kind === 'image' &&
        number(
          'presentationDuration',
          props.value.duration,
          0.1,
          60,
          0.1,
          (duration) => ({ duration }),
          's',
          { min: 1, max: 10 }
        )}
      {props.kind === 'video' && (
        <>
          <Details label={label('presentationTrim')} preferenceId={`${props.preferenceId}.trim`}>
            {number(
              'presentationTrimStart',
              props.value.trim.start,
              0,
              props.value.trim.end,
              0.001,
              (start) => ({ trim: { ...props.value.trim, start } }),
              's'
            )}
            {number(
              'presentationTrimEnd',
              props.value.trim.end,
              props.value.trim.start,
              props.sourceDuration,
              0.001,
              (end) => ({ trim: { ...props.value.trim, end } }),
              's'
            )}
          </Details>
          {props.hasAudio && (
            <ToggleField
              label={label('presentationSound')}
              value={!props.value.audio.muted}
              onChange={(enabled) =>
                propose({ audio: { ...props.value.audio, muted: !enabled } }, false)
              }
            />
          )}
          {props.hasAudio &&
            !props.value.audio.muted &&
            number(
              'presentationVolume',
              props.value.audio.gain * 100,
              0,
              200,
              1,
              (gain) => ({ audio: { ...props.value.audio, gain: gain / 100 } }),
              '%'
            )}
        </>
      )}
      <MediaFramingFields
        Details={Details}
        value={value}
        preferenceId={props.preferenceId}
        {...(props.colorClassName ? { colorClassName: props.colorClassName } : {})}
        propose={propose}
      />
      {invalid && (
        <p role="alert" className="text-xs">
          {label('presentationTrimInvalid')}
        </p>
      )}
    </div>
  );
}

function decimalPrecision(value: number) {
  const [mantissa = '', exponent = '0'] = value.toString().split('e');
  return Math.min(100, Math.max(0, (mantissa.split('.')[1]?.length ?? 0) - Number(exponent)));
}

/** Framing has no source-clock or authoring-state authority. */
function MediaFramingFields({
  Details,
  value,
  preferenceId,
  colorClassName,
  propose,
}: {
  Details: ComponentType<InspectorDisclosureProps>;
  value: BookendMediaFraming;
  preferenceId: string;
  colorClassName?: string;
  propose(patch: MediaPatch | null, preview: boolean): void;
}) {
  return (
    <Details label={label('presentationFraming')} preferenceId={`${preferenceId}.framing`}>
      <SegmentedRow
        ariaLabel={label('presentationFit')}
        value={value.fit}
        columns={2}
        options={[
          { value: 'contain', label: label('presentationContain') },
          { value: 'cover', label: label('presentationCover') },
        ]}
        onChange={(fit: 'contain' | 'cover') => propose({ fit }, false)}
      />
      {value.fit === 'contain' && (
        <ColorField
          {...(colorClassName ? { className: colorClassName } : {})}
          label={label('presentationFill')}
          title={label('presentationFill')}
          value={value.fillColor}
          allowAlpha={false}
          allowTransparent={false}
          onChange={(fillColor) => propose({ fillColor }, false)}
          onPreviewChange={(fillColor) => propose(fillColor ? { fillColor } : null, true)}
          onPreviewReset={() => propose(null, true)}
        />
      )}
      {value.fit === 'cover' && (
        <>
          {(['panX', 'panY'] as const).map((axis) => (
            <PreviewNumericRow
              key={axis}
              label={label(axis === 'panX' ? 'presentationPanX' : 'presentationPanY')}
              value={value.crop[axis] * 100}
              min={-100}
              max={100}
              step={0.1}
              unit="%"
              precision={2}
              onChange={(pan) => propose({ crop: { ...value.crop, [axis]: pan / 100 } }, false)}
              onPreview={(pan) =>
                propose(pan === null ? null : { crop: { ...value.crop, [axis]: pan / 100 } }, true)
              }
            />
          ))}
          <ContentToolbarButton
            type="button"
            size="compact"
            tone="outline"
            className="mx-2 flex max-w-full items-center gap-1.5"
            aria-label={label('presentationCenter')}
            onClick={() => propose({ crop: { panX: 0, panY: 0 } }, false)}
          >
            <RotateCcw size={14} aria-hidden="true" />
            <span>{label('presentationCenter')}</span>
          </ContentToolbarButton>
        </>
      )}
    </Details>
  );
}
