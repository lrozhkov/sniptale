import { useRef, type ReactNode } from 'react';
import { getColorAlpha, replaceColorChannels } from '@sniptale/foundation/color';
import { translate } from '../../platform/i18n';
import { PickerFooter } from './picker-sections';
import type { ColorSelectorFormatMode } from '@sniptale/ui/color-selector/types';
import { ColorEditorPanel } from './editor-panel';
import { ColorSelectorSwatchSection } from './swatch-section';
import type { useEyedropper } from '@sniptale/ui/color-selector/popover-state';

const PANEL_CLASS_NAME = [
  'sniptale-picker-root flex w-[304px] max-w-full max-h-[inherit] min-h-0 flex-col overflow-hidden rounded-[8px] p-3',
  'bg-[var(--sniptale-color-surface-panel)]',
  'text-[color:var(--sniptale-color-text-primary)]',
  'shadow-[0_8px_32px_#0002]',
].join(' ');

type ColorSelectorPickerPopoverProps = {
  compact?: boolean | undefined;
  originalColor?: string | undefined;
  onToggleCompact?: (() => void) | undefined;
  utilities?: ReactNode;
  allowAlpha?: boolean | undefined;
  allowTransparent?: boolean | undefined;
  color: string;
  eyedropper: ReturnType<typeof useEyedropper>;
  formatMode: ColorSelectorFormatMode;
  palette?: readonly string[];
  recentColors?: readonly string[];
  title?: string | undefined;
  onApply: () => void;
  onCancel: () => void;
  onColorChange: (color: string) => void;
  onCycleFormatMode: () => void;
  onSelectTransparent: () => void;
};

export function ColorSelectorPickerPopover(props: ColorSelectorPickerPopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const originalColor = useRef(props.originalColor ?? props.color);
  return (
    <div
      ref={panelRef}
      className={PANEL_CLASS_NAME}
      data-ui="shared.ui.color-selector.picker"
      onPointerDownCapture={(event) => {
        event.currentTarget.dataset['keyboard'] = 'false';
      }}
      onKeyDownCapture={(event) => {
        event.currentTarget.dataset['keyboard'] = 'true';
      }}
    >
      <div className="sniptale-color-picker-scroll min-h-0 space-y-3 overflow-y-auto overflow-x-hidden">
        {props.palette?.length ? (
          <div data-ui="shared.ui.color-selector.picker-palette">
            <ColorSelectorSwatchSection
              colors={props.palette.slice(0, 10)}
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
        {!props.compact && props.recentColors?.length ? (
          <ColorSelectorSwatchSection
            colors={props.recentColors.slice(0, 10)}
            label={translate('shared.ui.colorSelectorRecentColors')}
            selectedColor={props.color}
            title={props.title ?? ''}
            onSelect={props.onColorChange}
          />
        ) : null}
        <ColorEditorPanel {...props} originalColor={originalColor.current} />
      </div>
      <PickerFooter
        onApply={() => {
          const invalid = panelRef.current?.querySelector<HTMLElement>(
            '[aria-invalid="true"], :invalid'
          );
          if (invalid) {
            invalid.focus();
            return;
          }
          props.onApply();
        }}
        onCancel={props.onCancel}
        compact={props.compact}
        onToggleCompact={props.onToggleCompact}
        utilities={props.utilities}
      />
    </div>
  );
}
