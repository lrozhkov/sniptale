// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  exportMock: vi.fn(),
  homeMock: vi.fn(),
  videoSetupMock: vi.fn(),
}));

vi.mock('./export', () => ({
  PopupAppContentExport: (props: unknown) => {
    mocks.exportMock(props);
    return <div data-testid="export-route" />;
  },
}));

vi.mock('./home', () => ({
  PopupAppContentHome: (props: unknown) => {
    mocks.homeMock(props);
    return <div data-testid="home-route" />;
  },
}));

vi.mock('./video-setup', () => ({
  PopupAppContentVideoSetup: (props: unknown) => {
    mocks.videoSetupMock(props);
    return <div data-testid="video-setup-route" />;
  },
}));

import { PopupAppContent } from './view';
import type { PopupRuntimeState } from '../../runtime/types/state';
import {
  createPopupAppShellRuntime,
  type PopupRuntimeStateOverrides,
} from '../test-support/runtime';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createRuntime(overrides: PopupRuntimeStateOverrides = {}): PopupRuntimeState {
  return createPopupAppShellRuntime(overrides);
}

async function renderContent(runtime = createRuntime()) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<PopupAppContent runtime={runtime} />);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  mocks.exportMock.mockReset();
  mocks.homeMock.mockReset();
  mocks.videoSetupMock.mockReset();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

it('renders the selected video route even when recording remains active', async () => {
  await renderContent(createRuntime({ recordingActive: true, page: 'video' }));

  expect(container?.querySelector('[data-testid="video-setup-route"]')).toBeTruthy();
  expect(mocks.videoSetupMock).toHaveBeenCalledTimes(1);
  expect(mocks.exportMock).not.toHaveBeenCalled();
  expect(mocks.homeMock).not.toHaveBeenCalled();
});

it('respects manual navigation away from video while recording is active', async () => {
  await renderContent(createRuntime({ recordingActive: true, page: 'export' }));

  expect(container?.querySelector('[data-testid="export-route"]')).toBeTruthy();
  expect(mocks.exportMock).toHaveBeenCalledTimes(1);
  expect(mocks.videoSetupMock).not.toHaveBeenCalled();
});

it('renders the video setup route when the video page is active', async () => {
  await renderContent(createRuntime({ page: 'video' }));

  expect(container?.querySelector('[data-testid="video-setup-route"]')).toBeTruthy();
  expect(mocks.videoSetupMock).toHaveBeenCalledTimes(1);
});

it('renders the export route when the export page is active', async () => {
  await renderContent(createRuntime({ page: 'export' }));

  expect(container?.querySelector('[data-testid="export-route"]')).toBeTruthy();
  expect(mocks.exportMock).toHaveBeenCalledTimes(1);
});

it('renders the home route as the default branch', async () => {
  await renderContent(createRuntime());

  expect(container?.querySelector('[data-testid="home-route"]')).toBeTruthy();
  expect(mocks.homeMock).toHaveBeenCalledTimes(1);
});
