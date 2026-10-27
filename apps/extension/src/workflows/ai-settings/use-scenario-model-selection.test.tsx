// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const io = vi.hoisted(() => ({ read: vi.fn(), remember: vi.fn(), maintain: vi.fn() }));
vi.mock('./query', () => ({
  requestAIScenarioModelSelection: io.read,
  rememberAIScenarioModelSelection: io.remember,
  refreshManagedAICatalogs: io.maintain,
}));
import { useAIScenarioModelSelection } from './use-scenario-model-selection';
import type { requestAIScenarioModelSelection } from './query';
type Context = Awaited<ReturnType<typeof requestAIScenarioModelSelection>>;
function context(): Context {
  return {
    scenario: 'scenario-edit',
    globalSystemPrompt: '',
    providers: [
      {
        id: 'provider',
        name: 'Native provider',
        connectionType: 'anthropic',
        destinationKind: 'external',
        incarnation: 'first-incarnation',
        destinationBinding: `sha256:${'a'.repeat(64)}`,
        hasStoredApiKey: true,
        createdAt: 1,
      },
    ],
    models: ['first', 'second'].map((id) => ({
      id,
      modelCode: id,
      providerId: 'provider',
      displayName: id,
    })),
    remembered: null,
    resolution: { status: 'initial', modelId: 'first', previousSelection: null, reason: null },
  };
}
let host: HTMLDivElement;
let root: Root;
let selection: ReturnType<typeof useAIScenarioModelSelection>;
function Surface({ enabled = true }: { enabled?: boolean }) {
  selection = useAIScenarioModelSelection('scenario-edit', enabled);
  return <p>{selection.modelId ?? 'none'}</p>;
}
async function open() {
  await act(async () => root.render(<Surface />));
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.resetAllMocks();
  io.read.mockResolvedValue(context());
  io.remember.mockResolvedValue(undefined);
  io.maintain.mockResolvedValue(undefined);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
it('presents a native provider candidate without writing on open or reload', async () => {
  await open();
  expect(selection.modelId).toBe('first');
  expect(selection.configuration?.providers[0]?.connectionType).toBe('anthropic');
  await act(async () => selection.retryConfiguration());
  expect(io.remember).not.toHaveBeenCalled();
});
it('persists a first-use candidate only when the user requests its use', async () => {
  await open();
  await act(async () => {
    expect((await selection.prepareModelSelection()).modelId).toBe('first');
  });
  expect(io.remember).toHaveBeenCalledWith(
    expect.objectContaining({ scenario: 'scenario-edit' }),
    'scenario-edit',
    'first',
    'initial'
  );
});
it('persists an explicit choice and preserves it during a mounted reload', async () => {
  await open();
  await act(async () => selection.chooseModel('second'));
  expect(selection.modelId).toBe('second');
  expect(io.remember).toHaveBeenLastCalledWith(
    expect.anything(),
    'scenario-edit',
    'second',
    'explicit'
  );
  await act(async () => selection.retryConfiguration());
  expect(selection.modelId).toBe('second');
  expect(io.remember).toHaveBeenCalledTimes(1);
});
it('requires explicit replacement after the mounted model disappears', async () => {
  await open();
  const next = context();
  next.models = next.models.filter((model) => model.id === 'second');
  next.resolution.modelId = 'second';
  io.read.mockResolvedValue(next);
  await act(async () => {
    await expect(selection.prepareModelSelection()).rejects.toThrow('unavailable');
  });
  expect(selection.modelId).toBeNull();
  expect(selection.selectionUnavailable).toBe(true);
  expect(io.remember).not.toHaveBeenCalled();
  await act(async () => selection.retryConfiguration());
  expect(selection.modelId).toBeNull();
  await act(async () => selection.chooseModel('second'));
  expect(selection.modelId).toBe('second');
  expect(selection.selectionUnavailable).toBe(false);
});
it('refuses recreation of the same provider and model identities', async () => {
  await open();
  const next = context();
  next.providers[0]!.incarnation = 'recreated';
  io.read.mockResolvedValue(next);
  await act(async () => {
    await expect(selection.prepareModelSelection()).rejects.toThrow('unavailable');
  });
  expect(io.remember).not.toHaveBeenCalled();
});
it('does not write when the user cancels while the current catalog is loading', async () => {
  await open();
  let resolve!: (value: Context) => void;
  io.read.mockReturnValue(
    new Promise<Context>((done) => {
      resolve = done;
    })
  );
  const controller = new AbortController();
  let pending!: ReturnType<typeof selection.prepareModelSelection>;
  await act(async () => {
    pending = selection.prepareModelSelection(controller.signal);
  });
  controller.abort();
  await act(async () => {
    resolve(context());
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });
  expect(io.remember).not.toHaveBeenCalled();
});
it('keeps the previous visible choice when preference storage refuses a new choice', async () => {
  await open();
  io.remember.mockRejectedValue(new Error('Storage refused'));
  await act(async () => selection.chooseModel('second'));
  expect(selection.modelId).toBe('first');
  expect(selection.selectionFailed).toBe(true);
});

it('requires reselection when the provider destination changes without an identity change', async () => {
  await open();
  const next = context();
  next.providers[0]!.destinationBinding = `sha256:${'b'.repeat(64)}`;
  io.read.mockResolvedValue(next);
  await act(async () => {
    await expect(selection.prepareModelSelection()).rejects.toThrow('model-unavailable');
  });
  expect(selection.modelId).toBeNull();
  expect(selection.selectionUnavailable).toBe(true);
  expect(io.remember).not.toHaveBeenCalled();
  await act(async () => selection.chooseModel('first'));
  expect(selection.modelId).toBe('first');
  expect(io.remember).toHaveBeenCalledWith(next, 'scenario-edit', 'first', 'explicit');
});
it('blocks duplicate choices and request preparation until the explicit choice is saved', async () => {
  await open();
  let release!: () => void;
  io.remember.mockReturnValueOnce(
    new Promise<void>((resolve) => {
      release = resolve;
    })
  );
  act(() => selection.chooseModel('second'));
  expect(selection.selectionPending).toBe(true);
  act(() => selection.chooseModel('first'));
  await expect(selection.prepareModelSelection()).rejects.toThrow('model-unavailable');
  expect(io.remember).toHaveBeenCalledTimes(1);
  expect(io.read).toHaveBeenCalledTimes(2);
  await act(async () => release());
  expect(selection.selectionPending).toBe(false);
  expect(selection.modelId).toBe('second');
});
it('preserves the visible choice and permits retry after preparation discovery fails', async () => {
  await open();
  io.read.mockRejectedValueOnce(new Error('Discovery refused'));
  await act(async () => {
    await expect(selection.prepareModelSelection()).rejects.toThrow('catalog-unavailable');
  });
  expect(selection.modelId).toBe('first');
  expect(selection.configurationFailed).toBe(true);
  expect(selection.selectionPending).toBe(false);
  expect(io.remember).not.toHaveBeenCalled();
  await act(async () => {
    const prepared = await selection.prepareModelSelection();
    expect(prepared.catalog).toEqual(context());
    expect(prepared.modelId).toBe('first');
  });
  expect(selection.configurationFailed).toBe(false);
});
it('refuses preparation after a preference failure and keeps the previous visible choice', async () => {
  await open();
  io.remember.mockRejectedValueOnce(new Error('Storage refused'));
  await act(async () => {
    await expect(selection.prepareModelSelection()).rejects.toThrow('selection-write-failed');
  });
  expect(selection.modelId).toBe('first');
  expect(selection.selectionFailed).toBe(true);
  expect(selection.selectionPending).toBe(false);
});

it('does not read or write while disabled and loads a fresh choice on activation', async () => {
  await act(async () => root.render(<Surface enabled={false} />));
  expect(io.read).not.toHaveBeenCalled();
  expect(io.remember).not.toHaveBeenCalled();
  expect(selection.configuration).toBeNull();
  await act(async () => root.render(<Surface />));
  expect(io.read).toHaveBeenCalledTimes(2);
  expect(io.read).toHaveBeenLastCalledWith('scenario-edit');
  expect(selection.modelId).toBe('first');
  await act(async () => root.render(<Surface enabled={false} />));
  expect(selection.configuration).toBeNull();
  expect(selection.modelId).toBeNull();
  expect(io.remember).not.toHaveBeenCalled();
});

it.each(['choice', 'preparation'] as const)(
  'clears pending when %s settles while the interface is disabled',
  async (kind) => {
    await open();
    let resolve!: () => void;
    io.remember.mockReturnValueOnce(
      new Promise<void>((done) => {
        resolve = done;
      })
    );
    let prepared: ReturnType<typeof selection.prepareModelSelection> | undefined;
    await act(async () => {
      if (kind === 'choice') selection.chooseModel('second');
      else prepared = selection.prepareModelSelection();
    });
    expect(selection.selectionPending).toBe(true);
    await act(async () => root.render(<Surface enabled={false} />));
    await act(async () => {
      resolve();
      await prepared;
    });
    await act(async () => root.render(<Surface />));
    expect(selection.selectionPending).toBe(false);
    await act(async () => selection.chooseModel('first'));
    expect(selection.modelId).toBe('first');
  }
);

function holdMaintenance() {
  let release!: () => void;
  io.maintain.mockReturnValueOnce(
    new Promise<void>((resolve) => {
      release = resolve;
    })
  );
  return () => release();
}
it('shows the cached candidate while maintenance is pending and applies discovery without approval', async () => {
  const release = holdMaintenance();
  await open();
  expect(selection.modelId).toBe('first');
  expect(io.maintain).toHaveBeenCalledTimes(1);
  expect(io.remember).not.toHaveBeenCalled();
  const next = context();
  next.models.push({
    id: 'third',
    modelCode: 'third',
    providerId: 'provider',
    displayName: 'third',
  });
  io.read.mockResolvedValue(next);
  await act(async () => release());
  expect(selection.configuration?.models.map((model) => model.id)).toEqual([
    'first',
    'second',
    'third',
  ]);
  expect(selection.modelId).toBe('first');
  expect(io.remember).not.toHaveBeenCalled();
});
it('retains an explicit choice made while maintenance is pending', async () => {
  const release = holdMaintenance();
  await open();
  await act(async () => selection.chooseModel('second'));
  await act(async () => release());
  expect(selection.modelId).toBe('second');
  expect(io.remember).toHaveBeenCalledTimes(1);
});
it('requires explicit replacement when maintenance removes the visible candidate', async () => {
  const release = holdMaintenance();
  await open();
  const next = context();
  next.models = next.models.filter((model) => model.id === 'second');
  next.resolution.modelId = 'second';
  io.read.mockResolvedValue(next);
  await act(async () => release());
  expect(selection.modelId).toBeNull();
  expect(selection.selectionUnavailable).toBe(true);
  expect(io.remember).not.toHaveBeenCalled();
});
it.each(['maintenance', 'read'])(
  'retains the saved catalog after advisory %s failure and permits refresh',
  async (failure) => {
    if (failure === 'maintenance') io.maintain.mockRejectedValueOnce(new Error('Unavailable'));
    else io.read.mockResolvedValueOnce(context()).mockRejectedValueOnce(new Error('Unavailable'));
    await open();
    expect(selection.modelId).toBe('first');
    expect(selection.configurationFailed).toBe(false);
    await act(async () => selection.retryConfiguration());
    expect(selection.modelId).toBe('first');
    expect(io.maintain).toHaveBeenCalledTimes(2);
    expect(io.remember).not.toHaveBeenCalled();
  }
);
it.each(['refresh', 'reopen'])('discards late maintenance after a newer %s', async (action) => {
  const release = holdMaintenance();
  await open();
  if (action === 'reopen') {
    await act(async () => root.render(<Surface enabled={false} />));
    await open();
  } else await act(async () => selection.retryConfiguration());
  const calls = io.read.mock.calls.length;
  io.read.mockResolvedValue({ ...context(), models: [] });
  await act(async () => release());
  expect(io.read).toHaveBeenCalledTimes(calls);
  expect(selection.modelId).toBe('first');
});
it('does not wait for remote maintenance before preparing the visible model', async () => {
  const release = holdMaintenance();
  await open();
  await act(async () =>
    expect(selection.prepareModelSelection()).resolves.toMatchObject({ modelId: 'first' })
  );
  expect(io.remember).toHaveBeenCalledTimes(1);
  await act(async () => release());
});
