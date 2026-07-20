import { Pencil, Save, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { translate } from '../../../../platform/i18n';
import { CompactInput } from '../../../../ui/compact-inspector-controls';
import type { PageStyleInspectorActions, PageStyleInspectorViewState } from '../types';
import {
  getTemplateDisabledReason,
  getTemplatePropertyGroups,
  getTemplateWarningReason,
  type Template,
} from './model';
import { IconAction, TemplateRowActions, type TemplateActionRunner } from './row-actions';

export function TemplateRow(props: {
  actionRunner: TemplateActionRunner;
  actions: PageStyleInspectorActions;
  selection: PageStyleInspectorViewState['selection'];
  template: Template;
}) {
  const model = useTemplateRowModel(props);

  return (
    <div
      className={[
        'grid gap-2 rounded-[10px] border border-[color:var(--sniptale-color-border-soft)] p-2',
        'bg-[var(--sniptale-color-surface-panel)]',
      ].join(' ')}
    >
      <TemplateRowHeader
        editing={model.editing}
        name={model.name}
        pending={model.pending}
        template={props.template}
        onCancel={model.cancelRename}
        onEdit={() => model.setEditing(true)}
        onNameChange={model.setName}
        onSaveName={model.saveName}
      />
      <TemplateDetails
        disabledReason={model.disabledReason}
        template={props.template}
        warningReason={model.warningReason}
      />
      <TemplateRowActions
        actionRunner={props.actionRunner}
        actions={props.actions}
        disabledReason={model.disabledReason}
        pending={model.pending}
        template={props.template}
      />
    </div>
  );
}

function useTemplateRowModel(props: {
  actionRunner: TemplateActionRunner;
  actions: PageStyleInspectorActions;
  selection: PageStyleInspectorViewState['selection'];
  template: Template;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(props.template.name);
  const disabledReason = getTemplateDisabledReason(props.template, props.selection);
  const warningReason = getTemplateWarningReason(props.template);
  const pending =
    props.actionRunner.status?.state === 'pending' &&
    props.actionRunner.status.templateId === props.template.id;

  useEffect(() => {
    setName(props.template.name);
  }, [props.template.name]);

  return {
    cancelRename: () => {
      setName(props.template.name);
      setEditing(false);
    },
    disabledReason,
    editing,
    name,
    pending,
    saveName: () => {
      setEditing(false);
      void props.actionRunner.run({
        action: () => props.actions.renameTemplate(props.template, name),
        kind: 'rename',
        template: props.template,
      });
    },
    setEditing,
    setName,
    warningReason,
  };
}

function TemplateRowHeader(props: {
  editing: boolean;
  name: string;
  onCancel: () => void;
  onEdit: () => void;
  onNameChange: (value: string) => void;
  onSaveName: () => void;
  pending: boolean;
  template: Template;
}) {
  return props.editing ? (
    <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-1">
      <CompactInput
        aria-label={translate('content.pageStyleInspector.templateName')}
        disabled={props.pending}
        value={props.name}
        onChange={(event) => props.onNameChange(event.currentTarget.value)}
      />
      <IconAction
        disabled={props.pending}
        icon={<Save size={14} />}
        label={translate('content.pageStyleInspector.renameTemplate')}
        onClick={props.onSaveName}
      />
      <IconAction
        disabled={props.pending}
        icon={<X size={14} />}
        label={translate('content.pageStyleInspector.cancelTemplateRename')}
        onClick={props.onCancel}
      />
    </div>
  ) : (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
      <div className="min-w-0">
        <div className="truncate text-xs font-bold text-[var(--sniptale-color-text-primary)]">
          {props.template.name}
        </div>
        <div className="truncate text-[11px] text-[var(--sniptale-color-text-dim)]">
          {props.template.propertySummary.join(', ') || '-'}
        </div>
      </div>
      <IconAction
        disabled={props.pending}
        icon={<Pencil size={14} />}
        label={translate('content.pageStyleInspector.renameTemplate')}
        onClick={props.onEdit}
      />
    </div>
  );
}

function TemplateDetails(props: {
  disabledReason: string | null;
  template: Template;
  warningReason: string | null;
}) {
  const assetCount = props.template.patch.assets.length;
  const declarationCount = props.template.patch.declarations.length;
  const groups = getTemplatePropertyGroups(props.template);

  return (
    <div className="grid gap-1 text-[11px] text-[var(--sniptale-color-text-dim)]">
      <div>
        {declarationCount} {translate('content.pageStyleInspector.templateDeclarations')} /{' '}
        {assetCount} {translate('content.pageStyleInspector.templateAssets')}
      </div>
      {groups.length > 0 ? (
        <div className="grid gap-1">
          {groups.map((group) => (
            <div
              key={group.key}
              className="rounded-[8px] border border-[color:var(--sniptale-color-border-soft)] px-2 py-1"
            >
              <div className="font-bold text-[var(--sniptale-color-text-secondary)]">
                {translate(group.labelKey)}
              </div>
              <div className="mt-0.5 line-clamp-2 break-words">{group.items.join(', ')}</div>
            </div>
          ))}
        </div>
      ) : null}
      {props.disabledReason ? (
        <div className="font-semibold text-[var(--sniptale-color-warning)]">
          {props.disabledReason}
        </div>
      ) : null}
      {props.warningReason ? (
        <div className="font-semibold text-[var(--sniptale-color-warning)]">
          {props.warningReason}
        </div>
      ) : null}
    </div>
  );
}
