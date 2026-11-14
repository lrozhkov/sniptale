import { useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { ProductActionButton as ProductButton } from '@sniptale/ui/product-modal/actions';
import { CompactInput, CompactSelect, EditorIconButton } from '../../chrome/ui';
import {
  useEditorVectorLibrarySession,
  useEditorVectorLibrarySnapshot,
} from '../../application/vector-elements/context';
import { translate } from '../../../platform/i18n';
const message = (
  key: keyof (typeof import('../../../platform/i18n/catalogs/en.json'))['editor']['elements']
) => translate(`editor.elements.${key}`);
export function EditorElementsDownloads() {
  const session = useEditorVectorLibrarySession(),
    state = useEditorVectorLibrarySnapshot();
  const [prefix, setPrefix] = useState('');
  return (
    <>
      {' '}
      <section className="space-y-2">
        <h3 className="font-medium">{message('download')}</h3>
        <p className="leading-5 text-[var(--sniptale-color-text-secondary)]">
          {message('downloadHint')}
        </p>
        <CompactSelect
          aria-label={message('collectionFilter')}
          value={prefix}
          options={[
            { value: '', label: message('allCollections') },
            ...state.remoteCollections.map((collection) => ({
              value: collection.prefix,
              label: collection.name,
            })),
          ]}
          onChange={setPrefix}
        />
        <ProductButton
          tone="secondary"
          compact
          type="button"
          disabled={
            !prefix || !state.settings?.networkEnabled || state.download?.status === 'downloading'
          }
          onClick={() => void session.downloadCollection(prefix)}
          data-ui="editor.elements.download"
        >
          {state.download?.status === 'partial' ? message('resume') : message('download')}
        </ProductButton>
        {state.download ? (
          <div role="status" className="flex items-center gap-2">
            <span className="min-w-0 flex-1 break-words">
              {state.download.prefix}: {state.download.accepted}/{state.download.total} ·{' '}
              {message(state.download.status === 'error' ? 'downloadError' : state.download.status)}
            </span>
            {state.download.status === 'downloading' ? (
              <EditorIconButton
                title={message('cancelDownload')}
                aria-label={message('cancelDownload')}
                onClick={() => void session.cancelDownload()}
              >
                <X size={14} />
              </EditorIconButton>
            ) : null}
          </div>
        ) : null}
      </section>
      {state.downloads.length ? (
        <section className="space-y-2">
          <h3 className="font-medium">{message('downloadProgress')}</h3>
          {state.downloads.map((row) => {
            const prefix = row.prefix,
              sameSource = row.source?.sourceId === state.settings?.baseUrl;
            return (
              <div key={row.key} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 break-words">
                  {state.local.collections.find((collection) => collection.id === row.collectionId)
                    ?.name ??
                    prefix ??
                    row.collectionId}
                  : {Object.keys(row.accepted).length}/{row.manifest.length} ·{' '}
                  {message(
                    row.status === 'ready'
                      ? 'ready'
                      : row.status === 'error'
                        ? 'downloadError'
                        : 'partial'
                  )}
                </span>
                {row.status !== 'ready' ? (
                  <ProductButton
                    tone="secondary"
                    compact
                    disabled={
                      !prefix ||
                      !sameSource ||
                      !state.settings?.networkEnabled ||
                      state.download?.status === 'downloading'
                    }
                    onClick={() => {
                      if (prefix) void session.downloadCollection(prefix);
                    }}
                  >
                    {message('resume')}
                  </ProductButton>
                ) : null}
              </div>
            );
          })}
        </section>
      ) : null}
    </>
  );
}
export function EditorElementsCollections() {
  const session = useEditorVectorLibrarySession(),
    state = useEditorVectorLibrarySnapshot();
  const [name, setName] = useState('');
  const [renames, setRenames] = useState<Record<string, string>>({});
  return (
    <section className="space-y-2">
      <h3 className="font-medium">{message('collections')}</h3>
      <div className="flex items-center gap-1">
        <CompactInput
          aria-label={message('collectionName')}
          placeholder={message('collectionName')}
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={120}
        />
        <EditorIconButton
          title={message('createCollection')}
          aria-label={message('createCollection')}
          disabled={!name.trim() || state.busy}
          onClick={() => {
            void session.createCollection(name).then((saved) => {
              if (saved) setName('');
            });
          }}
        >
          <Plus size={16} />
        </EditorIconButton>
      </div>
      {!state.local.collections.length ? (
        <p className="text-[var(--sniptale-color-text-secondary)]">{message('noCollections')}</p>
      ) : (
        state.local.collections.map((collection) => (
          <div key={collection.id} className="flex min-w-0 items-center gap-1">
            <CompactInput
              aria-label={message('collectionName')}
              value={renames[collection.id] ?? collection.name}
              onChange={(event) =>
                setRenames((current) => ({ ...current, [collection.id]: event.target.value }))
              }
              onBlur={() => {
                const next = renames[collection.id]?.trim();
                if (next && next !== collection.name)
                  void session.renameCollection(collection.id, collection.incarnation, next);
              }}
              maxLength={120}
            />
            <EditorIconButton
              title={message('removeCollection')}
              aria-label={`${message('removeCollection')}: ${collection.name}`}
              disabled={state.busy}
              onClick={() => void session.removeCollection(collection.id, collection.incarnation)}
            >
              <Trash2 size={14} />
            </EditorIconButton>
          </div>
        ))
      )}
      <p className="leading-5 text-[var(--sniptale-color-text-secondary)]">
        {message('deleteHint')}
      </p>
    </section>
  );
}
