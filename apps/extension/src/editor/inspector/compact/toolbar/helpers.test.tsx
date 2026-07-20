// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';

const fireAndReportEditorActionMock = vi.hoisted(() =>
  vi.fn((_: string, run: () => Promise<void> | void) => run())
);

vi.mock('../../../runtime/async-actions', async (importOriginal) => ({
  ...(await importOriginal()),
  fireAndReportEditorAction: fireAndReportEditorActionMock,
}));

import {
  findActiveCollapsedCommand,
  handleCompactCommandClick,
  registerCompactCommandButtonRef,
} from './helpers';

describe('compact toolbar helpers', () => {
  it('finds only content-backed collapsed commands', () => {
    expect(
      findActiveCollapsedCommand(
        [
          { id: 'one', title: 'One', trigger: '1' },
          { content: <div />, id: 'two', title: 'Two', trigger: '2' },
        ],
        'two'
      )?.id
    ).toBe('two');
    expect(findActiveCollapsedCommand([{ id: 'one', title: 'One', trigger: '1' }], 'one')).toBe(
      undefined
    );
  });
});

describe('compact toolbar command interaction helpers', () => {
  it('guards disabled commands, toggles content commands, and runs executable commands', () => {
    const setCollapsedCommandId = vi.fn();
    const onClick = vi.fn();

    handleCompactCommandClick(
      { disabled: true, id: 'disabled', title: 'Disabled', trigger: 'D' },
      setCollapsedCommandId
    );
    handleCompactCommandClick(
      { content: <div />, id: 'content', title: 'Content', trigger: 'C' },
      setCollapsedCommandId
    );
    handleCompactCommandClick(
      { id: 'run', onClick, title: 'Run', trigger: 'R' },
      setCollapsedCommandId
    );

    expect(setCollapsedCommandId).toHaveBeenNthCalledWith(1, expect.any(Function) as never);
    expect(setCollapsedCommandId).toHaveBeenNthCalledWith(2, null);
    expect(fireAndReportEditorActionMock).toHaveBeenCalledWith(
      'compact-command:run',
      expect.any(Function)
    );
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('registers and clears command button refs by id', () => {
    const refs = { current: {} as Record<string, HTMLButtonElement | null> };
    const button = document.createElement('button');

    registerCompactCommandButtonRef(refs, 'command', button);
    expect(refs.current['command']).toBe(button);

    registerCompactCommandButtonRef(refs, 'command', null);
    expect(refs.current['command']).toBeUndefined();
  });
});
