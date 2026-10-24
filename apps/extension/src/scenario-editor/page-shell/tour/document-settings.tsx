import { useState } from 'react';
import { createSolidPaint, getRepresentativeColor } from '@sniptale/foundation/paint';
import { CompactPaintSelector } from '../../../ui/paint-selector';
import { BackgroundImagePicker } from '../../../composition/background-resources/picker';
import type { AcquiredBackground } from '../../../composition/background-resources/acquisition';
import { WindowHeaderSettings } from '../../../workflows/browser-frame/settings';
import { ScenarioInspectorActionButton } from '../inspector-actions';
import { DEFAULT_DRAWING_COLORS } from '../../../features/drawing/public';
import {
  tourTextDefaults,
  resolveTourMarkerAppearance,
  type TourDocument,
} from '@sniptale/runtime-contracts/scenario/types/tour';
import { Palette, MessageSquare, Crosshair, PanelsTopLeft, Trash2 } from 'lucide-react';
import { ColorField } from '../../../ui/compact-inspector-controls/controls';
import { GuideInspectorGroup } from '../inspector';
import { TourMarkerFields } from './object-settings';
import { TourTextPresentation, TourChoiceField } from './fields';
import type { Translate } from '../../../platform/i18n';

/** Central appearance edits freeze the legacy hotspot fallback before separating categories. */
export function TourDocumentSettings({
  section,
  tour,
  disabled,
  onChange,
  onUploadStage,
  importDisabled = disabled,
  t,
}: {
  section: 'appearance' | 'explanations' | 'hotspots';
  tour: TourDocument;
  disabled: boolean;
  onChange: (tour: TourDocument) => boolean;
  onUploadStage?:
    | ((file: File, signal: AbortSignal, originMediaId?: string) => Promise<boolean>)
    | undefined;
  importDisabled?: boolean | undefined;
  t: Translate;
}) {
  return (
    <GuideInspectorGroup
      id={`document:${section}`}
      icon={section === 'appearance' ? Palette : section === 'hotspots' ? Crosshair : MessageSquare}
      title={t(
        section === 'appearance'
          ? 'scenario.editor.appearance'
          : section === 'hotspots'
            ? 'scenario.editor.tourHotspot'
            : 'scenario.editor.tourAnnotation'
      )}
    >
      {section === 'appearance' && (
        <>
          <div className="tour-text-field">
            <TourChoiceField
              label={t('scenario.editor.tourAspect')}
              value={tour.stage.aspect}
              disabled={disabled}
              options={[
                { value: '16:9', label: '16:9' },
                { value: '4:3', label: '4:3' },
                { value: '9:16', label: '9:16' },
              ]}
              onChange={(aspect) => onChange({ ...tour, stage: { ...tour.stage, aspect } })}
            />
          </div>
          <TourStageBackgroundSettings
            stage={tour.stage}
            disabled={disabled}
            importDisabled={importDisabled}
            onUploadStage={onUploadStage}
            onChange={(stage) => onChange({ ...tour, stage })}
            t={t}
          />
          <GuideInspectorGroup
            id="window-header"
            level="group"
            icon={PanelsTopLeft}
            title={t('windowHeader.enabled')}
          >
            <WindowHeaderSettings
              header={tour.stage.windowHeader}
              disabled={disabled}
              onChange={(windowHeader) => {
                const { windowHeader: _previousHeader, ...stage } = tour.stage;
                if (
                  !onChange({ ...tour, stage: windowHeader ? { ...stage, windowHeader } : stage })
                )
                  throw new Error('Window header edit refused');
              }}
            />
          </GuideInspectorGroup>
          {(
            [
              { key: 'accent', label: t('scenario.editor.tourInteractionAccent') },
              { key: 'text', label: t('scenario.editor.tourSceneTextColor') },
            ] as const
          ).map(({ key, label }) => (
            <ColorField
              triggerVariant="swatch"
              floatingPlacement="side"
              palette={DEFAULT_DRAWING_COLORS}
              key={key}
              label={label}
              title={key === 'accent' ? t('scenario.editor.tourInteractionAccentHint') : label}
              value={tour.style[key]}
              disabled={disabled}
              allowAlpha={false}
              allowTransparent={false}
              onChange={(value) => onChange({ ...tour, style: { ...tour.style, [key]: value } })}
            />
          ))}
        </>
      )}
      {section === 'hotspots' && (
        <TourMarkerFields
          value={resolveTourMarkerAppearance(tour.style)}
          accent={tour.style.accent}
          disabled={disabled}
          t={t}
          onChange={(markerAppearance) =>
            onChange({ ...tour, style: { ...tour.style, markerAppearance } })
          }
        />
      )}
      {section !== 'appearance' && (
        <TourTextPresentation
          inherit={false}
          kind={section === 'hotspots' ? 'hotspot' : 'annotation'}
          value={tourTextDefaults(tour.style, section === 'hotspots' ? 'hotspot' : 'annotation')}
          defaults={tourTextDefaults(tour.style, section === 'hotspots' ? 'hotspot' : 'annotation')}
          disabled={disabled}
          t={t}
          onChange={(textAppearance) => {
            if (textAppearance)
              onChange({
                ...tour,
                style: {
                  ...tour.style,
                  hotspotAppearance: tourTextDefaults(tour.style, 'hotspot'),
                  [section === 'hotspots' ? 'hotspotAppearance' : 'textAppearance']: textAppearance,
                },
              });
          }}
        />
      )}
    </GuideInspectorGroup>
  );
}

