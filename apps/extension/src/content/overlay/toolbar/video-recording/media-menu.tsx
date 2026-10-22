import { ChevronDown, type LucideIcon } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { SegmentedSwitch } from '@sniptale/ui/segmented-switch';
import { WebcamPresentationMode } from '@sniptale/runtime-contracts/video/types/types';
import {
  ProductToolbarMenu,
  ProductToolbarMenuItem,
  ProductToolbarMenuItemCopy,
  ProductToolbarMenuDivider,
  ProductToolbarMenuGroupLabel,
} from '@sniptale/ui/product-menus/toolbar';
import type { VideoRecordingMediaDevice } from '@sniptale/runtime-contracts/video/types/messages.surface';
import { resolveToolbarDropdownState, ToolbarMenuDropdown } from '../menu/dropdown';
import { useToolbarFloatingMenuDismissal } from '../menu/floating.helpers';
import { getToolbarMenuPosition } from '../menu/position';
import { useToolbarMenuDirection } from '../menu/direction';
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
  onLoadDevices?: (requestPermission?: boolean) => Promise<VideoRecordingMediaDevice[]>;
  onDeviceChange?: (deviceId: string) => Promise<void> | void;
  cameraPlacement?: {
    mode: WebcamPresentationMode;
    locked: boolean;
    onChange: (mode: WebcamPresentationMode) => Promise<void> | void;
  };
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
    if (!toolbarMenuState || !menuType) queueMicrotask(() => triggerRef.current?.blur());
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
    let sequence = 0;
    const loadingDelay = window.setTimeout(() => {
      if (active) setShowLoading(true);
    }, 500);
    setError(null);
    setLoading(true);
    setShowLoading(false);
    const load = (requestPermission: boolean) => {
      const request = ++sequence;
      void Promise.resolve(onLoadDevices ? onLoadDevices(requestPermission) : [])
        .then((entries) => {
          if (active && request === sequence) {
            window.clearTimeout(loadingDelay);
            setDevices(
              entries.filter((entry) => entry.kind === kind && entry.deviceId && entry.label.trim())
            );
            setLoading(false);
            setShowLoading(false);
          }
        })
        .catch(() => {
          if (active && request === sequence) {
            window.clearTimeout(loadingDelay);
            setError(translate('content.toolbar.unknownError'));
            setLoading(false);
            setShowLoading(false);
          }
        });
    };
    load(true);
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
  const resolveLayout = () => {
    const dropdown = resolveToolbarDropdownState({
      anchorRef: triggerRef,
      displayMode: props.displayMode,
      getMenuPosition: (ref, height = 280) => getToolbarMenuPosition(ref.current, height),
      menuHeight: Math.max(96, devices.length * 48 + 48) + (props.cameraPlacement ? 72 : 0),
      menuWidth: props.cameraPlacement ? 280 : 260,
      preferredAlign: 'end',
    });
    return { placement: dropdown.menuPlacement, style: dropdown.style };
  };
  const dropdown = resolveLayout();
  const menuSide = useToolbarMenuDirection(resolveLayout);
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
  const selectPlacement = async (mode: WebcamPresentationMode) => {
    if (
      !props.cameraPlacement ||
      props.cameraPlacement.locked ||
      switching ||
      mode === props.cameraPlacement.mode
    )
      return;
    setSwitching(true);
    setError(null);
    try {
      await props.cameraPlacement.onChange(mode);
    } catch {
      setError(translate('content.toolbar.videoRecordingActionFailed'));
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
    menuSide,
    open,
    runToggle,
    selectDevice,
    selectPlacement,
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
  cameraPlacement?: RecordingMediaSplitControlProps['cameraPlacement'];
}) {
  const { control } = props;
  if (!control.open || !control.dropdown.style) return null;
  return (
    <ToolbarMenuDropdown dataUi={`${props.dataUi}.dropdown`} menuRef={control.menuRef}>
      <ProductToolbarMenu
        className="sniptale-content-menu-adopted"
        variant={props.cameraPlacement ? 'capture' : 'default'}
        compact
        title={props.label}
        placement={control.dropdown.placement}
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
        {control.devices.map((device) => (
          <ProductToolbarMenuItem
            key={device.deviceId}
            selected={device.deviceId === props.selectedDeviceId}
            onMouseDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onClick={() => void control.selectDevice(device.deviceId)}
          >
            <ProductToolbarMenuItemCopy label={device.label} />
          </ProductToolbarMenuItem>
        ))}
        {props.cameraPlacement ? (
          <>
            <ProductToolbarMenuDivider />
            <ProductToolbarMenuGroupLabel>
              {translate('popup.video.webcamPresentationModeLabel')}
            </ProductToolbarMenuGroupLabel>
            <div className="px-1 pb-1" onMouseDown={(event) => event.preventDefault()}>
              <SegmentedSwitch
                activeId={props.cameraPlacement.mode}
                appearance="neutral"
                density="compact"
                ariaLabel={translate('popup.video.webcamPresentationModeLabel')}
                dataAttribute={{ 'data-ui': 'content.toolbar.video-recording.camera.placement' }}
                options={[
                  {
                    id: WebcamPresentationMode.EMBEDDED,
                    label: translate('popup.video.webcamPresentationEmbedded'),
                    disabled: props.cameraPlacement.locked || control.switching,
                  },
                  {
                    id: WebcamPresentationMode.SEPARATE_TRACK,
                    label: translate('popup.video.webcamPresentationSeparateTrack'),
                    disabled: props.cameraPlacement.locked || control.switching,
                  },
                ]}
                onChange={(mode) => void control.selectPlacement(mode)}
              />
            </div>
          </>
        ) : null}
      </ProductToolbarMenu>
    </ToolbarMenuDropdown>
  );
}

