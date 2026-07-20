import { Check, Cpu, Pencil, Plus, Trash2 } from 'lucide-react';

import { translate } from '../../../../platform/i18n';
import type { AIModel } from '../../../../contracts/settings';
import {
  aiProvidersAddButtonDisabledClassName,
  aiProvidersSectionCardClassName,
} from './constants';
import { getAiModelPromptLabel } from './helpers';
import {
  getSettingsHoverActionsClassName,
  settingsDangerIconButtonClassName,
  settingsInfoIconButtonClassName,
  settingsListRowClassName,
  settingsSuccessBadgeClassName,
} from '../../../section-surface/panel-controls';
import type { AiProvidersSectionState } from '../controller/types';

export function AIProvidersModelsCard(props: { state: AiProvidersSectionState }) {
  return (
    <section className={aiProvidersSectionCardClassName}>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--sniptale-color-text-primary)]">
          <Cpu size={16} className="text-[var(--sniptale-color-success)]" />
          {translate('settings.aiProviders.modelsTitle')}
        </h3>
        <button
          onClick={() => props.state.modals.openModelModal()}
          disabled={props.state.providers.length === 0}
          className={aiProvidersAddButtonDisabledClassName}
        >
          <Plus size={14} />
          {translate('common.actions.add')}
        </button>
      </div>

      {props.state.models.length === 0 ? (
        <AIProvidersModelsEmptyState hasProviders={props.state.providers.length > 0} />
      ) : (
        <div className="space-y-3">
          {props.state.models.map((model) => (
            <AIModelRow
              key={model.id}
              defaultModelId={props.state.defaultModelId}
              getProviderName={props.state.getProviderName}
              model={model}
              onDelete={() => props.state.modals.setConfirmDelete({ type: 'model', item: model })}
              onEdit={() => props.state.modals.openModelModal(model)}
              onSetDefault={() => props.state.handleDefaultModelChange(model.id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function AIProvidersModelsEmptyState(props: { hasProviders: boolean }) {
  return (
    <div className="py-8 text-center text-[var(--sniptale-color-text-dim)]">
      <Cpu size={32} className="mx-auto mb-3 opacity-50" />
      <p className="text-sm">{translate('settings.aiProviders.modelsEmptyTitle')}</p>
      <p className="mt-1 text-xs">
        {props.hasProviders
          ? translate('settings.aiProviders.modelsEmptyDescriptionWithProviders')
          : translate('settings.aiProviders.modelsEmptyDescriptionNoProviders')}
      </p>
    </div>
  );
}

function AIModelRowCopy(props: {
  getProviderName: (providerId: string) => string;
  model: AIModel;
}) {
  return (
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-2 font-medium text-[var(--sniptale-color-text-primary)]">
        <span className="truncate">{props.model.displayName}</span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--sniptale-color-text-dim)]">
        <span>{props.getProviderName(props.model.providerId)}</span>
        <span className="text-[var(--sniptale-color-text-dim)]">•</span>
        <span className="font-mono">{props.model.modelCode}</span>
      </div>
      <div className="mt-1 text-xs text-[var(--sniptale-color-text-dim)]">
        {translate('settings.aiProviders.defaultModelDescription')}
      </div>
      <div className="mt-1 text-xs text-[var(--sniptale-color-text-dim)]">
        {translate('settings.aiProviders.modelPromptPrefix')} {getAiModelPromptLabel(props.model)}
      </div>
    </div>
  );
}

function AIModelRowActions(props: {
  onDelete: () => void;
  onEdit: () => void;
  onSetDefault: () => Promise<void>;
}) {
  return (
    <div className="flex items-center gap-2">
      <AIProvidersIconButton
        onClick={() => void props.onSetDefault()}
        tone="info"
        title={translate('settings.aiProviders.defaultModelTitle')}
      >
        <Check size={14} />
      </AIProvidersIconButton>
      <AIProvidersIconButton
        onClick={props.onEdit}
        tone="info"
        title={translate('common.actions.edit')}
      >
        <Pencil size={14} />
      </AIProvidersIconButton>
      <AIProvidersIconButton
        onClick={props.onDelete}
        tone="danger"
        title={translate('common.actions.delete')}
      >
        <Trash2 size={14} />
      </AIProvidersIconButton>
    </div>
  );
}

function AIModelRow(props: {
  defaultModelId: string | null;
  getProviderName: (providerId: string) => string;
  model: AIModel;
  onDelete: () => void;
  onEdit: () => void;
  onSetDefault: () => Promise<void>;
}) {
  const isDefault = props.defaultModelId === props.model.id;

  return (
    <div className={settingsListRowClassName}>
      <div className="min-w-0 flex-1">
        <AIModelRowCopy getProviderName={props.getProviderName} model={props.model} />
      </div>
      <div className="flex flex-shrink-0 items-center gap-2">
        {isDefault ? (
          <span className={settingsSuccessBadgeClassName}>
            {translate('settings.aiProviders.modelDefaultBadge')}
          </span>
        ) : null}
        <div className={getSettingsHoverActionsClassName(false)}>
          <AIModelRowActions
            onDelete={props.onDelete}
            onEdit={props.onEdit}
            onSetDefault={props.onSetDefault}
          />
        </div>
      </div>
    </div>
  );
}

function AIProvidersIconButton(props: {
  children: React.ReactNode;
  onClick: () => void;
  tone: 'danger' | 'info';
  title: string;
}) {
  const className =
    props.tone === 'info' ? settingsInfoIconButtonClassName : settingsDangerIconButtonClassName;

  return (
    <button type="button" onClick={props.onClick} className={className} title={props.title}>
      {props.children}
    </button>
  );
}
