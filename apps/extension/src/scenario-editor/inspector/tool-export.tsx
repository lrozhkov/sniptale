import { Download } from 'lucide-react';
import { translate } from '../../platform/i18n';
import { InspectorSection } from './fields';
import type { ScenarioInspectorExportCommand } from './types';

const SCENARIO_EXPORT_BUTTON_CLASS_NAME = [
  'inline-flex h-9 items-center justify-center gap-2 rounded-[8px]',
  'border border-[color:color-mix(in_srgb,var(--sniptale-color-accent)_34%,var(--sniptale-color-border-soft)_66%)]',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-accent-soft)_48%,var(--sniptale-color-surface-panel)_52%)]',
  'px-3 text-sm font-semibold text-[var(--sniptale-color-accent-emphasis)]',
  'shadow-sm transition-colors',
  'hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-accent-soft)_68%,var(--sniptale-color-surface-panel)_32%)]',
  'focus-visible:outline-none focus-visible:ring-2',
  'focus-visible:ring-[color:color-mix(in_srgb,var(--sniptale-color-accent)_34%,transparent)]',
].join(' ');

export function ScenarioExportToolInspector(props: { command: ScenarioInspectorExportCommand }) {
  return (
    <div className="grid gap-5" data-ui="scenario.inspector.export-tool">
      <InspectorSection title={translate('scenario.editor.export')}>
        <button
          type="button"
          className={SCENARIO_EXPORT_BUTTON_CLASS_NAME}
          onClick={props.command.onOpenExport}
        >
          <Download size={16} strokeWidth={2} aria-hidden="true" />
          {translate('scenario.editor.export')}
        </button>
      </InspectorSection>
    </div>
  );
}
