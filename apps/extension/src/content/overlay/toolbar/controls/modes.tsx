import React, { useRef } from 'react';
import {
  Bot,
  BrushCleaning,
  Check,
  MessageSquarePlus,
  MousePointerClick,
  PanelBottomClose,
  Pencil,
  Pin,
  PinOff,
  SwatchBook,
  TextCursor,
  TextCursorInput,
  Touchpad,
  Video,
} from 'lucide-react';
import { translate } from '../../../../platform/i18n';
import {
  ContentToolbarButton,
  ContentToolbarDivider,
  ContentToolbarGroup,
} from '@sniptale/ui/content-toolbar';
import {
  ProductToolbarMenu,
  ProductToolbarMenuItem,
  ProductToolbarMenuItemCopy,
} from '@sniptale/ui/product-menus/toolbar';
import type { ToolbarModeButtonsProps } from './mode-types';
import {
  resolveToolbarMenuPlacement,
  resolveToolbarFloatingMenuStyle,
  TOOLBAR_PRIMARY_MENU_Z_INDEX,
  useToolbarFloatingMenuDismissal,
} from '../menu/floating.helpers';
import { getToolbarMenuPosition } from '../menu/position';
import { ModeSelectorButton } from './mode-selector-button';
import type { ToolbarPageEditingMode } from '../types';
import { createTrustedContentActionIntentSource } from '../../../application/privileged-action-intent';

const MODE_ICON_CLASS_NAME = 'sniptale-toolbar-mode-icon h-[18px] w-[18px] shrink-0';
const TOOLBAR_SIDEBAR_RIGHT_INSET_PX = 348;

type ToolbarInteractionMode =
  | 'cursor'
  | 'design-review'
  | 'drawing'
  | 'highlighter'
  | 'quick-edit'
  | 'video-recording';
const TOOLBAR_INTERACTION_MODES: readonly ToolbarInteractionMode[] = [
  'cursor',
  'drawing',
  'highlighter',
  'quick-edit',
  'design-review',
  'video-recording',
];

function getSelectedMode(props: ToolbarModeButtonsProps): ToolbarInteractionMode {
  if (props.pendingMode) {
    return props.pendingMode === 'ai' ? 'quick-edit' : props.pendingMode;
  }

  if (props.designReviewMode) {
    return 'design-review';
  }

  if (props.drawingMode) {
    return 'drawing';
  }

  if (props.quickEditMode || props.aiPickMode) {
    return 'quick-edit';
  }

  if (props.highlighterMode) {
    return 'highlighter';
  }

  if (props.videoRecordingMode) {
    return 'video-recording';
  }

  return 'cursor';
}

