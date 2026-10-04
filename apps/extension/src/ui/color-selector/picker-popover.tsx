import { getColorAlpha, replaceColorChannels } from '@sniptale/foundation/color';
import { translate } from '../../platform/i18n';
import { PickerFooter } from './picker-sections';
import type { ColorSelectorFormatMode } from '@sniptale/ui/color-selector/types';
import { ColorEditorPanel } from './editor-panel';
import { ColorSelectorSwatchSection } from './swatch-section';
import type { useEyedropper } from '@sniptale/ui/color-selector/popover-state';

const PANEL_CLASS_NAME = [
  'rounded-[14px] border p-3',
  'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_48%,transparent)]',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_98%,transparent)]',
  'text-[color:var(--sniptale-color-text-primary)]',
  'shadow-[0_20px_48px_color-mix(in_srgb,var(--sniptale-color-shadow-strong)_18%,transparent)]',
].join(' ');

type ColorSelectorPickerPopoverProps = {
  allowAlpha?: boolean;
  allowTransparent?: boolean;
  color: string;
  eyedropper: ReturnType<typeof useEyedropper>;
  formatMode: ColorSelectorFormatMode;
  palette?: readonly string[];
  recentColors?: readonly string[];
  title?: string;
  onApply: () => void;
  onCancel: () => void;
  onColorChange: (color: string) => void;
  onCycleFormatMode: () => void;
  onSelectTransparent: () => void;
};

export function ColorSelectorPickerPopover(props: ColorSelectorPickerPopoverProps) {
  return (
    <div className={PANEL_CLASS_NAME} data-ui="shared.ui.color-selector.picker">
      <div className="space-y-1.5">
        {props.palette?.length ? (
          <div data-ui="shared.ui.color-selector.picker-palette" className="pb-2">
            <ColorSelectorSwatchSection
              colors={props.palette}
              label=""
              showLabel={false}
              selectedColor={props.color}
              title={props.title ?? ''}
              onSelect={(color) =>
                props.onColorChange(
                  props.color === 'transparent' || (getColorAlpha(color) ?? 1) < 1
                    ? color
                    : (replaceColorChannels(props.color, color) ?? color)
                )
              }
            />
          </div>
        ) : null}
        {props.recentColors?.length ? (
          <ColorSelectorSwatchSection
            colors={props.recentColors}
            label={translate('shared.ui.colorSelectorRecentColors')}
            selectedColor={props.color}
            title={props.title ?? ''}
            onSelect={props.onColorChange}
          />
        ) : null}
        <ColorEditorPanel {...props} />
        <PickerFooter onApply={props.onApply} onCancel={props.onCancel} />
      </div>
    </div>
  );
}
