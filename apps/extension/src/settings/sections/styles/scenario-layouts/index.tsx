import { useState } from 'react';
import { LayoutTemplate } from 'lucide-react';
import { ProductConfirmDialog } from '@sniptale/ui/product-feedback/confirm-dialog';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { SettingsCollection, settingsSectionClassName } from '../../../section-surface';
import { translate, useAppLocale } from '../../../../platform/i18n';
import { useScenarioLayoutsSettings } from './controller';

export function ScenarioLayoutsSection() {
  useAppLocale();
  const state = useScenarioLayoutsSettings();
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteFailed, setDeleteFailed] = useState(false);
  return (
    <section className={settingsSectionClassName} data-ui="settings.scenario-layouts">
      <p className="mb-4 text-sm text-[var(--sniptale-color-text-secondary)]">
        {translate('scenario.editor.templateCatalogHelp')}
      </p>
      {state.error && (
        <div role="alert" className="mb-3 text-sm">
          <p>{translate('scenario.editor.templateCatalogFailed')}</p>
          <ProductActionButton
            tone="secondary"
            compact
            disabled={state.busy}
            onClick={() => void state.reload()}
          >
            {translate('scenario.editor.guideRetry')}
          </ProductActionButton>
        </div>
      )}
      <SettingsCollection
        ariaLabel={translate('settings.navigation.scenarioLayouts')}
        state={state.loading ? 'loading' : state.error && !state.entries.length ? 'error' : 'ready'}
        errorState={translate('scenario.editor.templateLoadFailed')}
        emptyState={translate('scenario.editor.templateEmpty')}
        addAction={{
          label: translate('scenario.editor.templateCreate'),
          disabled: state.busy,
          onInvoke: () => void state.create(),
        }}
        items={state.entries.map((entry) => ({
          id: entry.id,
          title: entry.name,
          preview: <LayoutTemplate size={22} aria-hidden="true" />,
          previewVariant: 'icon',
          busy: state.busy,
          ...(entry.availability !== 'available'
            ? { meta: translate('scenario.editor.templateUnavailable') }
            : {}),
          capabilities: { edit: entry.availability === 'available', delete: true },
        }))}
        onAction={(action) => {
          if (action.type === 'edit') void state.edit(action.itemId);
          if (action.type === 'delete') {
            setDeleteFailed(false);
            setDeleting(action.itemId);
          }
        }}
      />
      <ProductConfirmDialog
        isOpen={deleting !== null}
        isLoading={state.busy}
        title={translate('scenario.editor.templateDeleteTitle')}
        message={
          deleteFailed
            ? translate('scenario.editor.templateCatalogFailed')
            : translate('scenario.editor.templateDeleteHelp')
        }
        confirmText={translate('common.actions.delete')}
        cancelText={translate('common.actions.cancel')}
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          if (await state.remove(deleting)) setDeleting(null);
          else setDeleteFailed(true);
        }}
      />
    </section>
  );
}
