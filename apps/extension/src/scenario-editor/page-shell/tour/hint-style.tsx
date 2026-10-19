import { InspectorDisclosureView } from '../../../ui/compact-inspector-controls/disclosure';
import { useInspectorDisclosure } from '../../../composition/inspector-disclosures/state';
import {
  TOUR_HINT_SURFACE,
  type TourTextAppearance,
} from '@sniptale/runtime-contracts/scenario/types/tour';
import { SurfaceStyleSelector } from '../../../ui/surface-style-selector';
import { useSurfaceStylePresetCatalog } from '../../../composition/surface-style-preset-resources/use-surface-style-preset-catalog';
import { ColorField } from '../../../ui/compact-inspector-controls/controls';
import { TourInspectorNumericRow } from './numeric-row';
import type { Translate } from '../../../platform/i18n';

/** Shares callout presets through direct selection; sizing remains owned by the tour. */
export function TourHintStyle({
  value,
  onChange,
  disabled,
  t,
}: {
  value: TourTextAppearance;
  onChange: (value: TourTextAppearance) => void;
  disabled: boolean;
  t: Translate;
}) {
  const [expanded, setExpanded] = useInspectorDisclosure('hint-style-details', false);
  const resources = useSurfaceStylePresetCatalog();
  const surface = value.surface ?? TOUR_HINT_SURFACE;
  return (
    <div className="tour-hint-style-settings">
      <SurfaceStyleSelector
        actions={resources.actions}
        disabled={disabled}
        fieldLabel={t('scenario.editor.tourHintStyle')}
        onChange={(style) => onChange({ ...value, surface: { ...surface, ...style } })}
        palette={['#ffffff', '#111827', '#f97316', '#2563eb', '#16a34a', '#8b5cf6']}
        presentation="selection"
        presets={resources.presets.filter((preset) => preset.enabled)}
        value={{ fillPaint: surface.fillPaint, surfaceCss: surface.surfaceCss }}
      />
      <ColorField
        triggerVariant="swatch"
        floatingPlacement="side"
        label={t('scenario.editor.tourTextColor')}
        title={t('scenario.editor.tourTextColor')}
        value={surface.textColor}
        palette={['#111827', '#ffffff', '#334155', '#f97316']}
        disabled={disabled}
        allowAlpha={false}
        allowTransparent={false}
        onChange={(textColor) => onChange({ ...value, surface: { ...surface, textColor } })}
      />
      <InspectorDisclosureView
        dataUi="scenario-editor.hint-style-details"
        variant="structural"
        label={t('scenario.editor.tourAdvancedAppearance')}
        open={expanded}
        onOpenChange={setExpanded}
        bodyClassName="sniptale-parameter-stack"
      >
        {(
          [
            { key: 'width', label: t('scenario.editor.tourHintWidth'), min: 200, max: 640 },
            { key: 'padding', label: t('scenario.editor.tourHintPadding'), min: 8, max: 24 },
          ] as const
        ).map(({ key, ...props }) => (
          <TourInspectorNumericRow
            key={key}
            {...props}
            value={surface[key]}
            unit="px"
            disabled={disabled}
            onChange={(next) => onChange({ ...value, surface: { ...surface, [key]: next } })}
          />
        ))}
      </InspectorDisclosureView>
    </div>
  );
}
