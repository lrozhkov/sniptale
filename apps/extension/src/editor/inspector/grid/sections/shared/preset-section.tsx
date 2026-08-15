import { translate } from '../../../../../platform/i18n';
import { ProductGlassColorPalette } from '@sniptale/ui/product-glass-controls';
import { PanelSection } from '../../../environment/shared';

export function EditorInspectorGridPresetSection(props: {
  applyGridColor: (color: string) => void;
  gridColor: string;
  gridPalette: readonly string[];
}) {
  return (
    <PanelSection label={translate('editor.compact.neutralPresets')}>
      <ProductGlassColorPalette
        colors={[...props.gridPalette]}
        value={props.gridColor}
        onSelect={props.applyGridColor}
      />
    </PanelSection>
  );
}
