import { BrushCleaning, Clock3, Eraser, Touchpad, type LucideIcon } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import {
  ProductToolbarMenu,
  ProductToolbarMenuItem,
  ProductToolbarMenuItemCopy,
} from '@sniptale/ui/product-menus/toolbar';
import type { DrawingSessionSnapshot, DrawingTool } from '../../../../features/drawing/public';
import { translate } from '../../../../platform/i18n';
import { ToolbarDrawingControls, type ToolbarDrawingControlsOwner } from '../controls/drawing';
import { resolveToolbarDropdownState, ToolbarMenuDropdown } from '../menu/dropdown';
import { useToolbarFloatingMenuDismissal } from '../menu/floating.helpers';
import { getToolbarMenuPosition } from '../menu/position';
import {
  RECORDING_DRAWING_AUTO_HIDE_DELAYS,
  type RecordingDrawingAutoHideDelay,
  type RecordingDrawingOwner,
} from './drawing-session';
import type { ToolbarMenuState } from '../state/menu';

export type RecordingDrawingInteractionMode = 'navigation' | 'eraser' | DrawingTool;

const DRAWING_TOOLS: readonly DrawingTool[] = [
  'select',
  'pencil',
  'marker',
  'text',
  'shape',
  'arrow',
  'blur',
];

function isDrawingTool(mode: RecordingDrawingInteractionMode): mode is DrawingTool {
  return DRAWING_TOOLS.includes(mode as DrawingTool);
}

function InteractionButton(props: {
  active: boolean;
  icon: LucideIcon;
  label: string;
  dataUi: string;
  onClick(): void;
}) {
  const Icon = props.icon;
  return (
    <ContentToolbarButton
      type="button"
      active={props.active}
      aria-pressed={props.active}
      aria-label={props.label}
      title={props.label}
      dataUi={props.dataUi}
      onClick={props.onClick}
    >
      <Icon size={18} />
    </ContentToolbarButton>
  );
}

function AutoHideControl(props: {
  compactMenus: boolean;
  delay: RecordingDrawingAutoHideDelay;
  displayMode: 'horizontal' | 'vertical';
  onChange(delay: RecordingDrawingAutoHideDelay): void;
  toolbarMenuState?: ToolbarMenuState;
}) {
  const [localOpen, setLocalOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const open = props.toolbarMenuState
    ? props.toolbarMenuState.activeMenuType === 'recording-auto-hide'
    : localOpen;
  const closeMenu = useCallback(() => {
    if (props.toolbarMenuState) props.toolbarMenuState.closeMenu('recording-auto-hide');
    else setLocalOpen(false);
    queueMicrotask(() => triggerRef.current?.blur());
  }, [props.toolbarMenuState]);
  useToolbarFloatingMenuDismissal({
    menuRef,
    onClose: closeMenu,
    open,
    triggerRef,
  });
  const dropdown = resolveToolbarDropdownState({
    anchorRef: triggerRef,
    displayMode: props.displayMode,
    getMenuPosition: (ref, height = 280) => getToolbarMenuPosition(ref.current, height),
    menuHeight: 280,
    menuWidth: 220,
    preferredAlign: 'end',
  });
  const label = translate('content.toolbar.recordingDrawingAutoHide');
  return (
    <div className="relative flex">
      <ContentToolbarButton
        ref={triggerRef}
        type="button"
        active={props.delay > 0}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={label}
        title={label}
        dataUi="content.toolbar.video-recording.auto-hide"
        menuIndicator
        onClick={() => {
          if (open) closeMenu();
          else if (props.toolbarMenuState) props.toolbarMenuState.toggleMenu('recording-auto-hide');
          else setLocalOpen(true);
        }}
      >
        <Clock3 size={18} />
      </ContentToolbarButton>
      {open && dropdown.style ? (
        <ToolbarMenuDropdown
          dataUi="content.toolbar.video-recording.auto-hide-menu"
          menuRef={menuRef}
        >
          <ProductToolbarMenu
            compact={props.compactMenus}
            placement={dropdown.menuPlacement}
            style={dropdown.style}
            title={label}
          >
            {RECORDING_DRAWING_AUTO_HIDE_DELAYS.map((delay) => (
              <ProductToolbarMenuItem
                key={delay}
                dataUi={`content.toolbar.video-recording.auto-hide-${delay}`}
                selected={props.delay === delay}
                onMouseDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  props.onChange(delay);
                  closeMenu();
                  triggerRef.current?.blur();
                }}
              >
                <ProductToolbarMenuItemCopy
                  label={
                    delay === 0
                      ? translate('content.toolbar.recordingDrawingAutoHideOff')
                      : `${delay} ${translate('content.toolbar.recordingDrawingAutoHideSeconds')}`
                  }
                />
              </ProductToolbarMenuItem>
            ))}
          </ProductToolbarMenu>
        </ToolbarMenuDropdown>
      ) : null}
    </div>
  );
}

