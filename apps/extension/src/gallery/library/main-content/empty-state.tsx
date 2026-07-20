import { AlertTriangle } from 'lucide-react';
import { translate } from '../../../platform/i18n';
import type { GalleryMainContentProps } from './types';

export function GalleryEmptyState(props: {
  folderFilter: GalleryMainContentProps['folderFilter'];
}) {
  const title =
    props.folderFilter === 'scenario'
      ? translate('gallery.app.emptyScenarioTitle')
      : translate('gallery.app.emptyTitle');
  const description =
    props.folderFilter === 'scenario'
      ? translate('gallery.app.emptyScenarioDescription')
      : translate('gallery.app.emptyDescription');

  return (
    <div
      className="flex h-full min-h-[420px] flex-col items-center justify-center rounded-[16px]
        border border-dashed border-[var(--sniptale-color-border-soft)]
        bg-[var(--sniptale-color-surface-panel)] text-center text-[var(--sniptale-color-text-muted)]"
    >
      <AlertTriangle className="mb-3 h-8 w-8 text-[var(--sniptale-color-text-muted)]" />
      <div className="text-lg font-semibold text-[var(--sniptale-color-text-primary)]">{title}</div>
      <div className="mt-2 max-w-md text-sm leading-6">{description}</div>
    </div>
  );
}