export function RecordingMediaSplitControl(props: RecordingMediaSplitControlProps) {
  const control = useRecordingMediaControl(props);
  const Icon = props.active ? props.activeIcon : props.inactiveIcon;
  return (
    <div className="sniptale-split-action sniptale-full-page-wrapper sniptale-recording-media-control">
      <ContentToolbarButton
        type="button"
        tone="property"
        className="sniptale-split-action-start sniptale-full-page-primary"
        active={props.active}
        aria-pressed={props.active}
        disabled={props.disabled || control.switching}
        title={props.label}
        dataUi={`${props.dataUi}.toggle`}
        onClick={() => void control.runToggle()}
      >
        <Icon size={18} />
      </ContentToolbarButton>
      <ContentToolbarButton
        type="button"
        tone="property"
        ref={control.triggerRef}
        className="sniptale-split-action-end sniptale-full-page-chevron"
        disabled={props.disabled || control.switching}
        aria-expanded={control.open}
        aria-haspopup="menu"
        title={props.label}
        data-menu-open={control.open ? 'true' : 'false'}
        data-menu-side={control.menuSide}
        dataUi={`${props.dataUi}.menu`}
        onClick={(event) => {
          event.stopPropagation();
          control.toggleMenu();
        }}
      >
        <ChevronDown size={14} />
      </ContentToolbarButton>
      <RecordingMediaDeviceMenu
        control={control}
        dataUi={props.dataUi}
        label={props.label}
        selectedDeviceId={props.selectedDeviceId}
        {...(props.cameraPlacement ? { cameraPlacement: props.cameraPlacement } : {})}
      />
      {control.error ? (
        <div
          role="alert"
          className={
            'absolute top-[calc(100%+10px)] right-0 max-w-56 rounded-[4px] select-text ' +
            'bg-[var(--sniptale-color-danger-subtle)] px-2 py-1 text-[14px] leading-5 font-normal ' +
            'text-[var(--sniptale-color-danger)]'
          }
        >
          {control.error}
        </div>
      ) : null}
    </div>
  );
}
