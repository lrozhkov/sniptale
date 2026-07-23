import { useCallback, useEffect, useState } from 'react';
import {
  loadTemplateOrder,
  saveTemplateOrder,
} from '../../../../../composition/persistence/prompt-templates';
import type { PromptTemplate } from '../../../../../contracts/settings';

type TemplateOrderState = {
  isLoaded: boolean;
  orderedIds: string[];
};

function syncOrderedIds(previous: string[], templates: PromptTemplate[]) {
  const existingIds = new Set(templates.map((template) => template.id));
  const filtered = previous.filter((id) => existingIds.has(id));
  const newIds = templates.map((template) => template.id).filter((id) => !filtered.includes(id));
  return [...filtered, ...newIds];
}

function reorderTemplateIds(previous: string[], sourceId: string, targetId: string) {
  const nextOrder = [...previous];
  const fromIndex = nextOrder.indexOf(sourceId);
  const toIndex = nextOrder.indexOf(targetId);
  nextOrder.splice(fromIndex, 1);
  nextOrder.splice(toIndex, 0, sourceId);
  // Template ordering is advisory-only: keep the local drag result even if persistence fails.
  void saveTemplateOrder(nextOrder);
  return nextOrder;
}

export function useTemplateOrderState(templates: PromptTemplate[]) {
  const [state, setState] = useState<TemplateOrderState>({
    isLoaded: false,
    orderedIds: [],
  });

  useEffect(() => {
    void loadTemplateOrder().then((orderedIds) => {
      setState({ isLoaded: true, orderedIds });
    });
  }, []);

  useEffect(() => {
    if (!state.isLoaded) {
      return;
    }

    setState((current) => ({
      ...current,
      orderedIds: syncOrderedIds(current.orderedIds, templates),
    }));
  }, [state.isLoaded, templates]);

  const reorder = useCallback((sourceId: string, targetId: string) => {
    setState((current) => ({
      ...current,
      orderedIds: reorderTemplateIds(current.orderedIds, sourceId, targetId),
    }));
  }, []);

  return { orderedIds: state.orderedIds, reorder };
}
