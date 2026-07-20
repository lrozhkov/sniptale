// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  loggerErrorMock,
  resizeElementMock,
  saveSpoilerStateMock,
  showToastMock,
  translateMock,
  writeTextMock,
} = vi.hoisted(() => ({
  loggerErrorMock: vi.fn(),
  resizeElementMock: vi.fn(),
  saveSpoilerStateMock: vi.fn(),
  showToastMock: vi.fn(),
  translateMock: vi.fn((key: string) => {
    const messages: Record<string, string> = {
      'aiModal.dataSummaryAllPrefix': 'All ',
      'aiModal.dataSummaryNone': 'None selected',
      'content.runtime.copyTextFailed': 'Copy failed',
    };
    return messages[key] ?? key;
  }),
  writeTextMock: vi.fn(() => Promise.resolve()),
}));

vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),
  translate: translateMock,
}));

vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/observability/logger')>()),
  createLogger: () => ({
    error: loggerErrorMock,
  }),
}));

vi.mock('../../persistence/spoiler-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../persistence/spoiler-state')>()),
  saveSpoilerState: saveSpoilerStateMock,
}));

vi.mock('@sniptale/ui/product-feedback/toast-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-feedback/toast-service')>()),
  showToast: showToastMock,
}));

vi.mock('./resize', async () => {
  const actual = await vi.importActual<typeof import('./resize')>('./resize');

  return {
    ...actual,
    resizeElement: resizeElementMock,
  };
});

import {
  createCopyFormattedJsonHandler,
  createDataResizeStartHandler,
  createJsonResizeStartHandler,
  createToggleSpoilerHandler,
  getSummaryToneClass,
} from './panel';

beforeEach(() => {
  vi.useFakeTimers();
  resizeElementMock.mockReset();
  saveSpoilerStateMock.mockReset();
  showToastMock.mockReset();
  translateMock.mockClear();
  loggerErrorMock.mockReset();
  writeTextMock.mockClear();
  vi.stubGlobal('navigator', {
    clipboard: {
      writeText: writeTextMock,
    },
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('createToggleSpoilerHandler', () => {
  it('toggles spoiler state and persists the new preference', () => {
    const setIsDataSpoilerOpen = vi.fn();

    createToggleSpoilerHandler(false, setIsDataSpoilerOpen)();

    expect(setIsDataSpoilerOpen).toHaveBeenCalledWith(true);
    expect(saveSpoilerStateMock).toHaveBeenCalledWith(true);
  });

  it('keeps the local spoiler toggle even when advisory persistence rejects', async () => {
    const setIsDataSpoilerOpen = vi.fn();
    saveSpoilerStateMock.mockRejectedValueOnce(new Error('storage offline'));

    createToggleSpoilerHandler(false, setIsDataSpoilerOpen)();
    await saveSpoilerStateMock.mock.results[0]?.value?.catch(() => undefined);

    expect(setIsDataSpoilerOpen).toHaveBeenCalledWith(true);
    expect(saveSpoilerStateMock).toHaveBeenCalledWith(true);
  });
});

describe('resize handlers', () => {
  it('delegate data and json resize events to the shared resize helper', () => {
    const dataContainerRef = { current: document.createElement('div') };
    const jsonPreviewRef = { current: document.createElement('pre') };
    const setIsDataResizing = vi.fn();
    const setIsJsonResizing = vi.fn();
    const event = {
      clientY: 100,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    };

    createDataResizeStartHandler({ dataContainerRef, setIsDataResizing })(event);
    createJsonResizeStartHandler({ jsonPreviewRef, setIsJsonResizing })(event);

    expect(resizeElementMock).toHaveBeenNthCalledWith(
      1,
      event,
      dataContainerRef.current,
      setIsDataResizing
    );
    expect(resizeElementMock).toHaveBeenNthCalledWith(
      2,
      event,
      jsonPreviewRef.current,
      setIsJsonResizing
    );
  });
});

describe('createCopyFormattedJsonHandler', () => {
  it('copies formatted json and resets copied state after the timeout', async () => {
    const setCopied = vi.fn();

    createCopyFormattedJsonHandler({
      formattedJSON: '{\n  "status": "open"\n}',
      setCopied,
    })();

    await Promise.resolve();
    expect(writeTextMock).toHaveBeenCalledWith('{\n  "status": "open"\n}');
    expect(setCopied).toHaveBeenCalledWith(true);

    vi.runAllTimers();

    expect(setCopied).toHaveBeenLastCalledWith(false);
  });

  it('surfaces clipboard failures without leaving copied state stuck', async () => {
    const setCopied = vi.fn();
    writeTextMock.mockRejectedValueOnce(new Error('denied'));

    createCopyFormattedJsonHandler({
      formattedJSON: '{\n  "status": "open"\n}',
      setCopied,
    })();

    await Promise.resolve();
    await Promise.resolve();

    expect(setCopied).toHaveBeenCalledWith(false);
    expect(showToastMock).toHaveBeenCalledWith('Copy failed', 'error');
    expect(loggerErrorMock).toHaveBeenCalledWith(
      'Failed to copy formatted JSON to clipboard',
      expect.any(Error)
    );
  });
});

describe('getSummaryToneClass', () => {
  it('maps translated summary prefixes to stable tone classes', () => {
    expect(getSummaryToneClass('All 3 fields selected')).toBe('sniptale-ai-summary--success');
    expect(getSummaryToneClass('None selected')).toBe('sniptale-ai-summary--danger');
    expect(getSummaryToneClass('Some fields selected')).toBe('sniptale-ai-summary--info');
  });
});
