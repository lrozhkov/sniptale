import React from 'react';
import { Ban, LoaderCircle } from 'lucide-react';
import { translate, useAppLocale } from '../../../platform/i18n';
import type { VideoProjectExportStatus } from '../../../features/video/project/types';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import {
  ProductModal,
  ProductModalBody,
  ProductModalFooter,
  ProductModalHeader,
} from '@sniptale/ui/product-modal';

const EXPORT_PROGRESS_DIALOG_CLASS_NAME = 'w-[min(560px,calc(100vw-32px))]';
const EXPORT_PROGRESS_PHASE_BADGE_CLASS_NAME = [
  'inline-flex items-center rounded-full border px-2.5 py-1',
  'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_88%,transparent)]',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-accent-soft)_32%,transparent)]',
  'text-xs font-semibold uppercase tracking-[0.08em] text-[color:var(--sniptale-color-text-secondary)]',
].join(' ');

const EXPORT_PROGRESS_BAR_TRACK_CLASS_NAME = [
  'rounded-full border border-[color:var(--sniptale-color-border-soft)]',
  'bg-[color:var(--sniptale-color-surface-overlay)] p-1',
].join(' ');

const EXPORT_PROGRESS_BAR_FILL_CLASS_NAME = [
  'h-3 rounded-full',
  'bg-[linear-gradient(90deg,var(--sniptale-color-accent),var(--sniptale-color-accent-emphasis))]',
  'transition-all',
].join(' ');

interface ExportProgressOverlayProps {
  status: VideoProjectExportStatus;
  onCancel: () => void;
}

function resolveProgressPercentage(progress: number) {
  return Math.max(4, Math.min(100, progress));
}

export const ExportProgressOverlay: React.FC<ExportProgressOverlayProps> = ({
  status,
  onCancel,
}) => {
  useAppLocale();

  return (
    <ProductModal
      closeOnBackdrop={false}
      dialogClassName={EXPORT_PROGRESS_DIALOG_CLASS_NAME}
      width="min(560px, calc(100vw - 32px))"
    >
      <ProductModalHeader
        title={translate('videoEditor.progress.title')}
        actions={<span className={EXPORT_PROGRESS_PHASE_BADGE_CLASS_NAME}>{status.phase}</span>}
      />
      <ProductModalBody className="gap-4">
        <div className="space-y-2">
          <div className="text-lg font-semibold text-[var(--sniptale-color-text-primary)]">
            {status.message}
          </div>
          <div className="text-sm text-[var(--sniptale-color-text-secondary)]">
            {translate('videoEditor.progress.active')}
          </div>
        </div>

        <div className={EXPORT_PROGRESS_BAR_TRACK_CLASS_NAME}>
          <div
            className={EXPORT_PROGRESS_BAR_FILL_CLASS_NAME}
            style={{ width: `${resolveProgressPercentage(status.progress)}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-sm text-[var(--sniptale-color-text-secondary)]">
          <span className="inline-flex items-center gap-2">
            <LoaderCircle size={16} strokeWidth={2} className="animate-spin" />{' '}
            {translate('videoEditor.progress.active')}
          </span>
          <span className="font-medium text-[var(--sniptale-color-text-primary)]">
            {Math.round(status.progress)}%
          </span>
        </div>
      </ProductModalBody>
      <ProductModalFooter>
        <ProductActionButton tone="secondary" onClick={onCancel}>
          <Ban size={16} strokeWidth={2} /> {translate('videoEditor.progress.cancel')}
        </ProductActionButton>
      </ProductModalFooter>
    </ProductModal>
  );
};
