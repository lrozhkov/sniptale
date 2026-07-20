import { MessageSquare, Pencil, Plus, Trash2 } from 'lucide-react';

import { translate } from '../../../platform/i18n';
import type { PromptTemplate } from '../../../contracts/settings';
import { DelayedSettingsCardLoadingState } from '../../section-surface/loading-state';
import {
  getSettingsHoverActionsClassName,
  settingsAddButtonClassName,
  settingsDangerIconButtonClassName,
  settingsEmptyStateClassName,
  settingsInfoIconButtonClassName,
  settingsListRowClassName,
} from '../../section-surface/panel-controls';
import { settingsMetaLabelClassName, SettingsSectionHeader } from '../../section-surface';
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

export function TemplatesSummary(props: { count: number }) {
  return (
    <div className="mb-6 flex items-center justify-between">
      <span className={settingsMetaLabelClassName}>
        {translate('templates.section.savedLabel')}
      </span>
      <span className="text-xs text-[var(--sniptale-color-text-dim)]">
        {props.count} {getTemplateCountLabel(props.count)}
      </span>
    </div>
  );
}

function LoadingState() {
  return <DelayedSettingsCardLoadingState />;
}

function EmptyState() {
  return (
    <div className={settingsEmptyStateClassName}>
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

function TemplateRowActions(props: {
  isHovered: boolean;
  isLoading: boolean;
  onDelete: () => void;
  onEdit: () => void;
}) {
  return (
    <div className={getSettingsHoverActionsClassName(props.isHovered)}>
      <button
        onClick={props.onEdit}
        disabled={props.isLoading}
        className={settingsInfoIconButtonClassName}
        title={translate('common.actions.edit')}
      >
        <Pencil size={14} />
      </button>
      <button
        onClick={props.onDelete}
        disabled={props.isLoading}
        className={settingsDangerIconButtonClassName}
        title={translate('common.actions.delete')}
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

function TemplateRow(props: {
  hoveredTemplateId: string | null;
  isLoading: boolean;
  onDelete: (template: PromptTemplate) => void;
  onEdit: (template: PromptTemplate) => void;
  onHoverChange: (id: string | null) => void;
  template: PromptTemplate;
}) {
  const isHovered = props.hoveredTemplateId === props.template.id;

  return (
    <div
      key={props.template.id}
      onMouseEnter={() => props.onHoverChange(props.template.id)}
      onMouseLeave={() => props.onHoverChange(null)}
      className={settingsListRowClassName}
    >
      <div className="flex w-full min-w-0 items-start gap-3">
        <div className={templateIconClassName}>
          <MessageSquare size={14} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-1 text-sm font-medium text-[var(--sniptale-color-text-primary)]">
            {props.template.name}
          </div>
          <div className="line-clamp-2 break-words text-xs text-[var(--sniptale-color-text-dim)]">
            {props.template.content}
          </div>
        </div>

        <TemplateRowActions
          isHovered={isHovered}
          isLoading={props.isLoading}
          onDelete={() => props.onDelete(props.template)}
          onEdit={() => props.onEdit(props.template)}
        />
      </div>
    </div>
  );
}

export function AddTemplateButton(props: { disabled: boolean; onClick: () => void }) {
  return (
    <button
      onClick={props.onClick}
      disabled={props.disabled}
      className={`${settingsAddButtonClassName} disabled:cursor-not-allowed disabled:opacity-50`}
    >
      <Plus size={16} />
      {translate('templates.section.addButton')}
    </button>
  );
}

export function TemplatesList(props: {
  hoveredTemplateId: string | null;
  isLoading: boolean;
  onDelete: (template: PromptTemplate) => void;
  onEdit: (template: PromptTemplate) => void;
  onHoverChange: (id: string | null) => void;
  templates: PromptTemplate[];
}) {
  if (props.isLoading) {
    return <LoadingState />;
  }

  if (props.templates.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="mb-6 space-y-2">
      {props.templates.map((template) => (
        <TemplateRow
          key={template.id}
          template={template}
          hoveredTemplateId={props.hoveredTemplateId}
          isLoading={props.isLoading}
          onDelete={props.onDelete}
          onEdit={props.onEdit}
          onHoverChange={props.onHoverChange}
        />
      ))}
    </div>
  );
}
