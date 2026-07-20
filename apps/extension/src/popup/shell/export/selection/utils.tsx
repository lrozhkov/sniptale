import { AlertTriangle, Check, Loader2 } from 'lucide-react';

import { translate } from '../../../../platform/i18n';
import type { ExportProgress, PopupExportResult } from '@sniptale/runtime-contracts/export';

export type PreviewFormat = 'json' | 'markdown';

const SUCCESS_RESULT_BADGE_CLASS_NAME = [
  'border border-[color:color-mix(in_srgb,var(--sniptale-color-success)_28%,var(--sniptale-color-border-soft)_72%)]',
  'bg-[var(--sniptale-color-success-soft)]',
  'text-[var(--sniptale-color-success)]',
].join(' ');

export const IDLE_PROGRESS: ExportProgress = {
  activeStepKey: null,
  phase: 'idle',
  message: '',
  current: 0,
  total: 0,
  errors: [],
};

export function cx(...classNames: Array<string | false | null | undefined>): string {
  return classNames.filter(Boolean).join(' ');
}

function trimLeadingDecorations(label: string): string {
  return label.replace(/^[^\p{L}\p{N}]+/u, '').trim();
}

export function formatPhaseLabel(progress: ExportProgress): string {
  const rawLabel = (() => {
    switch (progress.phase) {
      case 'idle':
        return translate('popup.video.waitingState');
      case 'scanning':
        return translate('exportModal.phaseScanning');
      case 'downloading':
        return translate('exportModal.phaseDownloading');
      case 'zipping':
        return translate('exportModal.phaseZipping');
      case 'done':
        return translate('popup.tabs.export');
      case 'error':
        return `${translate('common.states.error')} ${translate('popup.tabs.export').toLowerCase()}`;
    }
  })();

  return trimLeadingDecorations(rawLabel);
}

export function getResultBadgeClassName(result: PopupExportResult | null): string {
  if (result?.success) {
    return SUCCESS_RESULT_BADGE_CLASS_NAME;
  }

  if (result) {
    return [
      'border border-[color:color-mix(in_srgb,var(--sniptale-color-danger)_28%,var(--sniptale-color-border-soft)_72%)]',
      'bg-[color:color-mix(in_srgb,var(--sniptale-color-danger-soft)_78%,var(--sniptale-color-surface-panel)_22%)]',
      'text-[var(--sniptale-color-danger)]',
    ].join(' ');
  }

  return [
    'border border-[var(--sniptale-color-border-soft)]',
    'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-canvas)_54%,transparent)]',
    'text-[var(--sniptale-color-text-primary)]',
  ].join(' ');
}

export function renderResultIcon(result: PopupExportResult | null) {
  if (result?.success) {
    return <Check className="h-4 w-4" />;
  }

  if (result) {
    return <AlertTriangle className="h-4 w-4 text-[var(--sniptale-color-danger)]" />;
  }

  return <Loader2 className="h-4 w-4 animate-spin text-[var(--sniptale-color-accent)]" />;
}
