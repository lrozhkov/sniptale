import {
  BroomSparkles,
  BrushCleaning,
  Check,
  Eraser,
  Touchpad,
  type LucideIcon,
} from 'lucide-react';
import { useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { ContentToolbarButton, ContentToolbarDelayIndicator } from '@sniptale/ui/content-toolbar';
import {
  ProductToolbarMenu,
  ProductToolbarMenuItem,
  ProductToolbarMenuItemCopy,
} from '@sniptale/ui/product-menus/toolbar';
import {
  resolveDrawingToolCursor,
  type DrawingSessionSnapshot,
  type DrawingTool,
} from '../../../../features/drawing/public';
import { translate } from '../../../../platform/i18n';
import { ToolbarDrawingControls, type ToolbarDrawingControlsOwner } from '../controls/drawing';
import { resolveToolbarDropdownState, ToolbarMenuDropdown } from '../menu/dropdown';
import { useToolbarFloatingMenuDismissal } from '../menu/floating.helpers';
import { getToolbarMenuPosition } from '../menu/position';
import { useToolbarMenuDirection } from '../menu/direction';
import {
  RECORDING_DRAWING_AUTO_HIDE_DELAYS,
  type RecordingDrawingAutoHideDelay,
  type RecordingDrawingOwner,
} from './drawing-session';
import type { ToolbarMenuState } from '../state/menu';
import { RecordingToolbarControlsContext } from '../state/recording-controls';
import { RecordingControlVisibility } from './control-visibility';

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
      data-content-tool="true"
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
    if (!props.toolbarMenuState) queueMicrotask(() => triggerRef.current?.blur());
  }, [props.toolbarMenuState]);
  useToolbarFloatingMenuDismissal({
    menuRef,
    onClose: closeMenu,
    open,
    triggerRef,
  });
  const resolveLayout = () => {
    const dropdown = resolveToolbarDropdownState({
      anchorRef: triggerRef,
      displayMode: props.displayMode,
      getMenuPosition: (ref, height = 280) => getToolbarMenuPosition(ref.current, height),
      menuHeight: 280,
      menuWidth: 220,
      preferredAlign: 'end',
    });
    return { placement: dropdown.menuPlacement, style: dropdown.style };
  };
  const dropdown = resolveLayout();
  const menuSide = useToolbarMenuDirection(resolveLayout);
  const label = translate('content.toolbar.recordingDrawingAutoHide');
  const valueLabel =
    props.delay > 0
      ? `${props.delay} ${translate('content.toolbar.recordingDrawingAutoHideSeconds')}`
      : translate('content.toolbar.recordingDrawingAutoHideOff');
  const triggerLabel = `${label}: ${valueLabel}`;
  return (
    <div className="relative flex">
      <ContentToolbarButton
        ref={triggerRef}
        data-menu-side={menuSide}
        type="button"
        active={props.delay > 0}
        tone="property"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={triggerLabel}
        title={triggerLabel}
        dataUi="content.toolbar.video-recording.auto-hide"
        style={{ padding: 0 }}
        menuIndicator={props.delay === 0}
        onClick={() => {
          if (open) closeMenu();
          else if (props.toolbarMenuState) props.toolbarMenuState.toggleMenu('recording-auto-hide');
          else setLocalOpen(true);
        }}
      >
        <ContentToolbarDelayIndicator
          value={props.delay}
          dataUi="content.toolbar.video-recording.auto-hide-value"
        >
          <BroomSparkles size={18} />
        </ContentToolbarDelayIndicator>
      </ContentToolbarButton>
      {open && dropdown.style ? (
        <ToolbarMenuDropdown
          dataUi="content.toolbar.video-recording.auto-hide-menu"
          menuRef={menuRef}
        >
          <ProductToolbarMenu
            className="sniptale-content-menu-adopted"
            compact={props.compactMenus}
            placement={dropdown.placement}
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
                {props.delay === delay ? (
                  <Check
                    aria-hidden="true"
                    className="h-4 w-4 text-[var(--sniptale-color-accent)]"
                  />
                ) : null}
              </ProductToolbarMenuItem>
            ))}
          </ProductToolbarMenu>
        </ToolbarMenuDropdown>
      ) : null}
    </div>
  );
}

function useRecordingEraser(
  owner: RecordingDrawingOwner,
  interactionMode: RecordingDrawingInteractionMode,
  disabled: boolean | undefined
) {
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
  const visibility = useContext(RecordingToolbarControlsContext);
  useRecordingEraser(props.owner, props.interactionMode, props.disabled);

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
    showActions:
      !visibility?.active ||
      (['eraser', 'clear', 'cursor'] as const).some(
        (control) => visibility.controls[control] !== false
      ),
    onToolActivated: props.onInteractionModeChange,
    renderToolControl: ({ tool, control, icon, label }) => (
      <RecordingControlVisibility control={tool} icon={icon} label={label}>
        {control}
      </RecordingControlVisibility>
    ),
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
        {!visibility?.active ? (
          <fieldset disabled={visibility?.editing} className="contents">
            <AutoHideControl
              compactMenus={props.compactMenus}
              delay={props.owner.getAutoHideDelay()}
              displayMode={props.displayMode}
              onChange={(delay) => {
                void props.onAutoHideDelayChange?.(delay);
              }}
              {...(props.toolbarMenuState ? { toolbarMenuState: props.toolbarMenuState } : {})}
            />
          </fieldset>
        ) : null}
        <RecordingControlVisibility
          control="eraser"
          icon={Eraser}
          label={translate('content.toolbar.recordingDrawingEraser')}
        >
          <InteractionButton
            active={props.interactionMode === 'eraser'}
            dataUi="content.toolbar.video-recording.eraser"
            icon={Eraser}
            label={translate('content.toolbar.recordingDrawingEraser')}
            onClick={activateEraser}
          />
        </RecordingControlVisibility>
        <RecordingControlVisibility
          control="clear"
          icon={BrushCleaning}
          label={translate('content.toolbar.drawingClear')}
        >
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
        </RecordingControlVisibility>
        {props.actionTail}
      </>
    ),
  };
  return (
    <fieldset disabled={props.disabled} className="contents">
      {!props.disabled && props.interactionMode === 'eraser' ? (
        <style data-ui="content.toolbar.video-recording.eraser-cursor">
          {`.sniptale-drawing-canvas[tabindex="0"] { cursor: ${resolveDrawingToolCursor('eraser')} !important; }`}
        </style>
      ) : null}
      <ToolbarDrawingControls
        controller={props.owner.controller}
        displayMode={props.displayMode}
        owner={controlsOwner}
      />
    </fieldset>
  );
}
