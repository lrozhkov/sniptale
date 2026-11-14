import { useRef, type Ref } from 'react';
import { Upload, Settings2, SunMoon, Trash2 } from 'lucide-react';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { EditorIconButton, SearchField, CompactSelect, SegmentedSelector } from '../../chrome/ui';
import type {
  EditorVectorCatalogEntry,
  EditorVectorLibraryTab,
} from '../../application/vector-elements/session';
import { EditorVectorSourceNotice } from './catalog';
import {
  useEditorVectorLibrarySession,
  useEditorVectorLibrarySnapshot,
} from '../../application/vector-elements/context';
import { translate } from '../../../platform/i18n';

const message = (
  key: keyof (typeof import('../../../platform/i18n/catalogs/en.json'))['editor']['elements']
) => translate(`editor.elements.${key}`);
function ElementSourceDetails({ entry }: { entry: EditorVectorCatalogEntry }) {
  const provenance = entry.definition?.provenance;
  if (!provenance) return null;
  return <EditorVectorSourceNotice provenance={provenance} name={entry.name} compact />;
}
function ElementCollectionFilters({
  value,
  onChange,
}: {
  value: string;
  onChange(value: string): void;
}) {
  const session = useEditorVectorLibrarySession(),
    state = useEditorVectorLibrarySnapshot();
  return (
    <div className="flex min-w-0 items-center gap-1">
      <CompactSelect
        className="!h-8 !rounded-[4px] !px-2"
        containerClassName="min-w-0 flex-1"
        aria-label={message('collectionFilter')}
        dataUi="editor.elements.collection"
        value={state.collection}
        options={[
          { value: '', label: message('allCollections') },
          ...state.local.collections.map((collection) => ({
            value: `local:${collection.id}`,
            label: collection.name,
          })),
          ...state.remoteCollections.map((collection) => ({
            value: `remote:${collection.prefix}`,
            label: collection.name,
          })),
        ]}
        onChange={(collection) => session.setFilter(state.tab, collection)}
      />
      {state.local.collections.length ? (
        <CompactSelect
          className="!h-8 !rounded-[4px] !px-2"
          containerClassName="min-w-0 flex-1"
          aria-label={message('importTo')}
          title={message('importTo')}
          value={value}
          onChange={onChange}
          options={[
            { value: '', label: message('importTo') },
            ...state.local.collections.map((collection) => ({
              value: collection.id,
              label: collection.name,
            })),
          ]}
        />
      ) : null}
    </div>
  );
}
export function EditorElementsControls({
  headerRef,
  dark,
  onDarkChange,
  onManage,
  importCollection,
  setImportCollection,
}: {
  headerRef: Ref<HTMLDivElement>;
  dark: boolean;
  onDarkChange(value: boolean): void;
  onManage(): void;
  importCollection: string;
  setImportCollection(value: string): void;
}) {
  const session = useEditorVectorLibrarySession(),
    state = useEditorVectorLibrarySnapshot();
  const input = useRef<HTMLInputElement>(null);
  return (
    <div ref={headerRef} className="shrink-0 space-y-1 p-2" data-ui="editor.elements.header">
      <div className="flex items-center gap-1">
        <h2 className="min-w-0 flex-1 text-sm font-medium">{message('title')}</h2>
        <EditorIconButton
          className="!h-7 !w-7"
          title={message('import')}
          aria-label={message('import')}
          disabled={state.busy}
          data-ui="editor.elements.import"
          onClick={() => input.current?.click()}
        >
          <Upload size={16} />
        </EditorIconButton>
        <EditorIconButton
          className="!h-7 !w-7"
          title={dark ? message('previewLight') : message('previewDark')}
          aria-label={dark ? message('previewLight') : message('previewDark')}
          data-ui="editor.elements.preview-background"
          onClick={() => onDarkChange(!dark)}
        >
          <SunMoon size={16} />
        </EditorIconButton>
        <EditorIconButton
          className="!h-7 !w-7"
          title={message('manage')}
          aria-label={message('manage')}
          data-ui="editor.elements.manage"
          onClick={() => onManage()}
        >
          <Settings2 size={16} />
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
          const files = Array.from(event.target.files ?? []);
          event.target.value = '';
          if (files.length)
            void session.importFiles(files, importCollection || undefined).then(() => {
              onManage();
            });
        }}
      />
      <form
        className="[&>label]:!h-8 [&>label]:!rounded-[4px] [&>label]:!px-2"
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
      <SegmentedSelector<EditorVectorLibraryTab>
        ariaLabel={message('title')}
        columns={3}
        optionClassName="!h-8 !rounded-[4px]"
        options={[
          { value: 'catalog', label: message('catalog') },
          { value: 'favorites', label: message('favorites') },
          { value: 'mine', label: message('mine') },
        ]}
        value={state.tab}
        onChange={(tab) => session.setFilter(tab)}
      />
      <ElementCollectionFilters value={importCollection} onChange={setImportCollection} />
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
  return (
    <div
      ref={footerRef}
      data-ui="editor.elements.footer"
      className="flex shrink-0 items-center gap-2 border-t border-[var(--sniptale-color-border-soft)] px-2 py-1.5"
    >
      <div className="min-w-0 flex-1">
        {selected ? (
          <ElementSourceDetails entry={selected} />
        ) : (
          <p className="text-xs leading-4 text-[var(--sniptale-color-text-secondary)]">
            {message('selectOne')}
          </p>
        )}
      </div>
      {selected?.local && state.tab === 'mine' ? (
        <EditorIconButton
          className="!h-7 !w-7"
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
