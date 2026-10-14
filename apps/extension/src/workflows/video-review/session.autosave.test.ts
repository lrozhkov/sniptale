import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { VideoWorkspaceSnapshot } from '../../composition/persistence/review-workspaces/contracts';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import { createVideoReviewSession } from './session';
import { projectReviewWorkspace } from './session-durable-access';
import { readFileSync } from 'node:fs';
import { sha256EffectV1Bytes } from '@sniptale/runtime-contracts/effect-v1';
import { readReviewAnnotationEffectDocument } from '../../features/video/review/annotation-effects/validation';
import type {
  ReviewAnnotationEffect,
  ReviewAnnotationEffectSnapshot,
} from '../../features/video/review/annotation-effects/types';

function setup() {
  let stored: VideoWorkspaceSnapshot = {
    workspace: {
      aggregateId: 'recording:r',
      sourceAssetId: 'source',
      formatVersion: 1,
      source: { duration: 4, width: 640, height: 360, mimeType: 'video/webm', size: 5 },
      revision: 1,
      cursor: 0,
      history: [],
      advanced: createQuickEditAdvancedState(),
      createdAt: 1,
      updatedAt: 1,
    },
    draft: null,
  };
  const read = vi.fn(async () => structuredClone(stored));
  const deps = {
    readVideoWorkspace: read,
    moveVideoWorkspaceHistory: read,
    saveVideoWorkspaceDraft: read,
    saveVideoWorkspaceAdvanced: vi.fn(async (args) => {
      stored = {
        ...stored,
        workspace: {
          ...stored.workspace,
          revision: stored.workspace.revision + 1,
          advanced: args.advanced,
        },
      };
      return structuredClone(stored);
    }),
    commitVideoWorkspace: vi.fn(async (args) => {
      stored = {
        ...stored,
        workspace: {
          ...stored.workspace,
          history: [...stored.workspace.history, args.operation],
          cursor: stored.workspace.cursor + 1,
          revision: stored.workspace.revision + 1,
        },
      };
      return structuredClone(stored);
    }),
    saveVideoWorkspaceSnapshot: vi.fn(async (args) => {
      stored = {
        workspace: { ...args.workspace, revision: stored.workspace.revision + 1 },
        draft: args.draft,
      };
      return structuredClone(stored);
    }),
  } satisfies Parameters<typeof createVideoReviewSession>[1];
  const session = createVideoReviewSession(stored, deps);
  return { session, deps };
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

async function annotationFixture(suffix = '') {
  const fixture = setup();
  const source = readFileSync(
    'packages/runtime-contracts/src/effect-v1/fixtures/valid/neutral-runtime-conformance.sniptale-effect.json',
    'utf8'
  ).replace('"neutral-runtime-conformance"', `"neutral-runtime-conformance${suffix}"`);
  const effect = readReviewAnnotationEffectDocument(source)!;
  const asset = effect.assets[0]!;
  const sha256 = await sha256EffectV1Bytes(new TextEncoder().encode(source));
  const snapshot: ReviewAnnotationEffectSnapshot = {
    id: `effect:${sha256}`,
    sha256,
    source,
    schemaVersion: 'sniptale.effect.v1',
    kind: 'standalone',
    documentId: effect.id,
    retainedByteLength: new TextEncoder().encode(source).byteLength + asset.byteLength!,
    assets: [
      {
        id: asset.id,
        assetId: `project-asset:mark${suffix}`,
        kind: 'svg',
        mimeType: asset.mimeType,
        sha256: asset.sha256!,
        byteLength: asset.byteLength!,
      },
    ],
  };
  const instance: ReviewAnnotationEffect = {
    id: `annotation${suffix}`,
    snapshotId: snapshot.id,
    enabled: true,
    start: 1,
    end: 3,
    attachment: 'content',
    controls: {},
    order: 0,
    transform: { x: 0, y: 0, width: 1, height: 1, rotation: 0 },
  };
  const resource = {
    assetId: `project-asset:mark${suffix}`,
    physicalAssetId: `physical-mark${suffix}`,
    publish: vi.fn(async () => undefined),
    cancel: vi.fn(async () => undefined),
    release: vi.fn(async () => undefined),
  };
  return {
    ...fixture,
    resource,
    args: { expectedSourceAssetId: 'source', snapshot, instance, resources: [resource] },
  };
}

it('keeps autosave-off annotations local; header flush does not adopt and Save publishes once', async () => {
  const { session, deps, resource, args } = await annotationFixture();
  session.setAutosaveEnabled(false);
  await session.applyAnnotationEffect(args);
  expect(session.getSnapshot().snapshot.workspace).toMatchObject({
    revision: 1,
    cursor: 1,
    effectSnapshots: [args.snapshot],
  });
  expect(session.getSnapshot().snapshot.workspace.history).toHaveLength(1);
  expect(session.getSnapshot().dirty).toBe(true);
  expect(session.ownsAnnotationResource(resource)).toBe(true);
  await session.flush();
  expect(deps.saveVideoWorkspaceSnapshot).not.toHaveBeenCalled();
  expect(deps.commitVideoWorkspace).not.toHaveBeenCalled();
  expect(resource.publish).not.toHaveBeenCalled();
  await session.saveBuffered();
  expect(session.getSnapshot().dirty).toBe(false);
  expect(resource.publish).toHaveBeenCalledOnce();
  expect(resource.cancel).not.toHaveBeenCalled();
  expect(resource.release).toHaveBeenCalledOnce();
  expect(session.ownsAnnotationResource(resource)).toBe(false);
});

it.each(['reset', 'dispose'] as const)(
  'reads only admitted local resources until %s, without Save',
  async (action) => {
    const { session, deps, resource, args } = await annotationFixture();
    const blob = new Blob(['private'], { type: 'image/svg+xml' });
    const readable = { ...resource, read: vi.fn(async () => blob) };
    const signal = new AbortController().signal;
    session.setAutosaveEnabled(false);
    expect(await session.readAnnotationResource(resource.assetId, signal)).toBeNull();
    await session.applyAnnotationEffect({ ...args, resources: [readable] });
    expect(await session.readAnnotationResource(resource.assetId, signal)).toBe(blob);
    expect(deps.saveVideoWorkspaceSnapshot).not.toHaveBeenCalled();
    expect(resource.publish).not.toHaveBeenCalled();
    await session[action]();
    expect(await session.readAnnotationResource(resource.assetId, signal)).toBeNull();
    await session.dispose();
  }
);

it.each(['save', 'publication'] as const)(
  'retains failed %s annotation state for Save retry without duplicate history',
  async (failure) => {
    const { session, deps, resource, args } = await annotationFixture();
    if (failure === 'save')
      deps.saveVideoWorkspaceSnapshot.mockRejectedValueOnce(new Error('Save failed'));
    else resource.publish.mockRejectedValueOnce(new Error('Publication failed'));
    await expect(session.applyAnnotationEffect(args)).rejects.toThrow('failed');
    expect(session.getSnapshot()).toMatchObject({ dirty: true, pending: 0, error: 'storage' });
    expect(session.getSnapshot().snapshot.workspace.history).toHaveLength(1);
    expect(session.ownsAnnotationResource(resource)).toBe(true);
    expect(resource.release).not.toHaveBeenCalled();
    expect(resource.cancel).not.toHaveBeenCalled();
    await session.saveBuffered();
    expect(session.getSnapshot().dirty).toBe(false);
    expect(session.getSnapshot().snapshot.workspace.history).toHaveLength(1);
    expect(resource.release).toHaveBeenCalledOnce();
  }
);

it('Undo keeps redo leases; a new branch releases only unadopted resources', async () => {
  const { session, resource, args } = await annotationFixture();
  session.setAutosaveEnabled(false);
  await session.applyAnnotationEffect(args);
  await session.history('undo');
  expect(session.getSnapshot().document.advancedContent.annotationEffects).toBeUndefined();
  expect(session.getSnapshot().snapshot.workspace.effectSnapshots).toEqual([args.snapshot]);
  expect(resource.cancel).not.toHaveBeenCalled();
  const before = session.getSnapshot().document.advancedContent;
  await session.commit({
    id: 'branch',
    at: 2,
    target: 'advancedContent',
    before,
    after: { ...before, actionsEnabled: false },
  });
  expect(session.getSnapshot().snapshot.workspace.effectSnapshots).toEqual([]);
  expect(resource.cancel).toHaveBeenCalledOnce();
  expect(resource.release).toHaveBeenCalledOnce();
});

it('applying a distinct annotation after Undo releases the discarded annotation branch immediately', async () => {
  const first = await annotationFixture();
  const second = await annotationFixture('-second');
  first.session.setAutosaveEnabled(false);
  await first.session.applyAnnotationEffect(first.args);
  await first.session.history('undo');
  expect(first.resource.cancel).not.toHaveBeenCalled();
  await first.session.applyAnnotationEffect(second.args);
  expect(first.session.getSnapshot().snapshot.workspace).toMatchObject({
    revision: 1,
    cursor: 1,
    effectSnapshots: [second.args.snapshot],
  });
  expect(first.session.getSnapshot().snapshot.workspace.history).toHaveLength(1);
  expect(first.session.getSnapshot().document.advancedContent.annotationEffects?.instances).toEqual(
    [{ ...second.args.instance, order: 0 }]
  );
  expect(first.resource.cancel).toHaveBeenCalledOnce();
  expect(first.resource.release).toHaveBeenCalledOnce();
  expect(first.resource.publish).not.toHaveBeenCalled();
  expect(first.session.ownsAnnotationResource(first.resource)).toBe(false);
  expect(first.session.ownsAnnotationResource(second.resource)).toBe(true);
  expect(second.resource.cancel).not.toHaveBeenCalled();
  expect(second.resource.release).not.toHaveBeenCalled();
  expect(first.deps.saveVideoWorkspaceSnapshot).not.toHaveBeenCalled();
  await first.session.dispose();
  await second.session.dispose();
});

it.each(['reset', 'reload', 'dispose'] as const)(
  '%s cleans unadopted bytes without an implicit Save',
  async (action) => {
    const { session, deps, resource, args } = await annotationFixture();
    session.setAutosaveEnabled(false);
    await session.applyAnnotationEffect(args);
    await session[action]();
    expect(resource.publish).not.toHaveBeenCalled();
    expect(resource.cancel).toHaveBeenCalledOnce();
    expect(resource.release).toHaveBeenCalledOnce();
    expect(deps.saveVideoWorkspaceSnapshot).not.toHaveBeenCalled();
    if (action === 'dispose') {
      await session.dispose();
      await expect(session.applyAnnotationEffect(args)).rejects.toThrow('closed');
      expect(resource.release).toHaveBeenCalledOnce();
    }
  }
);

it('uncertain Save acknowledgement never cancels bytes retained by durable history during unmount', async () => {
  const { session, deps, resource, args } = await annotationFixture();
  const write = deps.saveVideoWorkspaceSnapshot.getMockImplementation()!;
  deps.saveVideoWorkspaceSnapshot.mockImplementationOnce(async (request) => {
    await write(request);
    throw new Error('Lost acknowledgement');
  });
  await expect(session.applyAnnotationEffect(args)).rejects.toThrow('acknowledgement');
  expect(session.getSnapshot().dirty).toBe(true);
  await session.dispose();
  expect(resource.publish).toHaveBeenCalledOnce();
  expect(resource.cancel).not.toHaveBeenCalled();
  expect(resource.release).toHaveBeenCalledOnce();
});

it('rejects stale sources before lease transfer and orders concurrent additions', async () => {
  const { session, resource, args } = await annotationFixture();
  session.setAutosaveEnabled(false);
  await expect(
    session.applyAnnotationEffect({ ...args, expectedSourceAssetId: 'other' })
  ).rejects.toThrow('source changed');
  expect(session.ownsAnnotationResource(resource)).toBe(false);
  expect(session.getSnapshot().snapshot.workspace.history).toEqual([]);
  await Promise.all([
    session.applyAnnotationEffect(args),
    session.applyAnnotationEffect({ ...args, instance: { ...args.instance, id: 'second' } }),
  ]);
  expect(
    session
      .getSnapshot()
      .document.advancedContent.annotationEffects?.instances.map((instance) => [
        instance.id,
        instance.order,
      ])
  ).toEqual([
    ['annotation', 0],
    ['second', 1],
  ]);
  expect(session.getSnapshot().snapshot.workspace.effectSnapshots).toEqual([args.snapshot]);
  await session.dispose();
});

it('includes staged producers in a session barrier and builds history from the admitted document', async () => {
  const { session, deps } = setup();
  const before = session.getSnapshot().document.advancedContent;
  const first = { ...before, actionsEnabled: false };
  const second = { ...first, zoom: { ...first.zoom, enabled: true } };
  let current = first;
  const acknowledge = vi.fn();
  const fail = vi.fn();
  session.stageAutosave(
    'content',
    () => ({ change: { kind: 'content', content: current }, acknowledge, fail }),
    { delay: 250 }
  );
  await session.flush();
  current = second;
  session.stageAutosave(
    'content',
    () => ({ change: { kind: 'content', content: current }, acknowledge, fail }),
    { delay: 250 }
  );
  await session.flush();
  expect(deps.commitVideoWorkspace.mock.calls[1]?.[0].operation).toMatchObject({
    before: first,
    after: second,
  });
  expect(acknowledge).toHaveBeenCalledTimes(2);
  expect(fail).not.toHaveBeenCalled();
});

it('reports an authored field dirty before its timer and preserves it after a failed reload', async () => {
  const { session, deps } = setup();
  const before = session.getSnapshot().document.advancedContent;
  session.stageAutosave(
    'content',
    () => ({
      change: { kind: 'content', content: { ...before, actionsEnabled: false } },
      acknowledge: vi.fn(),
      fail: vi.fn(),
    }),
    { delay: 1000 }
  );
  expect(session.getSnapshot().dirty).toBe(true);
  expect(session.getSnapshot()).toBe(session.getSnapshot());
  deps.readVideoWorkspace.mockRejectedValueOnce(new Error('read unavailable'));
  await expect(session.reload()).rejects.toThrow('read unavailable');
  expect(session.getSnapshot().dirty).toBe(true);
  await session.reload();
  expect(session.getSnapshot().dirty).toBe(false);
});

it.each(['new-stage', 'cancel-restage', 'ack-next-group'] as const)(
  'keeps the new authored producer dirty after an acquired old ACK (%s)',
  async (mode) => {
    const { session, deps } = setup();
    const initial = session.getSnapshot().document.advancedContent;
    const original = deps.commitVideoWorkspace.getMockImplementation()!;
    let release: () => void = () => undefined;
    deps.commitVideoWorkspace.mockImplementationOnce(async (args) => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return original(args);
    });
    let current = { ...initial, actionsEnabled: false };
    const capture = () => ({
      change: { kind: 'content' as const, content: current },
      acknowledge: () => {
        if (mode === 'ack-next-group' && !current.actionsEnabled) {
          current = { ...initial, actionsEnabled: true };
          session.stageAutosave('content', capture, { delay: 1000 });
        }
      },
      fail: vi.fn(),
    });
    session.stageAutosave('content', capture, { delay: 1000 });
    const first = session.flush();
    await vi.advanceTimersByTimeAsync(0);
    if (mode !== 'ack-next-group') {
      if (mode === 'cancel-restage') session.cancelAutosave('content');
      current = { ...initial, actionsEnabled: true };
      session.stageAutosave('content', capture, { delay: 1000 });
    }
    release();
    await first;
    expect(session.getSnapshot().dirty).toBe(true);
    expect(deps.commitVideoWorkspace).toHaveBeenCalledOnce();
    await session.flush();
    expect(session.getSnapshot().dirty).toBe(false);
    expect(deps.commitVideoWorkspace).toHaveBeenCalledTimes(2);
    expect(deps.saveVideoWorkspaceSnapshot).not.toHaveBeenCalled();
  }
);

