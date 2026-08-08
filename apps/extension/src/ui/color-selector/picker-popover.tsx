import { PickerFooter } from './picker-sections';
import type { ColorSelectorFormatMode } from '@sniptale/ui/color-selector/types';
import { ColorEditorPanel } from './editor-panel';

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
  formatMode: ColorSelectorFormatMode;
  onApply: () => void;
  onCancel: () => void;
  onColorChange: (color: string) => void;
  onCycleFormatMode: () => void;
  onEyedropperStateChange: (active: boolean) => void;
  onSelectTransparent: () => void;
};

export function ColorSelectorPickerPopover(props: ColorSelectorPickerPopoverProps) {
  return (
    <div className={PANEL_CLASS_NAME} data-ui="shared.ui.color-selector.picker">
      <div className="space-y-3">
        <ColorEditorPanel {...props} />
        <PickerFooter onApply={props.onApply} onCancel={props.onCancel} />
      </div>
    </div>
  );
}
