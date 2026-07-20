// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

const toastMocks = vi.hoisted(() => ({
  showToastMock: vi.fn(),
}));

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('@sniptale/ui/product-feedback/toast-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-feedback/toast-service')>()),
  showToast: toastMocks.showToastMock,
}));

import {
  dispatchContentModeDisabled,
  dispatchContentModeEnabled,
} from '../../platform/page-context/mode-events';
import { useModeDisabledListener } from './disabled-listener';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let currentProps: {
  aiPickMode: boolean;
  highlighterMode: boolean;
  quickEditMode: boolean;
} | null = null;
let latestSetters: {
  setAiPickModeSpy: Mock<(enabled: boolean) => void>;
  setHighlighterModeSpy: Mock<(enabled: boolean) => void>;
  setQuickEditDocumentModeSpy: Mock<(enabled: boolean) => void>;
  setQuickEditModeSpy: Mock<(enabled: boolean) => void>;
} | null = null;

function Harness() {
  useModeDisabledListener({
    aiPickMode: currentProps?.aiPickMode ?? false,
    highlighterMode: currentProps?.highlighterMode ?? false,
    quickEditMode: currentProps?.quickEditMode ?? false,
    setAiPickMode: (enabled) => latestSetters?.setAiPickModeSpy(enabled),
    setHighlighterMode: (enabled) => latestSetters?.setHighlighterModeSpy(enabled),
    setQuickEditDocumentMode: (enabled) => latestSetters?.setQuickEditDocumentModeSpy(enabled),
    setQuickEditMode: (enabled) => latestSetters?.setQuickEditModeSpy(enabled),
  });
  return null;
}

function renderHarness(props: {
  aiPickMode: boolean;
  highlighterMode: boolean;
  quickEditMode: boolean;
}) {
  currentProps = props;
  latestSetters = {
    setAiPickModeSpy: vi.fn<(enabled: boolean) => void>(),
    setHighlighterModeSpy: vi.fn<(enabled: boolean) => void>(),
    setQuickEditDocumentModeSpy: vi.fn<(enabled: boolean) => void>(),
    setQuickEditModeSpy: vi.fn<(enabled: boolean) => void>(),
  };

  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(<Harness />);
  });
}

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  currentProps = null;
  latestSetters = null;
  toastMocks.showToastMock.mockReset();
});

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

function expectAiPickDisableRouting() {
  renderHarness({
    aiPickMode: true,
    highlighterMode: false,
    quickEditMode: false,
  });

  act(() => {
    dispatchContentModeDisabled({ mode: 'ai-pick' });
  });

  expect(latestSetters?.setAiPickModeSpy).toHaveBeenCalledWith(false);
  expect(toastMocks.showToastMock).not.toHaveBeenCalled();
}

function expectHighlighterDisableRouting() {
  renderHarness({
    aiPickMode: false,
    highlighterMode: true,
    quickEditMode: false,
  });

  act(() => {
    dispatchContentModeDisabled({ mode: 'highlighter' });
  });

  expect(latestSetters?.setHighlighterModeSpy).toHaveBeenCalledWith(false);
  expect(toastMocks.showToastMock).not.toHaveBeenCalled();
}

function expectInactiveModeIgnore() {
  renderHarness({
    aiPickMode: false,
    highlighterMode: false,
    quickEditMode: false,
  });

  act(() => {
    dispatchContentModeDisabled({ mode: 'quick-edit' });
  });

  expect(latestSetters?.setQuickEditModeSpy).not.toHaveBeenCalled();
  expect(latestSetters?.setQuickEditDocumentModeSpy).toHaveBeenCalledWith(false);
  expect(toastMocks.showToastMock).not.toHaveBeenCalled();
}

function expectQuickEditDisableRouting() {
  renderHarness({
    aiPickMode: false,
    highlighterMode: false,
    quickEditMode: true,
  });

  act(() => {
    dispatchContentModeDisabled({ mode: 'quick-edit' });
  });

  expect(latestSetters?.setQuickEditDocumentModeSpy).toHaveBeenCalledWith(false);
  expect(latestSetters?.setQuickEditModeSpy).toHaveBeenCalledWith(false);
  expect(toastMocks.showToastMock).not.toHaveBeenCalled();
}

function expectQuickEditEnableRouting() {
  renderHarness({
    aiPickMode: false,
    highlighterMode: false,
    quickEditMode: false,
  });

  act(() => {
    dispatchContentModeEnabled({ mode: 'quick-edit' });
  });

  expect(latestSetters?.setQuickEditModeSpy).toHaveBeenCalledWith(true);
  expect(latestSetters?.setQuickEditDocumentModeSpy).not.toHaveBeenCalled();
}

function expectLatestSnapshotRouting() {
  renderHarness({
    aiPickMode: false,
    highlighterMode: false,
    quickEditMode: false,
  });
  renderHarness({
    aiPickMode: true,
    highlighterMode: false,
    quickEditMode: false,
  });

  act(() => {
    dispatchContentModeDisabled({ mode: 'ai-pick' });
  });

  expect(latestSetters?.setAiPickModeSpy).toHaveBeenCalledWith(false);
  expect(toastMocks.showToastMock).not.toHaveBeenCalled();
}

function runUseModeDisabledListenerSuite() {
  it('turns off ai-pick mode through the shared event seam', expectAiPickDisableRouting);
  it('turns off highlighter mode through the shared event seam', expectHighlighterDisableRouting);
  it(
    'turns off quick-edit document mode through the shared event seam',
    expectQuickEditDisableRouting
  );
  it('ignores disable events for modes that are already inactive', expectInactiveModeIgnore);
  it('turns on quick-edit mode through the shared event seam', expectQuickEditEnableRouting);
  it(
    'routes disable events through the latest mode snapshot after rerender',
    expectLatestSnapshotRouting
  );
}

describe('useModeDisabledListener', runUseModeDisabledListenerSuite);