function getModeIcon(mode: ToolbarInteractionMode) {
  switch (mode) {
    case 'quick-edit':
      return <TextCursorInput size={18} strokeWidth={2} className={MODE_ICON_CLASS_NAME} />;
    case 'design-review':
      return <SwatchBook size={18} strokeWidth={2} className={MODE_ICON_CLASS_NAME} />;
    case 'drawing':
      return <Pencil size={18} strokeWidth={2} className={MODE_ICON_CLASS_NAME} />;
    case 'video-recording':
      return <Video size={18} strokeWidth={2} className={MODE_ICON_CLASS_NAME} />;
    case 'highlighter':
      return <MessageSquarePlus size={18} strokeWidth={2} className={MODE_ICON_CLASS_NAME} />;
    case 'cursor':
    default:
      return <Touchpad size={18} strokeWidth={2} className={MODE_ICON_CLASS_NAME} />;
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
    case 'drawing':
      return {
        hint: translate('content.toolbar.drawingEnable'),
        label: translate('content.toolbar.drawingLabel'),
      };
    case 'video-recording':
      return {
        hint: translate('content.toolbar.videoRecordingEnable'),
        label: translate('content.toolbar.videoRecordingLabel'),
      };
    case 'highlighter':
      return {
        hint: translate('content.toolbar.highlighterEnable'),
        label: translate('content.toolbar.highlighterLabel'),
      };
    case 'cursor':
    default:
      return {
        hint: translate('content.toolbar.cursorDescription'),
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

    const selectMode = () => {
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
        case 'drawing':
          props.onToggleDrawing?.();
          break;
        case 'video-recording':
          void props.onToggleVideoRecording?.(event.nativeEvent);
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

    if (props.videoRecordingMode && mode !== 'video-recording') {
      if (props.videoRecordingModeLocked) return;
      void Promise.resolve(props.onToggleVideoRecording?.(event.nativeEvent)).then(
        (deactivated) => {
          if (deactivated !== false) selectMode();
        },
        () => undefined
      );
      return;
    }
    selectMode();
  };
}

function ModeMenuItem(props: {
  mode: ToolbarInteractionMode;
  selected: boolean;
  disabled?: boolean;
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
      {...(props.disabled === undefined ? {} : { disabled: props.disabled })}
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
        style={{ ...menuStyle, zIndex: TOOLBAR_PRIMARY_MENU_Z_INDEX }}
      >
        {TOOLBAR_INTERACTION_MODES.map((mode) => {
          const selected = selectedMode === mode;
          return (
            <ModeMenuItem
              key={mode}
              mode={mode}
              selected={selected}
              disabled={
                props.triggerProps.videoRecordingModeLocked === true && mode !== 'video-recording'
              }
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
      return <TextCursor size={18} strokeWidth={2} className={MODE_ICON_CLASS_NAME} />;
    case 'ai':
      return <Bot size={18} strokeWidth={2} className={MODE_ICON_CLASS_NAME} />;
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
    <ContentToolbarGroup className="sniptale-page-editing-mode-group">
      {(['block-selection', 'direct-text', 'ai'] as ToolbarPageEditingMode[]).map((mode) => (
        <PageEditingModeButton
          key={mode}
          active={selectedMode === mode}
          disabled={pending}
          mode={mode}
          onSelect={props.onSelectPageEditingMode}
        />
      ))}
    </ContentToolbarGroup>
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
    <>
      <ContentToolbarGroup className="sniptale-mode-selector-group">
        <div className="sniptale-mode-wrapper">
          <ModeSelectorButton
            label={buttonCopy.label}
            title={
              selectedMode === 'cursor'
                ? translate('content.toolbar.cursorDefault')
                : buttonCopy.label
            }
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
        {selectedMode === 'cursor' ? <NavigationToolbarActions {...props} /> : null}
      </ContentToolbarGroup>
      {selectedMode === 'cursor' || selectedMode === 'video-recording' ? null : (
        <ContentToolbarDivider
          className="sniptale-mode-leading-divider"
          dataUi="content.toolbar.mode-leading-divider"
        />
      )}
      <ToolbarQuickEditModeButtons {...props} />
    </>
  );
}

function NavigationToolbarActions(props: ToolbarModeButtonsProps) {
  const pinned = props.pinToTab === true || props.pinToTabLocked === true;
  return (
    <>
      <ContentToolbarButton
        type="button"
        dataUi="content.toolbar.navigation.clear-page-preparation"
        tone="danger"
        disabled={props.canClearPagePreparation !== true}
        title={translate('content.toolbar.clearPagePreparation')}
        onClick={(event) => {
          event.stopPropagation();
          props.onClearPagePreparation?.();
        }}
      >
        <BrushCleaning size={18} strokeWidth={2} />
      </ContentToolbarButton>
      <ContentToolbarButton
        type="button"
        active={pinned}
        aria-pressed={pinned}
        dataUi="content.toolbar.navigation.pin-to-tab"
        disabled={props.pinToTabLocked === true || props.pinToTabAvailable !== true}
        title={
          props.pinToTabLocked
            ? translate('content.toolbar.pinToTabLockedHint')
            : !props.pinToTabAvailable
              ? translate('content.toolbar.pinToTabUnavailableHint')
              : translate('content.toolbar.pinToTab')
        }
        onClick={(event) => {
          event.stopPropagation();
          props.onPinToTabChange?.(
            props.pinToTab !== true,
            createTrustedContentActionIntentSource(event.nativeEvent) ?? undefined
          );
        }}
      >
        {pinned ? <Pin size={18} strokeWidth={2} /> : <PinOff size={18} strokeWidth={2} />}
      </ContentToolbarButton>
      <ContentToolbarButton
        type="button"
        dataUi="content.toolbar.navigation.collapse"
        title={translate('content.toolbar.hideToolbar')}
        onClick={(event) => {
          event.stopPropagation();
          props.onHide?.();
        }}
      >
        <PanelBottomClose size={18} strokeWidth={2} />
      </ContentToolbarButton>
    </>
  );
}
