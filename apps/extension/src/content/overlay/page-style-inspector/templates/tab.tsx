import { translate } from '../../../../platform/i18n';
import { InspectorEmptyList, InspectorSearchInput } from '../list-controls';
import type { PageStyleInspectorActions, PageStyleInspectorViewState } from '../types';
import { RegistryStatusNotice } from '../registry/status';
import { templateMatchesQuery } from './model';
import { TemplateRow } from './row';
import { TemplateStatusBanner, useTemplateActionRunner } from './status';

export function TemplatesTab(props: {
  actions: PageStyleInspectorActions;
  state: PageStyleInspectorViewState;
}) {
  const query = props.state.templateQuery.trim().toLocaleLowerCase();
  const templates = props.state.templates.filter((template) =>
    templateMatchesQuery(template, query)
  );
  const actionRunner = useTemplateActionRunner();

  if (props.state.templates.length === 0) {
    return (
      <div className="grid gap-2">
        <TemplateRegistryStatus state={props.state} />
        <InspectorEmptyList copy={translate('content.pageStyleInspector.noTemplates')} />
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      <TemplateRegistryStatus state={props.state} />
      <InspectorSearchInput
        value={props.state.templateQuery}
        placeholder={translate('content.pageStyleInspector.searchTemplates')}
        onChange={props.actions.setTemplateQuery}
      />
      <TemplateStatusBanner status={actionRunner.status} />
      {templates.length === 0 ? (
        <InspectorEmptyList copy={translate('content.pageStyleInspector.noTemplatesMatched')} />
      ) : (
        <TemplateRows actionRunner={actionRunner} {...props} templates={templates} />
      )}
    </div>
  );
}

function TemplateRegistryStatus(props: { state: PageStyleInspectorViewState }) {
  return (
    <RegistryStatusNotice error={props.state.registryError} loading={props.state.registryLoading} />
  );
}

function TemplateRows(props: {
  actionRunner: ReturnType<typeof useTemplateActionRunner>;
  actions: PageStyleInspectorActions;
  state: PageStyleInspectorViewState;
  templates: PageStyleInspectorViewState['templates'];
}) {
  return (
    <div className="grid max-h-[360px] gap-2 overflow-y-auto pr-1">
      {props.templates.map((template) => (
        <TemplateRow
          key={template.id}
          actions={props.actions}
          actionRunner={props.actionRunner}
          selection={props.state.selection}
          template={template}
        />
      ))}
    </div>
  );
}
