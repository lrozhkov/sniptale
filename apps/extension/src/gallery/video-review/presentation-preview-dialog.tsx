import '../../ui/compact-inspector-controls/inspector-surface.css';
import { SegmentedRow } from '../../ui/compact-inspector-controls';
import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { ProductModal, ProductModalHeader, ProductModalFooter } from '@sniptale/ui/product-modal';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import {
  resolveThemeSafePortalTarget,
  useResolvedPortalTheme,
} from '@sniptale/ui/theme/safe-portal';
import { translate, useAppLocale } from '../../platform/i18n';

type WindowId = 'start' | 'join' | 'end';
type Props = {
  anchor: HTMLElement | null;
  edge: 'intro' | 'outro';
  windows: readonly { id: WindowId; label: string }[];
  selected: WindowId;
  onSelect(id: WindowId): void;
  url: string | null;
  pending: boolean;
  error: string | null;
  onRetry(): void;
  onClose(): void;
};

/** Controls actual prepared clips; the parent retains job, main transport and URL ownership. */
export function ReviewPresentationPreviewDialog(props: Props) {
  useAppLocale();
  const dialog = useRef<HTMLDialogElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [failure, setFailure] = useState<{ url: string | null; message: string } | null>(null);
  const theme = useResolvedPortalTheme(props.anchor);
  const fail = () =>
    setFailure({
      url: props.url,
      message: translate('gallery.videoReview.presentationPreviewPlayFailed'),
    });
  const localError = failure?.url === props.url ? failure.message : null;
  const error = props.error ?? localError;
  usePreviewModal(dialog, video, props.onClose, fail);
  const title = translate(
    props.edge === 'intro'
      ? 'gallery.videoReview.presentationPreviewIntro'
      : 'gallery.videoReview.presentationPreviewOutro'
  );
  return createPortal(
    <dialog
      ref={dialog}
      tabIndex={-1}
      aria-label={title}
      data-theme={theme ?? undefined}
      data-ui="gallery.videoReview.presentationPreview"
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      className="fixed inset-0 m-0 h-screen max-h-none w-screen max-w-none border-0 bg-transparent p-0
        text-[var(--sniptale-color-text-primary)]"
    >
      <ProductModal
        onClose={props.onClose}
        width="min(960px, calc(100vw - 24px))"
        maxWidth="calc(100vw - 24px)"
        maxHeight="calc(100dvh - 24px)"
        dialogClassName="flex min-h-0 flex-col overflow-hidden"
        role="presentation"
      >
        <ProductModalHeader
          title={title}
          onClose={props.onClose}
          closeTitle={translate('common.actions.close')}
          compact
        />
        {props.windows.length > 1 ? (
          <div className="shrink-0 px-4 py-2">
            <div className="sniptale-inspector-surface max-w-80">
              <SegmentedRow
                columns={2}
                ariaLabel={title}
                value={props.selected}
                options={props.windows.map((window) => ({ value: window.id, label: window.label }))}
                onChange={props.onSelect}
              />
            </div>
          </div>
        ) : null}
        <div className="min-h-0 overflow-auto px-4 pb-3" aria-busy={props.pending}>
          <PreviewBody
            video={video}
            url={props.url}
            pending={props.pending}
            error={error}
            onError={fail}
            onRetry={() => {
              setFailure(null);
              props.onRetry();
            }}
          />
        </div>
        <ProductModalFooter compact>
          <ProductActionButton compact tone="secondary" onClick={props.onClose}>
            {translate('common.actions.close')}
          </ProductActionButton>
        </ProductModalFooter>
      </ProductModal>
    </dialog>,
    resolveThemeSafePortalTarget(props.anchor)
  );
}

/** Prepared-clip feedback changes independently from modal placement and keyboard ownership. */
function PreviewBody({
  video,
  url,
  pending,
  error,
  onRetry,
  onError,
}: {
  video: RefObject<HTMLVideoElement | null>;
  url: string | null;
  pending: boolean;
  error: string | null;
  onRetry(): void;
  onError(): void;
}) {
  if (pending)
    return (
      <p role="status" className="py-8 text-center text-sm">
        {translate('gallery.videoReview.presentationPreviewLoading')}
      </p>
    );
  if (error)
    return (
      <div role="alert" className="space-y-2 py-4 text-sm">
        <p>{error}</p>
        <ProductActionButton compact tone="secondary" onClick={onRetry}>
          {translate('gallery.videoReview.retry')}
        </ProductActionButton>
      </div>
    );
  return url ? <PreviewClip key={url} video={video} url={url} onError={onError} /> : null;
}

/** Native events stop at this modal before reaching the underlying editor's transport. */
function usePreviewModal(
  dialog: RefObject<HTMLDialogElement | null>,
  video: RefObject<HTMLVideoElement | null>,
  close: () => void,
  failed: () => void
) {
  const latest = useRef({ close, failed });
  latest.current = { close, failed };
  useLayoutEffect(() => {
    const element = dialog.current;
    const trigger = document.activeElement;
    const cancel = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
      latest.current.close();
    };
    const keydown = (event: KeyboardEvent) => {
      event.stopPropagation();
      if (event.key === 'Escape') {
        event.preventDefault();
        latest.current.close();
        return;
      }
      const target = event.target instanceof Element ? event.target : null;
      if (
        event.key !== ' ' ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.isComposing ||
        target?.closest(
          'input,textarea,select,button,[role="button"],[contenteditable]:not([contenteditable="false"])'
        )
      )
        return;
      const clip = video.current;
      if (!clip) return;
      event.preventDefault();
      if (event.repeat) return;
      if (clip.paused)
        void clip.play().catch(() => {
          if (video.current === clip) latest.current.failed();
        });
      else clip.pause();
    };
    const keyup = (event: KeyboardEvent) => event.stopPropagation();
    element?.addEventListener('cancel', cancel);
    element?.addEventListener('keydown', keydown);
    element?.addEventListener('keyup', keyup);
    element?.showModal();
    element?.focus({ preventScroll: true });
    return () => {
      element?.removeEventListener('cancel', cancel);
      element?.removeEventListener('keydown', keydown);
      element?.removeEventListener('keyup', keyup);
      element?.close();
      if (trigger instanceof HTMLElement && trigger.isConnected)
        trigger.focus({ preventScroll: true });
    };
  }, [dialog, video]);
}

/** Each clip lifetime pauses before replacement; the supplied object URL is never revoked here. */
function PreviewClip({
  video,
  url,
  onError,
}: {
  video: RefObject<HTMLVideoElement | null>;
  url: string;
  onError(): void;
}) {
  useLayoutEffect(() => {
    const clip = video.current;
    return () => clip?.pause();
  }, [video]);
  return (
    <video
      ref={video}
      src={url}
      controls
      playsInline
      preload="metadata"
      onError={onError}
      className="block w-full object-contain bg-black"
      style={{ height: 'min(54dvh, 540px)' }}
    />
  );
}
