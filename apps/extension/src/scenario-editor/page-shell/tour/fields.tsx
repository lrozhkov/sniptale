import { GUIDE_LIMITS } from '@sniptale/runtime-contracts/scenario/types/guide';
import { TOUR_LIMITS } from '@sniptale/runtime-contracts/scenario/types/tour';
import { useEffect, useState } from 'react';
import type {
  TourAction,
  TourDocument,
  TourPoint,
  TourTextAppearance,
} from '@sniptale/runtime-contracts/scenario/types/tour';
import { GuideVoiceField } from '../voice-field';
import { CompactSelect } from '../../../ui/compact-inspector-controls/select';
import { NumericRow } from '../../../ui/compact-inspector-controls/numeric';
import { ProductInput } from '@sniptale/ui/product-form-controls';
import type { Translate } from '../../../platform/i18n';

export function TourTextField({
  label,
  value,
  onChange,
  disabled,
  singleLine = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  singleLine?: boolean;
}) {
  return (
    <div className="tour-text-field">
      <span>{label}</span>
      <GuideVoiceField
        formControl
        clearable
        singleLine={singleLine}
        aria-label={label}
        value={value}
        disabled={disabled}
        rows={3}
        maxLength={singleLine ? GUIDE_LIMITS.maxLabelLength : TOUR_LIMITS.maxTextLength}
        onValueChange={onChange}
      />
    </div>
  );
}

export function TourPointFields({
  point,
  maximum = { x: 1, y: 1 },
  disabled,
  onChange,
}: {
  point: TourPoint;
  maximum?: TourPoint;
  disabled: boolean;
  onChange: (point: TourPoint) => void;
}) {
  return (
    <div className="tour-coordinate-fields">
      {(['x', 'y'] as const).map((axis) => (
        <NumericRow
          key={axis}
          label={axis.toUpperCase()}
          value={point[axis] * 100}
          min={0}
          max={maximum[axis] * 100}
          unit="%"
          precision={1}
          disabled={disabled}
          onPreviewValue={() => {}}
          onCommitValue={(value) => onChange({ ...point, [axis]: value / 100 })}
        />
      ))}
    </div>
  );
}

export function TourTextPresentation({
  value,
  defaults,
  disabled,
  onChange,
  t,
}: {
  value: TourTextAppearance | null;
  defaults: TourTextAppearance;
  disabled: boolean;
  onChange: (value: TourTextAppearance | null) => void;
  t: Translate;
}) {
  return (
    <div className="tour-text-field">
      <span>{t('scenario.editor.tourTextPresentation')}</span>
      <CompactSelect
        aria-label={t('scenario.editor.tourTextPresentation')}
        disabled={disabled}
        value={value?.presentation ?? 'inherit'}
        options={[
          { value: 'inherit', label: t('scenario.editor.tourInherited') },
          { value: 'callout', label: t('scenario.editor.tourCallout') },
          { value: 'caption-top', label: t('scenario.editor.tourCaptionTop') },
          { value: 'caption-bottom', label: t('scenario.editor.tourCaptionBottom') },
        ]}
        onChange={(presentation) =>
          onChange(presentation === 'inherit' ? null : { ...(value ?? defaults), presentation })
        }
      />
    </div>
  );
}

/** URL actions keep an editable draft until a canonical command accepts a complete destination. */
export function TourActionField({
  value,
  tour,
  disabled,
  onChange,
  t,
}: {
  value: TourAction;
  tour: TourDocument;
  disabled: boolean;
  onChange: (action: TourAction) => boolean;
  t: Translate;
}) {
  const [kind, setKind] = useState<TourAction['kind']>(value.kind);
  const storedUrl = value.kind === 'url' ? value.url : '';
  const [url, setUrl] = useState(storedUrl);
  const [invalid, setInvalid] = useState(false);
  useEffect(() => {
    setKind(value.kind);
    setInvalid(false);
  }, [value.kind]);
  useEffect(() => setUrl(storedUrl), [storedUrl]);
  const options: { value: TourAction['kind']; label: string }[] = [
    { value: 'none', label: t('scenario.editor.tourActionNone') },
    { value: 'next', label: t('scenario.editor.tourActionNext') },
    { value: 'previous', label: t('scenario.editor.tourActionPrevious') },
    { value: 'slide', label: t('scenario.editor.tourActionSlide') },
    { value: 'url', label: t('scenario.editor.tourActionUrl') },
    { value: 'restart', label: t('scenario.editor.tourRestart') },
    ...(tour.endScreen.enabled
      ? [{ value: 'end' as const, label: t('scenario.editor.tourEnd') }]
      : []),
  ];
  const commitUrl = () => {
    if (kind === 'url') setInvalid(!onChange({ kind: 'url', url }));
  };
  return (
    <div className="tour-text-field">
      <span>{t('scenario.editor.tourAction')}</span>
      <CompactSelect
        aria-label={t('scenario.editor.tourAction')}
        value={kind}
        options={options}
        disabled={disabled}
        onChange={(next) => {
          setKind(next);
          setInvalid(false);
          if (next === 'url') return;
          if (next === 'slide') {
            const first = tour.slides[0];
            if (first) onChange({ kind: 'slide', slideId: first.id });
          } else onChange({ kind: next });
        }}
      />
      {kind === 'slide' && (
        <CompactSelect
          aria-label={t('scenario.editor.tourActionSlide')}
          disabled={disabled}
          value={value.kind === 'slide' ? value.slideId : (tour.slides[0]?.id ?? '')}
          options={tour.slides.map((slide, index) => ({
            value: slide.id,
            label: `${index + 1}. ${slide.title || t('scenario.editor.tourUntitled')}`,
          }))}
          onChange={(slideId) => onChange({ kind: 'slide', slideId })}
        />
      )}
      {kind === 'url' && (
        <ProductInput
          aria-label={t('scenario.editor.tourActionUrl')}
          value={url}
          disabled={disabled}
          aria-invalid={invalid}
          placeholder="https://"
          maxLength={4000}
          onChange={(event) => {
            setUrl(event.target.value);
            setInvalid(false);
          }}
          onBlur={commitUrl}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              commitUrl();
            }
          }}
        />
      )}
      {invalid && <span role="alert">{t('scenario.editor.tourInvalidUrl')}</span>}
    </div>
  );
}
