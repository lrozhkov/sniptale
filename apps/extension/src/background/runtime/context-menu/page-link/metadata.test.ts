// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { browserScriptingExecuteScriptMock } = vi.hoisted(() => ({
  browserScriptingExecuteScriptMock: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/scripting', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/scripting')>()),
  browserScripting: {
    executeScript: browserScriptingExecuteScriptMock,
  },
}));

import { resolvePageLinkTitle } from './metadata';

function createTab(overrides: Partial<chrome.tabs.Tab> = {}): chrome.tabs.Tab {
  return {
    id: 7,
    title: 'Tab title',
    url: 'https://example.test',
    ...overrides,
  } as chrome.tabs.Tab;
}

describe('context menu page-link metadata', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.head.innerHTML = '';
    document.title = '';
    browserScriptingExecuteScriptMock.mockResolvedValue([{ frameId: 0, result: 'Meta title' }]);
  });

  it('uses page metadata title when scripting returns one', async () => {
    await expect(resolvePageLinkTitle(createTab())).resolves.toBe('Meta title');
    expect(browserScriptingExecuteScriptMock).toHaveBeenCalledWith({
      target: { tabId: 7 },
      func: expect.any(Function),
    });
  });

  it('falls back to tab title on scripting failures and restricted browser pages', async () => {
    browserScriptingExecuteScriptMock.mockRejectedValueOnce(new Error('blocked'));

    await expect(resolvePageLinkTitle(createTab())).resolves.toBe('Tab title');
    await expect(resolvePageLinkTitle(createTab({ url: 'chrome://extensions' }))).resolves.toBe(
      'Tab title'
    );
    expect(browserScriptingExecuteScriptMock).toHaveBeenCalledTimes(1);
  });

  it('reads metadata in priority order inside the page context', async () => {
    document.head.innerHTML = `
      <meta name="twitter:title" content="Twitter title">
      <meta property="og:title" content="Open Graph title">
    `;
    mockPageContextExecution();

    await expect(resolvePageLinkTitle(createTab())).resolves.toBe('Open Graph title');
  });

  it(
    'falls back from empty metadata to document title, tab URL, or empty title',
    verifyFallbackTitles
  );
});

function mockPageContextExecution(): void {
  browserScriptingExecuteScriptMock.mockImplementation(async ({ func }) => [
    { frameId: 0, result: func() },
  ]);
}

async function verifyFallbackTitles(): Promise<void> {
  mockPageContextExecution();

  document.title = 'Document title';
  await expect(resolvePageLinkTitle(createTab())).resolves.toBe('Document title');
  document.title = '';
  await expect(resolvePageLinkTitle(createTab())).resolves.toBe('Tab title');
  await expect(
    resolvePageLinkTitle(createTab({ id: undefined, title: '', url: 'https://tab.test' }))
  ).resolves.toBe('https://tab.test');
  await expect(
    resolvePageLinkTitle(createTab({ id: undefined, title: '', url: '' }))
  ).resolves.toBe('');
}
