import { ToggleField } from '../../../ui/compact-inspector-controls/controls';
import { InspectorParameterRow } from '../../../ui/compact-inspector-controls/layout';
import { SelectField } from '../../../ui/compact-inspector-controls/controls';
import { TourHintStyle } from './hint-style';
import { GUIDE_LIMITS } from '@sniptale/runtime-contracts/scenario/types/guide';
import {
  TOUR_LIMITS,
  TOUR_HINT_SURFACE,
  resolveTourTextAppearance,
} from '@sniptale/runtime-contracts/scenario/types/tour';
import { useEffect, useState } from 'react';
import type {
  TourAction,
  TourDocument,
  TourPoint,
  TourTextAppearance,
} from '@sniptale/runtime-contracts/scenario/types/tour';
import { GuideVoiceField } from '../voice-field';
import { TourInspectorNumericRow } from './numeric-row';
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
    <InspectorParameterRow label={label} stacked={!singleLine} valueMinimum={200}>
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
    </InspectorParameterRow>
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
        <TourInspectorNumericRow
          key={axis}
          label={axis.toUpperCase()}
          value={point[axis] * 100}
          min={0}
          max={maximum[axis] * 100}
          unit="%"
          precision={1}
          disabled={disabled}
          onChange={(value) => onChange({ ...point, [axis]: value / 100 })}
        />
      ))}
    </div>
  );
}

export function TourTextPresentation({
  inherit = true,
  kind,
  value,
  defaults,
  disabled,
  onChange,
  t,
}: {
  inherit?: boolean;
  kind?: 'hotspot' | 'annotation';
  value: TourTextAppearance | null;
  defaults: TourTextAppearance;
  disabled: boolean;
  onChange: (value: TourTextAppearance | null) => void;
  t: Translate;
}) {
  const effective = kind ? resolveTourTextAppearance(kind, value, defaults) : (value ?? defaults);
  const presentationLabel = t(
    kind === 'annotation'
      ? 'scenario.editor.tourSlidePlacement'
      : kind === 'hotspot'
        ? 'scenario.editor.tourHotspotHint'
        : 'scenario.editor.tourTextPresentation'
  );
  return (
    <div className="tour-text-field">
      {inherit && (
        <ToggleField
          disabled={disabled}
          label={t('scenario.editor.tourUseCentralStyle')}
          value={value === null}
          onChange={() =>
            onChange(
              value ? null : { ...effective, surface: effective.surface ?? TOUR_HINT_SURFACE }
            )
          }
        />
      )}
      <SelectField
        label={presentationLabel}
        disabled={disabled}
        value={value ? effective.presentation : 'inherit'}
        options={[
          ...(inherit
            ? [{ value: 'inherit' as const, label: t('scenario.editor.tourInherited') }]
            : []),
          ...(kind !== 'annotation'
            ? [
                {
                  value: 'callout' as const,
                  label: t('scenario.editor.tourCallout'),
                },
              ]
            : []),
          ...(kind !== 'hotspot'
            ? [
                { value: 'caption-top' as const, label: t('scenario.editor.tourCaptionTop') },
                { value: 'caption-bottom' as const, label: t('scenario.editor.tourCaptionBottom') },
              ]
            : []),
        ]}
        onChange={(presentation) =>
          onChange(
            presentation === 'inherit'
              ? null
              : { ...effective, surface: effective.surface ?? TOUR_HINT_SURFACE, presentation }
          )
        }
      />
      {value && (
        <>
          <SelectField
            label={t('scenario.editor.tourTextAlignment')}
            value={value.alignment}
            disabled={disabled}
            options={[
              { value: 'start', label: t('scenario.editor.tourAlignStart') },
              { value: 'center', label: t('scenario.editor.tourAlignCenter') },
              { value: 'end', label: t('scenario.editor.tourAlignEnd') },
            ]}
            onChange={(alignment) =>
              onChange({ ...effective, surface: effective.surface ?? TOUR_HINT_SURFACE, alignment })
            }
          />
          {effective.presentation === 'callout' && (
            <>
              {kind === 'hotspot' && (
                <div title={t('scenario.editor.tourCalloutGapHint')}>
                  <TourInspectorNumericRow
                    label={t('scenario.editor.tourCalloutGap')}
                    value={effective.calloutGap ?? 30}
                    min={0}
                    max={120}
                    unit="px"
                    disabled={disabled}
                    onChange={(calloutGap) => onChange({ ...effective, calloutGap })}
                  />
                </div>
              )}
              <SelectField
                label={t('scenario.editor.tourTextPlacement')}
                value={value.placement}
                disabled={disabled}
                options={[
                  { value: 'auto', label: t('scenario.editor.tourPlacementAuto') },
                  { value: 'top', label: t('scenario.editor.tourPlacementTop') },
                  { value: 'bottom', label: t('scenario.editor.tourPlacementBottom') },
                  { value: 'left', label: t('scenario.editor.tourPlacementLeft') },
                  { value: 'right', label: t('scenario.editor.tourPlacementRight') },
                ]}
                onChange={(placement) =>
                  onChange({
                    ...effective,
                    surface: effective.surface ?? TOUR_HINT_SURFACE,
                    placement,
                  })
                }
              />
            </>
          )}
        </>
      )}
      <TourHintStyle value={effective} disabled={disabled} onChange={onChange} t={t} />
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
    <div className="tour-text-field tour-action-field">
      <SelectField
        label={t('scenario.editor.tourAction')}
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
        <SelectField
          label={t('scenario.editor.tourActionSlide')}
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
