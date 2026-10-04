import { DEFAULT_DRAWING_COLORS } from '../../../features/drawing/public';
import {
  tourTextDefaults,
  resolveTourMarkerAppearance,
  type TourDocument,
} from '@sniptale/runtime-contracts/scenario/types/tour';
import { Palette, MessageSquare } from 'lucide-react';
import { ColorField } from '../../../ui/compact-inspector-controls/controls';
import { CompactSelect } from '../../../ui/compact-inspector-controls/select';
import { GuideInspectorGroup } from '../inspector';
import { TourMarkerFields } from './object-settings';
import { TourTextPresentation } from './fields';
import type { Translate } from '../../../platform/i18n';

/** Central appearance edits freeze the legacy hotspot fallback before separating categories. */
export function TourDocumentSettings({
  section,
  tour,
  disabled,
  onChange,
  t,
}: {
  section: 'appearance' | 'explanations' | 'hotspots';
  tour: TourDocument;
  disabled: boolean;
  onChange: (tour: TourDocument) => boolean;
  t: Translate;
}) {
  return (
    <GuideInspectorGroup
      id={`document:${section}`}
      icon={section === 'appearance' ? Palette : MessageSquare}
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
            <span>{t('scenario.editor.tourAspect')}</span>
            <CompactSelect
              aria-label={t('scenario.editor.tourAspect')}
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
          <ColorField
            triggerVariant="swatch"
            floatingPlacement="side"
            layout="stacked"
            palette={DEFAULT_DRAWING_COLORS}
            label={t('scenario.editor.tourBackground')}
            title={t('scenario.editor.tourBackground')}
            value={tour.stage.background}
            disabled={disabled}
            allowAlpha={false}
            allowTransparent={false}
            onChange={(background) => onChange({ ...tour, stage: { ...tour.stage, background } })}
          />
          {(
            [
              { key: 'accent', label: t('scenario.editor.tourInteractionAccent') },
              { key: 'text', label: t('scenario.editor.tourSceneTextColor') },
            ] as const
          ).map(({ key, label }) => (
            <ColorField
              triggerVariant="swatch"
              floatingPlacement="side"
              layout="stacked"
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
