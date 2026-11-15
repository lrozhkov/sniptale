import { useEffect } from 'react';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { ProductActionButton as ProductButton } from '@sniptale/ui/product-modal/actions';
import { EditorIconButton } from '../../chrome/ui';
import { editorVectorErrorMessage } from './catalog';
import { formatBytes } from '../../../platform/i18n/format-bytes';
import { EditorDocumentVectorSources } from './document-sources';
import { EditorElementsSourceSettings } from './source-settings';
import { EditorElementsDownloads, EditorElementsCollections } from './collections';
import {
  useEditorVectorLibrarySession,
  useEditorVectorLibrarySnapshot,
} from '../../application/vector-elements/context';
import { translate } from '../../../platform/i18n';
const message = (
  key: keyof (typeof import('../../../platform/i18n/catalogs/en.json'))['editor']['elements']
) => translate(`editor.elements.${key}`);
export function EditorElementsManagement({ onBack }: { onBack(): void }) {
  const session = useEditorVectorLibrarySession(),
    state = useEditorVectorLibrarySnapshot();
  useEffect(() => {
    void session.refreshCacheUsage();
  }, [session]);
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-ui="editor.elements.management">
      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--sniptale-color-border-soft)] p-2">
        <EditorIconButton title={message('back')} aria-label={message('back')} onClick={onBack}>
          <ArrowLeft size={16} />
        </EditorIconButton>
        <span className="text-sm">{message('manage')}</span>
      </div>
      <div
        className="min-h-0 flex-1 space-y-5 overflow-y-auto p-3 text-xs"
        data-ui="editor.elements.management-scroll"
      >
        {state.error ? (
          <p role="alert" className="text-[var(--sniptale-color-danger)]">
            {editorVectorErrorMessage(state.errorCode)}
          </p>
        ) : null}
        {state.imports.length ? (
          <section className="space-y-2">
            <h3 className="font-medium">{message('importResults')}</h3>
            {state.imports.map((result, index) => (
              <div key={`${result.name}:${index}`} className="break-words">
                <div>{result.name}</div>
                <div className="text-[var(--sniptale-color-text-secondary)]">
                  {message('accepted')}: {result.accepted} · {message('declined')}:{' '}
                  {result.declined}
                </div>
              </div>
            ))}
          </section>
        ) : null}
        <EditorDocumentVectorSources />
        <EditorElementsSourceSettings />
        <EditorElementsDownloads />
        <EditorElementsCollections />
        <section className="space-y-2">
          <h3 className="font-medium">{message('presets')}</h3>
          {!state.local.presets.length ? (
            <p className="text-[var(--sniptale-color-text-secondary)]">{message('noPresets')}</p>
          ) : (
            state.local.presets.map((preset) => (
              <div key={preset.id} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 break-words">{preset.name}</span>
                <EditorIconButton
                  title={message('removePreset')}
                  aria-label={`${message('removePreset')}: ${preset.name}`}
                  disabled={state.busy}
                  onClick={() => void session.removePreset(preset.id, preset.incarnation)}
                >
                  <Trash2 size={14} />
                </EditorIconButton>
              </div>
            ))
          )}
        </section>
        <section className="space-y-2">
          <p
            className="leading-5 text-[var(--sniptale-color-text-secondary)]"
            data-ui="editor.elements.cache-usage"
          >
            {state.cacheUsage
              ? message('cacheUsage')
                  .replace('{used}', formatBytes(state.cacheUsage.bytes))
                  .replace('{budget}', formatBytes(state.cacheUsage.budgetBytes))
              : message('cacheUsageUnknown')}
          </p>
          <ProductButton
            tone="secondary"
            compact
            type="button"
            disabled={state.busy}
            onClick={() => void session.clearCache()}
            data-ui="editor.elements.clear-cache"
          >
            {message('clearCache')}
          </ProductButton>
          <p className="leading-5 text-[var(--sniptale-color-text-secondary)]">
            {message('cacheHint')}
          </p>
        </section>
      </div>
    </div>
  );
}
