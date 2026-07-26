import { beforeEach, describe, expect, it, vi } from 'vitest';

const diagMocks = vi.hoisted(() => ({
  logSelectionModeDiagMock: vi.fn(),
}));

const modeSessionMocks = vi.hoisted(() => ({
  deactivateOtherContentModesMock: vi.fn(),
  setContentModeEnabledMock: vi.fn(),
}));

vi.mock('../diag', () => ({
  logSelectionModeDiag: diagMocks.logSelectionModeDiagMock,
}));

vi.mock('../../../application/mode-session', () => ({
  deactivateOtherContentModes: modeSessionMocks.deactivateOtherContentModesMock,
  setContentModeEnabled: modeSessionMocks.setContentModeEnabledMock,
}));

import { createSelectionModeControllerActions } from './actions';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('selection-mode controller actions', () => {
  it('wires enable, disable, active, and cleanup actions to the runtime contract', async () => {
    const cleanup = vi.fn();
    const runtime = {
      disableSelectionMode: vi.fn(),
      enableSelectionMode: vi.fn(() => Promise.resolve({ x: 1, y: 2, width: 3, height: 4 })),
      isSelectionModeActive: vi.fn(() => true),
    };

    const actions = createSelectionModeControllerActions({
      cleanup,
      runtime,
    });

    const options = { captureAction: 'copy' as const };
    await expect(actions.enableSelectionMode(options)).resolves.toEqual({
      x: 1,
      y: 2,
      width: 3,
      height: 4,
    });
    actions.disableSelectionMode();

    expect(actions.isSelectionModeActive()).toBe(true);
    expect(actions.cleanup).toBe(cleanup);
    expect(runtime.enableSelectionMode).toHaveBeenCalledWith(options);
    expect(diagMocks.logSelectionModeDiagMock).toHaveBeenNthCalledWith(
      1,
      'enableSelectionMode.requested'
    );
    expect(diagMocks.logSelectionModeDiagMock).toHaveBeenNthCalledWith(
      2,
      'disableSelectionMode.requested'
    );
    expect(modeSessionMocks.deactivateOtherContentModesMock).toHaveBeenCalledWith('selection-mode');
    expect(modeSessionMocks.setContentModeEnabledMock).toHaveBeenNthCalledWith(
      1,
      'selection-mode',
      true
    );
  });
});
