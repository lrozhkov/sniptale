import { useEffect, useState } from 'react';
import { ProductInput, ProductSelect } from '@sniptale/ui/product-form-controls';
import { ProductConfirmDialog } from '@sniptale/ui/product-feedback/confirm-dialog';
import { getControlSecondaryButtonClassName } from '@sniptale/ui/control-language';
import { translate } from '../../../../../platform/i18n';
import { settingsSectionClassName, SettingsSectionHeader } from '../../../../section-surface';
import { useAnnotationTemplateTagsController } from './controller';

type Controller = ReturnType<typeof useAnnotationTemplateTagsController>;

function TagRow(props: { controller: Controller; id: string; label: string }) {
  const [draft, setDraft] = useState(props.label);
  const [mergeTarget, setMergeTarget] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => setDraft(props.label), [props.label]);
  const options = props.controller.state.tags
    .filter((tag) => tag.id !== props.id)
    .map((tag) => ({ label: tag.label, value: tag.id }));
  return (
    <div className="grid gap-2 border-b border-[var(--sniptale-color-border-subtle)] p-3 last:border-b-0">
      <div className="flex items-center gap-2">
        <ProductInput
          aria-label={translate('highlighter.templateTags.name')}
          maxLength={32}
          onChange={(event) => setDraft(event.currentTarget.value)}
          value={draft}
        />
        <button
          className={getControlSecondaryButtonClassName({ density: 'compact' })}
          disabled={!draft.trim() || draft === props.label}
          onClick={() => void props.controller.actions.rename(props.id, draft.trim())}
          type="button"
        >
          {translate('highlighter.templateTags.rename')}
        </button>
        <button
          className={getControlSecondaryButtonClassName({ density: 'compact', tone: 'danger' })}
          onClick={() => setConfirmDelete(true)}
          type="button"
        >
          {translate('highlighter.templateTags.delete')}
        </button>
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-[var(--sniptale-color-text-dim)]">
          {translate('highlighter.templateTags.usage').replace(
            '{count}',
            String(props.controller.usage.get(props.id) ?? 0)
          )}
        </span>
        {options.length > 0 ? (
          <span className="flex items-center gap-2">
            <ProductSelect
              aria-label={translate('highlighter.templateTags.mergeTarget')}
              className="min-w-40"
              onChange={setMergeTarget}
              options={options}
              value={mergeTarget}
            />
            <button
              className={getControlSecondaryButtonClassName({ density: 'compact' })}
              disabled={!mergeTarget}
              onClick={() => void props.controller.actions.merge(props.id, mergeTarget)}
              type="button"
            >
              {translate('highlighter.templateTags.merge')}
            </button>
          </span>
        ) : null}
      </div>
      <ProductConfirmDialog
        cancelText={translate('common.actions.cancel')}
        confirmText={translate('highlighter.templateTags.delete')}
        isOpen={confirmDelete}
        message={translate('highlighter.templateTags.deleteDescription')}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          const deleted = await props.controller.actions.delete(props.id);
          if (deleted) setConfirmDelete(false);
        }}
        title={translate('highlighter.templateTags.deleteTitle')}
      />
    </div>
  );
}

export function AnnotationTemplateTagsSettings() {
  const controller = useAnnotationTemplateTagsController();
  const [label, setLabel] = useState('');
  return (
    <section className={settingsSectionClassName}>
      <SettingsSectionHeader
        description={translate('highlighter.templateTags.description')}
        kicker={translate('highlighter.templateTags.title')}
      />
      <div className="mb-4 flex gap-2">
        <ProductInput
          aria-label={translate('highlighter.templateTags.name')}
          maxLength={32}
          onChange={(event) => setLabel(event.currentTarget.value)}
          value={label}
        />
        <button
          className={getControlSecondaryButtonClassName({ density: 'compact' })}
          disabled={!label.trim() || controller.state.tags.length >= 32}
          onClick={() =>
            void controller.actions.create(label.trim()).then((created) => {
              if (created) setLabel('');
            })
          }
          type="button"
        >
          {translate('highlighter.templateTags.add')}
        </button>
      </div>
      <div className="overflow-hidden rounded-xl border border-[var(--sniptale-color-border-soft)]">
        {controller.isLoading ? (
          <div className="p-4 text-sm">{translate('common.states.loading')}</div>
        ) : controller.error ? (
          <div className="p-4 text-sm" role="alert">
            {translate('highlighter.templateTags.loadError')}
          </div>
        ) : controller.state.tags.length === 0 ? (
          <div className="p-4 text-sm text-[var(--sniptale-color-text-dim)]">
            {translate('highlighter.templateTags.assignmentEmpty')}
          </div>
        ) : (
          controller.state.tags.map((tag) => (
            <TagRow controller={controller} id={tag.id} key={tag.id} label={tag.label} />
          ))
        )}
      </div>
    </section>
  );
}
