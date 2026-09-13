import type {
  TourHotspot,
  TourAnnotation,
  TourRect,
  TourDocument,
} from '@sniptale/runtime-contracts/scenario/types/tour';
import { Crosshair, MessageSquare, ScanLine } from 'lucide-react';
import { ProductToggle } from '@sniptale/ui/product-form-controls';
import { NumericRow } from '../../../ui/compact-inspector-controls/numeric';
import { GuideInspectorGroup } from '../inspector';
import { TourActionField, TourPointFields, TourTextField, TourTextPresentation } from './fields';
import type { Translate } from '../../../platform/i18n';

type SettingsProps<T> = {
  value: T;
  tour: TourDocument;
  disabled: boolean;
  onChange: (value: T) => boolean;
  t: Translate;
};

export function TourHotspotSettings({
  value,
  tour,
  disabled,
  onChange,
  t,
}: SettingsProps<TourHotspot>) {
  return (
    <>
      <GuideInspectorGroup icon={Crosshair} title={t('scenario.editor.tourHotspot')}>
        <TourTextField
          label={t('scenario.editor.tourObjectLabel')}
          singleLine
          value={value.label}
          disabled={disabled}
          onChange={(label) => onChange({ ...value, label })}
        />
        <TourTextField
          label={t('scenario.editor.textLabel')}
          value={value.text}
          disabled={disabled}
          onChange={(text) => onChange({ ...value, text })}
        />
        <TourPointFields
          point={value.point}
          disabled={disabled}
          onChange={(point) => onChange({ ...value, point })}
        />
        <label className="guide-number-toggle">
          <ProductToggle
            size="sm"
            disabled={disabled}
            aria-label={t('scenario.editor.tourPulse')}
            checked={value.pulse}
            onClick={() => onChange({ ...value, pulse: !value.pulse })}
          />
          {t('scenario.editor.tourPulse')}
        </label>
        <TourTextPresentation
          value={value.appearance}
          defaults={tour.style.textAppearance}
          disabled={disabled}
          onChange={(appearance) => onChange({ ...value, appearance })}
          t={t}
        />
        <TourActionField
          value={value.action}
          tour={tour}
          disabled={disabled}
          onChange={(action) => onChange({ ...value, action })}
          t={t}
        />
      </GuideInspectorGroup>
      <GuideInspectorGroup icon={ScanLine} title={t('scenario.editor.tourTargetArea')}>
        <label className="guide-number-toggle">
          <ProductToggle
            size="sm"
            disabled={disabled}
            aria-label={t('scenario.editor.tourTargetArea')}
            checked={value.targetRect !== null}
            onClick={() =>
              onChange({
                ...value,
                targetRect: value.targetRect
                  ? null
                  : {
                      x: Math.min(value.point.x, 0.8),
                      y: Math.min(value.point.y, 0.8),
                      width: 0.2,
                      height: 0.2,
                    },
              })
            }
          />
          {t('scenario.editor.tourTargetArea')}
        </label>
        {value.targetRect && (
          <TourRectFields
            value={value.targetRect}
            disabled={disabled}
            onChange={(targetRect) => onChange({ ...value, targetRect })}
            t={t}
          />
        )}
      </GuideInspectorGroup>
    </>
  );
}

export function TourAnnotationSettings({
  value,
  tour,
  disabled,
  onChange,
  t,
}: SettingsProps<TourAnnotation>) {
  return (
    <GuideInspectorGroup icon={MessageSquare} title={t('scenario.editor.tourAnnotation')}>
      <TourTextField
        label={t('scenario.editor.textLabel')}
        value={value.text}
        disabled={disabled}
        onChange={(text) => onChange({ ...value, text })}
      />
      <label className="guide-number-toggle">
        <ProductToggle
          size="sm"
          disabled={disabled}
          aria-label={t('scenario.editor.tourAnchor')}
          checked={value.anchor !== null}
          onClick={() => onChange({ ...value, anchor: value.anchor ? null : { x: 0.5, y: 0.5 } })}
        />
        {t('scenario.editor.tourAnchor')}
      </label>
      {value.anchor && (
        <TourPointFields
          point={value.anchor}
          disabled={disabled}
          onChange={(anchor) => onChange({ ...value, anchor })}
        />
      )}
      <TourTextPresentation
        value={value.appearance}
        defaults={tour.style.textAppearance}
        disabled={disabled}
        onChange={(appearance) => onChange({ ...value, appearance })}
        t={t}
      />
    </GuideInspectorGroup>
  );
}

function TourRectFields({
  value,
  disabled,
  onChange,
  t,
}: {
  value: TourRect;
  disabled: boolean;
  onChange: (rect: TourRect) => void;
  t: Translate;
}) {
  return (
    <>
      <TourPointFields
        point={value}
        maximum={{ x: 1 - value.width, y: 1 - value.height }}
        disabled={disabled}
        onChange={(point) => onChange({ ...value, ...point })}
      />
      <div className="tour-coordinate-fields">
        {(['width', 'height'] as const).map((axis) => (
          <NumericRow
            key={axis}
            label={t(`scenario.editor.${axis}`)}
            unit="%"
            precision={1}
            value={value[axis] * 100}
            min={0.1}
            max={(1 - (axis === 'width' ? value.x : value.y)) * 100}
            disabled={disabled}
            onPreviewValue={() => {}}
            onCommitValue={(size) => onChange({ ...value, [axis]: size / 100 })}
          />
        ))}
      </div>
    </>
  );
}
