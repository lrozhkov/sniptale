import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { FolderOpen, Plus, Search } from 'lucide-react';
import { useState, type DragEvent, type ReactNode } from 'react';
import type { EditorStartItem } from './use-items';
export { useEditorStartItems, sortEditorStartItems } from './use-items';
export type { EditorStartItem, EditorStartSourceItem } from './use-items';

export interface EditorStartProps {
  title: string;
  description: string;
  createLabel: string;
  openLabel: string;
  recentLabel: string;
  emptyLabel: string;
  loadingLabel: string;
  errorLabel: string;
  retryLabel: string;
  searchLabel: string;
  unavailableLabel: string;
  items: EditorStartItem[];
  status: 'loading' | 'ready' | 'error';
  actionError?: string | null;
  pending?: boolean;
  icon: ReactNode;
  browseOnOpen?: boolean;
  onCreate: () => void;
  onOpen: () => void;
  onSelect: (id: string) => void;
  onRetry: () => void;
  onRecover?: () => void;
  onDropFile?: (file: File) => void;
}

const rootClassName = [
  'sniptale-extension-surface h-screen min-h-[720px] min-w-[1280px] overflow-y-auto',
  'bg-[var(--sniptale-color-surface-canvas)] px-10 py-10',
  'text-[var(--sniptale-color-text-primary)]',
].join(' ');
const headerClassName = [
  'flex flex-wrap items-center gap-x-8 gap-y-5 pb-6',
  'border-b border-[var(--sniptale-color-border-soft)]',
].join(' ');
const focusClassName = [
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
  'focus-visible:outline-[var(--sniptale-color-accent)]',
].join(' ');
const cardClassName = [
  'group min-w-0 overflow-hidden rounded-xl border border-[var(--sniptale-color-border-soft)]',
  'bg-[var(--sniptale-color-surface-panel)] text-left',
  'hover:bg-[var(--sniptale-color-surface-hover)] disabled:opacity-50',
  focusClassName,
].join(' ');
const searchClassName = [
  'flex h-10 items-center gap-2 rounded-lg border',
  'border-[var(--sniptale-color-border-soft)]',
  'bg-[var(--sniptale-color-surface-panel)] px-3',
].join(' ');
const emptyClassName = [
  'rounded-xl border border-dashed border-[var(--sniptale-color-border-soft)]',
  'p-8 text-sm text-[var(--sniptale-color-text-secondary)]',
].join(' ');
const iconClassName = [
  'grid size-12 shrink-0 place-items-center rounded-xl',
  'border border-[var(--sniptale-color-border-soft)] bg-[var(--sniptale-color-surface-panel)]',
  'text-[var(--sniptale-color-text-secondary)]',
].join(' ');

function EditorStartActions(props: EditorStartProps & { onBrowse: () => void }) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2" data-ui="editor.start.actions">
      <ProductActionButton compact disabled={props.pending} onClick={props.onCreate}>
        <Plus size={18} aria-hidden="true" />
        {props.createLabel}
      </ProductActionButton>
      <ProductActionButton
        compact
        tone="secondary"
        disabled={props.pending}
        onClick={props.browseOnOpen ? props.onBrowse : props.onOpen}
      >
        <FolderOpen size={18} aria-hidden="true" />
        {props.openLabel}
      </ProductActionButton>
    </div>
  );
}

function EditorStartCard(props: { item: EditorStartItem; start: EditorStartProps }) {
  const { item, start } = props;
  return (
    <button
      type="button"
      disabled={start.pending || item.unavailable}
      onClick={() => start.onSelect(item.id)}
      className={cardClassName}
      title={item.title}
      data-ui="editor.start.project"
    >
      <span className="grid aspect-video place-items-center overflow-hidden bg-[var(--sniptale-color-surface-canvas)]">
        {item.thumbnailUrl ? (
          <img src={item.thumbnailUrl} alt="" className="h-full w-full object-contain" />
        ) : (
          <span className="text-[var(--sniptale-color-text-muted)]" aria-hidden="true">
            {start.icon}
          </span>
        )}
      </span>
      <span className="block px-4 py-3">
        <span className="line-clamp-2 min-h-10 break-words text-sm font-medium leading-5">
          {item.title}
        </span>
        <span className="mt-1 block truncate text-xs text-[var(--sniptale-color-text-secondary)]">
          {item.unavailable ? start.unavailableLabel : item.detail}
        </span>
      </span>
    </button>
  );
}

