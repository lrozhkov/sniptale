import type { AppLocale } from '../../../../../platform/i18n';
import { translate } from '../../../../../platform/i18n';
import type { ContextMenuTree } from '../../../../../contracts/settings/context-menu-layout';
import { contextMenuCommandLabel, type ContextMenuCatalogItem } from './context-menu-catalog';

/** Compact read-only projection of commands that are currently available to the browser menu. */
export function ContextMenuPreview({
  tree,
  catalog,
  locale,
}: {
  tree: ContextMenuTree;
  catalog: readonly ContextMenuCatalogItem[];
  locale: AppLocale;
}) {
  const t = (key: Parameters<typeof translate>[0]) => translate(key, locale);
  const available = new Set(catalog.filter((item) => item.available).map((item) => item.command));
  const preview = tree.nodes.flatMap((node) => {
    if (node.type === 'command')
      return node.enabled && available.has(node.command)
        ? [{ title: contextMenuCommandLabel(node, catalog, locale), children: [] as string[] }]
        : [];
    const children = node.enabled
      ? node.children
          .filter((child) => child.enabled && available.has(child.command))
          .map((child) => contextMenuCommandLabel(child, catalog, locale))
      : [];
    return children.length ? [{ title: node.title, children }] : [];
  });
  return (
    <section
      className="rounded-xl border border-[var(--sniptale-color-border-soft)] p-3"
      aria-label={t('settings.appearance.contextMenuPreview')}
    >
      <h3 className="text-sm font-semibold">{t('settings.appearance.contextMenuPreview')}</h3>
      {preview.length === 0 ? (
        <p className="mt-2 text-sm text-[var(--sniptale-color-text-muted)]">
          {t('settings.appearance.contextMenuNoPreview')}
        </p>
      ) : (
        <ul className="mt-2 space-y-1 text-sm">
          {preview.map((item, index) => (
            <li key={`${index}:${item.title}`} className="rounded-md px-2 py-1">
              {item.title}
              {item.children.length ? (
                <ul className="ml-4 mt-1 space-y-1 border-l border-[var(--sniptale-color-border-soft)] pl-3">
                  {item.children.map((child, childIndex) => (
                    <li key={`${childIndex}:${child}`}>{child}</li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
