import { expect, it, vi } from 'vitest';

const rootMocks = vi.hoisted(() => ({
  createFacadeBindingsMock: vi.fn(),
  createRuntimeBindingsMock: vi.fn(),
}));

vi.mock('./facade', () => ({
  createSelectionModeFacadeBindings: rootMocks.createFacadeBindingsMock,
}));

vi.mock('./runtime', () => ({
  createSelectionModeRuntimeBindings: rootMocks.createRuntimeBindingsMock,
}));

import { createSelectionModeFacadeBindings, createSelectionModeRuntimeBindings } from '.';

it('re-exports the owner-local facade and runtime bindings', () => {
  const facade = { facade: true };
  const runtime = { runtime: true };
  rootMocks.createFacadeBindingsMock.mockReturnValue(facade);
  rootMocks.createRuntimeBindingsMock.mockReturnValue(runtime);

  expect(createSelectionModeFacadeBindings({} as never)).toBe(facade);
  expect(createSelectionModeRuntimeBindings({} as never)).toBe(runtime);
});
