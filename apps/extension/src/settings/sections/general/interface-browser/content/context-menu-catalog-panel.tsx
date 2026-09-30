import { translate, type AppLocale } from '../../../../../platform/i18n';
import type { ContextMenuTree } from '../../../../../contracts/settings/context-menu-layout';
import {
  addContextMenuCommand,
  contextMenuNodePosition,
  findContextMenuNode,
  isContextMenuCommandActive,
  reactivateContextMenuCommand,
} from './context-menu-tree-model';
import type { ContextMenuCatalogItem } from './context-menu-catalog';

type CatalogPanelProps = {
  tree: ContextMenuTree;
  catalog: readonly ContextMenuCatalogItem[];
  locale: AppLocale;
  selectedKey: string | null;
  visible?: boolean;
  onChange: (tree: ContextMenuTree) => void;
  onSelect: (key: string) => void;
  onAnnounce: (message: string) => void;
  expanded: Set<string>;
  onExpanded: (expanded: Set<string>) => void;
};

/** Unused available actions. Enter inserts beside the selected tree item; drag targets choose exact placement. */
export function ContextMenuCatalogPanel(props: CatalogPanelProps) {
  const t = (key: Parameters<typeof translate>[0]) => translate(key, props.locale);
  const unused = props.catalog.filter(
    (item) => item.available && !isContextMenuCommandActive(props.tree, item.command)
  );
  const add = (command: string) => {
    const selected = props.selectedKey ? findContextMenuNode(props.tree, props.selectedKey) : null;
    const position = props.selectedKey
      ? contextMenuNodePosition(props.tree, props.selectedKey)
      : null;
    const parentId = selected?.type === 'section' ? selected.id : (position?.parentId ?? null);
    const parent = parentId ? findContextMenuNode(props.tree, `section:${parentId}`) : null;
    const index =
      selected?.type === 'section'
        ? selected.children.length
        : position
          ? position.index + 1
          : props.tree.nodes.length;
    const existing = findContextMenuNode(props.tree, `command:${command}`);
    const next = existing
      ? reactivateContextMenuCommand(props.tree, command)
      : addContextMenuCommand(props.tree, command, { parentId, index });
    if (next === props.tree) return;
    props.onChange(next);
    if (parent?.type === 'section') props.onExpanded(new Set([...props.expanded, parent.id]));
    if (existing) {
      const open = new Set(props.expanded);
      let ancestor = contextMenuNodePosition(next, `command:${command}`)?.parentId;
      while (ancestor) {
        open.add(ancestor);
        ancestor = contextMenuNodePosition(next, `section:${ancestor}`)?.parentId ?? null;
      }
      props.onExpanded(open);
    }
    props.onSelect(`command:${command}`);
    props.onAnnounce(t('settings.appearance.contextMenuAdded'));
  };
  return (
    <section
      className="min-w-0 space-y-2 rounded-xl border border-[var(--sniptale-color-border-soft)] p-3"
      aria-label={t('settings.appearance.contextMenuCatalog')}
    >
      <h3 className="text-sm font-semibold">{t('settings.appearance.contextMenuCatalog')}</h3>
      <div className="max-h-[34rem] space-y-1 overflow-y-auto">
        {unused.length === 0 ? (
          <p className="text-sm text-[var(--sniptale-color-text-muted)]">
            {t('settings.appearance.contextMenuEmptyCatalog')}
          </p>
        ) : null}
        {unused.map((item) => (
          <button
            key={item.command}
            type="button"
            draggable
            className="block min-h-10 w-full truncate rounded-lg px-3 py-2 text-left text-sm
              hover:bg-[var(--sniptale-color-surface-hover)] focus-visible:outline-none
              focus-visible:ring-2 focus-visible:ring-[var(--sniptale-color-focus-ring)]"
            title={item.label}
            aria-label={`${t('settings.appearance.contextMenuAddCommand')}: ${item.label}`}
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = 'move';
              event.dataTransfer.setData('text/plain', `command:${item.command}`);
            }}
            onClick={() => add(item.command)}
          >
            {item.label}
          </button>
        ))}
      </div>
    </section>
  );
}
