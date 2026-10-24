import { InspectorDisclosureView } from '../../../ui/compact-inspector-controls/disclosure';
import { useInspectorDisclosure } from '../../../composition/inspector-disclosures/state';
import { TourHighlightAnimationFields } from './mask-settings';
import { ToggleField } from '../../../ui/compact-inspector-controls/controls';
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
  TourHotspotVisual,
} from '@sniptale/runtime-contracts/scenario/types/tour';
import {
  RotateCcw,
  Crosshair,
  MessageSquare,
  ScanLine,
  Timer,
  ScanSearch,
  Palette,
  Type,
} from 'lucide-react';
import { ColorField } from '../../../ui/compact-inspector-controls/controls';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import type { ReactNode } from 'react';
import { GuideInspectorGroup } from '../inspector';
import { TourChoiceField, TourPointFields, TourTextField, TourTextPresentation } from './fields';
import { TourInspectorNumericRow } from './numeric-row';
import type { Translate } from '../../../platform/i18n';

type SettingsProps<T> = {
  value: T;
  presentation?: 'all' | 'sections';
  narration?: ReactNode;
  timing?: ReactNode;
  camera?: ReactNode;
  tour: TourDocument;
  disabled: boolean;
  onChange: (value: T) => boolean;
  t: Translate;
};

export function TourHotspotSettings({
  value,
  presentation = 'all',
  narration,
  timing,
  camera,
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
              label={t('scenario.editor.textLabel')}
              headingOwnsLabel
              value={value.text}
              disabled={disabled}
              onChange={(text) => onChange({ ...value, text })}
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
          <TourHotspotVisualSettings value={value} disabled={disabled} t={t} onChange={onChange} />
          {value.visual.kind === 'point' && (
            <TourPointFields
              point={value.point}
              disabled={disabled}
              onChange={(point) => onChange({ ...value, point })}
            />
          )}
          {value.visual.kind === 'point' && (
            <>
              <ToggleField
                disabled={disabled}
                value={!value.markerAppearance}
                label={t('scenario.editor.tourMarkerInherit')}
                onChange={() =>
                  onChange({
                    ...value,
                    markerAppearance: value.markerAppearance
                      ? null
                      : resolveTourMarkerAppearance(tour.style),
                  })
                }
              />
              {value.markerAppearance && (
                <TourMarkerFields
                  value={resolveTourMarkerAppearance(tour.style, value)}
                  accent={tour.style.accent}
                  disabled={disabled || !value.markerAppearance}
                  t={t}
                  onChange={(markerAppearance) => onChange({ ...value, markerAppearance })}
                />
              )}
            </>
          )}
        </GuideInspectorGroup>
      ),
    },
    {
      id: 'textAppearance',
      icon: Type,
      label: t('scenario.editor.tourTextAppearance'),
      categorized: true,
      content: (
        <GuideInspectorGroup
          id="textAppearance"
          icon={Type}
          title={t('scenario.editor.tourTextAppearance')}
        >
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
      id: 'targetArea',
      icon: ScanLine,
      label: t('scenario.editor.tourTargetArea'),
      categorized: true,
      content: <TourTargetArea value={value} disabled={disabled} onChange={onChange} t={t} />,
    },
    ...actionTimingAndCameraSections(timing, camera, t),
  ]);
}

