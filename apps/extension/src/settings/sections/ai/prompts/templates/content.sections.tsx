import { MessageSquare } from 'lucide-react';

import { translate } from '../../../../../platform/i18n';
import type { PromptTemplate } from '../../../../../contracts/settings';
import {
  SettingsCollection,
  type SettingsCollectionAction,
  type SettingsCollectionItem,
  type SettingsCollectionMoveIntent,
} from '../../../../section-surface';

function EmptyState() {
  return (
    <div>
      <MessageSquare size={32} className="mx-auto mb-3 text-[var(--sniptale-color-text-dim)]" />
      <p className="mb-1 text-sm text-[var(--sniptale-color-text-muted)]">
        {translate('templates.section.emptyTitle')}
      </p>
      <p className="text-xs text-[var(--sniptale-color-text-dim)]">
        {translate('templates.section.emptyDescription')}
      </p>
    </div>
  );
}

export function TemplatesList(props: {
  isBusy: boolean;
  isLoading: boolean;
  onDelete: (template: PromptTemplate) => void;
  onEdit: (template: PromptTemplate) => void;
  onMove: (itemId: string, beforeItemId: string | null) => Promise<void>;
  onReset: (templateId: string) => void;
  onToggle: (templateId: string, enabled: boolean) => void;
  onAdd: () => void;
  templates: PromptTemplate[];
}) {
  const items: readonly SettingsCollectionItem[] = props.templates.map((template) => ({
    id: template.id,
    title: template.name,
    meta: template.content,
    enabled: template.enabled !== false,
    busy: props.isBusy,
    capabilities: {
      edit: true,
      delete: template.isDefault !== true,
      reorder: true,
      reset: template.isDefault === true && template.customized === true,
      toggle: true,
    },
    actionLabels: {
      reset: translate('templates.section.restoreAction'),
    },
  }));
  const byId = new Map(props.templates.map((template) => [template.id, template]));
  const onAction = (action: SettingsCollectionAction) => {
    const template = byId.get(action.itemId);
    if (!template) return;
    if (action.type === 'edit') props.onEdit(template);
    if (action.type === 'delete') props.onDelete(template);
    if (action.type === 'reset') props.onReset(template.id);
    if (action.type === 'toggle') props.onToggle(template.id, action.nextChecked);
  };
  const onMove = (intent: SettingsCollectionMoveIntent) => {
    void props.onMove(intent.itemId, intent.beforeItemId);
  };
  return (
    <SettingsCollection
      ariaLabel={translate('templates.section.savedLabel')}
      items={items}
      state={props.isLoading ? 'loading' : 'ready'}
      emptyState={<EmptyState />}
      addAction={{
        label: translate('templates.section.addButton'),
        disabled: props.isLoading || props.isBusy,
        onInvoke: props.onAdd,
      }}
      onAction={onAction}
      onMove={onMove}
    />
  );
}
