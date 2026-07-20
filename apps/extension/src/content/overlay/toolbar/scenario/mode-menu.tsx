import type React from 'react';
import { useRef } from 'react';
import { Check, MousePointerClick, ScanEye } from 'lucide-react';
import { translate } from '../../../../platform/i18n';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import {
  ProductToolbarMenu,
  ProductToolbarMenuItem,
  ProductToolbarMenuItemCopy,
} from '@sniptale/ui/product-menus/toolbar';
import {
  resolveToolbarMenuPlacement,
  resolveToolbarFloatingMenuStyle,
  useToolbarFloatingMenuDismissal,
} from '../menu/floating.helpers';
import { getToolbarMenuPosition } from '../menu/position';
import type { ToolbarMenuState } from '../state/menu';

type ScenarioCaptureMode = 'manual' | 'by-click';
const TOOLBAR_SIDEBAR_RIGHT_INSET_PX = 348;

function getScenarioModeIcon(captureMode: ScenarioCaptureMode) {
  if (captureMode === 'by-click') {
    return <MousePointerClick className="h-[18px] w-[18px]" />;
  }

  return <ScanEye className="h-[18px] w-[18px]" />;
}

function buildScenarioModeOptions(byClickDisabled: boolean) {
  return [
    {
      icon: <ScanEye className="sniptale-popover-icon h-4 w-4" />,
      value: 'manual' as const,
      label: translate('scenario.content.modeManual'),
      hint: translate('scenario.content.modeManualHint'),
      disabled: false,
    },
    {
      icon: <MousePointerClick className="sniptale-popover-icon h-4 w-4" />,
      value: 'by-click' as const,
      label: translate('scenario.content.modeByClick'),
      hint: byClickDisabled
        ? translate('scenario.content.modeByClickDisabledHint')
        : translate('scenario.content.modeByClickHint'),
      disabled: byClickDisabled,
    },
  ];
}

function ScenarioModeOptionItem(props: {
  captureMode: ScenarioCaptureMode;
  onClose: () => void;
  onSelect: (captureMode: ScenarioCaptureMode) => void;
  option: ReturnType<typeof buildScenarioModeOptions>[number];
}) {
  const selected = props.captureMode === props.option.value;

  return (
    <ProductToolbarMenuItem
      key={props.option.value}
      dataUi={`content.toolbar.scenario-mode-option.${props.option.value}`}
      selected={selected}
      disabled={props.option.disabled}
      onMouseDown={(event) => {
        if (props.option.disabled) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        props.onSelect(props.option.value);
        props.onClose();
      }}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      {props.option.icon}
      <ProductToolbarMenuItemCopy label={props.option.label} hint={props.option.hint} />
      {selected ? <Check className="h-4 w-4 text-[var(--sniptale-color-accent)]" /> : null}
    </ProductToolbarMenuItem>
  );
}

function ScenarioModeOptions(props: {
  captureMode: ScenarioCaptureMode;
  onClose: () => void;
  onSelect: (captureMode: ScenarioCaptureMode) => void;
  options: ReturnType<typeof buildScenarioModeOptions>;
}) {
  return props.options.map((option) => (
    <ScenarioModeOptionItem
      key={option.value}
      captureMode={props.captureMode}
      onClose={props.onClose}
      onSelect={props.onSelect}
      option={option}
    />
  ));
}

function ScenarioModeDropdown(props: {
  byClickDisabled: boolean;
  captureMode: ScenarioCaptureMode;
  compactMenus: boolean;
  displayMode: 'horizontal' | 'vertical';
  menuRef: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
  onSelect: (captureMode: ScenarioCaptureMode) => void;
  sidebarVisible: boolean;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const options = buildScenarioModeOptions(props.byClickDisabled);
  const placement = getToolbarMenuPosition(props.triggerRef.current, 260);
  const menuPlacement = resolveToolbarMenuPlacement(props.displayMode, placement);
  const menuStyle = resolveToolbarFloatingMenuStyle({
    anchorEl: props.triggerRef.current,
    displayMode: props.displayMode,
    menuHeight: 260,
    menuWidth: 280,
    placement,
    viewportRightInset: props.sidebarVisible ? TOOLBAR_SIDEBAR_RIGHT_INSET_PX : 0,
  });

  if (!menuStyle) {
    return null;
  }

  return (
    <div
      ref={props.menuRef as React.Ref<HTMLDivElement>}
      data-ui="content.toolbar.scenario-mode-menu"
    >
      <ProductToolbarMenu
        compact={props.compactMenus}
        title={translate('scenario.content.captureMode')}
        variant="capture"
        placement={menuPlacement}
        style={menuStyle}
      >
        <ScenarioModeOptions
          captureMode={props.captureMode}
          onClose={props.onClose}
          onSelect={props.onSelect}
          options={options}
        />
      </ProductToolbarMenu>
    </div>
  );
}

function ScenarioModeButton(props: {
  captureMode: ScenarioCaptureMode;
  onToggle: () => void;
  open: boolean;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
}) {
  return (
    <ContentToolbarButton
      ref={props.triggerRef}
      active={props.open || props.captureMode === 'by-click'}
      onClick={(event) => {
        event.stopPropagation();
        props.onToggle();
      }}
      title={translate('scenario.content.captureMode')}
      dataUi="content.toolbar.scenario-mode-button"
      menuIndicator
      aria-label={translate('scenario.content.captureMode')}
      aria-expanded={props.open}
      aria-haspopup="menu"
    >
      {getScenarioModeIcon(props.captureMode)}
    </ContentToolbarButton>
  );
}

export function ToolbarScenarioModeMenu(props: {
  byClickDisabled: boolean;
  captureMode: ScenarioCaptureMode;
  compactMenus: boolean;
  displayMode: 'horizontal' | 'vertical';
  onSetCaptureMode: (captureMode: ScenarioCaptureMode) => void;
  sidebarVisible?: boolean;
  toolbarMenuState: ToolbarMenuState;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const open = props.toolbarMenuState.activeMenuType === 'scenario-mode';

  useToolbarFloatingMenuDismissal({
    menuRef,
    open,
    triggerRef,
    onClose: () => props.toolbarMenuState.closeMenu('scenario-mode'),
  });

  return (
    <div className="relative">
      <ScenarioModeButton
        captureMode={props.captureMode}
        onToggle={() => props.toolbarMenuState.toggleMenu('scenario-mode')}
        open={open}
        triggerRef={triggerRef}
      />

      {open ? (
        <ScenarioModeDropdown
          byClickDisabled={props.byClickDisabled}
          captureMode={props.captureMode}
          compactMenus={props.compactMenus}
          displayMode={props.displayMode}
          menuRef={menuRef}
          onClose={() => props.toolbarMenuState.closeMenu('scenario-mode')}
          onSelect={props.onSetCaptureMode}
          sidebarVisible={props.sidebarVisible ?? false}
          triggerRef={triggerRef}
        />
      ) : null}
    </div>
  );
}