/** Stage paint and image binding share one background, independently of slide content. */
function TourStageBackgroundSettings({
  stage,
  disabled,
  importDisabled,
  onUploadStage,
  onChange,
  t,
}: {
  stage: TourDocument['stage'];
  disabled: boolean;
  importDisabled: boolean;
  onUploadStage?:
    | ((file: File, signal: AbortSignal, originMediaId?: string) => Promise<boolean>)
    | undefined;
  onChange: (stage: TourDocument['stage']) => boolean;
  t: Translate;
}) {
  const [pickerKey, setPickerKey] = useState(0);
  const [applying, setApplying] = useState(false);
  return (
    <>
      <CompactPaintSelector
        triggerVariant="swatch"
        palette={DEFAULT_DRAWING_COLORS}
        label={t('scenario.editor.tourBackground')}
        title={t('scenario.editor.tourBackground')}
        value={stage.paint ?? createSolidPaint(stage.background)}
        disabled={disabled}
        onChange={(paint) =>
          onChange({
            ...stage,
            paint,
            background: getRepresentativeColor(paint).slice(0, 7),
            image: null,
          })
        }
      />
      {onUploadStage && (
        <BackgroundImagePicker
          key={pickerKey}
          pending={importDisabled}
          onSelect={async ({ file, originMediaId }: AcquiredBackground, signal) => {
            setApplying(true);
            try {
              if (!(await onUploadStage(file, signal, originMediaId)))
                throw new Error('Stage background import refused');
            } finally {
              if (!signal.aborted) setApplying(false);
            }
          }}
        />
      )}
      {applying && (
        <ScenarioInspectorActionButton
          onClick={() => {
            setApplying(false);
            setPickerKey((value) => value + 1);
          }}
        >
          {t('scenario.editor.guideImportCancel')}
        </ScenarioInspectorActionButton>
      )}
      {stage.image && (
        <>
          <TourChoiceField
            label={t('scenario.editor.tourFit')}
            value={stage.imageFit ?? 'cover'}
            disabled={disabled}
            options={[
              { value: 'contain', label: t('scenario.editor.tourContain') },
              { value: 'cover', label: t('scenario.editor.tourCover') },
            ]}
            onChange={(imageFit) => onChange({ ...stage, imageFit })}
          />
          <ScenarioInspectorActionButton
            disabled={disabled}
            onClick={() => onChange({ ...stage, image: null })}
          >
            <Trash2 size={15} aria-hidden="true" />
            {t('scenario.editor.tourRemoveStageImage')}
          </ScenarioInspectorActionButton>
        </>
      )}
    </>
  );
}
