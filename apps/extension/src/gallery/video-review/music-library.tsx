import { MediaLibraryHeader } from '../../ui/media-library-header';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FolderOpen, Play, Square } from 'lucide-react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { ProductModal } from '@sniptale/ui/product-modal';
import {
  resolveThemeSafePortalTarget,
  useResolvedPortalTheme,
} from '@sniptale/ui/theme/safe-portal';
import type { MediaLibraryItem } from '../../composition/persistence/media-library/contracts';
import { formatDurationLabel } from '../../composition/audio-recording/format';
import { translate, useAppLocale } from '../../platform/i18n';
import { useMusicLibraryState } from './music-library-state';

/** Callbacks retain ownership of playback, durable insertion, cancellation and successful closure. */
export interface MusicLibraryDrawerProps {
  label?: string;
  anchor: HTMLElement | null;
  onClose(): void;
  onSelect(id: string): Promise<void>;
  onUpload(file: File): Promise<void>;
  onRetry?: (() => Promise<void>) | undefined;
  onPreview(id: string): Promise<void>;
  onStopPreview(): void;
  playingId: string | null;
  loadingId: string | null;
  error?: string | null;
  unavailable(item: MediaLibraryItem): string | null;
}

/** Native modal traps focus; its children use the existing product drawer and theme owners. */
export function MusicLibraryDrawer(props: MusicLibraryDrawerProps) {
  useAppLocale();
  const dialog = useRef<HTMLDialogElement>(null);
  const theme = useResolvedPortalTheme(props.anchor);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return createPortal(
    <dialog
      ref={dialog}
      data-theme={theme ?? undefined}
      aria-label={props.label ?? translate('gallery.videoReview.musicLibrary')}
      onCancel={(event) => {
        event.preventDefault();
        props.onClose();
      }}
      onKeyDown={(event) => event.stopPropagation()}
      onKeyUp={(event) => event.stopPropagation()}
      className={[
        'sniptale-compact-workspace m-0 h-screen max-h-none w-screen max-w-none border-0 bg-transparent p-0',
        'text-[var(--sniptale-color-text-primary)]',
      ].join(' ')}
    >
      <ProductModal
        onClose={props.onClose}
        width="max(960px, 80vw)"
        maxWidth="calc(100vw - 24px)"
        maxHeight="100vh"
        role="presentation"
        dialogClassName={[
          '!bottom-0 !left-0 !top-0 !h-screen !transform-none !rounded-none !border-l-0',
          '!bg-[color:rgb(from_var(--sniptale-color-surface-panel)_r_g_b_/_1)]',
        ].join(' ')}
      >
        <MusicLibraryContent {...props} />
      </ProductModal>
    </dialog>,
    resolveThemeSafePortalTarget(props.anchor)
  );
}

