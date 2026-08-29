import { UploadCloud } from 'lucide-react';
import { useRef, useState, type DragEvent, type ReactNode } from 'react';
import { translate } from '../../../platform/i18n';

interface GalleryWebSnapshotDropTargetProps {
  children: ReactNode;
  disabled: boolean;
  onFilesDrop?: (files: File[]) => void;
}

function hasFilePayload(event: DragEvent<HTMLElement>): boolean {
  return (
    event.dataTransfer.files.length > 0 || Array.from(event.dataTransfer.types).includes('Files')
  );
}

export function GalleryWebSnapshotDropTarget(props: GalleryWebSnapshotDropTargetProps) {
  const [isActive, setIsActive] = useState(false);
  const dragDepthRef = useRef(0);

  const resetDragState = () => {
    dragDepthRef.current = 0;
    setIsActive(false);
  };

  const handleDragEnter = (event: DragEvent<HTMLDivElement>) => {
    if (!hasFilePayload(event)) return;
    event.preventDefault();
    dragDepthRef.current += 1;
    if (!props.disabled) setIsActive(true);
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!hasFilePayload(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = props.disabled ? 'none' : 'copy';
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    if (dragDepthRef.current === 0) return;
    event.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsActive(false);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    if (!hasFilePayload(event)) return;
    event.preventDefault();
    event.stopPropagation();
    const files = Array.from(event.dataTransfer.files);
    resetDragState();
    if (!props.disabled) props.onFilesDrop?.(files);
  };

  return (
    <div
      data-ui="gallery.page.root"
      className={
        'sniptale-extension-surface relative flex h-full min-h-0 w-full overflow-hidden ' +
        'bg-[var(--sniptale-color-surface-canvas)] p-4 ' +
        'text-[var(--sniptale-color-text-primary)]'
      }
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {props.children}
      {isActive ? (
        <div
          data-ui="gallery.web-snapshot-drop-target"
          role="status"
          aria-live="polite"
          className={
            'pointer-events-none absolute inset-4 z-50 flex items-center justify-center rounded-2xl ' +
            'border-2 border-dashed border-[var(--sniptale-color-border-accent-strong)] ' +
            'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_92%,transparent)] ' +
            'shadow-[0_18px_48px_color-mix(in_srgb,var(--sniptale-color-shadow-strong)_22%,transparent)] ' +
            'backdrop-blur-sm'
          }
        >
          <div className="flex max-w-md flex-col items-center gap-2 px-6 text-center">
            <UploadCloud
              className="h-9 w-9 text-[var(--sniptale-color-accent)]"
              aria-hidden="true"
            />
            <strong className="text-base font-semibold">
              {translate('gallery.importModal.webSnapshotDropTitle')}
            </strong>
            <span className="text-sm text-[var(--sniptale-color-text-secondary)]">
              {translate('gallery.importModal.webSnapshotDropDescription')}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
