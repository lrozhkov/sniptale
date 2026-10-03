import { ProductToggle } from '@sniptale/ui/product-form-controls';
import { useTourInspectorSections } from './settings-sections';
import { useState, type ReactNode } from 'react';
import { createSolidPaint, getRepresentativeColor, type Paint } from '@sniptale/foundation/paint';
import {
  resolveTourMask,
  TOUR_MASK_DEFAULTS,
  type TourMaskDefaults,
  type TourDocument,
  type TourMask,
} from '@sniptale/runtime-contracts/scenario/types/tour';
import { ScanLine, Palette } from 'lucide-react';
import { CompactPaintSelector } from '../../../ui/paint-selector';
import { TourInspectorNumericRow } from './numeric-row';
import { CompactSelect } from '../../../ui/compact-inspector-controls/select';
import { GuideInspectorGroup } from '../inspector';
import type { Translate } from '../../../platform/i18n';

/** Each effect retains its parameters; geometry belongs to the selected canvas frame. */
export function TourMaskSettings({
  value: authored,
  defaults,
  presentation = 'all',
  narration,
  central = false,
  title,
  disabled,
  onChange,
  t,
}: {
  value: TourMask;
  defaults?: TourMaskDefaults | undefined;
  presentation?: 'all' | 'sections';
  narration?: ReactNode;
  central?: boolean;
  title?: string;
  disabled: boolean;
  onChange: (value: TourMask) => boolean;
  t: Translate;
}) {
  const value = resolveTourMask(authored, defaults);
  const renderSections = useTourInspectorSections(presentation, t, narration);
  const controls = maskEffectControls(value);
  const changeStyle = (next: TourMask) => onChange({ ...next, inheritStyle: false });
  const [preview, setPreview] = useState<{ id: string; kind: string; amount: number } | null>(null);
  const amount =
    preview?.id === value.id && preview.kind === value.kind
      ? preview.amount
      : controls.amount?.value;
  const appearance = (
    <GuideInspectorGroup
      id={central ? `default-${value.kind}` : 'mask-appearance'}
      icon={central ? ScanLine : Palette}
      title={title ?? t('scenario.editor.appearance')}
    >
      {!central && value.kind !== 'redact' && (
        <label className="guide-number-toggle">
          <ProductToggle
            size="sm"
            disabled={disabled}
            aria-label={t('scenario.editor.tourUseCentralStyle')}
            checked={authored.inheritStyle === true}
            onClick={() => onChange({ ...value, inheritStyle: !authored.inheritStyle })}
          />
          {t('scenario.editor.tourUseCentralStyle')}
        </label>
      )}
      {controls.paint && (
        <CompactPaintSelector
          triggerVariant="swatch"
          label={t('scenario.editor.color')}
          title={t('scenario.editor.color')}
          value={controls.paint.value}
          allowedModes={controls.paint.modes}
          disabled={disabled}
          palette={[
            '#111827',
            '#ffffff',
            '#f97316',
            '#facc15',
            '#2563eb',
            '#16a34a',
            '#ef4444',
            '#8b5cf6',
          ]}
          onChange={(paint) => changeStyle(controls.paint!.change(paint))}
        />
      )}
      {controls.amount && (
        <TourInspectorNumericRow
          label={t(controls.amount.label)}
          value={amount ?? controls.amount.value}
          unit={controls.amount.unit}
          min={controls.amount.min}
          max={controls.amount.max}
          disabled={disabled}
          onPreview={(amount) => setPreview({ id: value.id, kind: value.kind, amount })}
          onChange={(amount) => {
            setPreview(null);
            changeStyle(controls.amount!.change(amount));
          }}
        />
      )}
    </GuideInspectorGroup>
  );
  if (central) return appearance;
  return renderSections('mask', [
    {
      id: 'effect',
      icon: ScanLine,
      label: t('scenario.editor.tourEffectType'),
      categorized: true,
      content: (
        <GuideInspectorGroup id="mask" icon={ScanLine} title={t('scenario.editor.tourMask')}>
          <div className="tour-text-field">
            <span>{t('scenario.editor.tourMask')}</span>
            <CompactSelect
              aria-label={t('scenario.editor.tourMask')}
              disabled={disabled}
              value={value.kind}
              options={[
                { value: 'highlight', label: t('scenario.editor.tourHighlight') },
                { value: 'spotlight', label: t('scenario.editor.tourSpotlight') },
                { value: 'blur', label: t('scenario.editor.tourBlur') },
                ...(value.kind === 'redact'
                  ? [{ value: 'redact' as const, label: t('scenario.editor.tourRedact') }]
                  : []),
              ]}
              onChange={(kind) => onChange({ ...authored, kind })}
            />
          </div>
          <p className="text-xs leading-relaxed text-[color:var(--sniptale-color-text-secondary)]">
            {t('scenario.editor.tourAreaCanvasHint')}
          </p>
        </GuideInspectorGroup>
      ),
    },
    {
      id: 'appearance',
      icon: Palette,
      label: t('scenario.editor.appearance'),
      categorized: true,
      content: appearance,
    },
  ]);
}

