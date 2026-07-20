import { useEffect, useMemo, useRef } from 'react';
import { VideoEditorLibraryPanelBody } from './body';
import type { VideoEditorLibraryPanelProps } from '../contracts/panel';

function useEscapeClose(isOpen: boolean, onClose: () => void): void {
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }

      event.preventDefault();
      onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);
}

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
  useEscapeClose(isOpen, onClose);

  if (!isOpen) {
    return null;
  }

  return (
    <aside
      data-ui="video-editor.library.drawer"
      role="dialog"
      aria-modal="false"
      className={[
        'fixed bottom-0 left-0 top-0 z-[60] flex w-[min(760px,calc(100vw-24px))] min-w-0 flex-col',
        'overflow-hidden rounded-r-[14px] border border-l-0',
        'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_82%,transparent)]',
        'bg-[color:var(--sniptale-color-surface-canvas)]',
        'shadow-[0_20px_48px_color-mix(in_srgb,var(--sniptale-color-overlay)_24%,transparent)]',
      ].join(' ')}
    >
      <div className="sniptale-modal-accent-sm" />
      <VideoEditorLibraryPanelBody {...props} inputRefs={inputRefs} onClose={onClose} />
    </aside>
  );
}
