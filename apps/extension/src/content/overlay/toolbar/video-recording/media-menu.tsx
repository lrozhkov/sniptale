import { ChevronDown, type LucideIcon } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ProductToolbarMenu,
  ProductToolbarMenuItem,
  ProductToolbarMenuItemCopy,
} from '@sniptale/ui/product-menus/toolbar';
import type { VideoRecordingMediaDevice } from '@sniptale/runtime-contracts/video/types/messages.surface';
import { resolveToolbarDropdownState, ToolbarMenuDropdown } from '../menu/dropdown';
import { useToolbarFloatingMenuDismissal } from '../menu/floating.helpers';
import { getToolbarMenuPosition } from '../menu/position';
import type { ToolbarMenuState, ToolbarPopoverMenu } from '../state/menu';
import { translate } from '../../../../platform/i18n';

type RecordingMediaSplitControlProps = {
  active: boolean;
  activeIcon: LucideIcon;
  disabled: boolean;
  inactiveIcon: LucideIcon;
  kind: MediaDeviceKind;
  dataUi: string;
  displayMode: 'horizontal' | 'vertical';
  label: string;
  selectedDeviceId: string | null;
  menuType?: Extract<ToolbarPopoverMenu, 'recording-camera' | 'recording-microphone'>;
  toolbarMenuState?: ToolbarMenuState;
  onLoadDevices?: () => Promise<VideoRecordingMediaDevice[]>;
  onDeviceChange?: (deviceId: string) => Promise<void> | void;
  onToggle(): Promise<void> | void;
};

function useRecordingMediaControl(props: RecordingMediaSplitControlProps) {
  const { kind, menuType, onLoadDevices, toolbarMenuState } = props;
  const [localOpen, setLocalOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const open =
    toolbarMenuState && menuType ? toolbarMenuState.activeMenuType === menuType : localOpen;
  const closeMenu = useCallback(() => {
    if (toolbarMenuState && menuType) toolbarMenuState.closeMenu(menuType);
    else setLocalOpen(false);
    queueMicrotask(() => triggerRef.current?.blur());
  }, [menuType, toolbarMenuState]);
  const [devices, setDevices] = useState<VideoRecordingMediaDevice[]>([]);
  const [loading, setLoading] = useState(false);
  const [showLoading, setShowLoading] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const runToggle = async () => {
    setSwitching(true);
    setError(null);
    try {
      await props.onToggle();
    } catch {
      setError(translate('content.toolbar.unknownError'));
    } finally {
      setSwitching(false);
    }
  };
  useEffect(() => {
    if (!open) return;
    let active = true;
    const loadingDelay = window.setTimeout(() => {
      if (active) setShowLoading(true);
    }, 500);
    setError(null);
    setLoading(true);
    setShowLoading(false);
    void Promise.resolve(onLoadDevices ? onLoadDevices() : [])
      .then((entries) => {
        if (active) {
          window.clearTimeout(loadingDelay);
          setDevices(entries.filter((entry) => entry.kind === kind));
          setLoading(false);
          setShowLoading(false);
        }
      })
      .catch(() => {
        if (active) {
          window.clearTimeout(loadingDelay);
          setError(translate('content.toolbar.unknownError'));
          setLoading(false);
          setShowLoading(false);
        }
      });
    return () => {
      active = false;
      window.clearTimeout(loadingDelay);
    };
  }, [kind, onLoadDevices, open]);
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
    menuHeight: Math.max(96, devices.length * 48 + 48),
    menuWidth: 260,
    preferredAlign: 'end',
  });
  const toggleMenu = () => {
    if (open) {
      closeMenu();
    } else if (toolbarMenuState && menuType) {
      toolbarMenuState.toggleMenu(menuType);
    } else {
      setLocalOpen(true);
    }
  };
  const selectDevice = async (deviceId: string) => {
    setSwitching(true);
    setError(null);
    try {
      await props.onDeviceChange?.(deviceId);
      closeMenu();
    } catch {
      setError(translate('content.toolbar.unknownError'));
    } finally {
      setSwitching(false);
    }
  };
  return {
    closeMenu,
    devices,
    dropdown,
    error,
    loading,
    showLoading,
    menuRef,
    open,
    runToggle,
    selectDevice,
    switching,
    toggleMenu,
    triggerRef,
  };
}

