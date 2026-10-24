import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { MousePointer2, RotateCcw } from 'lucide-react';
import type { Translate } from '../../../platform/i18n';

/** One mounted scene retains authoring scroll while native modality contains playback focus. */
export function TourPreview({
  active,
  children,
  onClose,
  onReplay,
  t,
}: {
  active: boolean;
  children: ReactNode;
  onClose(): void;
  onReplay(): void;
  t: Translate;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const node = dialog.current;
    if (!node) return;
    node.close();
    if (active) node.showModal();
    else node.open = true;
    return () => node.close();
  }, [active]);
  return (
    <dialog
      ref={dialog}
      className="tour-preview-dialog"
      data-preview={active}
      role={active ? 'dialog' : 'presentation'}
      aria-label={active ? t('scenario.editor.previewTitle') : undefined}
      onKeyDown={(event) => {
        if (!active || event.defaultPrevented || event.key !== 'Escape') return;
        const nested = event.nativeEvent
          .composedPath()
          .some(
            (node) => node instanceof HTMLDialogElement && node !== event.currentTarget && node.open
          );
        if (nested) return;
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }}
      onCancel={(event) => {
        if (event.target !== event.currentTarget) return;
        event.preventDefault();
        onClose();
      }}
    >
      <div className="tour-preview-header" hidden={!active}>
        <ContentToolbarButton title={t('scenario.editor.tourReturnToEditing')} onClick={onClose}>
          <MousePointer2 size={16} aria-hidden="true" />
          <span>{t('scenario.editor.tourReturnToEditing')}</span>
        </ContentToolbarButton>
        <ContentToolbarButton title={t('scenario.editor.tourReplayPreview')} onClick={onReplay}>
          <RotateCcw size={16} aria-hidden="true" />
          <span>{t('scenario.editor.tourReplayPreview')}</span>
        </ContentToolbarButton>
      </div>
      <div className="tour-preview-player">{children}</div>
    </dialog>
  );
}
