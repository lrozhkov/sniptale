// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { appendToContentOverlayRootMock, getContentUiElementByIdMock } = vi.hoisted(() => ({
  appendToContentOverlayRootMock: vi.fn((element: HTMLElement) => {
    document.body.appendChild(element);
  }),
  getContentUiElementByIdMock: vi.fn((id: string) => document.getElementById(id)),
}));

vi.mock('../../../platform/dom-host', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/dom-host')>()),
  appendToContentOverlayRoot: appendToContentOverlayRootMock,
  getContentUiElementById: getContentUiElementByIdMock,
}));

vi.mock('../../../../platform/i18n', () => ({
  translate: (key: string) => key,
}));

import { useShowToolbarButton } from '.';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let currentProps: Parameters<typeof useShowToolbarButton>[0] | null = null;

function Harness() {
  useShowToolbarButton(
    currentProps ?? {
      countdownActive: false,
      isCompletelyHidden: false,
      isToolbarVisible: false,
      onShowToolbar: vi.fn(),
      screenshotMode: true,
    }
  );

  return null;
}

async function renderHarness(props: Parameters<typeof useShowToolbarButton>[0]) {
  currentProps = props;

  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<Harness />);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  appendToContentOverlayRootMock.mockClear();
  getContentUiElementByIdMock.mockClear();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  currentProps = null;
  document.getElementById('sniptale-show-toolbar-btn')?.remove();
  vi.unstubAllGlobals();
});

async function expectButtonReuseWithLatestCallback() {
  const firstOnShowToolbar = vi.fn();
  const secondOnShowToolbar = vi.fn();

  await renderHarness({
    countdownActive: false,
    isCompletelyHidden: false,
    isToolbarVisible: false,
    onShowToolbar: firstOnShowToolbar,
    screenshotMode: true,
  });

  const initialButton = document.getElementById('sniptale-show-toolbar-btn');

  await renderHarness({
    countdownActive: false,
    isCompletelyHidden: false,
    isToolbarVisible: false,
    onShowToolbar: secondOnShowToolbar,
    screenshotMode: true,
  });

  const updatedButton = document.getElementById('sniptale-show-toolbar-btn');
  updatedButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

  expect(initialButton).toBeTruthy();
  expect(updatedButton).toBe(initialButton);
  expect(appendToContentOverlayRootMock).toHaveBeenCalledTimes(1);
  expect(firstOnShowToolbar).not.toHaveBeenCalled();
  expect(secondOnShowToolbar).toHaveBeenCalledTimes(1);
}

async function expectButtonRemovalWhenNotNeeded() {
  await renderHarness({
    countdownActive: false,
    isCompletelyHidden: false,
    isToolbarVisible: false,
    onShowToolbar: vi.fn(),
    screenshotMode: true,
  });

  expect(document.getElementById('sniptale-show-toolbar-btn')).toBeTruthy();

  await renderHarness({
    countdownActive: false,
    isCompletelyHidden: false,
    isToolbarVisible: true,
    onShowToolbar: vi.fn(),
    screenshotMode: true,
  });

  expect(document.getElementById('sniptale-show-toolbar-btn')).toBeNull();
}

function runUseShowToolbarButtonSuite() {
  it(
    'reuses the same toolbar button across rerenders and routes clicks through the latest callback',
    expectButtonReuseWithLatestCallback
  );
  it(
    'removes the toolbar button when screenshot mode no longer needs it',
    expectButtonRemovalWhenNotNeeded
  );
}

describe('useShowToolbarButton', runUseShowToolbarButtonSuite);
