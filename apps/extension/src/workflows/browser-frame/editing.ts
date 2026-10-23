import { useEffect, useRef, useState } from 'react';
import {
  DEFAULT_WINDOW_HEADER,
  type WindowHeader,
} from '@sniptale/runtime-contracts/window-header';
import { translate } from '../../platform/i18n';
import { acquireWindowHeaderFavicon } from './favicon';
import { importWindowHeaderIcon } from './local-icon';

type Source = 'site' | 'file';
export interface WindowHeaderSettingsProps {
  header: WindowHeader | undefined;
  rememberedHeader?: WindowHeader | undefined;
  onChange: (header: WindowHeader | undefined) => void | Promise<void>;
  disabled?: boolean;
  allowNone?: boolean;
}
interface IconRequest {
  controller: AbortController;
  header: WindowHeader;
  source: Source;
}

function sameIconTarget(current: WindowHeader | undefined, job: IconRequest): boolean {
  return (
    current?.kind === 'browser' &&
    current.faviconEnabled === job.header.faviconEnabled &&
    current.faviconSource === job.header.faviconSource &&
    current.faviconDataUrl === job.header.faviconDataUrl &&
    (job.source === 'file' || current.url === job.header.url)
  );
}
function withoutIcon(header: WindowHeader): WindowHeader {
  const { faviconSource: _source, faviconDataUrl: _icon, ...rest } = header;
  return { ...rest, faviconEnabled: false };
}

/** Icon acquisition has one cancellation owner; an accepted edit merges into the latest title/style. */
async function acquireIcon(
  job: IconRequest,
  current: () => WindowHeader | undefined,
  commit: WindowHeaderSettingsProps['onChange'],
  file?: File
) {
  const icon = file
    ? await importWindowHeaderIcon(file, job.controller.signal)
    : await acquireWindowHeaderFavicon(job.header.url, job.controller.signal);
  const header = current();
  if (job.controller.signal.aborted || !header || !sameIconTarget(header, job)) return true;
  if (!icon) return false;
  await commit({
    ...header,
    faviconEnabled: true,
    faviconSource: job.source,
    faviconDataUrl: icon,
  });
  return true;
}

function needsWebsiteIcon(header: WindowHeader | undefined): boolean {
  return !!(
    header?.kind === 'browser' &&
    header.faviconEnabled &&
    header.faviconSource !== 'file' &&
    !header.faviconDataUrl
  );
}

/** Mounting persisted settings is offline; only explicit gestures acquire an icon. */
export function useWindowHeaderEditing({
  header,
  rememberedHeader,
  onChange,
  disabled = false,
}: WindowHeaderSettingsProps) {
  const latest = useRef(header);
  latest.current = header;
  const request = useRef<IconRequest | null>(null);
  const generation = useRef(0);
  const active = useRef(true);
  const [busy, setBusy] = useState<Source | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cancel = () => {
    generation.current++;
    request.current?.controller.abort();
    request.current = null;
    setBusy(null);
  };
  useEffect(() => {
    const lifecycleGeneration = generation;
    active.current = true;
    return () => {
      active.current = false;
      lifecycleGeneration.current++;
      request.current?.controller.abort();
    };
  }, []);
  useEffect(() => {
    if (request.current && (disabled || !sameIconTarget(header, request.current))) cancel();
  }, [disabled, header]);
  async function commit(next: WindowHeader | undefined) {
    latest.current = next;
    try {
      await onChange(next);
      return active.current;
    } catch {
      if (active.current) setError(translate('windowHeader.updateFailed'));
      return false;
    }
  }
  async function acquire(source: Source, file?: File) {
    const current = latest.current;
    if (!active.current || disabled || current?.kind !== 'browser') return;
    cancel();
    const job: IconRequest = { controller: new AbortController(), header: current, source };
    request.current = job;
    setBusy(source);
    setError(null);
    try {
      const found = await acquireIcon(
        job,
        () => latest.current,
        async (next) => {
          await commit(next);
        },
        file
      );
      if (!found && !job.controller.signal.aborted)
        setError(
          translate(source === 'file' ? 'windowHeader.fileUnavailable' : 'windowHeader.unavailable')
        );
    } catch {
      if (!job.controller.signal.aborted)
        setError(
          translate(source === 'file' ? 'windowHeader.fileUnavailable' : 'windowHeader.unavailable')
        );
    } finally {
      if (request.current === job && active.current) {
        request.current = null;
        setBusy(null);
      }
    }
  }
  function patch(update: Partial<WindowHeader>) {
    if (!disabled && latest.current) void commit({ ...latest.current, ...update });
  }
  function toggleFavicon() {
    const current = latest.current;
    if (!current || disabled) return;
    cancel();
    setError(null);
    const stamp = generation.current;
    const enabled = !(current.faviconEnabled && current.faviconSource !== 'file');
    const next = { ...withoutIcon(current), faviconEnabled: enabled };
    void commit(next).then((applied) => {
      if (applied && enabled && generation.current === stamp) void acquire('site');
    });
  }
  function clearFile() {
    if (!latest.current || disabled) return;
    cancel();
    setError(null);
    void commit(withoutIcon(latest.current));
  }
  function changeKind(kind: 'none' | WindowHeader['kind']) {
    if (disabled) return;
    cancel();
    setError(null);
    void commit(
      kind === 'none'
        ? undefined
        : { ...(latest.current ?? rememberedHeader ?? DEFAULT_WINDOW_HEADER), kind }
    );
  }
  async function changeAddress(url: string) {
    const current = latest.current;
    if (!current || disabled) return;
    if (current.faviconSource === 'file') {
      await commit({ ...current, url });
      return;
    }
    cancel();
    const stamp = generation.current;
    const { faviconDataUrl: _icon, ...rest } = current;
    if (
      (await commit({ ...rest, url })) &&
      stamp === generation.current &&
      needsWebsiteIcon(latest.current)
    )
      void acquire('site');
  }
  return {
    busy,
    error,
    patch,
    changeKind,
    changeAddress,
    toggleFavicon,
    clearFile,
    loadFile: (file: File) => acquire('file', file),
  };
}
