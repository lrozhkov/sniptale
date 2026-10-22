import {
  Check,
  ChevronDown,
  CircleDot,
  MousePointer2,
  MousePointerClick,
  SunDim,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_VIDEO_CURSOR_EFFECTS } from '@sniptale/runtime-contracts/video/types/types';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import {
  ProductToolbarMenu,
  ProductToolbarMenuItem,
  ProductToolbarMenuItemCopy,
} from '@sniptale/ui/product-menus/toolbar';
import { translate } from '../../../../platform/i18n';
import { resolveToolbarDropdownState, ToolbarMenuDropdown } from '../menu/dropdown';
import { useToolbarFloatingMenuDismissal } from '../menu/floating.helpers';
import { getToolbarMenuPosition } from '../menu/position';
import { useToolbarMenuDirection } from '../menu/direction';
import type { ToolbarMenuState } from '../state/menu';
import { RecordingCursorSettingsPanel, type RecordingCursorSettings } from './cursor-settings';

type VideoRecordingSpotlightSettings = RecordingCursorSettings;
type SpotlightToggleKey = 'cursorHaloEnabled' | 'cursorDimmingEnabled' | 'clickAnimationEnabled';

type RecordingSpotlightMenuProps = {
  compact: boolean;
  disabled: boolean;
  displayMode: 'horizontal' | 'vertical';
  settings: VideoRecordingSpotlightSettings;
  toolbarMenuState?: ToolbarMenuState;
  onChange(settings: VideoRecordingSpotlightSettings): Promise<void> | void;
};

const SPOTLIGHT_OPTIONS = [
  [
    'clickAnimationEnabled',
    MousePointerClick,
    'content.toolbar.videoRecordingClickAnimation',
    'click',
  ],
  ['cursorHaloEnabled', CircleDot, 'content.toolbar.videoRecordingCursorHalo', 'halo'],
  ['cursorDimmingEnabled', SunDim, 'content.toolbar.videoRecordingCursorDimming', 'dimming'],
] as const;

function SpotlightOptionItems(props: {
  disabled: boolean;
  settings: VideoRecordingSpotlightSettings;
  update(key: SpotlightToggleKey): void;
}) {
  return SPOTLIGHT_OPTIONS.map(([key, Icon, labelKey, dataSuffix]) => (
    <ProductToolbarMenuItem
      key={key}
      disabled={props.disabled}
      dataUi={`content.toolbar.video-recording.spotlight-${dataSuffix}`}
      selected={props.settings[key]}
      ariaPressed={props.settings[key]}
      onMouseDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        props.update(key);
      }}
    >
      <Icon size={18} />
      <ProductToolbarMenuItemCopy label={translate(labelKey)} />
      {props.settings[key] ? (
        <Check aria-hidden="true" className="h-4 w-4 text-[var(--sniptale-color-accent)]" />
      ) : null}
    </ProductToolbarMenuItem>
  ));
}

