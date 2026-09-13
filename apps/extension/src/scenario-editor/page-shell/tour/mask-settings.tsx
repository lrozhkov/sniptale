import { useState } from 'react';
import { createSolidPaint, getRepresentativeColor, type Paint } from '@sniptale/foundation/paint';
import type { TourMask } from '@sniptale/runtime-contracts/scenario/types/tour';
import { ScanLine } from 'lucide-react';
import { CompactPaintSelector } from '../../../ui/paint-selector';
import { NumericRow } from '../../../ui/compact-inspector-controls/numeric';
import { CompactSelect } from '../../../ui/compact-inspector-controls/select';
import { GuideInspectorGroup } from '../inspector';
import type { Translate } from '../../../platform/i18n';

/** Each effect retains its parameters; geometry belongs to the selected canvas frame. */
export function TourMaskSettings({
  value,
  disabled,
  onChange,
  t,
}: {
  value: TourMask;
  disabled: boolean;
  onChange: (value: TourMask) => boolean;
  t: Translate;
}) {
  const controls = maskEffectControls(value);
  const [preview, setPreview] = useState<{ id: string; kind: string; amount: number } | null>(null);
  const amount =
    preview?.id === value.id && preview.kind === value.kind
      ? preview.amount
      : controls.amount?.value;
  return (
    <GuideInspectorGroup icon={ScanLine} title={t('scenario.editor.tourMask')}>
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
        onChange={(kind) => onChange({ ...value, kind })}
      />
      <p className="text-xs leading-relaxed text-[color:var(--sniptale-color-text-secondary)]">
        {t('scenario.editor.tourAreaCanvasHint')}
      </p>
      {controls.paint && (
        <CompactPaintSelector
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
          onChange={(paint) => onChange(controls.paint!.change(paint))}
        />
      )}
      {controls.amount && (
        <NumericRow
          appearance="plain"
          label={t(controls.amount.label)}
          value={amount ?? controls.amount.value}
          unit={controls.amount.unit}
          min={controls.amount.min}
          max={controls.amount.max}
          scrub={{ min: controls.amount.min, max: controls.amount.max }}
          disabled={disabled}
          onPreviewValue={(amount) => setPreview({ id: value.id, kind: value.kind, amount })}
          onCommitValue={(amount) => {
            setPreview(null);
            onChange(controls.amount!.change(amount));
          }}
        />
      )}
    </GuideInspectorGroup>
  );
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
