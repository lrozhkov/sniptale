import React, { useId, useRef } from 'react';
import { Ban } from 'lucide-react';
import { translate, useAppLocale } from '../../../platform/i18n';
import type { VideoProjectExportStatus } from '../../../features/video/project/types';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import {
  ProductModal,
  ProductModalBody,
  ProductModalFooter,
  ProductModalHeader,
} from '@sniptale/ui/product-modal';
import { useExportDialogFocus } from '../dialog/focus';

const PHASE_MESSAGES = {
  PREPARING: 'videoEditor.progress.preparing',
  RENDERING: 'videoEditor.progress.rendering',
  TRANSCODING: 'videoEditor.progress.transcoding',
  SAVING: 'videoEditor.progress.saving',
  DONE: 'videoEditor.progress.done',
  FAILED: 'videoEditor.progress.failed',
  CANCELLED: 'videoEditor.progress.cancelled',
} as const;

interface ExportProgressOverlayProps {
  status: VideoProjectExportStatus;
  onCancel: () => void;
}

export const ExportProgressOverlay: React.FC<ExportProgressOverlayProps> = ({
  status,
  onCancel,
}) => {
  useAppLocale();
  const rootRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useExportDialogFocus(rootRef);
  const progress = Math.round(Math.max(0, Math.min(100, status.progress)));
  const phase = translate(PHASE_MESSAGES[status.phase]);

  return (
    <div ref={rootRef} className="contents">
      <ProductModal
        labelledBy={titleId}
        closeOnBackdrop={false}
        width="min(480px, calc(100vw - 32px))"
      >
        <ProductModalHeader
          actions={<></>}
          compact
          title={<span id={titleId}>{translate('videoEditor.progress.title')}</span>}
        />
        <ProductModalBody compact className="gap-3">
          <div className="flex items-center justify-between gap-4 text-sm text-[var(--sniptale-color-text-secondary)]">
            <span role="status">{phase}</span>
            <span className="shrink-0 tabular-nums text-[var(--sniptale-color-text-primary)]">
              {progress}%
            </span>
          </div>
          <div
            role="progressbar"
            aria-label={phase}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
            className="overflow-hidden rounded-full bg-[var(--sniptale-color-surface-overlay)]"
          >
            <div
              className="h-2 rounded-full bg-[var(--sniptale-color-accent)]
                transition-[width] motion-reduce:transition-none"
              style={{ width: `${progress}%` }}
            />
          </div>
        </ProductModalBody>
        <ProductModalFooter compact className="justify-end">
          <ProductActionButton compact tone="secondary" onClick={onCancel}>
            <Ban size={16} strokeWidth={2} /> {translate('videoEditor.progress.cancel')}
          </ProductActionButton>
        </ProductModalFooter>
      </ProductModal>
    </div>
  );
};
