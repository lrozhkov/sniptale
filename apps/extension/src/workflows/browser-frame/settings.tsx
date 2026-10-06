import { SegmentedRow, TextField } from '../../ui/compact-inspector-controls';
import { useEffect, useRef, useState } from 'react';
import { Globe, LoaderCircle } from 'lucide-react';
import { DEFAULT_WINDOW_HEADER, type WindowHeader } from '../../features/browser-frame/header';
import { translate, useAppLocale } from '../../platform/i18n';
import { acquireWindowHeaderFavicon } from './favicon';

interface WindowHeaderSettingsProps {
  header: WindowHeader | undefined;
  onChange: (header: WindowHeader | undefined) => void | Promise<void>;
  disabled?: boolean;
  allowNone?: boolean;
}

/** Explicit edit gestures own acquisition; mounting a saved project never performs network I/O. */
function useWindowHeaderEditing({ header, onChange, disabled = false }: WindowHeaderSettingsProps) {
  const latest = useRef(header);
  latest.current = header;
  const request = useRef<AbortController | null>(null);
  const requestAddress = useRef<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    if (
      request.current &&
      (header?.url !== requestAddress.current ||
        !header?.faviconEnabled ||
        header.kind !== 'browser')
    ) {
      request.current.abort();
      setBusy(false);
    }
  }, [header?.url, header?.faviconEnabled, header?.kind]);
  async function commit(next: WindowHeader | undefined) {
    latest.current = next;
    try {
      await onChange(next);
    } catch {
      setError(translate('windowHeader.updateFailed'));
    }
  }
  function patch(update: Partial<WindowHeader>) {
    if (disabled || !latest.current) return;
    void commit({ ...latest.current, ...update });
  }
  async function acquire(next: WindowHeader) {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    requestAddress.current = next.url;
    setBusy(true);
    setError(null);
    try {
      const icon = await acquireWindowHeaderFavicon(next.url, controller.signal);
      const current = latest.current;
      if (
        controller.signal.aborted ||
        !current ||
        !current.faviconEnabled ||
        current.url !== next.url ||
        current.kind !== 'browser'
      )
        return;
      if (icon) await commit({ ...current, faviconDataUrl: icon });
      else setError(translate('windowHeader.unavailable'));
    } catch {
      if (!controller.signal.aborted) setError(translate('windowHeader.unavailable'));
    } finally {
      if (request.current === controller) {
        request.current = null;
        setBusy(false);
      }
    }
  }
  function toggleFavicon() {
    if (!header || disabled) return;
    request.current?.abort();
    setError(null);
    const { faviconDataUrl: _icon, ...rest } = header;
    const next = { ...rest, faviconEnabled: !header.faviconEnabled };
    void commit(next).then(() => {
      if (next.faviconEnabled) void acquire(next);
    });
  }
  function changeKind(kind: 'none' | WindowHeader['kind']) {
    if (disabled) return;
    request.current?.abort();
    setError(null);
    void commit(
      kind === 'none' ? undefined : { ...(latest.current ?? DEFAULT_WINDOW_HEADER), kind }
    );
  }
  function changeAddress(value: string) {
    if (!header) return;
    request.current?.abort();
    const { faviconDataUrl: _icon, ...rest } = header;
    void commit({ ...rest, url: value.slice(0, 2048).replace(/[\uD800-\uDFFF]/gu, '') });
  }
  function acquireMissingFavicon() {
    const current = latest.current;
    if (current?.faviconEnabled && !current.faviconDataUrl) void acquire(current);
  }
  return { busy, error, patch, changeKind, changeAddress, acquireMissingFavicon, toggleFavicon };
}

