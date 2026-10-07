import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  resolveThemeSafePortalTarget,
  useResolvedPortalTheme,
} from '@sniptale/ui/theme/safe-portal';
import { ProductModal, ProductModalHeader } from '@sniptale/ui/product-modal';
import { MaterialBrowser } from '@sniptale/ui/material-browser';
import {
  listMediaLibrary,
  getMediaThumbnail,
  getMediaAssetBlob,
} from '../persistence/media-library';
import type { MediaLibraryItem } from '../persistence/media-library/contracts';
import { translate } from '../../platform/i18n';

/** Each visible thumbnail owns and revokes its disposable Blob URL. */
export function BackgroundLibraryThumbnail({ mediaId }: { mediaId: string }) {
  const anchor = useRef<HTMLSpanElement>(null);
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    let active = true;
    let objectUrl: string | undefined;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((item) => item.isIntersecting)) return;
      observer.disconnect();
      void (async () => {
        const thumbnail = await getMediaThumbnail(mediaId);
        const blob = thumbnail?.blob ?? (await getMediaAssetBlob(mediaId));
        if (!blob || !active) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })().catch(() => undefined);
    });
    if (anchor.current) observer.observe(anchor.current);
    return () => {
      active = false;
      observer.disconnect();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [mediaId]);
  return (
    <span ref={anchor} className="block h-full w-full">
      {url && <img src={url} alt="" className="h-full w-full object-cover" />}
    </span>
  );
}

/** Native modal owns focus trapping, Escape and restoration, including inside quick-editor dialogs. */
export function BackgroundLibraryDrawer(props: {
  anchor: HTMLElement | null;
  onClose(): void;
  onSelect(id: string): void;
  busy: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const theme = useResolvedPortalTheme(props.anchor);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  const title = translate('settings.editor.backgrounds.library');
  return createPortal(
    <dialog
      ref={dialog}
      role="dialog"
      data-theme={theme ?? undefined}
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        props.onClose();
      }}
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
        <div className="flex h-full min-h-0 flex-col" data-ui="background.library.drawer">
          <ProductModalHeader
            title={title}
            onClose={props.onClose}
            closeTitle={translate('common.actions.close')}
          />
          <BackgroundLibraryContent {...props} />
        </div>
      </ProductModal>
    </dialog>,
    resolveThemeSafePortalTarget(props.anchor)
  );
}

/** Library listing owns its read/search/retry lifecycle independently of modal placement. */
function BackgroundLibraryContent(props: { onSelect(id: string): void; busy: boolean }) {
  const [items, setItems] = useState<MediaLibraryItem[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState('');
  useEffect(() => {
    let active = true;
    setStatus('loading');
    void listMediaLibrary()
      .then((rows) => {
        if (!active) return;
        setItems(
          rows.filter(
            (item) =>
              ['image', 'screenshot'].includes(item.kind) && item.lifecycle?.trashedAt === undefined
          )
        );
        setStatus('ready');
      })
      .catch(() => {
        if (active) setStatus('failed');
      });
    return () => {
      active = false;
    };
  }, [attempt]);
  const title = translate('settings.editor.backgrounds.library');
  return (
    <div className="flex min-h-0 flex-1 p-4">
      <MaterialBrowser
        labels={{ list: title, show: title, hide: title }}
        search={
          <input
            type="search"
            className={[
              'w-full rounded border bg-transparent px-3 py-2',
              'border-[var(--sniptale-color-border-subtle)]',
            ].join(' ')}
            aria-label={translate('settings.editor.backgrounds.search')}
            placeholder={translate('settings.editor.backgrounds.search')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        }
        status={
          status === 'loading' ? (
            <p>{translate('settings.editor.backgrounds.loading')}</p>
          ) : status === 'failed' ? (
            <button onClick={() => setAttempt((n) => n + 1)}>
              {translate('settings.editor.backgrounds.retry')}
            </button>
          ) : items.length === 0 ? (
            <p>{translate('settings.editor.backgrounds.empty')}</p>
          ) : undefined
        }
      >
        {items
          .filter((item) => item.filename.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
          .map((item) => (
            <button
              type="button"
              key={item.id}
              disabled={props.busy}
              title={item.filename}
              onClick={() => props.onSelect(item.id)}
              className={[
                'overflow-hidden rounded border border-[var(--sniptale-color-border-subtle)] text-left',
                'hover:border-[var(--sniptale-color-text-secondary)] disabled:opacity-50',
              ].join(' ')}
            >
              <span className="block h-32">
                <BackgroundLibraryThumbnail mediaId={item.id} />
              </span>
              <span className="block truncate p-2 text-xs">{item.filename}</span>
            </button>
          ))}
      </MaterialBrowser>
    </div>
  );
}
