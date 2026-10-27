import { PageToolbarGroup, PageToolbarDivider, PageToolbarSlot } from './page-layout';
import { readContentUiScaleCompensation } from '@sniptale/ui/floating-interactions/scale';
import { CommandPressScope } from '@sniptale/ui/control-language/press';
import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Icon } from '@iconify/react';
import cursorTextIcon from '@iconify-icons/tabler/cursor-text';
import {
  Bot,
  Check,
  MessageSquarePlus,
  MousePointerClick,
  Pencil,
  SwatchBook,
  TextCursorInput,
  Touchpad,
  Video,
} from 'lucide-react';
import { translate } from '../../../../platform/i18n';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import {
  ProductToolbarMenu,
  ProductToolbarMenuItem,
  ProductToolbarMenuItemCopy,
} from '@sniptale/ui/product-menus/toolbar';
import { TextMarkerControl } from './text-marker';
import { TextRewriteControl } from '../../ai/text-rewrite/view';
import type { ToolbarModeButtonsProps } from './mode-types';
import {
  resolveToolbarMenuPlacement,
  resolveToolbarFloatingMenuStyle,
  TOOLBAR_PRIMARY_MENU_Z_INDEX,
  useToolbarFloatingMenuDismissal,
} from '../menu/floating.helpers';
import { getToolbarMenuPosition } from '../menu/position';
import { useToolbarMenuDirection } from '../menu/direction';
import { ModeSelectorButton } from './mode-selector-button';
import type { ToolbarPageEditingMode } from '../types';
import { PageControlVisibility, PageProtectedControls } from './control-visibility';
import { isEditableElementTarget } from '../../../../ui/keyboard/editable-target';
import { isTrustedKeyboardEvent } from '../../../platform/trusted-events';

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
  return (event: React.SyntheticEvent<HTMLElement> | KeyboardEvent) => {
    const activationEvent = 'nativeEvent' in event ? event.nativeEvent : event;
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
          void props.onToggleVideoRecording?.(activationEvent);
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
      void Promise.resolve(props.onToggleVideoRecording?.(activationEvent)).then(
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
      <kbd className="sniptale-toolbar-menu-shortcut">
        {TOOLBAR_INTERACTION_MODES.indexOf(props.mode) + 1}
      </kbd>
      <span className="inline-flex w-4 shrink-0">
        {props.selected ? <Check className="h-4 w-4 text-[var(--sniptale-color-accent)]" /> : null}
      </span>
    </ProductToolbarMenuItem>
  );
}

