import {
  tourTextDefaults,
  resolveTourMarkerAppearance,
  type TourMarkerAppearance,
} from '@sniptale/runtime-contracts/scenario/types/tour';
import { useTourInspectorSections } from './settings-sections';
import type {
  TourHotspot,
  TourAnnotation,
  TourRect,
  TourDocument,
} from '@sniptale/runtime-contracts/scenario/types/tour';
import {
  RotateCcw,
  Crosshair,
  MessageSquare,
  ScanLine,
  Palette,
  MousePointer2,
} from 'lucide-react';
import { ColorField } from '../../../ui/compact-inspector-controls/controls';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import type { ReactNode } from 'react';
import { ProductToggle } from '@sniptale/ui/product-form-controls';
import { GuideInspectorGroup } from '../inspector';
import { TourActionField, TourPointFields, TourTextField, TourTextPresentation } from './fields';
import { TourInspectorNumericRow } from './numeric-row';
import type { Translate } from '../../../platform/i18n';

type SettingsProps<T> = {
  value: T;
  presentation?: 'all' | 'sections';
  narration?: ReactNode;
  tour: TourDocument;
  disabled: boolean;
  onChange: (value: T) => boolean;
  t: Translate;
};

export function TourHotspotSettings({
  value,
  presentation = 'all',
  narration,
  tour,
  disabled,
  onChange,
  t,
}: SettingsProps<TourHotspot>) {
  const renderSections = useTourInspectorSections(presentation, t, narration);
  return renderSections('hotspot', [
    {
      id: 'content',
      icon: MessageSquare,
      label: t('scenario.editor.textLabel'),
      categorized: true,
      content: (
        <>
          <GuideInspectorGroup
            id="hotspot"
            collapsible={false}
            icon={Crosshair}
            title={t('scenario.editor.tourHotspot')}
          >
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
          </GuideInspectorGroup>
        </>
      ),
    },
    {
      id: 'appearance',
      icon: Palette,
      label: t('scenario.editor.appearance'),
      categorized: true,
      content: (
        <GuideInspectorGroup id="appearance" icon={Palette} title={t('scenario.editor.appearance')}>
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
          <label className="guide-number-toggle">
            <ProductToggle
              size="sm"
              disabled={disabled}
              checked={!value.markerAppearance}
              aria-label={t('scenario.editor.tourMarkerInherit')}
              onClick={() =>
                onChange({
                  ...value,
                  markerAppearance: value.markerAppearance
                    ? null
                    : resolveTourMarkerAppearance(tour.style),
                })
              }
            />
            {t('scenario.editor.tourMarkerInherit')}
          </label>
          <TourMarkerFields
            value={resolveTourMarkerAppearance(tour.style, value)}
            accent={tour.style.accent}
            disabled={disabled || !value.markerAppearance}
            t={t}
            onChange={(markerAppearance) => onChange({ ...value, markerAppearance })}
          />
          <TourTextPresentation
            kind="hotspot"
            value={value.appearance}
            defaults={tourTextDefaults(tour.style, 'hotspot')}
            disabled={disabled}
            onChange={(appearance) => onChange({ ...value, appearance })}
            t={t}
          />
        </GuideInspectorGroup>
      ),
    },
    {
      id: 'action',
      icon: MousePointer2,
      label: t('scenario.editor.tourAction'),
      categorized: true,
      content: (
        <GuideInspectorGroup
          id="action"
          icon={MousePointer2}
          title={t('scenario.editor.tourAction')}
        >
          <TourActionField
            value={value.action}
            tour={tour}
            disabled={disabled}
            onChange={(action) => onChange({ ...value, action })}
            t={t}
          />
        </GuideInspectorGroup>
      ),
    },
    {
      id: 'targetArea',
      icon: ScanLine,
      label: t('scenario.editor.tourTargetArea'),
      categorized: true,
      content: <TourTargetArea value={value} disabled={disabled} onChange={onChange} t={t} />,
    },
  ]);
}

