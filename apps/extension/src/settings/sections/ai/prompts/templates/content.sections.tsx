import { MessageSquare } from 'lucide-react';

import { translate } from '../../../../../platform/i18n';
import type { PromptTemplate } from '../../../../../contracts/settings';
import {
  SettingsCollection,
  SettingsSectionHeader,
  type SettingsCollectionAction,
  type SettingsCollectionItem,
} from '../../../../section-surface';
import { getTemplateCountLabel } from './helpers';

const templateIconClassName = [
  'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border',
  'border-[color:color-mix(in_srgb,var(--sniptale-color-info)_24%,var(--sniptale-color-border-soft)_76%)]',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-info)_10%,transparent)]',
  'text-[var(--sniptale-color-info)]',
].join(' ');

export function TemplatesHeader() {
  return (
    <SettingsSectionHeader
      description={translate('templates.section.subtitle')}
      kicker={translate('settings.navigation.templates')}
    />
  );
}

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
  isLoading: boolean;
  onDelete: (template: PromptTemplate) => void;
  onEdit: (template: PromptTemplate) => void;
  onAdd: () => void;
  templates: PromptTemplate[];
}) {
  const items: readonly SettingsCollectionItem[] = props.templates.map((template) => ({
    id: template.id,
    title: template.name,
    meta: template.content,
    preview: <MessageSquare size={14} className={templateIconClassName} />,
    busy: props.isLoading,
    badges: template.isDefault
      ? [{ id: 'system', label: translate('settings.collection.defaultBadge'), tone: 'neutral' }]
      : [],
    capabilities: { edit: true, delete: true },
  }));
  const byId = new Map(props.templates.map((template) => [template.id, template]));
  const onAction = (action: SettingsCollectionAction) => {
    const template = byId.get(action.itemId);
    if (!template) return;
    if (action.type === 'edit') props.onEdit(template);
    if (action.type === 'delete') props.onDelete(template);
  };
  return (
    <SettingsCollection
      ariaLabel={translate('templates.section.savedLabel')}
      title={translate('templates.section.savedLabel')}
      items={items}
      countLabel={`${items.length} ${getTemplateCountLabel(items.length)}`}
      state={props.isLoading ? 'loading' : 'ready'}
      emptyState={<EmptyState />}
      addAction={{
        label: translate('templates.section.addButton'),
        disabled: props.isLoading,
        onInvoke: props.onAdd,
      }}
      onAction={onAction}
    />
  );
}
