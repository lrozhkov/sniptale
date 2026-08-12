import { BrushCleaning, Clock3, Eraser, MousePointer2, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import {
  ProductToolbarMenu,
  ProductToolbarMenuItem,
  ProductToolbarMenuItemCopy,
} from '@sniptale/ui/product-menus/toolbar';
import type { DrawingSessionSnapshot, DrawingTool } from '../../../../features/drawing/public';
import { translate } from '../../../../platform/i18n';
import { ToolbarDrawingControls, type ToolbarDrawingControlsOwner } from '../controls/drawing';
import {
  RECORDING_DRAWING_AUTO_HIDE_DELAYS,
  type RecordingDrawingAutoHideDelay,
  type RecordingDrawingOwner,
} from './drawing-session';

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
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!menuRef.current?.contains(target) && !triggerRef.current?.contains(target))
        setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopImmediatePropagation();
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener('pointerdown', dismiss, true);
    document.addEventListener('keydown', escape, true);
    return () => {
      document.removeEventListener('pointerdown', dismiss, true);
      document.removeEventListener('keydown', escape, true);
    };
  }, [open]);
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
        onClick={() => setOpen((current) => !current)}
      >
        <Clock3 size={18} />
      </ContentToolbarButton>
      {open ? (
        <div
          ref={menuRef}
          data-ui="content.toolbar.video-recording.auto-hide-menu"
          style={
            props.displayMode === 'vertical'
              ? { position: 'absolute', left: 'calc(100% + 10px)', top: 0, zIndex: 2147483646 }
              : { position: 'absolute', left: 0, top: 'calc(100% + 10px)', zIndex: 2147483646 }
          }
        >
          <ProductToolbarMenu
            compact={props.compactMenus}
            placement={props.displayMode === 'vertical' ? 'side' : 'down'}
            title={label}
          >
            {RECORDING_DRAWING_AUTO_HIDE_DELAYS.map((delay) => (
              <ProductToolbarMenuItem
                key={delay}
                dataUi={`content.toolbar.video-recording.auto-hide-${delay}`}
                selected={props.delay === delay}
                onClick={(event) => {
                  event.stopPropagation();
                  props.onChange(delay);
                  setOpen(false);
                  triggerRef.current?.focus();
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
        </div>
      ) : null}
    </div>
  );
}

export function RecordingDrawingControls(props: {
  compactMenus: boolean;
  disabled?: boolean;
  displayMode: 'horizontal' | 'vertical';
  interactionMode: RecordingDrawingInteractionMode;
  owner: RecordingDrawingOwner;
  onInteractionModeChange(mode: RecordingDrawingInteractionMode): void;
}) {
  const { disabled, interactionMode, onInteractionModeChange, owner } = props;
  useEffect(() => {
    if (disabled || interactionMode === 'navigation') return;
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      owner.controller.finalizeInteraction();
      owner.controller.session.select(null);
      onInteractionModeChange('navigation');
    };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [disabled, interactionMode, onInteractionModeChange, owner]);

  useEffect(() => {
    if (disabled || interactionMode !== 'eraser') return;
    let pointerId: number | null = null;
    let path: Array<{ x: number; y: number }> = [];
    const point = (event: PointerEvent) => ({
      x: event.clientX + window.scrollX,
      y: event.clientY + window.scrollY,
    });
    const down = (event: PointerEvent) => {
      if ((event.target as Element | null)?.closest('.sniptale-app')) return;
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
    tools: DRAWING_TOOLS,
    showActions: props.interactionMode !== 'navigation',
    onToolActivated: props.onInteractionModeChange,
    renderLeadingControls: () => (
      <InteractionButton
        active={props.interactionMode === 'navigation'}
        dataUi="content.toolbar.video-recording.navigation"
        icon={MousePointer2}
        label={translate('content.toolbar.recordingNavigation')}
        onClick={activateNavigation}
      />
    ),
    renderTrailingControls: () => (
      <InteractionButton
        active={props.interactionMode === 'eraser'}
        dataUi="content.toolbar.video-recording.eraser"
        icon={Eraser}
        label={translate('content.toolbar.recordingDrawingEraser')}
        onClick={activateEraser}
      />
    ),
    renderActions: (snapshot: DrawingSessionSnapshot) => (
      <>
        <AutoHideControl
          compactMenus={props.compactMenus}
          delay={props.owner.getAutoHideDelay()}
          displayMode={props.displayMode}
          onChange={(delay) => props.owner.setAutoHideDelay(delay)}
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