function TourTargetArea({
  value,
  disabled,
  onChange,
  t,
}: Omit<SettingsProps<TourHotspot>, 'tour'>) {
  return (
    <GuideInspectorGroup
      id="targetArea"
      icon={ScanLine}
      title={t('scenario.editor.tourTargetArea')}
    >
      <label className="guide-number-toggle" title={t('scenario.editor.tourTargetAreaHint')}>
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
  );
}

export function TourAnnotationSettings({
  value,
  presentation = 'all',
  narration,
  tour,
  disabled,
  onChange,
  t,
}: SettingsProps<TourAnnotation>) {
  const renderSections = useTourInspectorSections(presentation, t, narration);
  return renderSections('annotation', [
    {
      id: 'content',
      icon: MessageSquare,
      label: t('scenario.editor.textLabel'),
      categorized: true,
      content: (
        <GuideInspectorGroup
          id="annotation"
          icon={MessageSquare}
          title={t('scenario.editor.textLabel')}
          collapsible={false}
        >
          <TourTextField
            label={t('scenario.editor.textLabel')}
            value={value.text}
            disabled={disabled}
            onChange={(text) => onChange({ ...value, text })}
          />
        </GuideInspectorGroup>
      ),
    },
    {
      id: 'appearance',
      icon: Palette,
      label: t('scenario.editor.appearance'),
      categorized: true,
      content: (
        <GuideInspectorGroup id="appearance" icon={Palette} title={t('scenario.editor.appearance')}>
          <TourTextPresentation
            kind="annotation"
            value={value.appearance}
            defaults={tour.style.textAppearance}
            disabled={disabled}
            onChange={(appearance) => onChange({ ...value, appearance })}
            t={t}
          />
        </GuideInspectorGroup>
      ),
    },
  ]);
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
          <TourInspectorNumericRow
            key={axis}
            label={t(`scenario.editor.${axis}`)}
            unit="%"
            precision={1}
            value={value[axis] * 100}
            min={0.1}
            max={(1 - (axis === 'width' ? value.x : value.y)) * 100}
            disabled={disabled}
            onChange={(size) => onChange({ ...value, [axis]: size / 100 })}
          />
        ))}
      </div>
    </>
  );
}

/** Whole-object marker snapshots share controls between tour defaults and hotspot overrides. */
export function TourMarkerFields({
  value,
  accent,
  disabled,
  onChange,
  t,
}: {
  value: TourMarkerAppearance;
  accent: string;
  disabled: boolean;
  onChange: (value: TourMarkerAppearance) => void;
  t: Translate;
}) {
  return (
    <div className="tour-text-field">
      <ColorField
        triggerVariant="swatch"
        floatingPlacement="side"
        layout="stacked"
        label={t('scenario.editor.tourMarkerColor')}
        title={t('scenario.editor.tourMarkerColor')}
        value={value.color ?? 'transparent'}
        palette={['#ffffff', '#111827', '#f97316', '#2563eb']}
        disabled={disabled}
        allowAlpha={false}
        allowTransparent
        onChange={(color) => onChange({ ...value, color: color === 'transparent' ? null : color })}
      />
      <div className="flex items-end gap-2">
        <ColorField
          className="min-w-0 flex-1"
          triggerVariant="swatch"
          floatingPlacement="side"
          layout="stacked"
          label={t('scenario.editor.tourMarkerPulseColor')}
          title={t('scenario.editor.tourMarkerPulseColor')}
          value={value.pulseColor ?? accent}
          palette={['#ffffff', '#111827', '#f97316', '#2563eb']}
          disabled={disabled}
          allowAlpha={false}
          allowTransparent={false}
          onChange={(pulseColor) => onChange({ ...value, pulseColor })}
        />
        <ContentToolbarButton
          className="shrink-0"
          title={t('scenario.editor.tourMarkerPulseReset')}
          disabled={disabled || value.pulseColor === null}
          onClick={() => onChange({ ...value, pulseColor: null })}
        >
          <RotateCcw size={15} aria-hidden="true" />
        </ContentToolbarButton>
      </div>
      <TourInspectorNumericRow
        label={t('scenario.editor.tourMarkerSize')}
        value={value.size}
        min={16}
        max={64}
        unit="px"
        disabled={disabled}
        onChange={(size) => onChange({ ...value, size })}
      />
    </div>
  );
}
