// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CONTENT_ROOT_ID } from '@sniptale/ui/branding';

const { executeScriptMock } = vi.hoisted(() => ({
  executeScriptMock: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/scripting', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/scripting')>()),
  browserScripting: {
    executeScript: executeScriptMock,
  },
}));

import { getPageDimensions, hideFixedElements, restoreFixedElements, scrollPage } from './index';

type ScriptInjection = {
  func?: (...args: unknown[]) => unknown;
  args?: unknown[];
  target: { tabId: number };
};

function runInjectedScript(injection: ScriptInjection) {
  return injection.func?.(...(injection.args ?? []));
}

const runSerializedInjectedScript = runInjectedScript;

function runCapturePageStateDimensionsSuite() {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
    executeScriptMock.mockImplementation(async (injection: ScriptInjection) => [
      { result: runInjectedScript(injection) },
    ]);
  });

  it('reads page dimensions through the shared scripting seam', async () => {
    Object.defineProperty(document.documentElement, 'scrollHeight', {
      configurable: true,
      value: 3200,
    });
    Object.defineProperty(document.documentElement, 'scrollWidth', {
      configurable: true,
      value: 1440,
    });
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 900,
    });
    Object.defineProperty(window, 'devicePixelRatio', {
      configurable: true,
      value: 2,
    });

    await expect(getPageDimensions(12)).resolves.toEqual({
      devicePixelRatio: 2,
      scrollHeight: 3200,
      scrollWidth: 1440,
      viewportHeight: 900,
    });

    expect(executeScriptMock).toHaveBeenCalledWith(
      expect.objectContaining({
        target: { tabId: 12 },
      })
    );
  });

  it('fails when the injected page-dimensions result is missing', async () => {
    executeScriptMock.mockResolvedValueOnce([]);

    await expect(getPageDimensions(12)).rejects.toThrow('Failed to get page dimensions');
  });
}

function appendFixedMutationFixture() {
  const fixture = createFixedMutationFixture();
  document.body.append(fixture.fixed, fixture.contentHost, fixture.toast, fixture.normal);
  return fixture;
}

async function expectFixedElementsHideAndRestore() {
  const { contentHost, fixed, toast } = appendFixedMutationFixture();

  await expect(hideFixedElements(9)).resolves.toBe(1);
  expect(fixed.dataset['sniptaleFixed']).toBe('true');
  expect(fixed.style.display).toBe('none');
  expect(contentHost.dataset['sniptaleFixed']).toBeUndefined();
  expect(contentHost.style.display).toBe('block');
  expect(toast.style.display).toBe('block');

  await restoreFixedElements(9);

  expect(fixed.dataset['sniptaleFixed']).toBeUndefined();
  expect(fixed.style.display).toBe('flex');
}

function appendShadowPreparedOverlayFixture() {
  const contentHost = createPositionedElement({
    display: 'block',
    id: CONTENT_ROOT_ID,
    position: 'fixed',
  });
  const shadowRoot = contentHost.attachShadow({ mode: 'open' });
  const callout = createPositionedElement({
    className: 'sniptale-callout',
    display: 'block',
    position: 'fixed',
  });
  const frames = createPositionedElement({
    className: 'sniptale-frames-container',
    display: 'block',
    position: 'fixed',
  });
  shadowRoot.append(callout, frames);
  document.body.append(contentHost);
  return { callout, contentHost, frames };
}

async function expectPreparedOverlaysStayVisibleDuringMasking() {
  const { callout, contentHost, frames } = appendShadowPreparedOverlayFixture();

  await expect(hideFixedElements(9)).resolves.toBe(0);

  expect(contentHost.dataset['sniptaleFixed']).toBeUndefined();
  expect(callout.style.display).toBe('block');
  expect(frames.style.display).toBe('block');
}

function runCapturePageStateMutationSuite() {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
    executeScriptMock.mockImplementation(async (injection: ScriptInjection) => [
      { result: runInjectedScript(injection) },
    ]);
  });

  it(
    'hides and restores fixed elements while preserving Sniptale overlays',
    expectFixedElementsHideAndRestore
  );
  it(
    'preserves shadow-owned prepared overlays during fixed-element masking',
    expectPreparedOverlaysStayVisibleDuringMasking
  );
  it(
    'keeps the fixed-element masking script independent from extension module scope',
    expectSerializedFixedElementMasking
  );
  it(
    'returns zero hidden elements when the injected script yields no count',
    expectZeroHiddenElementFallback
  );
  it(
    'restores fixed elements without forcing an inline display when none existed before hide',
    expectRestoreWithoutInlineDisplay
  );
  it('scrolls the page to the requested offset', expectScrollPageOffset);
}

async function expectSerializedFixedElementMasking() {
  const fixture = appendFixedMutationFixture();

  executeScriptMock.mockImplementationOnce(async (injection: ScriptInjection) => [
    { result: runSerializedInjectedScript(injection) },
  ]);

  await expect(hideFixedElements(9)).resolves.toBe(1);

  expect(fixture.fixed.dataset['sniptaleFixed']).toBe('true');
  expect(fixture.contentHost.dataset['sniptaleFixed']).toBeUndefined();
}

async function expectZeroHiddenElementFallback() {
  executeScriptMock.mockResolvedValueOnce([{ result: undefined }]);

  await expect(hideFixedElements(5)).resolves.toBe(0);
}

async function expectRestoreWithoutInlineDisplay() {
  const fixed = document.createElement('div');
  fixed.style.position = 'fixed';
  document.body.append(fixed);

  await hideFixedElements(11);
  expect(fixed.style.display).toBe('none');

  await restoreFixedElements(11);
  expect(fixed.style.display).toBe('');
}

async function expectScrollPageOffset() {
  const scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);

  await scrollPage(7, 480);

  expect(scrollToSpy).toHaveBeenCalledWith(0, 480);
  expect(executeScriptMock).toHaveBeenCalledWith(
    expect.objectContaining({
      args: [480],
      target: { tabId: 7 },
    })
  );
}

function createPositionedElement(args: {
  display?: string;
  id?: string;
  position: string;
  className?: string;
}) {
  const element = document.createElement('div');
  if (args.id) {
    element.id = args.id;
  }
  if (args.className) {
    element.className = args.className;
  }
  element.style.position = args.position;
  if (args.display) {
    element.style.display = args.display;
  }
  return element;
}

function createFixedMutationFixture() {
  return {
    fixed: createPositionedElement({ display: 'flex', id: 'fixed', position: 'fixed' }),
    contentHost: createPositionedElement({
      display: 'block',
      id: CONTENT_ROOT_ID,
      position: 'fixed',
    }),
    toast: createPositionedElement({
      className: 'sniptale-toast',
      display: 'block',
      position: 'fixed',
    }),
    normal: createPositionedElement({ id: 'normal', position: 'static' }),
  };
}

describe('capture-page-state dimensions', runCapturePageStateDimensionsSuite);
describe('capture-page-state DOM mutations', runCapturePageStateMutationSuite);
