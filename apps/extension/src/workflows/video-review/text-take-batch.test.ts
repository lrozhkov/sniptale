import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { applyReviewTextTakeBatch } from './text-take-batch';
import { createTextTakeBatchFixture } from './text-take-batch.test-support';
import { importedAudioClip } from './audio-import';
import { projectReviewWorkspace } from './session-durable-access';
import { parseReviewOperation } from '../../features/video/review/validation';

const io = vi.hoisted(() => ({ prepare: vi.fn() }));
vi.mock('./audio-import', async (original) => ({
  ...(await original<typeof import('./audio-import')>()),
  prepareReviewAudio: io.prepare,
}));
type Fixture = ReturnType<typeof createTextTakeBatchFixture>;
function asset(id: string) {
  return {
    assetId: `project-asset:${id}`,
    duration: 1,
    protect: vi.fn(async () => undefined),
    publish: vi.fn(async () => undefined),
    cancel: vi.fn(async () => undefined),
    discard: vi.fn(async () => undefined),
  };
}
let prepared: ReturnType<typeof asset>[];
beforeEach(() => {
  io.prepare.mockReset();
  prepared = [];
  io.prepare.mockImplementation(async () => {
    const next = asset(`asset-${prepared.length}`);
    prepared.push(next);
    return next;
  });
});
afterEach(() => vi.restoreAllMocks());
function apply(fixture: Fixture, signal = new AbortController().signal) {
  return applyReviewTextTakeBatch({
    session: fixture.session,
    entries: fixture.previews.map((preview) => ({ preview, filename: `${preview.clipId}.mp3` })),
    signal,
    options: { muteSource: true, sourceAudioAvailable: () => true },
  });
}
function clips(fixture: Fixture) {
  return fixture.session.getSnapshot().document.advancedContent.audio.voiceover;
}
async function editText(fixture: Fixture) {
  const before = fixture.session.getSnapshot().document.advancedContent;
  await fixture.session.commit({
    id: 'own-text',
    at: 2,
    target: 'advancedContent',
    before,
    after: {
      ...before,
      text: {
        version: 1,
        fragments: before.text!.fragments.map((fragment) => ({
          ...fragment,
          text: 'Changed locally',
          revision: fragment.revision + 1,
        })),
      },
    },
  });
}

it.each(['prepare', 'protect', 'stale'] as const)(
  'accepts no take after the second %s refusal, retaining unrelated edits',
  async (phase) => {
    const fixture = createTextTakeBatchFixture();
    const first = asset('first'),
      second = asset('second');
    io.prepare.mockResolvedValueOnce(first);
    if (phase === 'prepare') io.prepare.mockRejectedValueOnce(new Error('second prepare'));
    else {
      io.prepare.mockResolvedValueOnce(second);
      second.protect.mockImplementationOnce(async () => {
        if (phase === 'stale') await editText(fixture);
        else throw new Error('second protect');
      });
    }
    await expect(apply(fixture)).rejects.toThrow();
    expect(fixture.commit).not.toHaveBeenCalled();
    expect(clips(fixture)).toHaveLength(0);
    expect(first.cancel).toHaveBeenCalledOnce();
    if (phase !== 'prepare') expect(second.cancel).toHaveBeenCalledOnce();
    if (phase === 'stale')
      expect(fixture.session.getSnapshot().document.advancedContent.text?.fragments[0]?.text).toBe(
        'Changed locally'
      );
    else {
      await apply(fixture);
      expect(fixture.commit).toHaveBeenCalledOnce();
      expect(clips(fixture)).toHaveLength(2);
    }
  }
);

it.each(['expired', 'duplicate', 'missing-source'] as const)(
  'refuses %s before preparing bytes',
  async (kind) => {
    const fixture = createTextTakeBatchFixture();
    if (kind === 'expired') fixture.previews[1]!.expiresAt = Date.now() - 1;
    if (kind === 'duplicate') fixture.previews[1]!.clipId = fixture.previews[0]!.clipId;
    await expect(
      kind === 'missing-source'
        ? applyReviewTextTakeBatch({
            session: fixture.session,
            entries: fixture.previews.map((preview) => ({ preview, filename: 'take.mp3' })),
            signal: new AbortController().signal,
            options: { muteSource: true, sourceAudioAvailable: () => false },
          })
        : apply(fixture)
    ).rejects.toThrow();
    expect(io.prepare).not.toHaveBeenCalled();
    expect(fixture.commit).not.toHaveBeenCalled();
  }
);

