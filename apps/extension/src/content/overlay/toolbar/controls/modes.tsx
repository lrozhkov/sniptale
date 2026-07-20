import React, { useRef } from 'react';
import { Check, FilePenLine, MousePointer2, Square, TextCursorInput } from 'lucide-react';
import { translate } from '../../../../platform/i18n';
import { ContentToolbarButton, ContentToolbarGroup } from '@sniptale/ui/content-toolbar';
import {
  ProductToolbarMenu,
  ProductToolbarMenuItem,
  ProductToolbarMenuItemCopy,
} from '@sniptale/ui/product-menus/toolbar';
import type { ToolbarModeButtonsProps } from './mode-types';
import {
  resolveToolbarMenuPlacement,
  resolveToolbarFloatingMenuStyle,
  useToolbarFloatingMenuDismissal,
} from '../menu/floating.helpers';
import { getToolbarMenuPosition } from '../menu/position';
import { AiSparkIcon } from '../../icons/icons';
import { ModeSelectorButton } from './mode-selector-button';
import { PageStyleInspectorToolbarButton } from './page-style-inspector';

const MODE_ICON_CLASS_NAME = 'sniptale-toolbar-mode-icon h-[18px] w-[18px] shrink-0';
const TOOLBAR_SIDEBAR_RIGHT_INSET_PX = 348;

type ToolbarInteractionMode = 'ai' | 'cursor' | 'highlighter' | 'quick-edit';

function ToolbarAiIcon() {
  return <AiSparkIcon className={`${MODE_ICON_CLASS_NAME} sniptale-ai-icon`} />;
}

function getQuickEditDocumentModeTitle(enabled: boolean): string {
  return translate(
    enabled
      ? 'content.toolbar.quickEditDocumentModeDisable'
      : 'content.toolbar.quickEditDocumentModeEnable'
  );
}

function getSelectedMode(props: ToolbarModeButtonsProps): ToolbarInteractionMode {
  if (props.pendingMode) {
    return props.pendingMode;
  }

  if (props.aiPickMode) {
    return 'ai';
  }

  if (props.quickEditMode) {
    return 'quick-edit';
  }

  if (props.highlighterMode) {
    return 'highlighter';
  }

  return 'cursor';
}

function getModeIcon(mode: ToolbarInteractionMode) {
  switch (mode) {
    case 'ai':
      return <ToolbarAiIcon />;
    case 'quick-edit':
      return <TextCursorInput size={18} strokeWidth={2} className={MODE_ICON_CLASS_NAME} />;
    case 'highlighter':
      return <Square size={18} strokeWidth={2} className={MODE_ICON_CLASS_NAME} />;
    case 'cursor':
    default:
      return <MousePointer2 size={18} strokeWidth={2} className={MODE_ICON_CLASS_NAME} />;
  }
}

function getModeCopy(mode: ToolbarInteractionMode) {
  switch (mode) {
    case 'ai':
      return {
        hint: translate('content.toolbar.aiEnable'),
        label: translate('content.toolbar.aiLabel'),
      };
    case 'quick-edit':
      return {
        hint: translate('content.toolbar.quickEditEnable'),
        label: translate('content.toolbar.quickEditLabel'),
      };
    case 'highlighter':
      return {
        hint: translate('content.toolbar.highlighterEnable'),
        label: translate('content.toolbar.highlighterLabel'),
      };
    case 'cursor':
    default:
      return {
        hint: translate('content.toolbar.cursorDefault'),
        label: translate('content.toolbar.cursorLabel'),
      };
  }
}

function createModeSelectionHandler(
  mode: ToolbarInteractionMode,
  props: ToolbarModeButtonsProps,
  onClose: () => void
) {
  return (event: React.SyntheticEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();

    switch (mode) {
      case 'ai':
        if (props.aiPickMode) {
          props.onDisableAiPickMode?.();
        } else {
          props.onAiPickContentStart();
        }
        break;
      case 'quick-edit':
        props.onToggleQuickEdit();
        break;
      case 'highlighter':
        props.onToggleHighlighter();
        break;
      case 'cursor':
        if (!props.isCursorMode) {
          props.onEnableCursorMode?.();
        }
        break;
    }

    onClose();
  };
}