function resolveModeMenuLayout(props: {
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
  const anchor = props.triggerRef.current;
  if (anchor && menuStyle) {
    const rect = anchor.getBoundingClientRect();
    const scale = readContentUiScaleCompensation(anchor);
    const vertical = props.triggerProps.displayMode === 'vertical';
    const top = typeof menuStyle.top === 'number' ? menuStyle.top : 0;
    const available = vertical
      ? (window.innerHeight - rect.top) / scale - top - 8
      : (placement === 'up' ? rect.top : window.innerHeight - rect.bottom) / scale - 18;
    // Keep the existing 8px viewport margin and, horizontally, the 10px menu gap.
    menuStyle.maxHeight = Math.max(0, available);
    menuStyle.overflowY = 'auto';
  }
  return {
    placement: menuPlacement,
    style: menuStyle ? { ...menuStyle, zIndex: TOOLBAR_PRIMARY_MENU_Z_INDEX } : null,
  };
}

function ToolbarModeMenu(props: {
  menuRef: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  triggerProps: ToolbarModeButtonsProps;
}) {
  const adopted = React.useContext(CommandPressScope);
  const { placement: menuPlacement, style: menuStyle } = resolveModeMenuLayout(props);
  const selectedMode = getSelectedMode(props.triggerProps);

  if (!menuStyle) {
    return null;
  }

  return (
    <div ref={props.menuRef as React.Ref<HTMLDivElement>}>
      <ProductToolbarMenu
        className={adopted ? 'sniptale-content-menu-adopted' : ''}
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
        label: translate('content.toolbar.aiTableLabel'),
        title: translate('content.toolbar.aiTableHint'),
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
      return (
        <Icon
          icon={cursorTextIcon}
          width={18}
          height={18}
          className={`${MODE_ICON_CLASS_NAME} tabler-cursor-text`}
          aria-hidden="true"
        />
      );
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

  const control = (
    <ContentToolbarButton
      type="button"
      active={props.active}
      data-content-tool="true"
      aria-pressed={props.active}
      aria-label={copy.label}
      dataUi={`content.toolbar.page-editing-mode.${props.mode}`}
      disabled={props.disabled}
      title={copy.title}
      onMouseDown={(event) => event.preventDefault()}
      onClick={(event) => {
        event.stopPropagation();
        props.onSelect(props.mode);
      }}
    >
      {getPageEditingModeIcon(props.mode)}
    </ContentToolbarButton>
  );
  return props.mode === 'block-selection' ? (
    <PageToolbarSlot id="editing-block-selection" label={copy.label}>
      <PageProtectedControls>{control}</PageProtectedControls>
    </PageToolbarSlot>
  ) : (
    <PageControlVisibility
      control={props.mode === 'ai' ? 'editing-ai' : 'editing-direct-text'}
      label={copy.label}
    >
      {control}
    </PageControlVisibility>
  );
}

function ToolbarQuickEditModeButtons(
  props: ToolbarModeButtonsProps & { selectionToolActive?: boolean }
) {
  if (getSelectedMode(props) !== 'quick-edit') {
    return null;
  }

  const selectedMode: ToolbarPageEditingMode = props.aiPickMode
    ? 'ai'
    : props.quickEditDocumentMode
      ? 'direct-text'
      : 'block-selection';
  const pending = props.pendingMode !== null && props.pendingMode !== undefined;

  return (
    <PageToolbarGroup className="sniptale-page-editing-mode-group">
      {(['block-selection', 'direct-text', 'ai'] as ToolbarPageEditingMode[]).map((mode) => (
        <PageEditingModeButton
          key={mode}
          active={!props.selectionToolActive && selectedMode === mode}
          disabled={pending}
          mode={mode}
          onSelect={props.onSelectPageEditingMode}
        />
      ))}
    </PageToolbarGroup>
  );
}

function acceptsModeDigit(event: KeyboardEvent, trigger: HTMLButtonElement | null): boolean {
  if (
    !isTrustedKeyboardEvent(event) ||
    event.defaultPrevented ||
    event.repeat ||
    event.isComposing ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    event.shiftKey ||
    event.composedPath().some(isEditableElementTarget) ||
    !trigger ||
    trigger.matches(':disabled') ||
    trigger.getClientRects().length === 0 ||
    getComputedStyle(trigger).visibility === 'hidden' ||
    trigger.closest('[inert], [data-page-customizing="true"], [data-dragging="true"]')
  )
    return false;
  const root = trigger.getRootNode();
  if (!(root instanceof Document || root instanceof ShadowRoot)) return false;
  return ![
    ...root.querySelectorAll<HTMLElement>('[aria-modal="true"], [role="dialog"], [role="listbox"]'),
  ].some(
    (layer) => layer.getClientRects().length > 0 && getComputedStyle(layer).visibility !== 'hidden'
  );
}

export function ToolbarModeButtons(props: ToolbarModeButtonsProps) {
  const { onSelectPageEditingMode } = props;
  const [selectionTool, setSelectionTool] = useState<'marker' | 'ai-text' | null>(null);
  useEffect(() => {
    if (!props.quickEditMode || props.aiPickMode || props.quickEditDocumentMode)
      setSelectionTool(null);
  }, [props.quickEditMode, props.aiPickMode, props.quickEditDocumentMode]);
  const changeMarkerActive = useCallback(
    (active: boolean) => {
      if (active) onSelectPageEditingMode('block-selection');
      setSelectionTool((current) => (active ? 'marker' : current === 'marker' ? null : current));
    },
    [onSelectPageEditingMode]
  );
  const changeAITextActive = useCallback(
    (active: boolean) => {
      if (active) onSelectPageEditingMode('block-selection');
      setSelectionTool((current) => (active ? 'ai-text' : current === 'ai-text' ? null : current));
    },
    [onSelectPageEditingMode]
  );
  const selectEditingMode = (mode: ToolbarPageEditingMode) => {
    setSelectionTool(null);
    props.onSelectPageEditingMode(mode);
  };
  const canSelectText = Boolean(
    props.quickEditMode && !props.quickEditDocumentMode && !props.aiPickMode
  );
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuSide = useToolbarMenuDirection(() =>
    resolveModeMenuLayout({ triggerProps: props, triggerRef })
  );
  const menuRef = useRef<HTMLDivElement>(null);
  const selectedMode = getSelectedMode(props);
  const buttonCopy = getModeCopy(selectedMode);
  const open = props.toolbarMenuState.activeMenuType === 'mode';
  const pending = props.pendingMode !== null && props.pendingMode !== undefined;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mode = TOOLBAR_INTERACTION_MODES[Number(event.key) - 1];
      if (
        !/^[1-6]$/u.test(event.key) ||
        !mode ||
        pending ||
        (props.toolbarMenuState.activeMenuType !== null &&
          props.toolbarMenuState.activeMenuType !== 'mode') ||
        (props.videoRecordingModeLocked && mode !== 'video-recording') ||
        !acceptsModeDigit(event, triggerRef.current)
      )
        return;
      createModeSelectionHandler(mode, mode === selectedMode, props, () =>
        props.toolbarMenuState.closeMenu('mode')
      )(event);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [props, pending, selectedMode]);

  useToolbarFloatingMenuDismissal({
    menuRef,
    onClose: () => props.toolbarMenuState.closeMenu('mode'),
    open,
    triggerRef,
  });

  return (
    <>
      <PageToolbarGroup className="sniptale-mode-selector-group">
        <PageToolbarSlot id="mode" label={buttonCopy.label} interactiveWhileEditing>
          <div className="sniptale-mode-wrapper" data-menu-side={menuSide}>
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
        </PageToolbarSlot>
      </PageToolbarGroup>
      {selectedMode === 'cursor' || selectedMode === 'video-recording' ? null : (
        <PageToolbarDivider
          className="sniptale-mode-leading-divider"
          dataUi="content.toolbar.mode-leading-divider"
        />
      )}
      <ToolbarQuickEditModeButtons
        {...props}
        selectionToolActive={canSelectText && selectionTool !== null}
        onSelectPageEditingMode={selectEditingMode}
      />
      <TextMarkerControl
        displayMode={props.displayMode ?? 'horizontal'}
        active={selectionTool === 'marker' && canSelectText}
        visible={getSelectedMode(props) === 'quick-edit'}
        onActiveChange={changeMarkerActive}
      />
      <TextRewriteControl
        visible={getSelectedMode(props) === 'quick-edit'}
        active={canSelectText && selectionTool === 'ai-text'}
        disabled={pending}
        onActiveChange={changeAITextActive}
      />
    </>
  );
}