function TourHotspotVisualSettings({
  value,
  disabled,
  onChange,
  t,
}: Omit<SettingsProps<TourHotspot>, 'tour'>) {
  const visual = value.visual;
  const switchKind = (kind: TourHotspotVisual['kind']) => {
    if (kind === visual.kind) return;
    const rect =
      visual.kind === 'point'
        ? (value.targetRect ?? {
            x: Math.max(0, Math.min(0.8, value.point.x - 0.1)),
            y: Math.max(0, Math.min(0.8, value.point.y - 0.1)),
            width: 0.2,
            height: 0.2,
          })
        : visual.rect;
    const next: TourHotspotVisual =
      kind === 'point'
        ? { kind, pulse: true }
        : {
            kind,
            rect,
            ...(visual.kind === 'point'
              ? {}
              : {
                  ...(visual.strokeWidth === undefined ? {} : { strokeWidth: visual.strokeWidth }),
                  ...(visual.radius === undefined ? {} : { radius: visual.radius }),
                }),
            color: visual.kind === 'point' ? '#f97316' : visual.color,
            opacity: visual.kind === 'point' ? 0.4 : visual.opacity,
            animation:
              visual.kind === 'point'
                ? {
                    enter: { kind: 'fade', durationMs: 250 },
                    exit: { kind: 'fade', durationMs: 250 },
                  }
                : visual.animation,
          };
    onChange({
      ...value,
      point: { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 },
      visual: next,
    });
  };
  return (
    <>
      <TourChoiceField
        label={t('scenario.editor.tourVisual')}
        value={visual.kind}
        disabled={disabled}
        options={[
          { value: 'point', label: t('scenario.editor.tourVisualPoint') },
          { value: 'frame', label: t('scenario.editor.tourVisualFrame') },
          { value: 'highlight', label: t('scenario.editor.tourHighlight') },
          { value: 'spotlight', label: t('scenario.editor.tourSpotlight') },
        ]}
        onChange={switchKind}
      />
      {visual.kind === 'point' ? (
        <ToggleField
          disabled={disabled}
          label={t('scenario.editor.tourPulse')}
          value={visual.pulse}
          onChange={() => onChange({ ...value, visual: { ...visual, pulse: !visual.pulse } })}
        />
      ) : (
        <>
          <TourRectFields
            value={visual.rect}
            t={t}
            disabled={disabled}
            onChange={(rect) =>
              onChange({
                ...value,
                point: { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 },
                visual: { ...visual, rect },
              })
            }
          />
          {visual.kind === 'frame' && (
            <>
              <TourInspectorNumericRow
                label={t('scenario.editor.tourFrameStroke')}
                value={visual.strokeWidth ?? 3}
                min={1}
                max={12}
                unit="px"
                disabled={disabled}
                onChange={(strokeWidth) =>
                  onChange({ ...value, visual: { ...visual, strokeWidth } })
                }
              />
              <TourInspectorNumericRow
                label={t('scenario.editor.tourFrameRadius')}
                value={visual.radius ?? 6}
                min={0}
                max={32}
                unit="px"
                disabled={disabled}
                onChange={(radius) => onChange({ ...value, visual: { ...visual, radius } })}
              />
            </>
          )}
          <TourHighlightAnimationFields
            value={visual.animation}
            inherited={false}
            central
            disabled={disabled}
            t={t}
            onChange={(animation) =>
              animation ? onChange({ ...value, visual: { ...visual, animation } }) : false
            }
          />
          <ColorField
            triggerVariant="swatch"
            floatingPlacement="side"
            title={t('scenario.editor.color')}
            label={t('scenario.editor.color')}
            value={visual.color}
            disabled={disabled}
            onChange={(color) => onChange({ ...value, visual: { ...visual, color } })}
          />
          <TourInspectorNumericRow
            label={t('scenario.editor.tourOpacity')}
            value={visual.opacity * 100}
            min={0}
            max={100}
            unit="%"
            disabled={disabled}
            onChange={(opacity) =>
              onChange({ ...value, visual: { ...visual, opacity: opacity / 100 } })
            }
          />
        </>
      )}
    </>
  );
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
      <div title={t('scenario.editor.tourTargetAreaHint')}>
        <ToggleField
          disabled={disabled}
          label={t('scenario.editor.tourTargetArea')}
          value={value.targetRect !== null}
          onChange={() =>
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
      </div>
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
  timing,
  camera,
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
            headingOwnsLabel
            value={value.text}
            disabled={disabled}
            onChange={(text) => onChange({ ...value, text })}
          />
        </GuideInspectorGroup>
      ),
    },
    {
      id: 'textAppearance',
      icon: Type,
      label: t('scenario.editor.tourTextAppearance'),
      categorized: true,
      content: (
        <GuideInspectorGroup
          id="textAppearance"
          icon={Type}
          title={t('scenario.editor.tourTextAppearance')}
        >
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
    ...actionTimingAndCameraSections(timing, camera, t),
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
  const [expanded, setExpanded] = useInspectorDisclosure('marker-pulse-details', false);
  return (
    <div className="tour-text-field">
      <ColorField
        triggerVariant="swatch"
        floatingPlacement="side"
        label={t('scenario.editor.tourMarkerColor')}
        title={t('scenario.editor.tourMarkerColor')}
        value={value.color ?? 'transparent'}
        palette={['#ffffff', '#111827', '#f97316', '#2563eb']}
        disabled={disabled}
        allowAlpha={false}
        allowTransparent
        onChange={(color) => onChange({ ...value, color: color === 'transparent' ? null : color })}
      />

      <TourInspectorNumericRow
        label={t('scenario.editor.tourMarkerSize')}
        value={value.size}
        min={16}
        max={64}
        unit="px"
        disabled={disabled}
        onChange={(size) => onChange({ ...value, size })}
      />
      <InspectorDisclosureView
        dataUi="scenario-editor.marker-pulse-details"
        variant="structural"
        label={t('scenario.editor.tourMarkerPulseDetails')}
        open={expanded}
        onOpenChange={setExpanded}
        bodyClassName="sniptale-parameter-stack"
      >
        <div className="flex items-end gap-2">
          <ColorField
            className="min-w-0 flex-1"
            triggerVariant="swatch"
            floatingPlacement="side"
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
      </InspectorDisclosureView>
    </div>
  );
}

function actionTimingAndCameraSections(timing: ReactNode, camera: ReactNode, t: Translate) {
  return [
    ...(timing
      ? [
          {
            id: 'timing',
            icon: Timer,
            label: t('scenario.editor.tourTiming'),
            categorized: true,
            content: timing,
          },
        ]
      : []),
    ...(camera
      ? [
          {
            id: 'camera',
            icon: ScanSearch,
            label: t('scenario.editor.tourCamera'),
            categorized: true,
            content: camera,
          },
        ]
      : []),
  ];
}
