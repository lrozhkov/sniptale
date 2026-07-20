import type React from 'react';
import { Scaling } from 'lucide-react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import {
  ProductToolbarMenu,
  ProductToolbarMenuDivider,
  ProductToolbarMenuItem,
  ProductToolbarMenuItemCopy,
} from '@sniptale/ui/product-menus/toolbar';
import { translate } from '../../../platform/i18n';
import type { ViewportPreset } from '../../../contracts/settings';
import type { ProductToolbarMenuPlacement } from '@sniptale/ui/product-menus/toolbar';
import { PopoverCheckIcon } from '../icons/icons';

function ViewportIcon({ className }: { className?: string }) {
  return <Scaling className={className} size={18} strokeWidth={2} />;
}

export function ViewportSelectorButton(props: {
  currentViewport: { width: number; height: number } | null;
  disabled: boolean;
  isOpen: boolean;
  onToggle: (event: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  const isNative = props.currentViewport === null;

  return (
    <ContentToolbarButton
      type="button"
      onClick={props.onToggle}
      disabled={props.disabled}
      active={!isNative}
      className="sniptale-viewport-btn"
      dataUi="content.toolbar.viewport-button"
      menuIndicator
      title={translate('content.toolbar.viewportButton')}
      data-menu-open={props.isOpen ? 'true' : 'false'}
    >
      {!isNative && props.currentViewport ? (
        <span className="sniptale-viewport-badge">
          <span>{props.currentViewport.width}</span>
          <span>{props.currentViewport.height}</span>
        </span>
      ) : (
        <ViewportIcon />
      )}
    </ContentToolbarButton>
  );
}

function stopMenuEvent(event: React.MouseEvent) {
  event.stopPropagation();
  event.preventDefault();
}

function ViewportMenuItem(props: {
  hint: string;
  label: string;
  onMouseDown: (event: React.MouseEvent) => void;
  selected: boolean;
}) {
  return (
    <ProductToolbarMenuItem
      onMouseDown={props.onMouseDown}
      onClick={stopMenuEvent}
      selected={props.selected}
    >
      <ViewportIcon className="sniptale-popover-icon" />
      <ProductToolbarMenuItemCopy label={props.label} hint={props.hint} />
      {props.selected ? <PopoverCheckIcon /> : null}
    </ProductToolbarMenuItem>
  );
}

function ViewportPresetMenuItem(props: {
  currentViewport: { width: number; height: number } | null;
  onSelectPreset: (preset: ViewportPreset) => void;
  preset: ViewportPreset;
}) {
  const isSelected =
    props.currentViewport?.width === props.preset.width &&
    props.currentViewport?.height === props.preset.height;

  return (
    <ViewportMenuItem
      label={props.preset.label}
      hint={`${props.preset.width}×${props.preset.height}`}
      onMouseDown={(event) => {
        stopMenuEvent(event);
        props.onSelectPreset(props.preset);
      }}
      selected={isSelected}
    />
  );
}

export function ViewportSelectorMenu(props: {
  compactMenus: boolean;
  currentViewport: { width: number; height: number } | null;
  menuPlacement: ProductToolbarMenuPlacement;
  menuStyle: React.CSSProperties;
  onSelectNative: () => void;
  onSelectPreset: (preset: ViewportPreset) => void;
  presets: ViewportPreset[];
}) {
  const isNative = props.currentViewport === null;

  return (
    <ProductToolbarMenu
      compact={props.compactMenus}
      style={props.menuStyle}
      title={translate('content.toolbar.viewportMenuTitle')}
      variant="viewport"
      placement={props.menuPlacement}
    >
      <ViewportMenuItem
        label={translate('content.toolbar.viewportNativeLabel')}
        hint={translate('content.toolbar.viewportNativeHint')}
        onMouseDown={(event) => {
          stopMenuEvent(event);
          props.onSelectNative();
        }}
        selected={isNative}
      />

      {props.presets.length > 0 ? <ProductToolbarMenuDivider /> : null}

      {props.presets.map((preset) => (
        <ViewportPresetMenuItem
          key={preset.id}
          currentViewport={props.currentViewport}
          onSelectPreset={props.onSelectPreset}
          preset={preset}
        />
      ))}
    </ProductToolbarMenu>
  );
}