it.each([510, 511])('admits the clip capacity boundary from %s existing takes', async (count) => {
  const fixture = createTextTakeBatchFixture();
  const before = fixture.session.getSnapshot().document.advancedContent;
  await fixture.session.commitDurable({
    id: 'seed',
    at: 1,
    target: 'advancedContent',
    before,
    after: {
      ...before,
      audio: {
        ...before.audio,
        voiceover: Array.from({ length: count }, (_, index) => ({
          ...importedAudioClip(`project-asset:old-${index}`, 1, 0, 40),
          id: `old-${index}`,
        })),
      },
    },
  });
  fixture.commit.mockClear();
  if (count === 510) {
    await apply(fixture);
    expect(clips(fixture)).toHaveLength(512);
    expect(fixture.commit).toHaveBeenCalledOnce();
  } else {
    await expect(apply(fixture)).rejects.toThrow('invalid-request');
    expect(io.prepare).not.toHaveBeenCalled();
    expect(fixture.commit).not.toHaveBeenCalled();
  }
});

it('checks the source-mute limit independently of voiceover capacity', async () => {
  const fixture = createTextTakeBatchFixture();
  const before = fixture.session.getSnapshot().document.advancedContent;
  await fixture.session.commitDurable({
    id: 'seed',
    at: 1,
    target: 'advancedContent',
    before,
    after: {
      ...before,
      audio: {
        ...before.audio,
        original: {
          ...before.audio.original,
          mutes: Array.from({ length: 511 }, (_, index) => ({
            id: `range-${index}`,
            kind: 'range' as const,
            start: 0,
            end: 1,
            volume: 0,
          })),
        },
      },
    },
  });
  fixture.commit.mockClear();
  await expect(apply(fixture)).rejects.toThrow('invalid-request');
  expect(io.prepare).not.toHaveBeenCalled();
  expect(fixture.commit).not.toHaveBeenCalled();
});

it('checks actual decoded duration after every preparation', async () => {
  const fixture = createTextTakeBatchFixture();
  const first = asset('first'),
    second = { ...asset('second'), duration: 1.1 };
  io.prepare.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
  await expect(apply(fixture)).rejects.toThrow('duration');
  expect(fixture.commit).not.toHaveBeenCalled();
  expect(first.cancel).toHaveBeenCalledOnce();
  expect(second.cancel).toHaveBeenCalledOnce();
});

it.each([false, true])(
  'keeps one logical receipt across a lost acknowledgement, accepted=%s',
  async (accepted) => {
    const fixture = createTextTakeBatchFixture();
    const commit = fixture.commit.getMockImplementation()!;
    fixture.commit.mockImplementationOnce(async (request) => {
      if (accepted) await commit(request);
      throw new Error('lost acknowledgement');
    });
    if (accepted) await apply(fixture);
    else {
      await expect(apply(fixture)).rejects.toThrow('lost acknowledgement');
      await apply(fixture);
    }
    expect(clips(fixture)).toHaveLength(2);
    expect(
      new Set(
        fixture.commit.mock.calls.map(([request]) => {
          const operation = parseReviewOperation(request.operation, 40);
          if (!operation) throw new Error('Invalid fixture receipt');
          return operation.id;
        })
      ).size
    ).toBe(1);
    expect(fixture.stored().workspace.history).toHaveLength(1);
  }
);

async function unknownAcknowledgement() {
  const fixture = createTextTakeBatchFixture();
  const commit = fixture.commit.getMockImplementation()!;
  fixture.commit.mockImplementationOnce(async (request) => {
    await commit(request);
    throw new Error('lost acknowledgement');
  });
  fixture.read.mockRejectedValueOnce(new Error('canonical unavailable'));
  await expect(apply(fixture)).rejects.toThrow('lost acknowledgement');
  for (const handle of prepared) {
    expect(handle.cancel).not.toHaveBeenCalled();
    expect(handle.publish).not.toHaveBeenCalled();
  }
  return fixture;
}

