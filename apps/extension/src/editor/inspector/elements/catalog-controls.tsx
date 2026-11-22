import { useEffect, useId, useRef, useState, type Ref } from 'react';
import { Upload, SlidersHorizontal, Trash2, Star, Info } from 'lucide-react';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { EditorIconButton, SearchField } from '../../chrome/ui';
import type { EditorVectorCatalogEntry } from '../../application/vector-elements/session';
import { EditorVectorSourceNotice, editorVectorCollectionName } from './catalog';
import { getEditorVectorUserCatalogs } from '../../application/vector-elements/user-catalogs';
import { EditorElementsImportDialog } from './import-dialog';
import { ElementCollectionFilter } from './collection-filter';
import { EditorElementsCollectionDownload } from './collection-download';
import {
  useEditorVectorLibrarySession,
  useEditorVectorLibrarySnapshot,
} from '../../application/vector-elements/context';
import { INSPECTOR_CONTENT_INSET_CLASS_NAME } from '../chrome';
import { translate } from '../../../platform/i18n';

const message = (
  key: keyof (typeof import('../../../platform/i18n/catalogs/en.json'))['editor']['elements']
) => translate(`editor.elements.${key}`);
function ElementCollectionFilters() {
  const session = useEditorVectorLibrarySession();
  const state = useEditorVectorLibrarySnapshot();
  const favoritesOnly = state.tab === 'favorites';
  const userCollections = getEditorVectorUserCatalogs(state.local, favoritesOnly);
  const favoritePrefixes = new Set(
    state.local.items
      .filter((item) => item.favorite && !item.deleted)
      .flatMap((item) => (item.prefix ? [item.prefix] : []))
  );
  const remoteCollections = favoritesOnly
    ? Array.from(favoritePrefixes, (prefix) => ({
        prefix,
        name:
          state.remoteCollections.find((collection) => collection.prefix === prefix)?.name ??
          prefix,
      }))
    : state.remoteCollections;
  const options = [
    { value: '', label: message('allCollections') },
    ...userCollections.map((collection) => ({
      value: collection.value,
      label:
        collection.kind === 'imported-svg' ? message('importedSvgCollection') : collection.label,
      ...(collection.prefix ? { prefix: collection.prefix } : {}),
    })),
    ...remoteCollections.map((collection) => ({
      value: `remote:${collection.prefix}`,
      label: collection.name,
      prefix: collection.prefix,
    })),
  ];
  const invalidCollection =
    Boolean(state.collection) &&
    (favoritesOnly || !state.collection.startsWith('remote:')) &&
    !options.some((option) => option.value === state.collection);
  useEffect(() => {
    if (invalidCollection) session.setFilter(state.tab, '');
  }, [invalidCollection, session, state.tab]);
  return (
    <ElementCollectionFilter
      value={state.collection}
      options={options}
      onChange={(collection) => session.setFilter(state.tab, collection)}
    />
  );
}