function EditorStartRecent(
  props: EditorStartProps & {
    browse: boolean;
    query: string;
    onQuery: (value: string) => void;
    visible: EditorStartItem[];
  }
) {
  return (
    <section aria-label={props.recentLabel} className="mt-8">
      <div className="mb-5 flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold">{props.recentLabel}</h2>
        {props.browse ? (
          <label className={searchClassName}>
            <Search size={16} aria-hidden="true" />
            <span className="sr-only">{props.searchLabel}</span>
            <input
              autoFocus
              value={props.query}
              onChange={(event) => props.onQuery(event.target.value)}
              className="bg-transparent text-sm outline-none"
              placeholder={props.searchLabel}
            />
          </label>
        ) : null}
      </div>
      {props.status === 'loading' ? (
        <p role="status" className="py-10 text-sm text-[var(--sniptale-color-text-secondary)]">
          {props.loadingLabel}
        </p>
      ) : null}
      {props.status === 'error' ? (
        <div
          role="alert"
          className="rounded-xl border border-[var(--sniptale-color-border-soft)] p-6"
        >
          <p>{props.errorLabel}</p>
          <button
            type="button"
            onClick={props.onRetry}
            className="mt-3 text-sm text-[var(--sniptale-color-accent-emphasis)] underline focus-visible:outline"
          >
            {props.retryLabel}
          </button>
        </div>
      ) : null}
      {props.status === 'ready' && props.visible.length === 0 ? (
        <p className={emptyClassName}>{props.emptyLabel}</p>
      ) : null}
      {props.status === 'ready' && props.visible.length > 0 ? (
        <div className="grid grid-cols-3 gap-4">
          {props.visible.map((item) => (
            <EditorStartCard key={item.id} item={item} start={props} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function handleStartDrop(event: DragEvent<HTMLElement>, onDropFile: (file: File) => void) {
  event.preventDefault();
  const file = Array.from(event.dataTransfer.files).find((candidate) =>
    candidate.type.startsWith('image/')
  );
  if (file) onDropFile(file);
}

/** Presentation-only start surface; editor adapters own reads and navigation. */
export function EditorStart(props: EditorStartProps) {
  const onDropFile = props.onDropFile;
  const [browse, setBrowse] = useState(false);
  const [query, setQuery] = useState('');
  const visible = browse
    ? props.items.filter((item) =>
        item.title.toLocaleLowerCase().includes(query.toLocaleLowerCase())
      )
    : props.items.slice(0, 6);
  return (
    <main
      data-ui="editor.start"
      onDragOver={props.onDropFile ? (event) => event.preventDefault() : undefined}
      onDrop={onDropFile ? (event) => handleStartDrop(event, onDropFile) : undefined}
      className={rootClassName}
    >
      <div className="mx-auto max-w-[1080px]">
        <header className={headerClassName}>
          <div className="flex min-w-0 flex-1 items-center gap-4">
            <span className={iconClassName} aria-hidden="true">
              {props.icon}
            </span>
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight">{props.title}</h1>
              <p className="mt-2 text-sm text-[var(--sniptale-color-text-secondary)]">
                {props.description}
              </p>
            </div>
          </div>
          <EditorStartActions {...props} onBrowse={() => setBrowse(true)} />
        </header>
        {props.actionError ? (
          <div role="alert" className="mt-4 text-sm text-[var(--sniptale-color-text-danger)]">
            <p>{props.actionError}</p>
            {props.onRecover ? (
              <button
                type="button"
                onClick={props.onRecover}
                className="mt-2 underline focus-visible:outline"
              >
                {props.retryLabel}
              </button>
            ) : null}
          </div>
        ) : null}
        <EditorStartRecent
          {...props}
          browse={browse}
          query={query}
          onQuery={setQuery}
          visible={visible}
        />
      </div>
    </main>
  );
}
