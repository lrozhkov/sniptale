import { beforeEach, expect, it, vi } from 'vitest';
import { refreshViewportRecordingAfterNavigation } from './refresh';

const {
  attachDebugger,
  resetZoom,
  setViewport,
  setViewportRecordingDrawState,
  waitForViewportSettle,
} = vi.hoisted(() => ({
  attachDebugger: vi.fn(),
  resetZoom: vi.fn(),
  setViewport: vi.fn(),
  setViewportRecordingDrawState: vi.fn(),
  waitForViewportSettle: vi.fn(),
}));

const viewportPreset = {
  id: 'desktop',
  label: 'Desktop',
  width: 1920,
  height: 1080,
};

vi.mock('../../../debugger/session/attach', () => ({
  attachDebugger,
  attachDebuggerSafe: vi.fn(),
}));

vi.mock('../../../debugger/workspace', () => ({
  ViewportEmulationResult: undefined,
  clearViewport: vi.fn(),
  resetZoom,
  setViewport,
}));

vi.mock('./viewport-draw-state', () => ({
  setViewportRecordingDrawState,
}));

vi.mock('./shared', async () => {
  const actual = await vi.importActual<typeof import('./shared')>('./shared');

  return {
    ...actual,
    waitForViewportSettle,
  };
});

beforeEach(() => {
  vi.clearAllMocks();

  attachDebugger.mockResolvedValue(undefined);
  resetZoom.mockResolvedValue(undefined);
  setViewport.mockResolvedValue({
    cssWidth: 1364.8,
    cssHeight: 768.2,
    scale: 0.71,
  });
  setViewportRecordingDrawState.mockResolvedValue(undefined);
  waitForViewportSettle.mockResolvedValue(undefined);
});

it('refreshes the crop overlay before unfreezing the viewport recording', async () => {
  await refreshViewportRecordingAfterNavigation({
    tabId: 42,
    viewportPreset,
    navigationEpoch: 3,
    isCurrentNavigationEpoch: () => true,
  });

  expect(waitForViewportSettle).toHaveBeenCalledTimes(1);
  expect(setViewportRecordingDrawState).toHaveBeenCalledWith({
    frozen: false,
    navigationEpoch: 3,
  });
});

it('unfreezes after refresh retries are exhausted', async () => {
  attachDebugger.mockRejectedValue(new Error('Target closed'));

  await refreshViewportRecordingAfterNavigation({
    tabId: 42,
    viewportPreset,
    navigationEpoch: 5,
    isCurrentNavigationEpoch: () => true,
  });

  expect(attachDebugger).toHaveBeenCalledTimes(2);
  expect(waitForViewportSettle).toHaveBeenCalledTimes(1);
  expect(setViewportRecordingDrawState).toHaveBeenCalledWith({
    frozen: false,
    navigationEpoch: 5,
  });
});