export function RecordingDrawingControls(props: {
  actionTail?: ReactNode;
  compactMenus: boolean;
  disabled?: boolean;
  displayMode: 'horizontal' | 'vertical';
  interactionMode: RecordingDrawingInteractionMode;
  owner: RecordingDrawingOwner;
  toolbarMenuState?: ToolbarMenuState;
  onAutoHideDelayChange?: (delay: RecordingDrawingAutoHideDelay) => Promise<void> | void;
  onInteractionModeChange(mode: RecordingDrawingInteractionMode): void;
}) {
  const { disabled, interactionMode, owner } = props;

  useEffect(() => {
    if (disabled || interactionMode !== 'eraser') return;
    let pointerId: number | null = null;
    let path: Array<{ x: number; y: number }> = [];
    const point = (event: PointerEvent) => ({
      x: event.clientX + window.scrollX,
      y: event.clientY + window.scrollY,
    });
    const belongsToExtensionUi = (event: PointerEvent) =>
      event
        .composedPath()
        .some(
          (target) =>
            target instanceof Element &&
            (target.matches('.sniptale-app') || target.closest('.sniptale-app') !== null)
        );
    const down = (event: PointerEvent) => {
      if (belongsToExtensionUi(event)) return;
      pointerId = event.pointerId;
      path = [point(event)];
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    const move = (event: PointerEvent) => {
      if (pointerId !== event.pointerId) return;
      path.push(point(event));
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    const up = (event: PointerEvent) => {
      if (pointerId !== event.pointerId) return;
      path.push(point(event));
      owner.erasePath(path);
      pointerId = null;
      path = [];
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    document.addEventListener('pointerdown', down, true);
    document.addEventListener('pointermove', move, true);
    document.addEventListener('pointerup', up, true);
    return () => {
      document.removeEventListener('pointerdown', down, true);
      document.removeEventListener('pointermove', move, true);
      document.removeEventListener('pointerup', up, true);
    };
  }, [disabled, interactionMode, owner]);

  const activateNavigation = () => {
    props.owner.controller.finalizeInteraction();
    props.owner.controller.session.select(null);
    props.onInteractionModeChange('navigation');
  };
  const activateEraser = () => {
    props.owner.controller.finalizeInteraction();
    props.owner.controller.session.select(null);
    props.onInteractionModeChange('eraser');
  };
  const controlsOwner: ToolbarDrawingControlsOwner = {
    activeTool: isDrawingTool(props.interactionMode) ? props.interactionMode : null,
    persistOptionsDisclosure: true,
    tools: DRAWING_TOOLS,
    // Recording lifecycle transitions return interaction to Navigation. Keep
    // these meaningful actions mounted so the canonical shell does not resize.
    showActions: true,
    onToolActivated: props.onInteractionModeChange,
    renderLeadingControls: () => (
      <InteractionButton
        active={props.interactionMode === 'navigation'}
        dataUi="content.toolbar.video-recording.navigation"
        icon={Touchpad}
        label={translate('content.toolbar.recordingNavigation')}
        onClick={activateNavigation}
      />
    ),
    renderActions: (snapshot: DrawingSessionSnapshot) => (
      <>
        <AutoHideControl
          compactMenus={props.compactMenus}
          delay={props.owner.getAutoHideDelay()}
          displayMode={props.displayMode}
          onChange={(delay) => {
            void props.onAutoHideDelayChange?.(delay);
          }}
          {...(props.toolbarMenuState ? { toolbarMenuState: props.toolbarMenuState } : {})}
        />
        <InteractionButton
          active={props.interactionMode === 'eraser'}
          dataUi="content.toolbar.video-recording.eraser"
          icon={Eraser}
          label={translate('content.toolbar.recordingDrawingEraser')}
          onClick={activateEraser}
        />
        <ContentToolbarButton
          type="button"
          tone="danger"
          disabled={snapshot.document.objects.length === 0}
          aria-label={translate('content.toolbar.drawingClear')}
          title={translate('content.toolbar.drawingClear')}
          dataUi="content.toolbar.video-recording.clear"
          onClick={() => props.owner.controller.session.clear()}
        >
          <BrushCleaning size={18} strokeWidth={2} />
        </ContentToolbarButton>
        {props.actionTail}
      </>
    ),
  };
  return (
    <fieldset disabled={props.disabled} className="contents">
      <ToolbarDrawingControls
        controller={props.owner.controller}
        displayMode={props.displayMode}
        owner={controlsOwner}
      />
    </fieldset>
  );
}
