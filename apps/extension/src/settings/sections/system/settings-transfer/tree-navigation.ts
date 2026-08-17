import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { SettingsTransferTreeNode } from '../../../../contracts/settings-transfer';

export function useSettingsTransferTreeNavigation(args: {
  visibleNodes: readonly SettingsTransferTreeNode[];
  expandedIds: ReadonlySet<string>;
  onToggleExpanded: (id: string, expanded?: boolean) => void;
}) {
  const [activeId, setActiveId] = useState(() => args.visibleNodes[0]?.id ?? '');
  const treeItemRefs = useRef(new Map<string, HTMLLIElement>());
  const checkboxRefs = useRef(new Map<string, HTMLInputElement>());
  useEffect(() => {
    if (!args.visibleNodes.some((node) => node.id === activeId)) {
      setActiveId(args.visibleNodes[0]?.id ?? '');
    }
  }, [activeId, args.visibleNodes]);

  const focusNode = (id: string) => {
    setActiveId(id);
    treeItemRefs.current.get(id)?.focus();
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    const currentIndex = args.visibleNodes.findIndex((node) => node.id === activeId);
    if (currentIndex < 0) return;
    const current = args.visibleNodes[currentIndex];
    let targetId: string | undefined;
    if (event.key === 'ArrowDown') targetId = args.visibleNodes[currentIndex + 1]?.id;
    if (event.key === 'ArrowUp') targetId = args.visibleNodes[currentIndex - 1]?.id;
    if (event.key === 'Home') targetId = args.visibleNodes[0]?.id;
    if (event.key === 'End') targetId = args.visibleNodes.at(-1)?.id;
    if (event.key === 'ArrowRight' && current?.children.length) {
      if (!args.expandedIds.has(current.id)) args.onToggleExpanded(current.id, true);
      else targetId = current.children[0]?.id;
    }
    if (event.key === 'ArrowLeft' && current) {
      if (current.children.length > 0 && args.expandedIds.has(current.id)) {
        args.onToggleExpanded(current.id, false);
      } else targetId = current.parentId ?? undefined;
    }
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      checkboxRefs.current.get(activeId)?.click();
      return;
    }
    if (!targetId) {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') event.preventDefault();
      return;
    }
    event.preventDefault();
    focusNode(targetId);
  };

  return {
    activeId,
    onActivate: setActiveId,
    handleKeyDown,
    registerTreeItem: (id: string, element: HTMLLIElement | null) => {
      if (element) treeItemRefs.current.set(id, element);
      else treeItemRefs.current.delete(id);
    },
    registerCheckbox: (id: string, element: HTMLInputElement | null) => {
      if (element) checkboxRefs.current.set(id, element);
      else checkboxRefs.current.delete(id);
    },
  };
}
