import { translate } from '../../../platform/i18n';

export function ScenarioProjectsHeader() {
  return (
    <div className="flex items-center gap-2">
      <div
        className="rounded-full border border-[var(--sniptale-color-border-soft)] px-2.5 py-1
          text-[10px] font-semibold uppercase tracking-[0.12em]
          text-[var(--sniptale-color-text-muted)]"
      >
        {translate('scenario.editor.projectsTool')}
      </div>
    </div>
  );
}
