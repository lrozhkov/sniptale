import { useEffect, useRef, useState } from 'react';
import { FolderOpen, Library } from 'lucide-react';
import { translate } from '../../platform/i18n';
import { BackgroundThumbnails } from '../../ui/background-thumbnails';
import {
  BACKGROUND_IMAGE_ACCEPT,
  prepareBackgroundImage,
} from '../../workflows/background-images/intake';
import { useBackgroundCatalog } from './catalog';
import {
  readBundledBackground,
  readLibraryBackground,
  type AcquiredBackground,
} from './acquisition';
import { BackgroundLibraryDrawer, BackgroundLibraryThumbnail } from './library';

export const backgroundActionClassName = [
  'flex min-h-8 min-w-0 items-center justify-center gap-2 rounded border px-2 text-xs',
  'border-[var(--sniptale-color-border-subtle)] text-[var(--sniptale-color-text-secondary)]',
  'hover:bg-[var(--sniptale-color-surface-hover)] disabled:opacity-50',
].join(' ');

/** Acquisition lifecycle is disposable; the receiving editor owns placement and history. */
export function BackgroundImagePicker(props: {
  onSelect(image: AcquiredBackground, signal: AbortSignal): Promise<void> | void;
  showPresets?: boolean;
}) {
  const catalog = useBackgroundCatalog();
  const [anchor, setAnchor] = useState<HTMLDivElement | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const running = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [library, setLibrary] = useState(false);
  const [selected, setSelected] = useState<string>();
  useEffect(() => () => running.current?.abort(), []);
  const run = async (
    acquire: (signal: AbortSignal) => Promise<AcquiredBackground>,
    id?: string
  ) => {
    if (running.current) return;
    const controller = new AbortController();
    running.current = controller;
    setBusy(true);
    setFailed(false);
    try {
      const result = await acquire(controller.signal);
      controller.signal.throwIfAborted();
      await props.onSelect(result, controller.signal);
      if (!controller.signal.aborted) {
        setSelected(id);
        setLibrary(false);
      }
    } catch {
      if (!controller.signal.aborted) setFailed(true);
    } finally {
      if (running.current === controller) running.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  };
  return (
    <div ref={setAnchor} className="space-y-2" data-ui="background.image.picker">
      {props.showPresets !== false && (
        <BackgroundThumbnails
          label={translate('settings.editor.backgrounds.title')}
          disabled={busy}
          items={catalog.presets
            .filter((item) => item.enabled && item.available)
            .map((item) => ({
              id: item.id,
              name: item.name,
              active: item.id === selected,
              content: item.url ? (
                <img src={item.url} alt="" className="h-full w-full object-cover" />
              ) : item.mediaId ? (
                <BackgroundLibraryThumbnail mediaId={item.mediaId} />
              ) : undefined,
            }))}
          onSelect={(id) => {
            const item = catalog.presets.find((item) => item.id === id);
            if (item)
              void run(
                (signal) =>
                  item.mediaId
                    ? readLibraryBackground(item.mediaId, signal)
                    : readBundledBackground(id, signal),
                id
              );
          }}
        />
      )}
      <input
        ref={input}
        type="file"
        accept={BACKGROUND_IMAGE_ACCEPT}
        hidden
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          if (file)
            void run(async (signal) => ({ file: await prepareBackgroundImage(file, signal) }));
        }}
      />
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          className={backgroundActionClassName}
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          <FolderOpen size={14} />
          {translate('settings.editor.backgrounds.upload')}
        </button>
        <button
          type="button"
          className={backgroundActionClassName}
          disabled={busy}
          onClick={() => setLibrary(true)}
        >
          <Library size={14} />
          {translate('settings.editor.backgrounds.library')}
        </button>
      </div>
      {(failed || catalog.status === 'failed') && (
        <p role="alert" className="text-xs text-[var(--sniptale-color-text-secondary)]">
          {translate('settings.editor.backgrounds.failed')}
        </p>
      )}
      {library && (
        <BackgroundLibraryDrawer
          anchor={anchor}
          busy={busy}
          onClose={() => {
            running.current?.abort();
            running.current = null;
            setBusy(false);
            setLibrary(false);
          }}
          onSelect={(id) => void run((signal) => readLibraryBackground(id, signal), id)}
        />
      )}
    </div>
  );
}