export function EditorElementsControls({
  headerRef,
  appearanceOpen,
  onAppearance,
}: {
  headerRef: Ref<HTMLDivElement>;
  appearanceOpen: boolean;
  onAppearance(): void;
}) {
  const session = useEditorVectorLibrarySession();
  const state = useEditorVectorLibrarySnapshot();
  const input = useRef<HTMLInputElement>(null);
  const upload = useRef<HTMLButtonElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const favoritesOnly = state.tab === 'favorites';
  return (
    <div
      ref={headerRef}
      className={`shrink-0 space-y-2 ${INSPECTOR_CONTENT_INSET_CLASS_NAME}`}
      data-ui="editor.elements.header"
    >
      <div className="flex min-w-0 items-center gap-1">
        <EditorIconButton
          className="!h-8 !w-8"
          title={message('appearance')}
          aria-label={message('appearance')}
          data-ui="editor.elements.appearance-trigger"
          active={appearanceOpen}
          aria-pressed={appearanceOpen}
          onClick={onAppearance}
        >
          <SlidersHorizontal size={16} />
        </EditorIconButton>
        <form
          className="min-w-0 flex-1"
          onKeyDown={(event) => event.stopPropagation()}
          onKeyUp={(event) => event.stopPropagation()}
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void session.searchNow(true);
          }}
        >
          <SearchField
            label={message('search')}
            placeholder={message('search')}
            value={state.query}
            onChange={(value) => session.setQuery(value)}
          />
        </form>
        <EditorIconButton
          className="!h-8 !w-8"
          title={message('favoritesOnly')}
          aria-label={message('favoritesOnly')}
          aria-pressed={favoritesOnly}
          data-ui="editor.elements.favorites-only"
          onClick={() => session.setFilter(favoritesOnly ? 'catalog' : 'favorites')}
        >
          <Star size={16} fill={favoritesOnly ? 'currentColor' : 'none'} />
        </EditorIconButton>
        <EditorIconButton
          ref={upload}
          className="!h-8 !w-8"
          title={message('import')}
          aria-label={message('import')}
          disabled={state.busy}
          data-ui="editor.elements.import"
          onClick={() => input.current?.click()}
        >
          <Upload size={16} />
        </EditorIconButton>
      </div>
      <input
        ref={input}
        type="file"
        accept=".svg,.json,image/svg+xml,application/json"
        multiple
        className="hidden"
        data-ui="editor.elements.import-input"
        onChange={(event) => {
          const chosen = Array.from(event.target.files ?? []);
          event.target.value = '';
          if (chosen.length) setFiles(chosen);
        }}
      />
      <div className="flex min-w-0 items-center gap-1">
        <div className="min-w-0 flex-1">
          <ElementCollectionFilters />
        </div>
        <EditorElementsCollectionDownload />
      </div>
      {files.length ? (
        <EditorElementsImportDialog
          files={files}
          anchor={upload.current}
          onClose={() => setFiles([])}
        />
      ) : null}
    </div>
  );
}
export function EditorElementsSelected({
  footerRef,
  inserting,
  onAdd,
}: {
  footerRef: Ref<HTMLDivElement>;
  inserting: boolean;
  onAdd(entry: EditorVectorCatalogEntry): Promise<void>;
}) {
  const session = useEditorVectorLibrarySession(),
    state = useEditorVectorLibrarySnapshot();
  const selected = state.entries.find((entry) => entry.key === state.selectedKey);
  const detailsId = useId();
  const infoButton = useRef<HTMLButtonElement>(null);
  const [detailsKey, setDetailsKey] = useState<string | null>(null);
  const showDetails = selected && detailsKey === selected.key;
  const collectionName = selected
    ? editorVectorCollectionName(selected, state) || message('mine')
    : '';
  return (
    <div
      ref={footerRef}
      data-ui="editor.elements.footer"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && showDetails) {
          event.preventDefault();
          event.stopPropagation();
          setDetailsKey(null);
          infoButton.current?.focus();
        }
      }}
      className={[
        'relative flex shrink-0 items-center gap-2 border-t',
        'border-[var(--sniptale-color-border-soft)]',
        INSPECTOR_CONTENT_INSET_CLASS_NAME,
      ].join(' ')}
    >
      {showDetails && selected?.definition ? (
        <div
          className={[
            'absolute inset-x-0 bottom-full z-20 max-h-52 overflow-y-auto border-t',
            'border-[var(--sniptale-color-border-soft)] bg-[var(--sniptale-color-surface-canvas)]',
            'p-3 shadow-[var(--sniptale-shadow-floating-strong)]',
          ].join(' ')}
          id={detailsId}
          data-ui="editor.elements.details"
        >
          <EditorVectorSourceNotice
            provenance={selected.definition.provenance}
            name={selected.name}
          />
        </div>
      ) : null}
      <div className="min-w-0 flex-1">
        {selected ? (
          <div className="min-w-0 text-xs leading-4">
            <div
              className="truncate text-[var(--sniptale-color-text-primary)]"
              title={selected.name}
            >
              {selected.name}
            </div>
            <div
              className="truncate text-[var(--sniptale-color-text-secondary)]"
              title={collectionName}
            >
              {collectionName}
            </div>
          </div>
        ) : (
          <p className="text-xs leading-4 text-[var(--sniptale-color-text-secondary)]">
            {message('selectOne')}
          </p>
        )}
      </div>
      {selected ? (
        <>
          <EditorIconButton
            className="!h-7 !w-7"
            disabled={!selected.definition || state.busy}
            title={message(selected.favorite ? 'unfavorite' : 'favorite')}
            aria-label={message(selected.favorite ? 'unfavorite' : 'favorite')}
            aria-pressed={selected.favorite}
            data-ui="editor.elements.favorite"
            onClick={() => void session.favorite(selected)}
          >
            <Star size={14} fill={selected.favorite ? 'currentColor' : 'none'} />
          </EditorIconButton>
          <EditorIconButton
            ref={infoButton}
            className="!h-7 !w-7"
            disabled={!selected.definition}
            aria-controls={showDetails ? detailsId : undefined}
            title={message('info')}
            aria-label={message('info')}
            aria-expanded={Boolean(showDetails)}
            onClick={() => setDetailsKey(showDetails ? null : selected.key)}
          >
            <Info size={14} />
          </EditorIconButton>
        </>
      ) : null}
      {selected?.local && state.tab === 'catalog' ? (
        <EditorIconButton
          className="!h-7 !w-7 hover:!text-[var(--sniptale-color-danger)]"
          title={message('removeItem')}
          aria-label={message('removeItem')}
          disabled={state.busy}
          onClick={() => void session.removeItem(selected.key)}
        >
          <Trash2 size={14} />
        </EditorIconButton>
      ) : null}
      <ProductActionButton
        tone="secondary"
        compact
        disabled={!selected?.definition || inserting}
        data-ui="editor.elements.add"
        onClick={() => {
          if (selected) void onAdd(selected);
        }}
      >
        {message('add')}
      </ProductActionButton>
    </div>
  );
}
