import {
  TOUR_HINT_SURFACE,
  type TourTextAppearance,
} from '@sniptale/runtime-contracts/scenario/types/tour';
import { SurfaceStyleSelector } from '../../../ui/surface-style-selector';
import { useSurfaceStylePresetCatalog } from '../../../composition/surface-style-preset-resources/use-surface-style-preset-catalog';
import { ColorField } from '../../../ui/compact-inspector-controls/controls';
import { NumericRow } from '../../../ui/compact-inspector-controls/numeric';
import type { Translate } from '../../../platform/i18n';

/** Same surface/preset editor as callouts; composition stays bounded by tour-owned numeric controls. */
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
        presentation="management"
        presets={resources.presets.filter((preset) => preset.enabled)}
        value={{ fillPaint: surface.fillPaint, surfaceCss: surface.surfaceCss }}
      />
      <ColorField
        label={t('scenario.editor.tourTextColor')}
        title={t('scenario.editor.tourTextColor')}
        value={surface.textColor}
        palette={['#111827', '#ffffff', '#334155', '#f97316']}
        disabled={disabled}
        allowAlpha={false}
        allowTransparent={false}
        onChange={(textColor) => onChange({ ...value, surface: { ...surface, textColor } })}
      />
      {(
        [
          { key: 'width', label: t('scenario.editor.tourHintWidth'), min: 200, max: 640 },
          { key: 'padding', label: t('scenario.editor.tourHintPadding'), min: 8, max: 24 },
          { key: 'radius', label: t('scenario.editor.tourHintRadius'), min: 0, max: 32 },
        ] as const
      ).map(({ key, ...props }) => (
        <NumericRow
          key={key}
          {...props}
          value={surface[key]}
          unit="px"
          disabled={disabled}
          onPreviewValue={() => {}}
          onCommitValue={(next) => onChange({ ...value, surface: { ...surface, [key]: next } })}
        />
      ))}
    </div>
  );
}