/** Central effect categories share the exact controls used for local overrides. */
export function TourMaskDefaultSettings({
  tour,
  disabled,
  onChange,
  t,
}: {
  tour: TourDocument;
  disabled: boolean;
  onChange: (tour: TourDocument) => boolean;
  t: Translate;
}) {
  const defaults = tour.style.maskDefaults ?? TOUR_MASK_DEFAULTS;
  return (['highlight', 'spotlight', 'blur'] as const).map((kind) => (
    <TourMaskSettings
      key={kind}
      title={t(
        kind === 'highlight'
          ? 'scenario.editor.tourHighlight'
          : kind === 'spotlight'
            ? 'scenario.editor.tourSpotlight'
            : 'scenario.editor.tourBlur'
      )}
      central
      defaults={defaults}
      disabled={disabled}
      t={t}
      value={resolveTourMask(
        {
          id: 'defaults',
          kind,
          rect: { x: 0, y: 0, width: 1, height: 1 },
          color: '#f97316',
          opacity: 0.3,
          inheritStyle: true,
        },
        defaults
      )}
      onChange={(value) =>
        onChange({
          ...tour,
          style: {
            ...tour.style,
            maskDefaults: {
              highlight: { paint: value.paint ?? defaults.highlight.paint, opacity: value.opacity },
              spotlight: {
                color: value.spotlightColor ?? defaults.spotlight.color,
                opacity: value.spotlightOpacity ?? defaults.spotlight.opacity,
              },
              blur: { radius: value.blurRadius ?? defaults.blur.radius },
            },
          },
        })
      }
    />
  ));
}

function maskEffectControls(value: TourMask) {
  if (value.kind === 'blur')
    return {
      paint: null,
      amount: {
        label: 'scenario.editor.tourBlurRadius' as const,
        value: value.blurRadius ?? 12,
        unit: 'px' as const,
        min: 1,
        max: 80,
        change: (blurRadius: number) => ({ ...value, blurRadius }),
      },
    };
  const spotlight = value.kind === 'spotlight';
  return {
    paint: {
      value: spotlight
        ? createSolidPaint(value.spotlightColor ?? '#111827')
        : (value.paint ?? createSolidPaint(value.color)),
      modes:
        spotlight || value.kind === 'redact'
          ? (['solid'] as const)
          : (['solid', 'linear', 'radial'] as const),
      change: (paint: Paint) =>
        spotlight
          ? { ...value, spotlightColor: getRepresentativeColor(paint).slice(0, 7) }
          : { ...value, paint, color: getRepresentativeColor(paint).slice(0, 7) },
    },
    amount:
      value.kind === 'redact'
        ? null
        : {
            label: 'scenario.editor.tourOpacity' as const,
            value: (spotlight ? (value.spotlightOpacity ?? 0.6) : value.opacity) * 100,
            unit: '%' as const,
            min: 0,
            max: 100,
            change: (amount: number) =>
              spotlight
                ? { ...value, spotlightOpacity: amount / 100 }
                : { ...value, opacity: amount / 100 },
          },
  };
}
