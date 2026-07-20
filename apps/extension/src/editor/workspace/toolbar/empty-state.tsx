import { translate } from '../../../platform/i18n';

export function EditorToolbarEmptyState() {
  return (
    <div className="flex min-w-0 flex-1 items-center justify-between gap-4 px-4 py-2">
      <div className="min-w-0">
        <div className="text-sm font-semibold text-[var(--sniptale-color-text-primary)]">
          {translate('editor.page.title')}
        </div>
        <div className="text-xs leading-5 text-[var(--sniptale-color-text-muted)]">
          {translate('editor.page.subtitle')}
        </div>
      </div>
    </div>
  );
}