it('resumes an unknown accepted operation without preparing bytes or appending another action', async () => {
  const fixture = await unknownAcknowledgement();
  await apply(fixture);
  await apply(fixture);
  expect(fixture.commit).toHaveBeenCalledOnce();
  expect(io.prepare).toHaveBeenCalledTimes(2);
  expect(clips(fixture)).toHaveLength(2);
  for (const handle of prepared) expect(handle.publish).toHaveBeenCalledOnce();
});

it.each(['source', 'payload', 'pruned', 'unavailable'] as const)(
  'retains ambiguous bytes when canonical %s cannot acknowledge the exact operation',
  async (kind) => {
    const fixture = await unknownAcknowledgement();
    const saved = fixture.stored();
    if (kind === 'source') saved.workspace.sourceAssetId = 'different-source';
    if (kind === 'payload') {
      const operation = saved.workspace.history[0]!;
      if (operation.target !== 'advancedContent') throw new Error('fixture operation');
      operation.after.audio.original.volume = 0.5;
    }
    if (kind === 'pruned') {
      const document = projectReviewWorkspace(saved);
      saved.workspace = {
        ...saved.workspace,
        formatVersion: 2,
        baseline: document,
        advanced: { ...document.advancedContent, ui: saved.workspace.advanced.ui },
        history: [],
        cursor: 0,
        revision: saved.workspace.revision + 50,
      };
    }
    if (kind === 'unavailable') fixture.read.mockRejectedValue(new Error('canonical unavailable'));
    fixture.replaceStored(saved);
    await expect(apply(fixture)).rejects.toThrow();
    expect(fixture.commit).toHaveBeenCalledOnce();
    expect(io.prepare).toHaveBeenCalledTimes(2);
    for (const handle of prepared) {
      expect(handle.cancel).not.toHaveBeenCalled();
      expect(handle.publish).not.toHaveBeenCalled();
    }
  }
);

it('adopts accepted audio while preserving unrelated buffered text', async () => {
  const fixture = await unknownAcknowledgement();
  await editText(fixture);
  await apply(fixture);
  expect(clips(fixture)).toHaveLength(2);
  expect(fixture.commit).toHaveBeenCalledOnce();
  expect(fixture.session.getSnapshot().dirty).toBe(true);
  expect(fixture.session.getSnapshot().document.advancedContent.text?.fragments[0]?.text).toBe(
    'Changed locally'
  );
  await fixture.session.saveBuffered();
  await fixture.session.history('undo');
  expect(clips(fixture)).toHaveLength(2);
  expect(fixture.session.getSnapshot().document.advancedContent.text?.fragments[0]?.text).toBe(
    'Narration 0'
  );
});

it('refuses whole-audio adoption over concurrent buffered audio', async () => {
  const fixture = await unknownAcknowledgement();
  await fixture.session.commit({
    id: 'own-audio',
    at: 2,
    target: 'sourceAudio',
    before: { muted: false, volume: 1 },
    after: { muted: false, volume: 0.5 },
  });
  await expect(apply(fixture)).rejects.toThrow('conflicts');
  expect(fixture.session.getSnapshot().document.advancedContent.audio.original.volume).toBe(0.5);
  expect(fixture.session.getSnapshot().dirty).toBe(true);
  expect(clips(fixture)).toHaveLength(0);
  for (const handle of prepared) expect(handle.cancel).not.toHaveBeenCalled();
});

it('retries only failed publication after Undo, preserving the redo receipt', async () => {
  const fixture = createTextTakeBatchFixture();
  const first = asset('first'),
    second = asset('second');
  second.publish.mockRejectedValueOnce(new Error('second publication'));
  io.prepare.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
  await expect(apply(fixture)).rejects.toThrow('second publication');
  await fixture.session.history('undo');
  expect(clips(fixture)).toHaveLength(0);
  await apply(fixture);
  expect(clips(fixture)).toHaveLength(0);
  expect(fixture.commit).toHaveBeenCalledOnce();
  expect(first.publish).toHaveBeenCalledOnce();
  expect(second.publish).toHaveBeenCalledTimes(2);
  expect(first.cancel).not.toHaveBeenCalled();
  expect(second.cancel).not.toHaveBeenCalled();
  await fixture.session.history('redo');
  expect(clips(fixture)).toHaveLength(2);
});

