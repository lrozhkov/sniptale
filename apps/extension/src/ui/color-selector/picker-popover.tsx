import { useRef, useState, type ReactNode } from 'react';
import { getColorAlpha, replaceColorChannels } from '@sniptale/foundation/color';
import { translate } from '../../platform/i18n';
import { PickerFooter } from './picker-sections';
import type { ColorSelectorFormatMode } from '@sniptale/ui/color-selector/types';
import { ColorCatalogToggle } from './catalog-panel';
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
  catalogMode?: boolean | undefined;
  onCatalogModeChange?: ((enabled: boolean) => void) | undefined;
  originalColor?: string | undefined;
  onToggleCompact?: (() => void) | undefined;
  utilities?: ReactNode;
  allowAlpha?: boolean | undefined;
  allowTransparent?: boolean | undefined;
  color: string;
  eyedropper: ReturnType<typeof useEyedropper>;
  formatMode: ColorSelectorFormatMode;
  palette?: readonly string[];
  paletteNames?: Readonly<Record<string, string>> | undefined;
  recentColors?: readonly string[];
  title?: string | undefined;
  onApply: () => void;
  onCancel: () => void;
  onColorChange: (color: string) => void;
  onCycleFormatMode: () => void;
  onSelectTransparent: () => void;
};

export function ColorSelectorPickerPopover(props: ColorSelectorPickerPopoverProps) {
  const [localCatalogMode, setLocalCatalogMode] = useState(false);
  const catalogMode = props.catalogMode ?? localCatalogMode;
  const setCatalogMode = props.onCatalogModeChange ?? setLocalCatalogMode;
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
        if (event.key === 'Tab') event.currentTarget.dataset['keyboard'] = 'true';
      }}
    >
      <div
        data-color-picker-body="true"
        data-color-search={catalogMode}
        className="sniptale-color-picker-scroll min-h-0 space-y-3 overflow-y-auto overflow-x-hidden"
      >
        {props.palette?.length ? (
          <div data-ui="shared.ui.color-selector.picker-palette">
            <ColorSelectorSwatchSection
              names={props.paletteNames}
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
        <ColorEditorPanel
          {...props}
          catalogMode={catalogMode}
          onCatalogExit={() => setCatalogMode(false)}
          originalColor={originalColor.current}
        />
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
        utilities={
          <>
            <ColorCatalogToggle
              active={catalogMode}
              onToggle={() => setCatalogMode(!catalogMode)}
            />
            {props.utilities}
          </>
        }
      />
    </div>
  );
}
