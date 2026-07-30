// policyStateIds: [] - this tab-bound intent is disposable popup navigation delivery, not authorization authority.
const POPUP_EXPORT_LAUNCH_INTENT_TTL_MS = 10_000;

type PopupExportLaunchIntent = {
  expiresAtEpochMs: number;
  generation: number;
};

type PopupExportLaunchIntentHandle = {
  generation: number;
  tabId: number;
};

const popupExportLaunchIntents = new Map<number, PopupExportLaunchIntent>();
let nextGeneration = 0;

function pruneExpiredPopupExportLaunchIntents(nowEpochMs: number): void {
  for (const [tabId, intent] of popupExportLaunchIntents) {
    if (intent.expiresAtEpochMs <= nowEpochMs) {
      popupExportLaunchIntents.delete(tabId);
    }
  }
}

export function issuePopupExportLaunchIntent(
  tabId: number,
  nowEpochMs = Date.now()
): PopupExportLaunchIntentHandle {
  pruneExpiredPopupExportLaunchIntents(nowEpochMs);
  const generation = ++nextGeneration;
  popupExportLaunchIntents.set(tabId, {
    expiresAtEpochMs: nowEpochMs + POPUP_EXPORT_LAUNCH_INTENT_TTL_MS,
    generation,
  });
  return { generation, tabId };
}

export function revokePopupExportLaunchIntent(handle: PopupExportLaunchIntentHandle): void {
  if (popupExportLaunchIntents.get(handle.tabId)?.generation === handle.generation) {
    popupExportLaunchIntents.delete(handle.tabId);
  }
}

export function consumePopupExportLaunchIntent(tabId: number, nowEpochMs = Date.now()): boolean {
  const intent = popupExportLaunchIntents.get(tabId);
  if (!intent) {
    return false;
  }

  popupExportLaunchIntents.delete(tabId);
  return intent.expiresAtEpochMs > nowEpochMs;
}

export function resetPopupExportLaunchIntentsForTests(): void {
  popupExportLaunchIntents.clear();
  nextGeneration = 0;
}
