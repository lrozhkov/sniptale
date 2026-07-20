import { beforeEach, expect, it, vi } from 'vitest';

const runtimeMocks = vi.hoisted(() => ({
  controller: {
    disable: vi.fn(),
    enable: vi.fn(),
    refreshSnapshot: vi.fn(),
  },
  registerContentMode: vi.fn(),
}));

vi.mock('../../../../application/default-owner', () => ({
  createLazyContentDefaultOwner: (createOwner: () => typeof runtimeMocks.controller) => {
    let owner: typeof runtimeMocks.controller | null = null;
    return {
      getOwner: () => {
        owner ??= createOwner();
        return owner;
      },
      getOwnerIfCreated: () => owner,
    };
  },
}));

vi.mock('../../../../application/mode-session', () => ({
  registerContentMode: runtimeMocks.registerContentMode,
}));

vi.mock('./mode.controller', () => ({
  createAiPickModeController: vi.fn(() => runtimeMocks.controller),
}));

vi.mock('./overlay', () => ({
  createAiPickOverlayController: vi.fn(() => ({})),
}));

const { disableAiPickMode, enableAiPickMode, refreshAiPickModeSnapshot } =
  await import('./runtime');

beforeEach(() => {
  vi.clearAllMocks();
});

it('passes optional enable options through to the AI-pick mode controller', async () => {
  const onSelect = vi.fn();
  const options = { source: vi.fn(() => null) };

  await enableAiPickMode(onSelect, options);

  expect(runtimeMocks.controller.enable).toHaveBeenCalledWith(onSelect, options);
});

it('preserves the default one-argument enable call shape without source options', async () => {
  const onSelect = vi.fn();

  await enableAiPickMode(onSelect);

  expect(runtimeMocks.controller.enable).toHaveBeenCalledWith(onSelect);
});

it('delegates refresh requests to the lazily-created AI-pick controller', async () => {
  await refreshAiPickModeSnapshot();

  expect(runtimeMocks.controller.refreshSnapshot).toHaveBeenCalledTimes(1);
});

it('delegates disable requests when the AI-pick controller exists', async () => {
  await enableAiPickMode(vi.fn());

  disableAiPickMode();

  expect(runtimeMocks.controller.disable).toHaveBeenCalledTimes(1);
});
