import { useEffect, useMemo, useState } from 'react';
import type { SettingsTransferTreeNode } from '../../../../contracts/settings-transfer';
import { translate } from '../../../../platform/i18n';
import {
  filterTransferTree,
  flattenTransferTreeNodes,
  flattenVisibleTransferTreeNodes,
} from './tree-model';
import { SettingsTransferTreeNodeItem } from './tree-node';
import { useSettingsTransferTreeNavigation } from './tree-navigation';
import { SettingsTransferTreeToolbar } from './tree-toolbar';

export function SettingsTransferTree(props: {
  nodes: readonly SettingsTransferTreeNode[];
  selected: ReadonlySet<string>;
  onToggle: (node: SettingsTransferTreeNode, checked: boolean) => void;
  onBulkToggle: (nodes: readonly SettingsTransferTreeNode[], checked: boolean) => void;
}) {
  const allNodes = useMemo(() => flattenTransferTreeNodes(props.nodes), [props.nodes]);
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filtered = useMemo(
    () => filterTransferTree(props.nodes, normalizedQuery),
    [normalizedQuery, props.nodes]
  );
  const expandableIds = useMemo(
    () => new Set(allNodes.filter((node) => node.children.length > 0).map((node) => node.id)),
    [allNodes]
  );
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set(expandableIds));
  useEffect(() => {
    setExpandedIds(new Set(expandableIds));
  }, [expandableIds]);
  useEffect(() => {
    if (!normalizedQuery) return;
    setExpandedIds((current) => {
      const next = new Set(current);
      for (const node of flattenTransferTreeNodes(filtered.nodes)) {
        if (node.children.length > 0) next.add(node.id);
      }
      return next;
    });
  }, [filtered.nodes, normalizedQuery]);

  const visibleNodes = useMemo(
    () => flattenVisibleTransferTreeNodes(filtered.nodes, expandedIds),
    [expandedIds, filtered.nodes]
  );
  const bulkNodes = normalizedQuery
    ? allNodes.filter((node) => filtered.matchedIds.has(node.id))
    : props.nodes;
  const scopeNodes = normalizedQuery ? bulkNodes : allNodes;
  const isScopeSelected =
    scopeNodes.length > 0 && scopeNodes.every((node) => props.selected.has(node.id));
  const visibleExpandableIds = flattenTransferTreeNodes(filtered.nodes)
    .filter((node) => node.children.length > 0)
    .map((node) => node.id);
  const isVisibleTreeExpanded =
    visibleExpandableIds.length > 0 && visibleExpandableIds.every((id) => expandedIds.has(id));
  const toggleExpanded = (id: string, expanded?: boolean) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      const nextExpanded = expanded ?? !next.has(id);
      if (nextExpanded) next.add(id);
      else next.delete(id);
      return next;
    });
  };
  const navigation = useSettingsTransferTreeNavigation({
    visibleNodes,
    expandedIds,
    onToggleExpanded: toggleExpanded,
  });
  const toggleVisibleExpansion = () => {
    setExpandedIds((current) => {
      const next = new Set(current);
      for (const id of visibleExpandableIds) {
        if (isVisibleTreeExpanded) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  };

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--sniptale-color-border-soft)]">
      <SettingsTransferTreeToolbar
        query={query}
        matchCount={filtered.matchedIds.size}
        expandableCount={visibleExpandableIds.length}
        scopeCount={scopeNodes.length}
        scopeSelected={isScopeSelected}
        expanded={isVisibleTreeExpanded}
        onQueryChange={setQuery}
        onToggleExpansion={toggleVisibleExpansion}
        onToggleScope={() => props.onBulkToggle(bulkNodes, !isScopeSelected)}
      />
      <div className="max-h-[min(52vh,32rem)] overflow-y-auto overscroll-contain p-2.5">
        {filtered.nodes.length > 0 ? (
          <ul
            role="tree"
            aria-label={translate('settings.settingsTransfer.treeLabel')}
            className="space-y-1"
            onKeyDown={navigation.handleKeyDown}
          >
            {filtered.nodes.map((node) => (
              <SettingsTransferTreeNodeItem
                key={node.id}
                {...props}
                node={node}
                level={1}
                activeId={navigation.activeId}
                expandedIds={expandedIds}
                onActivate={navigation.onActivate}
                onToggleExpanded={toggleExpanded}
                registerTreeItem={navigation.registerTreeItem}
                registerCheckbox={navigation.registerCheckbox}
              />
            ))}
          </ul>
        ) : (
          <p className="py-8 text-center text-sm text-[var(--sniptale-color-text-muted)]">
            {translate('settings.settingsTransfer.noSearchResults')}
          </p>
        )}
      </div>
    </div>
  );
}
