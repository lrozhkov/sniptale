export function createContextMenuTestTab(id = 5): chrome.tabs.Tab {
  return { id, url: 'https://example.test' } as chrome.tabs.Tab;
}

export async function flushContextMenuTestMicrotasks(): Promise<void> {
  for (let index = 0; index < 6; index += 1) await Promise.resolve();
}
