import {
  loadTemplateOrder,
  saveTemplateOrder,
} from '../../../../../composition/persistence/prompt-templates';
import type { PromptTemplate } from '../../../../../contracts/settings';

export async function loadSavedTemplateOrder(
  setOrderedIds: React.Dispatch<React.SetStateAction<string[]>>,
  setOrderLoaded: React.Dispatch<React.SetStateAction<boolean>>
) {
  const savedIds = await loadTemplateOrder();
  setOrderedIds(savedIds);
  setOrderLoaded(true);
}

export function syncOrderedIds(prev: string[], templates: PromptTemplate[]) {
  const existingIds = new Set(templates.map((template) => template.id));
  const filtered = prev.filter((id) => existingIds.has(id));
  const newIds = templates.map((template) => template.id).filter((id) => !filtered.includes(id));
  return [...filtered, ...newIds];
}

export function reorderTemplateIds(prev: string[], sourceId: string, targetId: string) {
  const newOrder = [...prev];
  const fromIndex = newOrder.indexOf(sourceId);
  const toIndex = newOrder.indexOf(targetId);
  newOrder.splice(fromIndex, 1);
  newOrder.splice(toIndex, 0, sourceId);
  // Template ordering is advisory-only: keep the local drag result even if persistence fails.
  void saveTemplateOrder(newOrder);
  return newOrder;
}
