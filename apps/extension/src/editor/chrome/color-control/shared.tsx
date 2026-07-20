import { ColorSelectorSwatchSection } from '../../../ui/color-selector/swatch-section';
import { buildUniqueColorList } from './helpers';

export function buildColorOptions(
  value: string,
  recentColors: readonly string[],
  palette: readonly string[]
) {
  return buildUniqueColorList([value, ...recentColors, ...palette], 10);
}

export function ColorSection(props: {
  colors: readonly string[];
  label: string;
  selectedColor: string;
  title: string;
  onSelect: (color: string) => void;
}) {
  return (
    <ColorSelectorSwatchSection
      colors={props.colors}
      label={props.label}
      selectedColor={props.selectedColor}
      title={props.title}
      onSelect={props.onSelect}
      gridClassName="grid grid-cols-10 justify-items-center gap-1"
      optionClassName="h-5 w-5 hover:-translate-y-px"
    />
  );
}