it('does not make an uncaptured UI-only preference an authored unload warning', async () => {
  const { session } = setup();
  const advanced = session.getSnapshot().snapshot.workspace.advanced;
  session.stageAutosave(
    'advanced',
    () => ({
      change: {
        kind: 'advanced',
        advanced: {
          ...advanced,
          ui: { ...advanced.ui, overlaysVisible: false },
        },
      },
      acknowledge: vi.fn(),
      fail: vi.fn(),
    }),
    { delay: 1000 }
  );
  expect(session.getSnapshot().dirty).toBe(false);
  await session.flush();
  expect(session.getSnapshot().dirty).toBe(false);
});

it('applies paused autosave locally and only explicit Save acknowledges a durable snapshot', async () => {
  const { session, deps } = setup();
  session.setAutosaveEnabled(false);
  const before = session.getSnapshot().document.advancedContent;
  session.stageAutosave(
    'content',
    () => ({
      change: { kind: 'content', content: { ...before, actionsEnabled: false } },
      acknowledge: () => undefined,
      fail: () => undefined,
    }),
    { delay: 250 }
  );
  await session.flush();
  expect(session.getSnapshot()).toMatchObject({ dirty: true, autosaveEnabled: false });
  expect(session.getSnapshot().snapshot.workspace.history).toHaveLength(1);
  expect(deps.commitVideoWorkspace).not.toHaveBeenCalled();
  expect(deps.saveVideoWorkspaceSnapshot).not.toHaveBeenCalled();
  await session.saveBuffered();
  expect(deps.saveVideoWorkspaceSnapshot).toHaveBeenCalledTimes(1);
  expect(session.getSnapshot()).toMatchObject({ dirty: false, autosaveEnabled: false });
});

