import { beforeEach, expect, it, vi } from 'vitest';

const selectionModeIndexMocks = vi.hoisted(() => ({
  createLazyContentDefaultOwner: vi.fn(),
  disableSelectionMode: vi.fn(),
  enableSelectionMode: vi.fn(),
  getOwner: vi.fn(),
  getOwnerIfCreated: vi.fn(),
  registerContentMode: vi.fn(),
}));

vi.mock('../../application/default-owner', () => ({
  createLazyContentDefaultOwner: selectionModeIndexMocks.createLazyContentDefaultOwner,
}));

vi.mock('../../application/mode-session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../application/mode-session')>()),
  registerContentMode: selectionModeIndexMocks.registerContentMode,
}));

vi.mock('./controller', () => ({
  createSelectionModeController: vi.fn(),
}));

function seedSelectionModeOwner(created: boolean): void {
  const controller = {
    disableSelectionMode: selectionModeIndexMocks.disableSelectionMode,
    enableSelectionMode: selectionModeIndexMocks.enableSelectionMode,
  };

  selectionModeIndexMocks.getOwner.mockReturnValue(controller);
  selectionModeIndexMocks.getOwnerIfCreated.mockReturnValue(created ? controller : undefined);
  selectionModeIndexMocks.createLazyContentDefaultOwner.mockReturnValue({
    getOwner: selectionModeIndexMocks.getOwner,
    getOwnerIfCreated: selectionModeIndexMocks.getOwnerIfCreated,
  });
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  selectionModeIndexMocks.enableSelectionMode.mockResolvedValue({
    height: 4,
    width: 3,
    x: 1,
    y: 2,
  });
});

it('registers selection mode cleanup and enables through the lazy owner', async () => {
  seedSelectionModeOwner(true);

  const { enableSelectionMode } = await import('.');

  await expect(enableSelectionMode()).resolves.toEqual({ height: 4, width: 3, x: 1, y: 2 });

  expect(selectionModeIndexMocks.registerContentMode).toHaveBeenCalledWith(
    'selection-mode',
    expect.any(Function)
  );
  expect(selectionModeIndexMocks.getOwner).toHaveBeenCalledOnce();
  expect(selectionModeIndexMocks.enableSelectionMode).toHaveBeenCalledOnce();
});

it('disables the existing selection mode owner without creating one', async () => {
  seedSelectionModeOwner(true);

  const { disableSelectionMode } = await import('.');
  disableSelectionMode();

  expect(selectionModeIndexMocks.getOwnerIfCreated).toHaveBeenCalledOnce();
  expect(selectionModeIndexMocks.getOwner).not.toHaveBeenCalled();
  expect(selectionModeIndexMocks.disableSelectionMode).toHaveBeenCalledOnce();
});

it('skips selection mode cleanup when no owner has been created', async () => {
  seedSelectionModeOwner(false);

  const { disableSelectionMode } = await import('.');
  disableSelectionMode();

  expect(selectionModeIndexMocks.getOwnerIfCreated).toHaveBeenCalledOnce();
  expect(selectionModeIndexMocks.getOwner).not.toHaveBeenCalled();
  expect(selectionModeIndexMocks.disableSelectionMode).not.toHaveBeenCalled();
});
