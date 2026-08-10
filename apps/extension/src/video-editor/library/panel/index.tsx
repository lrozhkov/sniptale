import { useMemo, useRef } from 'react';
import { ProductModal } from '@sniptale/ui/product-modal';
import { translate } from '../../../platform/i18n';
import { VideoEditorLibraryPanelBody } from './body';
import type { VideoEditorLibraryPanelProps } from '../contracts/panel';
import { useLibraryDrawerLifecycle } from './lifecycle';

function useInputRefs() {
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const audioInputRef = useRef<HTMLInputElement | null>(null);

  return useMemo(
    () => ({
      audioInputRef,
      imageInputRef,
      videoInputRef,
    }),
    []
  );
}

export function VideoEditorLibraryPanel({
  isOpen,
  onClose,
  ...props
}: VideoEditorLibraryPanelProps): React.JSX.Element | null {
  const inputRefs = useInputRefs();
  const panelRef = useRef<HTMLElement | null>(null);
  useLibraryDrawerLifecycle({ isOpen, onClose, panelRef });

  if (!isOpen) {
    return null;
  }

  return (
    <ProductModal
      onClose={onClose}
      width="min(860px, calc(100vw - 24px))"
      maxWidth="calc(100vw - 24px)"
      maxHeight="100vh"
      role="presentation"
      backdropClassName="!bg-[color:color-mix(in_srgb,var(--sniptale-color-overlay)_48%,transparent)]"
      dialogClassName={[
        '!bottom-0 !left-0 !top-0 !h-screen !translate-x-0 !translate-y-0 !rounded-none',
        '!border-l-0 !bg-[color:var(--sniptale-color-surface-canvas)]',
      ].join(' ')}
    >
      <aside
        ref={panelRef}
        data-ui="video-editor.library.drawer"
        role="dialog"
        aria-modal="true"
        aria-label={translate('videoEditor.app.libraryTitle')}
        tabIndex={-1}
        className="flex h-full min-w-0 flex-col overflow-hidden"
      >
        <VideoEditorLibraryPanelBody {...props} inputRefs={inputRefs} onClose={onClose} />
      </aside>
    </ProductModal>
  );
}
