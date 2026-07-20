import {
  captureDomStateMap,
  createDomMutationBatch,
  pagePreparationHistory,
  type PageDomElementState,
} from '../../parser/page-preparation/history';

type HistoryDomStateById = Map<string, Map<string, PageDomElementState>>;

export function createQuickEditHistoryTracker() {
  const historyDomStateById: HistoryDomStateById = new Map();

  return {
    begin(element: HTMLElement, id: string) {
      historyDomStateById.set(id, captureDomStateMap([element]));
      pagePreparationHistory.beginTransaction(`quick-edit:${id}`);
    },
    commit(element: HTMLElement, id: string | undefined) {
      if (!id) {
        return;
      }

      const beforeStates = historyDomStateById.get(id);
      pagePreparationHistory.commitTransaction(
        `quick-edit:${id}`,
        beforeStates ? createDomMutationBatch([element], beforeStates) : null
      );
      historyDomStateById.delete(id);
    },
    cancel(id: string | undefined) {
      if (!id) {
        return;
      }

      pagePreparationHistory.cancelTransaction(`quick-edit:${id}`);
      historyDomStateById.delete(id);
    },
  };
}
