import { useContext, useEffect, useRef, useState } from 'react';
import { CommandPressScope, useCommandPress } from '@sniptale/ui/control-language/press';
import { useInspectorLayout } from '../../ui/compact-inspector-controls/layout';
import { FolderOpen, Library, LoaderCircle } from 'lucide-react';
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
  type BackgroundImagePreparation,
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
  /** Replaces default normalization, admitting original computer and Library bytes. */
  prepareImage?: BackgroundImagePreparation;
  onError?(error: unknown): void;
  showPresets?: boolean;
  pending?: boolean;
}) {
  const catalog = useBackgroundCatalog();
  const prepareImage = props.prepareImage ?? prepareBackgroundImage;
  const acquireLibrary = (id: string, signal: AbortSignal) =>
    props.prepareImage
      ? readLibraryBackground(id, signal, props.prepareImage)
      : readLibraryBackground(id, signal);
  const [anchor, setAnchor] = useState<HTMLDivElement | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const running = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingId, setPendingId] = useState<string>();
  const isBusy = busy || !!props.pending;
  const [failed, setFailed] = useState(false);
  const [library, setLibrary] = useState(false);
  const [selected, setSelected] = useState<string>();
  useEffect(() => () => running.current?.abort(), []);
  const run = async (
    acquire: (signal: AbortSignal) => Promise<AcquiredBackground>,
    id?: string
  ) => {
    if (running.current || props.pending) return;
    const controller = new AbortController();
    running.current = controller;
    setBusy(true);
    setPendingId(id);
    setFailed(false);
    try {
      const result = await acquire(controller.signal);
      controller.signal.throwIfAborted();
      await props.onSelect(result, controller.signal);
      if (!controller.signal.aborted) {
        setSelected(id);
        setLibrary(false);
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setFailed(true);
        props.onError?.(error);
      }
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
          disabled={isBusy}
          items={catalog.presets
            .filter((item) => item.enabled && item.available)
            .map((item) => ({
              id: item.id,
              name: item.name,
              active: item.id === selected,
              loading: isBusy && item.id === pendingId,
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
                    ? acquireLibrary(item.mediaId, signal)
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
          if (file) void run(async (signal) => ({ file: await prepareImage(file, signal) }));
        }}
      />
      <BackgroundAcquisitionCommands
        busy={isBusy}
        uploading={isBusy && pendingId === undefined}
        onUpload={() => input.current?.click()}
        onLibrary={() => setLibrary(true)}
      />
      {(failed || catalog.status === 'failed') && (
        <p role="alert" className="text-xs text-[var(--sniptale-color-text-secondary)]">
          {translate('settings.editor.backgrounds.failed')}
        </p>
      )}
      {library && (
        <BackgroundLibraryDrawer
          anchor={anchor}
          busy={isBusy}
          onClose={() => {
            running.current?.abort();
            running.current = null;
            setBusy(false);
            setLibrary(false);
          }}
          onSelect={(id) => void run((signal) => acquireLibrary(id, signal), id)}
        />
      )}
    </div>
  );
}

function BackgroundAcquisitionCommands(props: {
  busy: boolean;
  uploading: boolean;
  onUpload(): void;
  onLibrary(): void;
}) {
  const scoped = useContext(CommandPressScope);
  const inspector = useInspectorLayout();
  const uploadPress = useCommandPress({
    enabled: scoped,
    disabled: props.busy,
    onClick: props.onUpload,
  });
  const libraryPress = useCommandPress({
    enabled: scoped,
    disabled: props.busy,
    onClick: props.onLibrary,
  });
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        className={`${backgroundActionClassName} grow ${inspector ? 'text-[13px]!' : ''}`}
        disabled={props.busy}
        {...uploadPress.props}
        data-command-press={scoped ? '' : undefined}
        data-pressing={uploadPress.pressed ? 'true' : undefined}
      >
        <span className={scoped ? 'sniptale-command-content' : 'contents'}>
          {props.uploading ? (
            <LoaderCircle
              size={14}
              className="shrink-0 animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
          ) : (
            <FolderOpen size={14} className="shrink-0" aria-hidden="true" />
          )}
          <span className="min-w-0 whitespace-normal">
            {translate('settings.editor.backgrounds.upload')}
          </span>
        </span>
      </button>
      <button
        type="button"
        className={`${backgroundActionClassName} grow ${inspector ? 'text-[13px]!' : ''}`}
        disabled={props.busy}
        {...libraryPress.props}
        data-command-press={scoped ? '' : undefined}
        data-pressing={libraryPress.pressed ? 'true' : undefined}
      >
        <span className={scoped ? 'sniptale-command-content' : 'contents'}>
          <Library size={14} className="shrink-0" aria-hidden="true" />
          <span className="min-w-0 whitespace-normal">
            {translate('settings.editor.backgrounds.library')}
          </span>
        </span>
      </button>
    </div>
  );
}