it('publishes accepted bytes when Cancel arrives during acknowledgement', async () => {
  const fixture = createTextTakeBatchFixture();
  const controller = new AbortController();
  const commit = fixture.commit.getMockImplementation()!;
  fixture.commit.mockImplementationOnce(async (request) => {
    const saved = await commit(request);
    controller.abort();
    return saved;
  });
  await apply(fixture, controller.signal);
  expect(clips(fixture)).toHaveLength(2);
  for (const handle of prepared) {
    expect(handle.publish).toHaveBeenCalledOnce();
    expect(handle.cancel).not.toHaveBeenCalled();
  }
});

it('serializes duplicate concurrent Apply commands onto one attempt', async () => {
  const fixture = createTextTakeBatchFixture();
  await Promise.all([apply(fixture), apply(fixture)]);
  expect(fixture.commit).toHaveBeenCalledOnce();
  expect(io.prepare).toHaveBeenCalledTimes(2);
  expect(clips(fixture)).toHaveLength(2);
});

it('retains compensation progress after a later cancellation refusal', async () => {
  const fixture = createTextTakeBatchFixture();
  const first = asset('first'),
    second = asset('second');
  second.protect.mockRejectedValueOnce(new Error('protect refusal'));
  second.cancel.mockRejectedValueOnce(new Error('cancel unavailable'));
  first.protect.mockImplementation(async () => {
    if (first.cancel.mock.calls.length) throw new Error('Canceled handles cannot be reused');
  });
  io.prepare.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
  await expect(apply(fixture)).rejects.toThrow();
  await apply(fixture);
  expect(first.cancel).toHaveBeenCalledOnce();
  expect(second.cancel).toHaveBeenCalledTimes(2);
  expect(first.protect).toHaveBeenCalledOnce();
  expect(first.publish).not.toHaveBeenCalled();
  expect(fixture.commit).toHaveBeenCalledOnce();
  expect(clips(fixture)).toHaveLength(2);
});

it('cancels prepared bytes when Cancel precedes metadata admission', async () => {
  const fixture = createTextTakeBatchFixture();
  const controller = new AbortController();
  const first = asset('first'),
    second = asset('second');
  second.protect.mockImplementationOnce(async () => {
    controller.abort();
  });
  io.prepare.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
  await expect(apply(fixture, controller.signal)).rejects.toThrow();
  expect(fixture.commit).not.toHaveBeenCalled();
  expect(clips(fixture)).toHaveLength(0);
  expect(first.cancel).toHaveBeenCalledOnce();
  expect(second.cancel).toHaveBeenCalledOnce();
});

it('rejects concurrent authored change after capture and binds the attempted revision after buffer Save', async () => {
  const fixture = createTextTakeBatchFixture();
  const commit = fixture.session.commitDurable;
  vi.spyOn(fixture.session, 'commitDurable').mockImplementationOnce(
    async (operation, onAttempt) => {
      await fixture.session.commit({
        id: 'own-gain',
        at: 2,
        target: 'sourceAudio',
        before: { muted: false, volume: 1 },
        after: { muted: false, volume: 0.5 },
      });
      return commit(operation, onAttempt);
    }
  );
  await expect(apply(fixture)).rejects.toThrow();
  expect(fixture.commit.mock.calls[0]?.[0].expectedRevision).toBe(2);
  expect(clips(fixture)).toHaveLength(0);
  expect(fixture.session.getSnapshot().document.advancedContent.audio.original.volume).toBe(0.5);
  expect(fixture.stored().workspace.history.map((operation) => operation.id)).toEqual(['own-gain']);
  for (const handle of prepared) expect(handle.cancel).toHaveBeenCalledOnce();
});

it('admits a new explicit selection after proven compensation instead of retaining a stale batch', async () => {
  const fixture = createTextTakeBatchFixture();
  io.prepare.mockRejectedValueOnce(new Error('preparation failed'));
  await expect(apply(fixture)).rejects.toThrow('preparation failed');
  fixture.previews[1] = { ...fixture.previews[1]!, clipId: 'regenerated-take' };
  await apply(fixture);
  expect(fixture.commit).toHaveBeenCalledOnce();
  expect(clips(fixture).map((clip) => clip.id)).toEqual(['take-0', 'regenerated-take']);
});
