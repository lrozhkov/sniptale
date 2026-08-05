import React, { useRef } from 'react';
import {
  Check,
  FilePenLine,
  Highlighter,
  MessageSquareText,
  MousePointer2,
  MousePointerClick,
  TextCursorInput,
} from 'lucide-react';
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
import { ModeSelectorButton } from './mode-selector-button';
import type { ToolbarPageEditingMode } from '../types';

const MODE_ICON_CLASS_NAME = 'sniptale-toolbar-mode-icon h-[18px] w-[18px] shrink-0';
const AI_ICON_CLASS_NAME = [
  MODE_ICON_CLASS_NAME,
  'inline-flex items-center justify-center text-[10px] font-bold tracking-[-0.04em]',
].join(' ');
const TOOLBAR_SIDEBAR_RIGHT_INSET_PX = 348;

type ToolbarInteractionMode = 'cursor' | 'design-review' | 'highlighter' | 'quick-edit';
const TOOLBAR_INTERACTION_MODES: readonly ToolbarInteractionMode[] = [
  'cursor',
  'highlighter',
  'quick-edit',
  'design-review',
];

function ToolbarAiIcon() {
  return (
    <span aria-hidden="true" className={AI_ICON_CLASS_NAME}>
      AI
    </span>
  );
}

function getSelectedMode(props: ToolbarModeButtonsProps): ToolbarInteractionMode {
  if (props.pendingMode) {
    return props.pendingMode === 'ai' ? 'quick-edit' : props.pendingMode;
  }

  if (props.designReviewMode) {
    return 'design-review';
  }

  if (props.quickEditMode || props.aiPickMode) {
    return 'quick-edit';
  }

  if (props.highlighterMode) {
    return 'highlighter';
  }

  return 'cursor';
}

function getModeIcon(mode: ToolbarInteractionMode) {
  switch (mode) {
    case 'quick-edit':
      return <TextCursorInput size={18} strokeWidth={2} className={MODE_ICON_CLASS_NAME} />;
    case 'design-review':
      return <MessageSquareText size={18} strokeWidth={2} className={MODE_ICON_CLASS_NAME} />;
    case 'highlighter':
      return <Highlighter size={18} strokeWidth={2} className={MODE_ICON_CLASS_NAME} />;
    case 'cursor':
    default:
      return <MousePointer2 size={18} strokeWidth={2} className={MODE_ICON_CLASS_NAME} />;
  }
}

function getModeCopy(mode: ToolbarInteractionMode) {
  switch (mode) {
    case 'quick-edit':
      return {
        hint: translate('content.toolbar.quickEditEnable'),
        label: translate('content.toolbar.quickEditLabel'),
      };
    case 'design-review':
      return {
        hint: translate('content.toolbar.designReviewEnable'),
        label: translate('content.toolbar.designReviewLabel'),
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
  selected: boolean,
  props: ToolbarModeButtonsProps,
  onClose: () => void
) {
  return (event: React.SyntheticEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (selected) {
      onClose();
      return;
    }

    switch (mode) {
      case 'quick-edit':
        if (props.aiPickMode) {
          props.onDisableAiPickMode?.();
        } else {
          props.onToggleQuickEdit();
        }
        break;
      case 'design-review':
        props.onToggleDesignReview();
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
        {TOOLBAR_INTERACTION_MODES.map((mode) => {
          const selected = selectedMode === mode;
          return (
            <ModeMenuItem
              key={mode}
              mode={mode}
              selected={selected}
              onSelect={createModeSelectionHandler(
                mode,
                selected,
                props.triggerProps,
                props.onClose
              )}
            />
          );
        })}
      </ProductToolbarMenu>
    </div>
  );
}

function getPageEditingModeCopy(mode: ToolbarPageEditingMode) {
  switch (mode) {
    case 'direct-text':
      return {
        label: translate('content.toolbar.quickEditDocumentModeLabel'),
        title: translate('content.toolbar.quickEditDocumentModeEnable'),
      };
    case 'ai':
      return {
        label: translate('content.toolbar.aiLabel'),
        title: translate('content.toolbar.aiEnable'),
      };
    case 'block-selection':
    default:
      return {
        label: translate('content.toolbar.quickEditBlockSelectionLabel'),
        title: translate('content.toolbar.quickEditBlockSelectionEnable'),
      };
  }
}

function getPageEditingModeIcon(mode: ToolbarPageEditingMode) {
  switch (mode) {
    case 'direct-text':
      return <FilePenLine size={18} strokeWidth={2} className={MODE_ICON_CLASS_NAME} />;
    case 'ai':
      return <ToolbarAiIcon />;
    case 'block-selection':
    default:
      return <MousePointerClick size={18} strokeWidth={2} className={MODE_ICON_CLASS_NAME} />;
  }
}

function PageEditingModeButton(props: {
  active: boolean;
  disabled: boolean;
  mode: ToolbarPageEditingMode;
  onSelect: (mode: ToolbarPageEditingMode) => void;
}) {
  const copy = getPageEditingModeCopy(props.mode);

  return (
    <ContentToolbarButton
      type="button"
      active={props.active}
      aria-pressed={props.active}
      aria-label={copy.label}
      dataUi={`content.toolbar.page-editing-mode.${props.mode}`}
      disabled={props.disabled}
      title={copy.title}
      onClick={(event) => {
        event.stopPropagation();
        props.onSelect(props.mode);
      }}
    >
      {getPageEditingModeIcon(props.mode)}
    </ContentToolbarButton>
  );
}

function ToolbarQuickEditModeButtons(props: ToolbarModeButtonsProps) {
  if (!props.quickEditMode && !props.aiPickMode) {
    return null;
  }

  const selectedMode: ToolbarPageEditingMode = props.aiPickMode
    ? 'ai'
    : props.quickEditDocumentMode
      ? 'direct-text'
      : 'block-selection';
  const pending = props.pendingMode !== null && props.pendingMode !== undefined;

  return (
    <>
      {(['block-selection', 'direct-text', 'ai'] as ToolbarPageEditingMode[]).map((mode) => (
        <PageEditingModeButton
          key={mode}
          active={selectedMode === mode}
          disabled={pending}
          mode={mode}
          onSelect={props.onSelectPageEditingMode}
        />
      ))}
    </>
  );
}

export function ToolbarModeButtons(props: ToolbarModeButtonsProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const selectedMode = getSelectedMode(props);
  const buttonCopy = getModeCopy(selectedMode);
  const open = props.toolbarMenuState.activeMenuType === 'mode';
  const pending = props.pendingMode !== null && props.pendingMode !== undefined;

  useToolbarFloatingMenuDismissal({
    menuRef,
    onClose: () => props.toolbarMenuState.closeMenu('mode'),
    open,
    triggerRef,
  });

  return (
    <ContentToolbarGroup className="sniptale-mode-selector-group">
      <div className="sniptale-mode-wrapper">
        <ModeSelectorButton
          label={buttonCopy.label}
          disabled={pending}
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
