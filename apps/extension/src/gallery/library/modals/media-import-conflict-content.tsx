import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { useState } from 'react';
import { Library } from 'lucide-react';
import { ProductSelect } from '@sniptale/ui/product-form-controls';
import { translate } from '../../../platform/i18n';
import { formatBytes } from '../../../platform/i18n/format-bytes';
import type { MediaFileImportConflict, MediaFileImportConflictStrategy } from '../import-types';
import { GalleryModalFrame } from './frame';

const STRATEGIES: MediaFileImportConflictStrategy[] = ['skip', 'duplicate'];

function getStrategyTitle(strategy: MediaFileImportConflictStrategy): string {
  return translate(
    strategy === 'skip'
      ? 'gallery.importModal.mediaConflictSkip'
      : 'gallery.importModal.mediaConflictKeepBoth'
  );
}

function getStrategyDescription(strategy: MediaFileImportConflictStrategy): string {
  return translate(
    strategy === 'skip'
      ? 'gallery.importModal.mediaConflictSkipDescription'
      : 'gallery.importModal.mediaConflictKeepBothDescription'
  );
}

export function MediaImportConflictModalContent(props: {
  conflicts: MediaFileImportConflict[];
  fileCount: number;
  onClose: () => void;
  onImport: (strategy: MediaFileImportConflictStrategy) => void;
}) {
  const [strategy, setStrategy] = useState<MediaFileImportConflictStrategy>('skip');

  return (
    <GalleryModalFrame
      title={translate('gallery.importModal.mediaConflictTitle')}
      description={translate('gallery.importModal.mediaConflictDescription')}
      maxWidthClassName="max-w-lg"
      onClose={props.onClose}
    >
      <div className="mt-4 rounded-[4px] border border-[var(--sniptale-color-border-soft)] px-3">
        <div className="flex min-h-8 items-center justify-between gap-4 py-2 text-[13px] leading-[18px] font-medium">
          <span className="text-[var(--sniptale-color-text-secondary)]">
            {translate('gallery.importModal.mediaFilesSelected')}
          </span>
          <span className="font-medium tabular-nums">{props.fileCount}</span>
        </div>
        <div className="border-t border-[var(--sniptale-color-border-soft)] py-2">
          <div className="mb-1.5 text-xs font-semibold text-[var(--sniptale-color-text-primary)]">
            {translate('gallery.importModal.mediaExactMatches')} · {props.conflicts.length}
          </div>
          <ul className="max-h-28 space-y-1 overflow-y-auto" role="list">
            {props.conflicts.map((conflict, index) => (
              <li
                key={`${conflict.filename}-${conflict.size}-${index}`}
                className="flex items-center justify-between gap-3 text-[13px] leading-[18px]
                  text-[var(--sniptale-color-text-secondary)]"
              >
                <span className="min-w-0 break-words" title={conflict.filename}>
                  {conflict.filename}
                </span>
                <span className="shrink-0 tabular-nums text-[var(--sniptale-color-text-muted)]">
                  {formatBytes(conflict.size)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-4">
        <span className="mb-1 block text-[13px] leading-[18px] font-medium text-[var(--sniptale-color-text-secondary)]">
          {translate('gallery.importModal.conflictActionLabel')}
        </span>
        <ProductSelect<MediaFileImportConflictStrategy>
          aria-label={translate('gallery.importModal.conflictActionLabel')}
          value={strategy}
          controlSize="md"
          containerClassName="w-full"
          className="w-full"
          options={STRATEGIES.map((value) => ({ value, label: getStrategyTitle(value) }))}
          onChange={setStrategy}
        />
        <p className="mt-1.5 text-sm leading-5 font-normal text-[var(--sniptale-color-text-secondary)]">
          {getStrategyDescription(strategy)}
        </p>
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <ProductActionButton compact type="button" onClick={props.onClose} tone="secondary">
          {translate('common.actions.cancel')}
        </ProductActionButton>
        <ProductActionButton compact type="button" onClick={() => props.onImport(strategy)}>
          <Library className="h-4 w-4" aria-hidden="true" />
          {translate('gallery.importModal.mediaConflictContinue')}
        </ProductActionButton>
      </div>
    </GalleryModalFrame>
  );
}