function RecordingMediaDeviceMenu(props: {
  control: ReturnType<typeof useRecordingMediaControl>;
  dataUi: string;
  label: string;
  selectedDeviceId: string | null;
}) {
  const { control } = props;
  if (!control.open || !control.dropdown.style) return null;
  return (
    <ToolbarMenuDropdown dataUi={`${props.dataUi}.dropdown`} menuRef={control.menuRef}>
      <ProductToolbarMenu
        compact
        title={props.label}
        placement={control.dropdown.menuPlacement}
        style={control.dropdown.style}
      >
        {control.showLoading && control.devices.length === 0 ? (
          <ProductToolbarMenuItem disabled>
            <ProductToolbarMenuItemCopy
              label={translate('content.toolbar.videoRecordingDevicesLoading')}
            />
          </ProductToolbarMenuItem>
        ) : null}
        {!control.loading && control.devices.length === 0 ? (
          <ProductToolbarMenuItem disabled>
            <ProductToolbarMenuItemCopy
              label={translate('content.toolbar.videoRecordingDevicesEmpty')}
            />
          </ProductToolbarMenuItem>
        ) : null}
        {control.devices.map((device, index) => (
          <ProductToolbarMenuItem
            key={device.deviceId}
            selected={device.deviceId === props.selectedDeviceId}
            onMouseDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onClick={() => void control.selectDevice(device.deviceId)}
          >
            <ProductToolbarMenuItemCopy label={device.label || `${props.label} ${index + 1}`} />
          </ProductToolbarMenuItem>
        ))}
      </ProductToolbarMenu>
    </ToolbarMenuDropdown>
  );
}

export function RecordingMediaSplitControl(props: RecordingMediaSplitControlProps) {
  const control = useRecordingMediaControl(props);
  const Icon = props.active ? props.activeIcon : props.inactiveIcon;
  return (
    <div
      className="sniptale-split-action sniptale-full-page-wrapper"
      data-active={props.active ? 'true' : 'false'}
    >
      <button
        className="sniptale-btn sniptale-toggle sniptale-split-action-start sniptale-full-page-primary"
        data-active={props.active ? 'true' : 'false'}
        disabled={props.disabled || control.switching}
        title={props.label}
        data-ui={`${props.dataUi}.toggle`}
        onClick={() => void control.runToggle()}
      >
        <Icon size={18} />
      </button>
      <button
        ref={control.triggerRef}
        className="sniptale-btn sniptale-split-action-end sniptale-full-page-chevron"
        disabled={props.disabled || control.switching}
        aria-expanded={control.open}
        aria-haspopup="menu"
        title={props.label}
        data-menu-open={control.open ? 'true' : 'false'}
        data-ui={`${props.dataUi}.menu`}
        onClick={(event) => {
          event.stopPropagation();
          control.toggleMenu();
        }}
      >
        <ChevronDown size={14} />
      </button>
      <RecordingMediaDeviceMenu
        control={control}
        dataUi={props.dataUi}
        label={props.label}
        selectedDeviceId={props.selectedDeviceId}
      />
      {control.error ? (
        <div
          role="alert"
          className={
            'absolute top-[calc(100%+10px)] right-0 max-w-56 rounded-md ' +
            'bg-[var(--sniptale-color-danger-subtle)] px-2 py-1 text-xs ' +
            'text-[var(--sniptale-color-danger)]'
          }
        >
          {control.error}
        </div>
      ) : null}
    </div>
  );
}
