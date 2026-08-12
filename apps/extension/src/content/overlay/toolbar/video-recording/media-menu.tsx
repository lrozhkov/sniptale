import { ChevronDown, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ContentToolbarButton, ContentToolbarGroup } from '@sniptale/ui/content-toolbar';
import {
  ProductToolbarMenu,
  ProductToolbarMenuItem,
  ProductToolbarMenuItemCopy,
} from '@sniptale/ui/product-menus/toolbar';

export function RecordingMediaSplitControl(props: {
  active: boolean;
  activeIcon: LucideIcon;
  disabled: boolean;
  inactiveIcon: LucideIcon;
  kind: MediaDeviceKind;
  label: string;
  selectedDeviceId: string | null;
  onDeviceChange?: (deviceId: string) => Promise<void> | void;
  onToggle(): Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const Icon = props.active ? props.activeIcon : props.inactiveIcon;
  const runToggle = async () => {
    setSwitching(true);
    setError(null);
    try {
      await props.onToggle();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSwitching(false);
    }
  };
  useEffect(() => {
    if (!open) return;
    void navigator.mediaDevices
      ?.enumerateDevices()
      .then((entries) => setDevices(entries.filter((entry) => entry.kind === props.kind)));
    const dismiss = (event: PointerEvent) => {
      if (!(event.target instanceof Node) || rootRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', dismiss, true);
    return () => document.removeEventListener('pointerdown', dismiss, true);
  }, [open, props.kind]);
  return (
    <div ref={rootRef} className="relative flex">
      <ContentToolbarGroup aria-label={props.label}>
        <ContentToolbarButton
          active={props.active}
          disabled={props.disabled || switching}
          title={props.label}
          onClick={() => void runToggle()}
        >
          <Icon size={18} />
        </ContentToolbarButton>
        <ContentToolbarButton
          disabled={props.disabled || switching}
          aria-expanded={open}
          aria-haspopup="menu"
          title={props.label}
          onClick={() => setOpen((value) => !value)}
        >
          <ChevronDown size={14} />
        </ContentToolbarButton>
      </ContentToolbarGroup>
      {open ? (
        <div
          style={{ position: 'absolute', top: 'calc(100% + 10px)', right: 0, zIndex: 2147483646 }}
        >
          <ProductToolbarMenu compact title={props.label} placement="down">
            {devices.map((device, index) => (
              <ProductToolbarMenuItem
                key={device.deviceId}
                selected={device.deviceId === props.selectedDeviceId}
                onClick={async () => {
                  setSwitching(true);
                  setError(null);
                  try {
                    await props.onDeviceChange?.(device.deviceId);
                    setOpen(false);
                  } catch (cause) {
                    setError(cause instanceof Error ? cause.message : String(cause));
                  } finally {
                    setSwitching(false);
                  }
                }}
              >
                <ProductToolbarMenuItemCopy label={device.label || `${props.label} ${index + 1}`} />
              </ProductToolbarMenuItem>
            ))}
          </ProductToolbarMenu>
        </div>
      ) : null}
      {error ? (
        <div
          role="alert"
          className={
            'absolute top-[calc(100%+10px)] right-0 max-w-56 rounded-md ' +
            'bg-[var(--sniptale-color-danger-subtle)] px-2 py-1 text-xs ' +
            'text-[var(--sniptale-color-danger)]'
          }
        >
          {error}
        </div>
      ) : null}
    </div>
  );
}
