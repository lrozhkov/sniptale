import type { ScenarioTemplatePackValidationResult } from '../../../features/scenario/project/v3/templates';
import { translate } from '../../../platform/i18n';

export function ScenarioTemplateImportResults(props: {
  error: string | null;
  result: ScenarioTemplatePackValidationResult | null;
}) {
  if (props.error) {
    return <div className="text-sm text-[var(--sniptale-color-danger)]">{props.error}</div>;
  }
  if (!props.result) {
    return (
      <div className="text-sm text-[var(--sniptale-color-text-muted)]">
        {translate('scenario.editor.noTemplateValidationResult')}
      </div>
    );
  }

  return (
    <div className="grid gap-3" data-ui="scenario.templates.import-results">
      <ResultSection
        label={translate('scenario.editor.templatesAccepted')}
        value={props.result.acceptedTemplates.length}
      />
      <ResultSection
        label={translate('scenario.editor.rejectedTemplates')}
        value={props.result.rejectedTemplates.length}
      />
      {props.result.rejectedTemplates.length > 0 ? (
        <ul className="grid gap-1 text-xs text-[var(--sniptale-color-text-muted)]">
          {props.result.rejectedTemplates.map((template) => (
            <li key={`${template.path}:${template.reason}`}>
              {template.path}: {template.reason}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function ResultSection(props: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-[var(--sniptale-color-text-muted)]">{props.label}</span>
      <span className="font-medium text-[var(--sniptale-color-text-primary)]">{props.value}</span>
    </div>
  );
}