it('retains a failed staged buffer and stops other autosaves until source recovery', async () => {
  const { session, deps } = setup();
  deps.commitVideoWorkspace.mockRejectedValueOnce({ code: 'changed-source' });
  const content = { ...session.getSnapshot().document.advancedContent, actionsEnabled: false };
  const acknowledge = vi.fn();
  const fail = vi.fn();
  session.stageAutosave(
    'content',
    () => ({ change: { kind: 'content', content }, acknowledge, fail }),
    { delay: 250 }
  );
  await expect(session.flush()).rejects.toMatchObject({ code: 'changed-source' });
  expect(acknowledge).not.toHaveBeenCalled();
  session.stageAutosave(
    'advanced',
    () => ({
      change: { kind: 'advanced', advanced: session.getSnapshot().snapshot.workspace.advanced },
      acknowledge,
      fail,
    }),
    { delay: 250 }
  );
  await vi.advanceTimersByTimeAsync(1000);
  await expect(session.flushAutosave(['advanced'])).rejects.toMatchObject({
    code: 'changed-source',
  });
  expect(deps.saveVideoWorkspaceAdvanced).not.toHaveBeenCalled();
  await session.reload();
  expect(session.getSnapshot().error).toBeNull();
  await session.flush();
  expect(deps.commitVideoWorkspace).toHaveBeenCalledTimes(1);
});

