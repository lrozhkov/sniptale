import { useState } from 'react';
import { ProductInput, ProductSelect } from '@sniptale/ui/product-form-controls';
import type { AppLocale } from '../../../../../platform/i18n';
import { translate } from '../../../../../platform/i18n';
import type { ContextMenuTree } from '../../../../../contracts/settings/context-menu-layout';
import {
  addContextMenuCommand,
  contextMenuNodePosition,
  findContextMenuNode,
} from './context-menu-tree-model';
import type { ContextMenuCatalogItem } from './context-menu-catalog';

const buttonClass = [
  'inline-flex min-h-9 cursor-pointer items-center justify-center rounded-lg',
  'border border-[var(--sniptale-color-border-soft)] px-3 py-1.5 text-sm',
  'hover:bg-[var(--sniptale-color-surface-hover)] focus-visible:outline-none',
  'focus-visible:ring-2 focus-visible:ring-[var(--sniptale-color-focus-ring)]',
  'disabled:cursor-not-allowed disabled:opacity-45',
].join(' ');

type CatalogPanelProps = {
  tree: ContextMenuTree;
  catalog: readonly ContextMenuCatalogItem[];
  locale: AppLocale;
  selectedKey: string | null;
  visible: boolean;
  onChange: (tree: ContextMenuTree) => void;
  onSelect: (key: string) => void;
  onAnnounce: (message: string) => void;
  expanded: Set<string>;
  onExpanded: (expanded: Set<string>) => void;
};

/** Owns catalog search and valid insertion targets independently of tree rendering. */
function useCatalogPlacement({
  tree,
  catalog,
  locale,
  selectedKey,
  onChange,
  onSelect,
  onAnnounce,
  expanded,
  onExpanded,
}: CatalogPanelProps) {
  const [destination, setDestination] = useState<string | null>(null);
  const [insertion, setInsertion] = useState<'end' | 'before' | 'after'>('end');
  const [search, setSearch] = useState('');
  const t = (key: Parameters<typeof translate>[0]) => translate(key, locale);
  const sections = tree.nodes.filter((node) => node.type === 'section');
  const selected = selectedKey ? findContextMenuNode(tree, selectedKey) : null;
  const parentFromSelection =
    selected?.type === 'section'
      ? selected.id
      : selectedKey
        ? contextMenuNodePosition(tree, selectedKey)?.parentId
        : null;
  const validDestination =
    destination === 'root' || sections.some((section) => section.id === destination)
      ? destination
      : null;
  const effectiveDestination = validDestination ?? parentFromSelection ?? 'root';
  const selectedPosition = selectedKey ? contextMenuNodePosition(tree, selectedKey) : null;
  const destinationParent = effectiveDestination === 'root' ? null : effectiveDestination;
  const canPlaceRelative = selectedPosition?.parentId === destinationParent && !!selectedPosition;
  const query = search.trim().toLocaleLowerCase(locale);
  const filtered = catalog.filter(
    (item) =>
      !query ||
      item.label.toLocaleLowerCase(locale).includes(query) ||
      item.group.toLocaleLowerCase(locale).includes(query)
  );
  const grouped = Map.groupBy(filtered, (item) => item.group);
  const addCommand = (command: string) => {
    const parentId = destinationParent;
    const target = parentId
      ? tree.nodes.find((node) => node.type === 'section' && node.id === parentId)
      : null;
    const endIndex = target?.type === 'section' ? target.children.length : tree.nodes.length;
    const index =
      canPlaceRelative && insertion !== 'end' && selectedPosition
        ? selectedPosition.index + (insertion === 'after' ? 1 : 0)
        : endIndex;
    const next = addContextMenuCommand(tree, command, { parentId, index });
    if (next === tree) return;
    onChange(next);
    onSelect(`command:${command}`);
    if (parentId) onExpanded(new Set([...expanded, parentId]));
    onAnnounce(t('settings.appearance.contextMenuAdded'));
  };
  return {
    search,
    setSearch,
    sections,
    effectiveDestination,
    setDestination,
    insertion,
    canPlaceRelative,
    setInsertion,
    filtered,
    grouped,
    addCommand,
  };
}

export function ContextMenuCatalogPanel(props: CatalogPanelProps) {
  const { tree, locale, visible } = props;
  const {
    search,
    setSearch,
    sections,
    effectiveDestination,
    setDestination,
    insertion,
    canPlaceRelative,
    setInsertion,
    filtered,
    grouped,
    addCommand,
  } = useCatalogPlacement(props);
  const t = (key: Parameters<typeof translate>[0]) => translate(key, locale);
  return (
    <section
      className="min-w-0 space-y-3 rounded-xl border border-[var(--sniptale-color-border-soft)] p-3"
      aria-label={t('settings.appearance.contextMenuCatalog')}
    >
      <h3 className="text-sm font-semibold">{t('settings.appearance.contextMenuCatalog')}</h3>
      <ProductInput
        aria-label={t('settings.appearance.contextMenuSearch')}
        placeholder={t('settings.appearance.contextMenuSearch')}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <ProductSelect
        key={visible ? 'visible' : 'hidden'}
        aria-label={t('settings.appearance.contextMenuDestination')}
        value={effectiveDestination}
        options={[
          { value: 'root', label: t('settings.appearance.contextMenuMainMenu') },
          ...sections.map((section) => ({ value: section.id, label: section.title })),
        ]}
        onChange={setDestination}
      />
      <ProductSelect
        key={visible ? 'position-visible' : 'position-hidden'}
        aria-label={t('settings.appearance.contextMenuPosition')}
        value={canPlaceRelative ? insertion : 'end'}
        options={[
          { value: 'end', label: t('settings.appearance.contextMenuAtEnd') },
          ...(canPlaceRelative
            ? [
                { value: 'before', label: t('settings.appearance.contextMenuBefore') },
                { value: 'after', label: t('settings.appearance.contextMenuAfter') },
              ]
            : []),
        ]}
        onChange={(value) => setInsertion(value as 'end' | 'before' | 'after')}
      />
      <div className="max-h-[25rem] space-y-3 overflow-y-auto pr-1">
        {filtered.length === 0 ? (
          <p className="text-sm text-[var(--sniptale-color-text-muted)]">
            {t('settings.appearance.contextMenuEmptyCatalog')}
          </p>
        ) : null}
        {[...grouped.entries()].map(([group, items]) => (
          <div key={group} className="space-y-1">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--sniptale-color-text-muted)]">
              {group}
            </h4>
            {items.map((item) => {
              const added = Boolean(findContextMenuNode(tree, `command:${item.command}`));
              return (
                <div
                  key={item.command}
                  className={[
                    'flex min-w-0 items-center gap-2 rounded-lg px-2 py-1',
                    'hover:bg-[var(--sniptale-color-surface-hover)]',
                  ].join(' ')}
                >
                  <span className="min-w-0 flex-1 truncate text-sm" title={item.label}>
                    {item.label}
                  </span>
                  <button
                    type="button"
                    className={buttonClass}
                    disabled={added || !item.available}
                    title={
                      !item.available ? t('settings.appearance.contextMenuUnavailable') : undefined
                    }
                    aria-label={`${t('settings.appearance.contextMenuAddCommand')}: ${item.label}`}
                    onClick={() => addCommand(item.command)}
                  >
                    {added
                      ? t('settings.appearance.contextMenuAdded')
                      : t('settings.appearance.contextMenuAddCommand')}
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}
