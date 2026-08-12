import { CircleDot, MousePointer2, MousePointerClick, SunDim } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ContentToolbarButton, ContentToolbarGroup } from '@sniptale/ui/content-toolbar';
import {
  ProductToolbarMenu,
  ProductToolbarMenuItem,
  ProductToolbarMenuItemCopy,
} from '@sniptale/ui/product-menus/toolbar';
import { translate } from '../../../../platform/i18n';
import { resolveToolbarDropdownState, ToolbarMenuDropdown } from '../menu/dropdown';
import { useToolbarFloatingMenuDismissal } from '../menu/floating.helpers';
import { getToolbarMenuPosition } from '../menu/position';
import type { ToolbarMenuState } from '../state/menu';

type VideoRecordingSpotlightSettings = {
  cursorHaloEnabled: boolean;
  cursorDimmingEnabled: boolean;
  clickAnimationEnabled: boolean;
};

type RecordingSpotlightMenuProps = {
  compact: boolean;
  disabled: boolean;
  displayMode: 'horizontal' | 'vertical';
  settings: VideoRecordingSpotlightSettings;
  toolbarMenuState?: ToolbarMenuState;
  onChange(settings: VideoRecordingSpotlightSettings): Promise<void> | void;
};

const SPOTLIGHT_OPTIONS = [
  ['cursorHaloEnabled', CircleDot, 'content.toolbar.videoRecordingCursorHalo', 'halo'],
  ['cursorDimmingEnabled', SunDim, 'content.toolbar.videoRecordingCursorDimming', 'dimming'],
  [
    'clickAnimationEnabled',
    MousePointerClick,
    'content.toolbar.videoRecordingClickAnimation',
    'click',
  ],
] as const;

function SpotlightOptionItems(props: {
  disabled: boolean;
  settings: VideoRecordingSpotlightSettings;
  update(key: keyof VideoRecordingSpotlightSettings): void;
}) {
  return SPOTLIGHT_OPTIONS.map(([key, Icon, labelKey, dataSuffix]) => (
    <ProductToolbarMenuItem
      key={key}
      disabled={props.disabled}
      dataUi={`content.toolbar.video-recording.spotlight-${dataSuffix}`}
      selected={props.settings[key]}
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
    </ProductToolbarMenuItem>
  ));
}

function useSpotlightMenuState(props: RecordingSpotlightMenuProps) {
  const [localOpen, setLocalOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const open = props.toolbarMenuState
    ? props.toolbarMenuState.activeMenuType === 'recording-spotlight'
    : localOpen;
  const closeMenu = useCallback(() => {
    if (props.toolbarMenuState) props.toolbarMenuState.closeMenu('recording-spotlight');
    else setLocalOpen(false);
    queueMicrotask(() => triggerRef.current?.blur());
  }, [props.toolbarMenuState]);
  const [draftSettings, setDraftSettings] = useState(props.settings);
  const [updating, setUpdating] = useState(false);
  const { clickAnimationEnabled, cursorDimmingEnabled, cursorHaloEnabled } = props.settings;
  useEffect(
    () => setDraftSettings({ clickAnimationEnabled, cursorDimmingEnabled, cursorHaloEnabled }),
    [clickAnimationEnabled, cursorDimmingEnabled, cursorHaloEnabled]
  );
  useToolbarFloatingMenuDismissal({ menuRef, onClose: closeMenu, open, triggerRef });
  const update = async (key: keyof VideoRecordingSpotlightSettings) => {
    if (updating) return;
    const previous = draftSettings;
    const next = { ...draftSettings, [key]: !draftSettings[key] };
    setDraftSettings(next);
    setUpdating(true);
    try {
      await props.onChange(next);
    } catch {
      setDraftSettings(previous);
    } finally {
      setUpdating(false);
    }
  };
  return {
    active: Object.values(draftSettings).some(Boolean),
    closeMenu,
    draftSettings,
    menuRef,
    open,
    setLocalOpen,
    triggerRef,
    update,
    updating,
  };
}

export function RecordingSpotlightMenu(props: RecordingSpotlightMenuProps) {
  const state = useSpotlightMenuState(props);
  const dropdown = resolveToolbarDropdownState({
    anchorRef: state.triggerRef,
    displayMode: props.displayMode,
    getMenuPosition: (ref, height = 280) => getToolbarMenuPosition(ref.current, height),
    menuHeight: 190,
    menuWidth: 280,
    preferredAlign: 'start',
  });
  const label = translate('content.toolbar.videoRecordingSpotlight');
  return (
    <div className="relative flex">
      <ContentToolbarGroup aria-label={label}>
        <ContentToolbarButton
          ref={state.triggerRef}
          active={state.active}
          disabled={props.disabled}
          aria-expanded={state.open}
          aria-haspopup="menu"
          dataUi="content.toolbar.video-recording.spotlight"
          menuIndicator
          title={label}
          onClick={() => {
            if (state.open) {
              state.closeMenu();
            } else if (props.toolbarMenuState) {
              props.toolbarMenuState.toggleMenu('recording-spotlight');
            } else {
              state.setLocalOpen(true);
            }
          }}
        >
          <MousePointer2 size={18} />
        </ContentToolbarButton>
      </ContentToolbarGroup>
      {state.open && dropdown.style ? (
        <ToolbarMenuDropdown
          dataUi="content.toolbar.video-recording.spotlight-menu"
          menuRef={state.menuRef}
        >
          <ProductToolbarMenu
            compact={props.compact}
            placement={dropdown.menuPlacement}
            style={dropdown.style}
            title={label}
          >
            <SpotlightOptionItems
              disabled={state.updating}
              settings={state.draftSettings}
              update={(key) => void state.update(key)}
            />
          </ProductToolbarMenu>
        </ToolbarMenuDropdown>
      ) : null}
    </div>
  );
}