function useSpotlightMenuState(props: RecordingSpotlightMenuProps) {
  const [localOpen, setLocalOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const advancedTriggerRef = useRef<HTMLButtonElement>(null);
  const triggerGroupRef = useRef<HTMLDivElement>(null);
  const [advanced, setAdvanced] = useState(false);
  const open = props.toolbarMenuState
    ? props.toolbarMenuState.activeMenuType === 'recording-spotlight'
    : localOpen;
  const closeMenu = useCallback(() => {
    setDraftSettings(props.settings);
    if (props.toolbarMenuState) props.toolbarMenuState.closeMenu('recording-spotlight');
    else setLocalOpen(false);
    if (!props.toolbarMenuState)
      queueMicrotask(() => {
        triggerRef.current?.blur();
        advancedTriggerRef.current?.blur();
      });
  }, [props.toolbarMenuState, props.settings]);
  const [draftSettings, setDraftSettings] = useState(props.settings);
  const [updating, setUpdating] = useState(false);
  const pendingRef = useRef(false);
  const [failed, setFailed] = useState(false);
  const { clickAnimationEnabled, cursorDimmingEnabled, cursorHaloEnabled } = props.settings;
  const { haloSize, haloOpacity, dimmingRadius, dimmingOpacity, clickSize, clickDuration } =
    props.settings.cursorEffects ?? DEFAULT_VIDEO_CURSOR_EFFECTS;
  const {
    haloColor,
    dimmingColor,
    clickColor,
    clickEffect,
    clickEasing,
    clickStroke,
    clickPulses,
    haloStroke,
    haloGlow,
  } = props.settings.cursorEffects ?? {};
  const effects = useMemo(
    () => ({
      haloSize,
      haloOpacity,
      dimmingRadius,
      dimmingOpacity,
      clickSize,
      clickDuration,
      ...(haloColor ? { haloColor } : {}),
      ...(dimmingColor ? { dimmingColor } : {}),
      ...(clickColor ? { clickColor } : {}),
      ...(clickEffect !== undefined ? { clickEffect } : {}),
      ...(clickEasing !== undefined ? { clickEasing } : {}),
      ...(clickStroke !== undefined ? { clickStroke } : {}),
      ...(clickPulses !== undefined ? { clickPulses } : {}),
      ...(haloStroke !== undefined ? { haloStroke } : {}),
      ...(haloGlow !== undefined ? { haloGlow } : {}),
    }),
    [
      haloSize,
      haloOpacity,
      dimmingRadius,
      dimmingOpacity,
      clickSize,
      clickDuration,
      haloColor,
      dimmingColor,
      clickColor,
      clickEffect,
      clickEasing,
      clickStroke,
      clickPulses,
      haloStroke,
      haloGlow,
    ]
  );
  const hasEffects = props.settings.cursorEffects !== undefined;
  useEffect(
    () =>
      setDraftSettings({
        clickAnimationEnabled,
        cursorDimmingEnabled,
        cursorHaloEnabled,
        ...(hasEffects ? { cursorEffects: effects } : {}),
      }),
    [clickAnimationEnabled, cursorDimmingEnabled, cursorHaloEnabled, effects, hasEffects]
  );
  useToolbarFloatingMenuDismissal({
    menuRef,
    onClose: closeMenu,
    open,
    triggerRef: triggerGroupRef,
  });
  const save = async (next: VideoRecordingSpotlightSettings) => {
    if (pendingRef.current || props.disabled) return;
    pendingRef.current = true;
    const previous = props.settings;
    setDraftSettings(next);
    setUpdating(true);
    setFailed(false);
    try {
      await props.onChange(next);
    } catch {
      setDraftSettings(previous);
      setFailed(true);
    } finally {
      pendingRef.current = false;
      setUpdating(false);
    }
  };
  return {
    active:
      draftSettings.cursorHaloEnabled ||
      draftSettings.cursorDimmingEnabled ||
      draftSettings.clickAnimationEnabled,
    advanced,
    advancedTriggerRef,
    closeMenu,
    draftSettings,
    menuRef,
    open,
    failed,
    save,
    setAdvanced,
    setDraftSettings,
    setLocalOpen,
    triggerRef,
    triggerGroupRef,
    update: (key: SpotlightToggleKey) => save({ ...draftSettings, [key]: !draftSettings[key] }),
    updating,
  };
}

export function RecordingSpotlightMenu(props: RecordingSpotlightMenuProps) {
  const state = useSpotlightMenuState(props);
  const resolveLayout = (advanced = state.advanced) => {
    const dropdown = resolveToolbarDropdownState({
      anchorRef: advanced ? state.advancedTriggerRef : state.triggerRef,
      displayMode: props.displayMode,
      getMenuPosition: (ref, height = 280) => getToolbarMenuPosition(ref.current, height),
      menuHeight: advanced ? 420 : 190,
      menuWidth: advanced ? 440 : 280,
      preferredAlign: 'start',
    });
    return { placement: dropdown.menuPlacement, style: dropdown.style };
  };
  const dropdown = resolveLayout();
  const menuSide = useToolbarMenuDirection(() => resolveLayout(false));
  const advancedMenuSide = useToolbarMenuDirection(() => resolveLayout(true));
  const label = translate('content.toolbar.videoRecordingSpotlight');
  return (
    <div
      className="sniptale-split-action sniptale-full-page-wrapper sniptale-recording-media-control"
      ref={state.triggerGroupRef}
      role="group"
      aria-label={label}
      aria-busy={state.updating}
    >
      <ContentToolbarButton
        ref={state.triggerRef}
        data-menu-side={menuSide}
        active={state.active}
        tone="property"
        className="sniptale-split-action-start sniptale-full-page-primary"
        disabled={props.disabled}
        aria-expanded={state.open && !state.advanced}
        aria-haspopup="menu"
        dataUi="content.toolbar.video-recording.spotlight"
        title={label}
        onClick={() => {
          if (state.open && !state.advanced) {
            state.closeMenu();
          } else if (props.toolbarMenuState) {
            state.setAdvanced(false);
            if (!state.open) props.toolbarMenuState.toggleMenu('recording-spotlight');
          } else {
            state.setAdvanced(false);
            state.setLocalOpen(true);
          }
        }}
      >
        <MousePointer2 size={18} />
      </ContentToolbarButton>
      <ContentToolbarButton
        ref={state.advancedTriggerRef}
        tone="property"
        className="sniptale-split-action-end sniptale-full-page-chevron"
        title={translate('content.toolbar.cursorSettings')}
        disabled={props.disabled}
        aria-expanded={state.open && state.advanced}
        aria-haspopup="dialog"
        data-menu-open={state.open && state.advanced ? 'true' : 'false'}
        data-menu-side={advancedMenuSide}
        dataUi="content.toolbar.video-recording.cursor-settings"
        onClick={() => {
          if (state.open && state.advanced) state.closeMenu();
          else {
            state.setAdvanced(true);
            if (props.toolbarMenuState) {
              if (!state.open) props.toolbarMenuState.toggleMenu('recording-spotlight');
            } else state.setLocalOpen(true);
          }
        }}
      >
        <ChevronDown size={14} />
      </ContentToolbarButton>
      {state.open && dropdown.style ? (
        <ToolbarMenuDropdown
          dataUi="content.toolbar.video-recording.spotlight-menu"
          menuRef={state.menuRef}
        >
          <ProductToolbarMenu
            className="sniptale-content-menu-adopted"
            compact={props.compact}
            placement={dropdown.placement}
            style={{
              ...dropdown.style,
              ...(state.advanced
                ? {
                    width: 440,
                    maxWidth: 'calc(100vw - 16px)',
                    maxHeight: 'calc(100vh - 16px)',
                    overflowY: 'auto' as const,
                  }
                : {}),
            }}
            {...(state.advanced ? {} : { title: label })}
          >
            {state.advanced ? (
              <RecordingCursorSettingsPanel
                disabled={props.disabled}
                settings={state.draftSettings}
                onChange={(next) => void state.save(next)}
                onPreview={state.setDraftSettings}
                onClose={state.closeMenu}
              />
            ) : (
              <SpotlightOptionItems
                disabled={props.disabled}
                settings={state.draftSettings}
                update={(key) => void state.update(key)}
              />
            )}
            {state.failed ? (
              <p role="alert" className="px-2 py-1 text-[12px] text-[var(--sniptale-color-danger)]">
                {translate('content.toolbar.cursorEffectSaveFailed')}
              </p>
            ) : null}
          </ProductToolbarMenu>
        </ToolbarMenuDropdown>
      ) : null}
    </div>
  );
}
