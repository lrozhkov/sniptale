import { startTransition, useEffect, useState } from 'react';
import type { DesignSystemRegistryEntry } from '../../catalog/registry/types';

interface DesignSystemPageExplorerState {
  expandedEntryId: string | null;
  setExpandedEntryId: (componentId: string) => void;
  isFilterPanelOpen: boolean;
  setIsFilterPanelOpen: (open: boolean) => void;
  toggleFilterPanel: () => void;
}

export function useDesignSystemPageExplorerState(
  filteredEntries: DesignSystemRegistryEntry[]
): DesignSystemPageExplorerState {
  const [expandedEntryId, setExpandedEntryIdState] = useState<string | null>(
    filteredEntries[0]?.componentId ?? null
  );
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);

  useEffect(() => {
    if (filteredEntries.length === 0) {
      startTransition(() => {
        setExpandedEntryIdState(null);
      });
      return;
    }

    if (filteredEntries.some((entry) => entry.componentId === expandedEntryId)) {
      return;
    }

    startTransition(() => {
      setExpandedEntryIdState(filteredEntries[0]!.componentId);
    });
  }, [expandedEntryId, filteredEntries]);

  return {
    expandedEntryId,
    setExpandedEntryId: (componentId) => setExpandedEntryIdState(componentId),
    isFilterPanelOpen,
    setIsFilterPanelOpen: (open) => setIsFilterPanelOpen(open),
    toggleFilterPanel: () => setIsFilterPanelOpen((current) => !current),
  };
}