function ModeMenuItem(props: {
  mode: ToolbarInteractionMode;
  selected: boolean;
  onSelect: (event: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  const copy = getModeCopy(props.mode);

  return (
    <ProductToolbarMenuItem
      dataUi={`content.toolbar.mode-option.${props.mode}`}
      onMouseDown={props.onSelect}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      selected={props.selected}
    >
      {getModeIcon(props.mode)}
      <ProductToolbarMenuItemCopy hint={copy.hint} label={copy.label} />
      {props.selected ? <Check className="h-4 w-4 text-[var(--sniptale-color-accent)]" /> : null}
    </ProductToolbarMenuItem>
  );
}

function ToolbarModeMenu(props: {
  menuRef: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  triggerProps: ToolbarModeButtonsProps;
}) {
  const placement = getToolbarMenuPosition(props.triggerRef.current, 320);
  const menuPlacement = resolveToolbarMenuPlacement(
    props.triggerProps.displayMode ?? 'horizontal',
    placement
  );
  const menuStyle = resolveToolbarFloatingMenuStyle({
    anchorEl: props.triggerRef.current,
    displayMode: props.triggerProps.displayMode ?? 'horizontal',
    menuHeight: 320,
    menuWidth: 280,
    placement,
    viewportRightInset: props.triggerProps.sidebarVisible ? TOOLBAR_SIDEBAR_RIGHT_INSET_PX : 0,
  });
  const selectedMode = getSelectedMode(props.triggerProps);

  if (!menuStyle) {
    return null;
  }

  return (
    <div ref={props.menuRef as React.Ref<HTMLDivElement>}>
      <ProductToolbarMenu
        compact={props.triggerProps.compactMenus ?? false}
        title={translate('content.toolbar.modeMenuTitle')}
        variant="capture"
        placement={menuPlacement}
        style={menuStyle}
      >
        {(['cursor', 'ai', 'quick-edit', 'highlighter'] as ToolbarInteractionMode[]).map((mode) => (
          <ModeMenuItem
            key={mode}
            mode={mode}
            selected={selectedMode === mode}
            onSelect={createModeSelectionHandler(mode, props.triggerProps, props.onClose)}
          />
        ))}
      </ProductToolbarMenu>
    </div>
  );
}

function QuickEditDocumentModeButton(props: {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
}) {
  return (
    <ContentToolbarButton
      type="button"
      active={props.enabled}
      aria-pressed={props.enabled}
      aria-label={translate('content.toolbar.quickEditDocumentModeLabel')}
      dataUi="content.toolbar.quick-edit-document-mode-button"
      title={getQuickEditDocumentModeTitle(props.enabled)}
      onClick={(event) => {
        event.stopPropagation();
        props.onToggle(!props.enabled);
      }}
    >
      <FilePenLine size={18} strokeWidth={2} className={MODE_ICON_CLASS_NAME} />
    </ContentToolbarButton>
  );
}

function ToolbarQuickEditModeButtons(props: ToolbarModeButtonsProps) {
  if (!props.quickEditMode) {
    return null;
  }

  return (
    <>
      <QuickEditDocumentModeButton
        enabled={props.quickEditDocumentMode}
        onToggle={props.onToggleQuickEditDocumentMode}
      />
      {props.onTogglePageStyleInspector ? (
        <PageStyleInspectorToolbarButton
          disabled={props.quickEditDocumentMode}
          open={props.pageStyleInspectorOpen ?? false}
          onToggle={props.onTogglePageStyleInspector}
        />
      ) : null}
    </>
  );
}

export function ToolbarModeButtons(props: ToolbarModeButtonsProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const selectedMode = getSelectedMode(props);
  const buttonCopy = getModeCopy(selectedMode);
  const open = props.toolbarMenuState.activeMenuType === 'mode';

  useToolbarFloatingMenuDismissal({
    menuRef,
    onClose: () => props.toolbarMenuState.closeMenu('mode'),
    open,
    triggerRef,
  });

  return (
    <ContentToolbarGroup>
      <div className="sniptale-mode-wrapper">
        <ModeSelectorButton
          label={buttonCopy.label}
          menuIndicator
          onToggle={() => props.toolbarMenuState.toggleMenu('mode')}
          open={open}
          triggerRef={triggerRef}
        >
          {getModeIcon(selectedMode)}
        </ModeSelectorButton>

        {open ? (
          <ToolbarModeMenu
            menuRef={menuRef}
            onClose={() => props.toolbarMenuState.closeMenu('mode')}
            triggerProps={props}
            triggerRef={triggerRef}
          />
        ) : null}
      </div>
      <ToolbarQuickEditModeButtons {...props} />
    </ContentToolbarGroup>
  );
}
