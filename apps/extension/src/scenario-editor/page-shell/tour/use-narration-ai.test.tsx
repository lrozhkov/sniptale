// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { useScenarioNarrationAI, type ScenarioNarrationAccess } from './use-narration-ai';
import {
  createGuideProject,
  type ScenarioNarrationText,
} from '../../../features/scenario/project/public';
import type {
  ScenarioNarrationPreview,
  ScenarioNarrationBasis,
} from '../../../workflows/scenario-narration/generation';
const io = vi.hoisted(() => ({ prepare: vi.fn(), generate: vi.fn(), cleanup: vi.fn() }));
vi.mock('../../../workflows/scenario-narration/generation', () => ({
  prepareScenarioNarrationBatch: io.prepare,
  generateScenarioNarration: io.generate,
  cleanupScenarioNarrationPreview: io.cleanup,
}));
let root: Root;
let host: HTMLDivElement;
let operation: ReturnType<typeof useScenarioNarrationAI>;
const targets: ScenarioNarrationText[] = ['a', 'b', 'c'].map((objectId) => ({
  slideId: 's',
  objectId,
  text: `Text ${objectId}`,
  narration: null,
}));
const profile = { modelId: 'm', voiceId: 'alloy', responseFormat: 'wav' as const };
const access: ScenarioNarrationAccess = { prepareNarration: vi.fn(), applyNarration: vi.fn() };
function basis(target: ScenarioNarrationText): ScenarioNarrationBasis {
  return {
    scope: {
      workspaceId: 'p',
      workspaceRevision: 1,
      target: { kind: 'scenario-text', slideId: 's', objectId: target.objectId },
      sourceTextHash: 'a'.repeat(64),
    },
    text: target.text,
    expectedNarration: null,
  };
}
function preview(source: ScenarioNarrationBasis): ScenarioNarrationPreview {
  return {
    ...source,
    blob: new Blob(['audio'], { type: 'audio/wav' }),
    url: `blob:${source.scope.target.objectId}`,
    staged: { id: '12345678-1234-4234-8234-123456789abc', mimeType: 'audio/wav', size: 5 },
    duration: 1,
  };
}
function Probe({ selected = targets }: { selected?: ScenarioNarrationText[] }) {
  operation = useScenarioNarrationAI(access, selected);
  return null;
}
beforeEach(async () => {
  vi.resetAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  vi.mocked(access.prepareNarration).mockResolvedValue({
    project: createGuideProject('Guide', 'p'),
    workspaceRevision: 1,
  });
  vi.mocked(access.applyNarration).mockResolvedValue(true);
  io.prepare.mockImplementation(async (_snapshot, selected: ScenarioNarrationText[]) =>
    selected.map(basis)
  );
  io.generate.mockImplementation(async (source: ScenarioNarrationBasis) => preview(source));
  io.cleanup.mockResolvedValue(undefined);
  await act(async () => root.render(<Probe />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
it('keeps ready batch previews and retries only missing targets after a provider failure', async () => {
  io.generate
    .mockImplementationOnce(async (source: ScenarioNarrationBasis) => preview(source))
    .mockRejectedValueOnce(new Error('provider-failed'));
  await act(async () => operation.generate(profile, 'provider'));
  expect(operation.ready.map((entry) => entry.preview.scope.target.objectId)).toEqual(['a', 'c']);
  expect(operation.errors).toHaveProperty('["s","b"]');
  await act(async () => operation.generate(profile, 'provider'));
  expect(io.generate).toHaveBeenCalledTimes(4);
  expect(io.generate.mock.calls[3]![0].scope.target.objectId).toBe('b');
  expect(operation.ready).toHaveLength(3);
  expect(access.applyNarration).not.toHaveBeenCalled();
});
it('retains completed previews and waits for cancellation settlement before enabling Apply', async () => {
  let finish!: (value: ScenarioNarrationPreview) => void;
  io.generate
    .mockImplementationOnce(async (source: ScenarioNarrationBasis) => preview(source))
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
  let pending!: Promise<void>;
  await act(async () => {
    pending = operation.generate(profile, 'provider');
  });
  expect(operation.ready).toHaveLength(1);
  expect(operation.running).toBe(true);
  expect(operation.resetUnacceptedPreviews()).toBe(false);
  await act(async () => {
    operation.cancel();
    await operation.apply(operation.ready.map((entry) => entry.preview));
  });
  expect(operation.running).toBe(true);
  expect(access.applyNarration).not.toHaveBeenCalled();
  await act(async () => {
    finish(preview(basis(targets[1]!)));
    await pending;
  });
  expect(operation.running).toBe(false);
  expect(operation.ready).toHaveLength(1);
  expect(io.cleanup).toHaveBeenCalledWith(expect.objectContaining({ url: 'blob:b' }));
  expect(io.generate).toHaveBeenCalledTimes(2);
});
it('retains accepted imports and failed previews and stops further Apply after refusal', async () => {
  await act(async () => operation.generate(profile, 'provider'));
  vi.mocked(access.applyNarration).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
  await act(async () => operation.apply(operation.ready.map((entry) => entry.preview)));
  expect(operation.ready.map((entry) => entry.accepted)).toEqual([true, false, false]);
  expect(access.applyNarration).toHaveBeenCalledTimes(2);
  expect(io.cleanup).toHaveBeenCalledTimes(1);
  expect(io.cleanup).toHaveBeenCalledWith(operation.ready[0]!.preview);
  await act(async () =>
    operation.apply(
      operation.ready.filter((entry) => !entry.accepted).map((entry) => entry.preview)
    )
  );
  expect(operation.ready.every((entry) => entry.accepted)).toBe(true);
  expect(io.generate).toHaveBeenCalledTimes(3);
});
it('rejects changed selection during the explicit Save before starting generation', async () => {
  let finish!: (value: Awaited<ReturnType<ScenarioNarrationAccess['prepareNarration']>>) => void;
  vi.mocked(access.prepareNarration).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  let pending!: Promise<void>;
  await act(async () => {
    pending = operation.generate(profile, 'provider');
  });
  await act(async () => root.render(<Probe selected={[targets[1]!]} />));
  await act(async () => {
    finish({ project: createGuideProject('Guide', 'p'), workspaceRevision: 1 });
    await pending;
  });
  expect(io.generate).not.toHaveBeenCalled();
  expect(operation.failed).toBe(true);
});
it('disposes a completed result after form disposal and never publishes it', async () => {
  let finish!: (value: ScenarioNarrationPreview) => void;
  io.generate.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  let pending!: Promise<void>;
  await act(async () => {
    pending = operation.generate(profile, 'provider');
  });
  await act(async () => root.unmount());
  const result = preview(basis(targets[0]!));
  finish(result);
  await pending;
  expect(io.cleanup).toHaveBeenCalledWith(result);
  expect(access.applyNarration).not.toHaveBeenCalled();
  root = createRoot(host);
});

it('resets only unaccepted previews after a profile edit and preserves accepted narration', async () => {
  await act(async () => operation.generate(profile, 'provider'));
  const accepted = operation.ready[0]!.preview;
  await act(async () => operation.apply([accepted]));
  await act(async () => expect(operation.resetUnacceptedPreviews()).toBe(true));
  expect(operation.ready).toEqual([{ preview: accepted, accepted: true }]);
  expect(io.cleanup).toHaveBeenCalledTimes(3);
  expect(io.generate).toHaveBeenCalledTimes(3);
  expect(access.applyNarration).toHaveBeenCalledTimes(1);
  await act(async () => operation.generate({ ...profile, voiceId: 'new-voice' }, 'provider'));
  expect(io.generate.mock.calls.slice(3).map(([source]) => source.scope.target.objectId)).toEqual([
    'b',
    'c',
  ]);
  expect(operation.ready[0]!.accepted).toBe(true);
});
