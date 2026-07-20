import { translate } from '../../platform/i18n';
import { buildColorOptions, COLOR_SELECTOR_MAX_OPTIONS } from '@sniptale/ui/color-selector/helpers';
import { ColorSelectorSwatchSection } from './swatch-section';

const PANEL_CLASS_NAME = [
  'rounded-[14px] border p-3',
  'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_48%,transparent)]',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_96%,transparent)]',
  'shadow-[inset_0_1px_0_color-mix(in_srgb,var(--sniptale-color-border-subtle)_16%,transparent)]',
].join(' ');

export function ColorSelectorExpandedPanel(props: {
  palette: readonly string[];
  recentColors: readonly string[];
  title: string;
  value: string;
  onSelect: (color: string) => void;
}) {
  const selectedColor = props.value.toLowerCase();
  const recentColors = buildColorOptions(props.recentColors, COLOR_SELECTOR_MAX_OPTIONS);
  const palette = buildColorOptions(props.palette, COLOR_SELECTOR_MAX_OPTIONS);

  return (
    <div className={PANEL_CLASS_NAME} data-ui="shared.ui.color-selector.expanded">
      <div className="space-y-3">
        <ColorSelectorSwatchSection
          colors={recentColors}
          label={translate('shared.ui.colorSelectorRecentColors')}
          selectedColor={selectedColor}
          title={props.title}
          onSelect={props.onSelect}
        />
        <ColorSelectorSwatchSection
          colors={palette}
          label={translate('shared.ui.colorSelectorPalette')}
          selectedColor={selectedColor}
          title={props.title}
          onSelect={props.onSelect}
        />
      </div>
    </div>
  );
}