it('aborting an annotation queued behind another operation prevents local admission and lease transfer', async () => {
  const { session, deps, resource, args } = await annotationFixture();
  let unblock!: () => void;
  const gate = new Promise<void>((resolve) => {
    unblock = resolve;
  });
  const read = deps.saveVideoWorkspaceAdvanced.getMockImplementation()!;
  deps.saveVideoWorkspaceAdvanced.mockImplementationOnce(async (request) => {
    await gate;
    return read(request);
  });
  const pending = session.saveAdvanced(session.getSnapshot().snapshot.workspace.advanced);
  const controller = new AbortController();
  const annotation = session.applyAnnotationEffect({ ...args, signal: controller.signal });
  const rejected = expect(annotation).rejects.toMatchObject({ name: 'AbortError' });
  controller.abort();
  unblock();
  await pending;
  await rejected;
  expect(session.getSnapshot().snapshot.workspace.history).toEqual([]);
  expect(session.ownsAnnotationResource(resource)).toBe(false);
  expect(resource.cancel).not.toHaveBeenCalled();
  expect(resource.publish).not.toHaveBeenCalled();
  await session.dispose();
});

it('publishes only the committed mutation projection and keeps injected adapter ownership', async () => {
  const { session, deps } = setup();
  let document: ReturnType<typeof projectReviewWorkspace> | undefined;
  const projected = vi.fn(async (args: Parameters<typeof deps.commitVideoWorkspace>[0]) => {
    const snapshot = await deps.commitVideoWorkspace(args);
    document = projectReviewWorkspace(snapshot);
    return { snapshot, document };
  });
  Object.assign(deps, { commitVideoWorkspaceWithProjection: projected });
  const content = { ...session.getSnapshot().document.advancedContent, actionsEnabled: false };
  session.stageAutosave(
    'content',
    () => ({
      change: { kind: 'content', content },
      acknowledge: vi.fn(),
      fail: vi.fn(),
    }),
    { delay: 250 }
  );
  await session.flush();
  expect(projected).toHaveBeenCalledOnce();
  expect(session.getSnapshot().document).toBe(document);
  expect(session.getSnapshot().document).toEqual(
    projectReviewWorkspace(await deps.readVideoWorkspace())
  );
  projected.mockRejectedValueOnce({ code: 'storage' });
  const operation = session.getSnapshot().snapshot.workspace.history[0]!;
  await expect(session.commit({ ...operation, id: 'rejected-projection' })).rejects.toMatchObject({
    code: 'storage',
  });
  expect(deps.commitVideoWorkspace).toHaveBeenCalledOnce();
  expect(session.getSnapshot().document).toBe(document);
});

it('retains a crop after save refusal and retries one durable content change', async () => {
  const { session, deps } = setup();
  session.setAutosaveEnabled(false);
  const canvas = { width: 360, height: 360, crop: { x: 0.2, y: 0, width: 0.5625, height: 1 } };
  const content = { ...session.getSnapshot().document.advancedContent, canvas };
  session.stageAutosave(
    'content',
    () => ({
      change: { kind: 'content', content },
      acknowledge: () => undefined,
      fail: () => undefined,
    }),
    { delay: 250 }
  );
  await session.flush();
  deps.saveVideoWorkspaceSnapshot.mockRejectedValueOnce(
    new DOMException('Full', 'QuotaExceededError')
  );
  await expect(session.saveBuffered()).rejects.toMatchObject({ name: 'QuotaExceededError' });
  expect(session.getSnapshot().document.advancedContent.canvas).toEqual(canvas);
  expect(session.getSnapshot().dirty).toBe(true);
  await session.saveBuffered();
  expect(session.getSnapshot().dirty).toBe(false);
  expect(session.getSnapshot().snapshot.workspace.history).toHaveLength(1);
  await session.reload();
  expect(session.getSnapshot().document.advancedContent.canvas).toEqual(canvas);
  await session.dispose();
});
