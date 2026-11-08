import { Check, Images, Image as ImageIcon, LoaderCircle, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { FloatingChromePanel } from '@sniptale/ui/floating-chrome';
import { translate } from '../../../platform/i18n';
import { subscribeToMediaHubEvents } from '../../../features/media-hub/events';
import { useEditorStartItems, type EditorStartItem } from '../../../ui/editor-start';
import { EditorStartThumbnail } from '../../../ui/editor-start/thumbnail';
import { useEditorController } from '../../application/controller-context';
import { useEditorStore } from '../../state/useEditorStore';
import {
  listRecentEditorImages,
  readRecentEditorThumbnail,
  openRecentEditorImage,
} from '../../workflows/recent-images';

function RecentImageRow(props: {
  item: EditorStartItem;
  currentId: string | null;
  pendingId: string | null;
  onSelect: (id: string) => Promise<void>;
}) {
  const { item } = props;
  return (
    <button
      type="button"
      data-ui="editor.recent-images.item"
      data-asset-id={item.id}
      aria-current={item.id === props.currentId ? 'true' : undefined}
      aria-disabled={props.pendingId !== null || item.id === props.currentId || item.unavailable}
      title={item.title}
      onClick={() => {
        if (!item.unavailable) void props.onSelect(item.id);
      }}
      className={[
        'my-px flex min-h-14 w-full items-center gap-3 rounded px-2 py-2 text-left',
        'hover:bg-[var(--sniptale-color-surface-hover)]',
        'aria-current:bg-[var(--sniptale-color-surface-hover)]',
        'focus-visible:outline focus-visible:outline-2',
        'focus-visible:outline-[var(--sniptale-color-accent)]',
      ].join(' ')}
    >
      <span className="w-14 shrink-0 overflow-hidden rounded">
        <EditorStartThumbnail item={item} fallback={<ImageIcon size={20} />} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] text-[var(--sniptale-color-text-primary)]">
          {item.title}
        </span>
        <span className="block text-xs text-[var(--sniptale-color-text-secondary)]">
          {item.detail}
        </span>
      </span>
      {props.pendingId === item.id ? (
        <LoaderCircle
          size={16}
          aria-label={translate('editor.recentImages.switching')}
          className="shrink-0 motion-safe:animate-spin"
        />
      ) : item.id === props.currentId ? (
        <Check
          size={16}
          className="shrink-0"
          aria-label={translate('editor.recentImages.current')}
        />
      ) : null}
    </button>
  );
}

function useRecentImagesDismissal(
  root: RefObject<HTMLDivElement | null>,
  anchor: HTMLButtonElement | null,
  onClose: (restoreFocus: boolean) => void
) {
  useEffect(() => {
    root.current?.querySelector<HTMLButtonElement>('[data-recent-close]')?.focus();
    const outside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !root.current?.contains(event.target) &&
        !anchor?.contains(event.target)
      )
        onClose(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      onClose(true);
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape, true);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape, true);
    };
  }, [anchor, onClose, root]);
}

function useRecentImagePicker(
  root: RefObject<HTMLDivElement | null>,
  onClose: (restoreFocus: boolean) => void
) {
  const { items, status, refresh } = useEditorStartItems(
    listRecentEditorImages,
    readRecentEditorThumbnail
  );
  const controller = useEditorController();
  const currentId = useEditorStore((state) => state.sessionId);
  const pendingRef = useRef(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(
    () =>
      subscribeToMediaHubEvents((event) => {
        if (event.type === 'library-changed') void refresh();
      }),
    [refresh]
  );
  const select = async (id: string) => {
    if (id === currentId || pendingRef.current) return;
    pendingRef.current = true;
    setPendingId(id);
    setFailed(false);
    try {
      await openRecentEditorImage({
        id,
        controller,
        isActive: () => root.current?.isConnected === true,
      });
      if (!root.current) return;
      onClose(false);
    } catch {
      if (!root.current) return;
      setFailed(true);
      void refresh();
    } finally {
      pendingRef.current = false;
      if (root.current) setPendingId(null);
    }
  };
  return { items, status, refresh, currentId, pendingId, failed, select };
}

function RecentImagesPanel(props: {
  onClose: (restoreFocus: boolean) => void;
  anchor: HTMLButtonElement | null;
}) {
  const root = useRef<HTMLDivElement>(null);
  const { items, status, refresh, currentId, pendingId, failed, select } = useRecentImagePicker(
    root,
    props.onClose
  );
  useRecentImagesDismissal(root, props.anchor, props.onClose);
  return (
    <FloatingChromePanel
      ref={root}
      dataUi="editor.recent-images.panel"
      className={[
        'absolute left-0 top-full mt-1.5 flex flex-col overflow-hidden p-1.5',
        'max-h-[min(32rem,calc(100vh-5rem))] w-[min(22rem,calc(100vw-1.5rem))]',
      ].join(' ')}
    >
      <div
        role="dialog"
        aria-label={translate('editor.recentImages.title')}
        className="flex min-h-0 flex-col"
      >
        <div className="flex shrink-0 items-center justify-between gap-2 px-2 py-1">
          <span
            className="text-xs font-medium text-[var(--sniptale-color-text-secondary)]"
            title={translate('editor.recentImages.order')}
          >
            {translate('editor.recentImages.title')}
          </span>
          <ContentToolbarButton
            data-recent-close
            title={translate('common.actions.close')}
            onClick={() => props.onClose(true)}
          >
            <X size={16} aria-hidden="true" />
          </ContentToolbarButton>
        </div>
        <div className="min-h-0 overflow-y-auto" aria-busy={pendingId !== null}>
          {status === 'loading' && items.length === 0 ? (
            <p role="status" className="p-3 text-xs">
              {translate('shared.editorStart.loading')}
            </p>
          ) : null}
          {status === 'error' ? (
            <div className="p-3 text-xs" role="alert">
              <p>{translate('shared.editorStart.error')}</p>
              <button
                type="button"
                className="mt-2 rounded px-2 py-1 hover:bg-[var(--sniptale-color-surface-hover)]"
                onClick={() => void refresh()}
              >
                {translate('shared.editorStart.retry')}
              </button>
            </div>
          ) : null}
          {status === 'ready' && items.length === 0 ? (
            <p className="p-3 text-xs text-[var(--sniptale-color-text-secondary)]">
              {translate('shared.editorStart.empty')}
            </p>
          ) : null}
          {items.slice(0, 12).map((item) => (
            <RecentImageRow
              key={item.id}
              item={item}
              currentId={currentId}
              pendingId={pendingId}
              onSelect={select}
            />
          ))}
        </div>
        {failed ? (
          <p
            role="alert"
            className="shrink-0 p-2 text-xs text-[var(--sniptale-color-text-primary)]"
          >
            {translate('editor.recentImages.switchFailed')}
          </p>
        ) : null}
      </div>
    </FloatingChromePanel>
  );
}

/** Opens a disposable recent-image chooser; the document remains mounted until navigation. */
export function EditorRecentImagesButton() {
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const close = useCallback((restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) trigger.current?.focus();
  }, []);
  return (
    <>
      <ContentToolbarButton
        ref={trigger}
        title={translate('editor.recentImages.title')}
        dataUi="editor.recent-images.trigger"
        active={open}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Images size={16} strokeWidth={2} aria-hidden="true" />
      </ContentToolbarButton>
      {open ? <RecentImagesPanel onClose={close} anchor={trigger.current} /> : null}
    </>
  );
}
