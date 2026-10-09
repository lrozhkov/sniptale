import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CornerDownRight, Filter, FolderOpen, Play, Search, Square, X } from 'lucide-react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { ProductSelect } from '@sniptale/ui/product-form-controls';
import { ProductModal, ProductModalHeader } from '@sniptale/ui/product-modal';
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
      aria-label={translate('gallery.videoReview.musicLibrary')}
      onCancel={(event) => {
        event.preventDefault();
        props.onClose();
      }}
      onKeyDown={(event) => event.stopPropagation()}
      onKeyUp={(event) => event.stopPropagation()}
      className={[
        'm-0 h-screen max-h-none w-screen max-w-none border-0 bg-transparent p-0',
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
      <div className="shrink-0 [&>.sniptale-modal-header]:flex-wrap [&>.sniptale-modal-header]:gap-3">
        <ProductModalHeader
          title={translate('gallery.videoReview.musicLibrary')}
          actions={
            <div
              className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2"
              data-ui="music.library.controls"
            >
              <div
                className={[
                  'flex h-8 w-40 shrink-0 items-center gap-1.5 rounded-md border',
                  'border-[var(--sniptale-color-border-soft)]',
                  'bg-[var(--sniptale-color-surface-input)] px-2 max-w-full transition-[width]',
                  'duration-200 focus-within:w-48',
                  'focus-within:border-[var(--sniptale-color-border-strong)]',
                  'motion-reduce:transition-none',
                ].join(' ')}
              >
                <Search size={16} className="shrink-0" aria-hidden="true" />
                <input
                  type="search"
                  className={[
                    'min-w-0 flex-1 bg-transparent text-sm outline-none',
                    'placeholder:text-[var(--sniptale-color-text-muted)]',
                    'focus:placeholder:text-transparent',
                  ].join(' ')}
                  aria-label={translate('gallery.videoReview.musicSearch')}
                  placeholder={translate('gallery.videoReview.musicSearch')}
                  value={state.query}
                  onChange={(event) => state.setQuery(event.target.value)}
                  onCompositionStart={() => state.setComposing(true)}
                  onCompositionEnd={() => state.setComposing(false)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                      event.preventDefault();
                      state.applyQuery();
                    }
                  }}
                />
              </div>
              <ProductSelect
                aria-label={translate('gallery.videoReview.musicFilter')}
                containerClassName="!w-44 shrink-0"
                controlSize="sm"
                value={state.viewId}
                onChange={state.setViewId}
                menuWidth={280}
                menuClassName="[&_[role=option]:not(:first-child)]:pl-7"
                options={[
                  {
                    value: '',
                    label: translate('gallery.videoReview.musicAll'),
                    icon: <Filter size={16} aria-hidden="true" />,
                  },
                  ...state.views.map((view) => ({
                    value: view.id,
                    label: view.name,
                    icon: <CornerDownRight size={16} aria-hidden="true" />,
                  })),
                ]}
              />
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
              <ContentToolbarButton
                tone="utility"
                className="shrink-0"
                onClick={props.onClose}
                aria-label={translate('common.actions.close')}
                title={translate('common.actions.close')}
              >
                <X size={16} aria-hidden="true" />
              </ContentToolbarButton>
            </div>
          }
        />
      </div>
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
