import { beforeEach, describe, expect, it, vi } from 'vitest';

const runtimeArgsMocks = vi.hoisted(() => ({
  createSelectionModeRuntimeArgsMock: vi.fn(),
}));

vi.mock('../session/runtime-state/args', () => ({
  createSelectionModeRuntimeArgs: runtimeArgsMocks.createSelectionModeRuntimeArgsMock,
}));

import { createSelectionModeRuntimeArgs } from './runtime';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('selection-mode controller runtime args facade', () => {
  it('delegates to the owner-local runtime-state args assembler', () => {
    const args = { state: { currentState: 'idle' } } as never;
    const runtimeArgs = { runtime: true } as never;
    runtimeArgsMocks.createSelectionModeRuntimeArgsMock.mockReturnValue(runtimeArgs);

    expect(createSelectionModeRuntimeArgs(args)).toBe(runtimeArgs);
    expect(runtimeArgsMocks.createSelectionModeRuntimeArgsMock).toHaveBeenCalledWith(args);
  });
});