/** Shared controls for explicit window-header edits in image and video editors. */
export function WindowHeaderSettings({
  header,
  onChange,
  disabled = false,
  allowNone = true,
}: WindowHeaderSettingsProps) {
  useAppLocale();
  const editing = useWindowHeaderEditing({ header, onChange, disabled });
  return (
    <fieldset disabled={disabled} className="min-w-0 space-y-3" data-ui="window-header-settings">
      <HeaderSegments<'none' | WindowHeader['kind']>
        label={translate('windowHeader.type')}
        value={header?.kind ?? 'none'}
        options={[
          ...(allowNone ? [{ id: 'none' as const, label: translate('windowHeader.none') }] : []),
          { id: 'browser', label: translate('windowHeader.browser') },
          { id: 'application', label: translate('windowHeader.application') },
        ]}
        onChange={editing.changeKind}
      />
      {header ? (
        <>
          <HeaderSegments
            label={translate('windowHeader.style')}
            value={header.style}
            options={[
              { id: 'windows', label: translate('windowHeader.windows') },
              { id: 'macos', label: translate('windowHeader.macos') },
              { id: 'linux', label: translate('windowHeader.linux') },
            ]}
            onChange={(style) => editing.patch({ style })}
          />
          <HeaderSegments
            label={translate('windowHeader.theme')}
            value={header.theme}
            options={[
              { id: 'light', label: translate('windowHeader.light') },
              { id: 'dark', label: translate('windowHeader.dark') },
            ]}
            onChange={(theme) => editing.patch({ theme })}
          />
          <TextField
            label={translate(
              header.kind === 'browser' ? 'windowHeader.tabTitle' : 'windowHeader.windowTitle'
            )}
            value={header.title}
            maxLength={512}
            onChange={(event) =>
              editing.patch({
                title: event.target.value.slice(0, 512).replace(/[\uD800-\uDFFF]/gu, ''),
              })
            }
          />
          {header.kind === 'browser' ? (
            <div className="flex min-w-0 items-end gap-1.5">
              <TextField
                label={translate('windowHeader.address')}
                value={header.url}
                maxLength={2048}
                placeholder="example.com"
                onChange={(event) => editing.changeAddress(event.target.value)}
                onBlur={editing.acquireMissingFavicon}
              />
              <button
                type="button"
                aria-label={translate('windowHeader.favicon')}
                title={translate(editing.busy ? 'windowHeader.loading' : 'windowHeader.favicon')}
                aria-pressed={header.faviconEnabled}
                onClick={editing.toggleFavicon}
                className={[
                  'flex h-[var(--sniptale-compact-control-height,32px)] w-8 shrink-0',
                  'items-center justify-center rounded-[6px] border',
                  'border-[color:var(--sniptale-color-border-soft)]',
                  'text-[color:var(--sniptale-color-text-secondary)]',
                  'hover:text-[color:var(--sniptale-color-text-primary)]',
                  'aria-pressed:text-[color:var(--sniptale-color-accent)]',
                  'focus-visible:outline focus-visible:outline-2',
                  'focus-visible:outline-[color:var(--sniptale-color-border-accent-strong)]',
                ].join(' ')}
              >
                {editing.busy ? (
                  <LoaderCircle size={16} className="animate-spin" />
                ) : (
                  <Globe size={16} />
                )}
              </button>
            </div>
          ) : null}
        </>
      ) : null}
      {editing.error ? (
        <p role="alert" className="text-xs text-[color:var(--sniptale-color-danger)]">
          {editing.error}
        </p>
      ) : null}
    </fieldset>
  );
}

function HeaderSegments<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { id: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="min-w-0 space-y-1.5">
      <span
        className={[
          'text-[length:var(--sniptale-compact-font-size,12px)] font-semibold',
          'text-[color:var(--sniptale-color-text-secondary)]',
        ].join(' ')}
      >
        {label}
      </span>
      <SegmentedRow
        columns={options.length === 2 ? 2 : 3}
        ariaLabel={label}
        value={value}
        options={options.map((option) => ({ value: option.id, label: option.label }))}
        onChange={onChange}
      />
    </div>
  );
}
