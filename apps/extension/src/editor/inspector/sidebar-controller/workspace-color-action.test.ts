import { beforeEach, describe, expect, it, vi } from 'vitest';

const { patchEditorWorkspaceDefaultsMock } = vi.hoisted(() => ({
  patchEditorWorkspaceDefaultsMock: vi.fn(),
}));

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),

  translate: (key: string) => key,
}));

vi.mock('../../persistence/workspace', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../persistence/workspace')>()),

  patchEditorWorkspaceDefaults: patchEditorWorkspaceDefaultsMock,
}));

import { createWorkspaceColorApplyAction } from './workspace-color-action';
import { createWorkspaceDefaultSaveAction } from './workspace-color-action';

function createApplyActionArgs() {
  return {
    rememberRecentColor: vi.fn(async () => undefined),
    setWorkspaceColorError: vi.fn(),
    updateWorkspace: vi.fn(),
  };
}

function createSaveActionArgs(
  overrides: Partial<Parameters<typeof createWorkspaceDefaultSaveAction>[0]> = {}
) {
  return {
    setWorkspaceColorError: vi.fn(),
    setWorkspaceDefaultSavePending: vi.fn(),
    updateWorkspaceDefaults: vi.fn(),
    workspaceBackgroundColor: '#123456',
    workspaceDefaultColor: '#654321',
    ...overrides,
  };
}

describe('createWorkspaceColorApplyAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    patchEditorWorkspaceDefaultsMock.mockResolvedValue({ backgroundColor: '#123456' });
  });

  it('applies current-page workspace colors without storage writes', async () => {
    const args = createApplyActionArgs();
    const applyWorkspaceColor = createWorkspaceColorApplyAction(args);

    await applyWorkspaceColor('#abcdef');

    expect(args.setWorkspaceColorError).toHaveBeenCalledWith(null);
    expect(args.updateWorkspace).toHaveBeenCalledWith({ backgroundColor: '#abcdef' });
    expect(args.rememberRecentColor).toHaveBeenCalledWith('#abcdef');
    expect(patchEditorWorkspaceDefaultsMock).not.toHaveBeenCalled();
  });
});

describe('createWorkspaceDefaultSaveAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    patchEditorWorkspaceDefaultsMock.mockResolvedValue({ backgroundColor: '#123456' });
  });

  it('skips writes when the visible color already matches the persisted default', async () => {
    const args = createSaveActionArgs({
      workspaceBackgroundColor: '#AbCdEf',
      workspaceDefaultColor: '#abcdef',
    });

    await createWorkspaceDefaultSaveAction(args)();

    expect(patchEditorWorkspaceDefaultsMock).not.toHaveBeenCalled();
    expect(args.setWorkspaceColorError).not.toHaveBeenCalled();
    expect(args.setWorkspaceDefaultSavePending).not.toHaveBeenCalled();
  });

  it('persists the current color as the next-session default', async () => {
    const args = createSaveActionArgs();

    await createWorkspaceDefaultSaveAction(args)();

    expect(args.setWorkspaceColorError).toHaveBeenCalledWith(null);
    expect(args.setWorkspaceDefaultSavePending).toHaveBeenNthCalledWith(1, true);
    expect(patchEditorWorkspaceDefaultsMock).toHaveBeenCalledWith({ backgroundColor: '#123456' });
    expect(args.updateWorkspaceDefaults).toHaveBeenCalledWith({ backgroundColor: '#123456' });
    expect(args.setWorkspaceDefaultSavePending).toHaveBeenLastCalledWith(false);
  });

  it('surfaces save errors without rolling back the current color', async () => {
    const args = createSaveActionArgs();
    patchEditorWorkspaceDefaultsMock.mockRejectedValueOnce(new Error('write failed'));

    await createWorkspaceDefaultSaveAction(args)();

    expect(args.setWorkspaceColorError).toHaveBeenLastCalledWith(
      'editor.compact.workspaceDefaultSaveFailed'
    );
    expect(args.updateWorkspaceDefaults).not.toHaveBeenCalled();
    expect(args.setWorkspaceDefaultSavePending).toHaveBeenLastCalledWith(false);
  });
});