function MusicLibraryContent(props: MusicLibraryDrawerProps) {
  const state = useMusicLibraryState();
  const pending = useRef(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState(false);
  const run = async (id: string, action: () => Promise<void>) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(id);
    setFailure(false);
    props.onStopPreview();
    try {
      await action();
    } catch {
      setFailure(true);
    } finally {
      pending.current = false;
      setBusy(null);
    }
  };
  return (
    <div className="flex h-full min-h-0 flex-col" data-ui="music.library.drawer">
      <MusicLibraryHeader
        label={props.label ?? translate('gallery.videoReview.musicLibrary')}
        state={state}
        busy={busy}
        onClose={props.onClose}
        onUpload={(file) => void run('upload', () => props.onUpload(file))}
      />
      {(props.error || failure) && (
        <div role="alert" className="shrink-0 px-4 py-2 text-sm">
          <p>{props.error || translate('gallery.videoReview.musicFailed')}</p>
          {props.onRetry && (
            <ContentToolbarButton
              tone="outline"
              className="shrink-0"
              disabled={busy !== null}
              aria-label={translate('gallery.videoReview.musicRetry')}
              onClick={() => void run('retry', props.onRetry!)}
            >
              {translate('gallery.videoReview.musicRetry')}
            </ContentToolbarButton>
          )}
        </div>
      )}
      <div
        className="min-h-0 flex-1 overflow-y-auto p-4"
        aria-busy={busy !== null || state.status === 'loading'}
        data-ui="music.library.list"
      >
        {state.status === 'loading' && (
          <p role="status">{translate('gallery.videoReview.musicLoading')}</p>
        )}
        {state.status === 'failed' && (
          <div role="alert">
            <p>{translate('gallery.videoReview.musicListFailed')}</p>
            <ContentToolbarButton tone="outline" className="shrink-0" onClick={state.retry}>
              {translate('gallery.videoReview.musicRetry')}
            </ContentToolbarButton>
          </div>
        )}
        {state.status === 'ready' && state.visible.length === 0 && (
          <p>{translate('gallery.videoReview.musicEmpty')}</p>
        )}
        {state.status === 'ready' && (
          <ul className="space-y-2" aria-label={translate('gallery.videoReview.musicAll')}>
            {state.visible.map((item) => (
              <MusicLibraryRow
                key={item.id}
                item={item}
                reason={props.unavailable(item)}
                playing={props.playingId === item.id}
                loading={props.loadingId === item.id}
                busy={busy !== null}
                adding={busy === item.id}
                onListen={() => {
                  if (props.playingId === item.id) props.onStopPreview();
                  else {
                    setFailure(false);
                    void props.onPreview(item.id).catch(() => setFailure(true));
                  }
                }}
                onAdd={() => void run(item.id, () => props.onSelect(item.id))}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function MusicLibraryHeader(props: {
  label: string;
  state: Pick<
    ReturnType<typeof useMusicLibraryState>,
    'views' | 'viewId' | 'setViewId' | 'query' | 'setQuery' | 'setComposing' | 'applyQuery'
  >;
  busy: string | null;
  onClose(): void;
  onUpload(file: File): void;
}) {
  const { state, busy } = props;
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <MediaLibraryHeader
        title={props.label}
        dataUi="music.library"
        menuClassName="sniptale-parameter-menu"
        query={state.query}
        onQueryChange={state.setQuery}
        onApplyQuery={state.applyQuery}
        onComposingChange={state.setComposing}
        searchLabel={translate('gallery.videoReview.musicSearch')}
        filterLabel={translate('gallery.videoReview.musicFilter')}
        viewId={state.viewId}
        onViewChange={state.setViewId}
        options={[
          { value: '', label: translate('gallery.videoReview.musicAll') },
          ...state.views.map((view) => ({
            value: view.id,
            label: view.name,
            group: translate('gallery.videoReview.musicAll'),
          })),
        ]}
        onClose={props.onClose}
      >
        <ContentToolbarButton
          tone="outline"
          className="!h-8 !min-h-8 !w-auto shrink-0 !px-3"
          disabled={busy !== null}
          onClick={() => input.current?.click()}
          aria-label={translate('gallery.videoReview.musicUpload')}
          title={translate('gallery.videoReview.musicUpload')}
        >
          <FolderOpen size={16} aria-hidden="true" />
          <span>
            {translate(
              busy === 'upload'
                ? 'gallery.videoReview.musicAdding'
                : 'gallery.videoReview.musicUpload'
            )}
          </span>
        </ContentToolbarButton>
      </MediaLibraryHeader>
      <input
        ref={input}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          if (file) props.onUpload(file);
        }}
      />
    </>
  );
}

function MusicLibraryRow({
  item,
  reason,
  playing,
  loading,
  busy,
  adding,
  onListen,
  onAdd,
}: {
  item: MediaLibraryItem;
  reason: string | null;
  playing: boolean;
  loading: boolean;
  busy: boolean;
  adding: boolean;
  onListen(): void;
  onAdd(): void;
}) {
  const listenLabel = translate(
    playing ? 'gallery.videoReview.musicStop' : 'gallery.videoReview.musicPlay'
  );
  return (
    <li className="flex items-center gap-3 rounded-md border border-[var(--sniptale-color-border-subtle)] p-3">
      <ContentToolbarButton
        tone="utility"
        className="shrink-0"
        disabled={busy || loading || !!reason}
        aria-label={`${listenLabel}: ${item.filename}`}
        onClick={onListen}
      >
        {playing ? <Square size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
      </ContentToolbarButton>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm" title={item.filename}>
          {item.filename}
        </p>
        {reason && <p className="text-xs text-[var(--sniptale-color-text-secondary)]">{reason}</p>}
      </div>
      <span className="shrink-0 text-xs text-[var(--sniptale-color-text-secondary)]">
        {loading
          ? translate('gallery.videoReview.musicLoading')
          : item.duration !== null && Number.isFinite(item.duration)
            ? formatDurationLabel(item.duration)
            : translate('gallery.videoReview.musicDurationUnknown')}
      </span>
      <ContentToolbarButton
        tone="outline"
        className="shrink-0"
        disabled={busy || !!reason}
        onClick={onAdd}
        aria-label={`${translate('gallery.videoReview.musicAdd')}: ${item.filename}`}
      >
        {translate(adding ? 'gallery.videoReview.musicAdding' : 'gallery.videoReview.musicAdd')}
      </ContentToolbarButton>
    </li>
  );
}
