import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getVideoProject } from '../../composition/persistence/projects';
import { isCurrentVideoProjectSnapshot } from '../../composition/persistence/projects/revision';
import { createLibraryLifecycle } from '../../composition/persistence/library-lifecycle/contracts';
import {
  createEmptyVideoProject,
  createVideoProjectAsset,
} from '../../features/video/project/factories/creation';
import { createVideoClipFromAsset } from '../../features/video/project/factories/clip';
import type { VideoProject } from '../../features/video/project/types/model';
import { createReviewCaptionSettings } from '../../features/video/review/text-document';
import { requestLlmSessionToken } from '../ai-session/llm-session';
import { runReviewTextJob } from '../video-review/text-rewrite-client';
import {
  applyProjectTextRewrite,
  captureProjectTextRewrite,
  generateProjectTextRewrite,
  type ProjectTextRewriteAccess,
} from './project-text-rewrite';

vi.mock('../../composition/persistence/projects', () => ({ getVideoProject: vi.fn() }));
vi.mock('../../composition/persistence/projects/revision', () => ({
  isCurrentVideoProjectSnapshot: vi.fn(),
}));
vi.mock('../ai-session/llm-session', () => ({ requestLlmSessionToken: vi.fn() }));
vi.mock('../video-review/text-rewrite-client', () => ({ runReviewTextJob: vi.fn() }));

const options = {
  prompt: 'Make the text clear',
  mode: 'phrases' as const,
  wholeDocument: false,
  changeIntervals: false,
  resegment: false,
};
const model = {
  modelId: 'text-model',
  approvedProviderId: 'approved-provider',
  approvedDestination: `sha256:${'a'.repeat(64)}`,
  approvedModelCode: 'approved-code',
};
const response = { version: 1 as const, fragments: [{ fromIds: ['phrase'], text: 'Clear text' }] };
const signal = () => new AbortController().signal;

function fixture() {
  let project = createEmptyVideoProject('Rewrite');
  const asset = createVideoProjectAsset(
    'Source',
    'VIDEO',
    { kind: 'project-asset', projectAssetId: 'source-bytes' },
    {
      width: 640,
      height: 360,
      duration: 20,
      mimeType: 'video/webm',
      size: 10,
      hasAudio: true,
      audioPeaks: null,
    }
  );
  const clip = createVideoClipFromAsset(project.tracks[0]!.id, asset, 640, 360, 4);
  if (clip.type !== 'VIDEO') throw new Error('Expected video');
  project = {
    ...project,
    version: 5,
    assets: [asset],
    clips: [{ ...clip, sourceStart: 2, sourceDuration: 8, duration: 4, playbackRate: 2 }],
    duration: 8,
    textDocuments: [
      {
        id: 'document',
        binding: { kind: 'source', assetId: asset.id, sourceInstanceId: clip.id },
        captions: createReviewCaptionSettings(),
        document: {
          version: 1,
          fragments: [
            {
              id: 'phrase',
              text: 'Original text',
              originalText: 'Original text',
              start: 4,
              end: 6,
              revision: 0,
              timingRevision: 0,
              alignment: 'range',
              timeDomain: 'source',
              showInVideo: true,
              origin: { kind: 'original', start: 4, end: 6 },
            },
          ],
        },
      },
    ],
  };
  let opened = true;
  let durable: VideoProject | null = structuredClone(project);
  let revision = 1;
  let trashed = false;
  const read = async (): ReturnType<typeof getVideoProject> =>
    durable
      ? {
          status: 'ready',
          project: structuredClone(durable),
          workspaceRevision: revision,
          ...(trashed
            ? { lifecycle: { ...createLibraryLifecycle('library', 1), trashedAt: 2 } }
            : {}),
        }
      : { status: 'notFound' };
  vi.mocked(getVideoProject).mockImplementation(read);
  vi.mocked(isCurrentVideoProjectSnapshot).mockImplementation(
    async (snapshot, expectedRevision) =>
      durable !== null &&
      !trashed &&
      expectedRevision === revision &&
      JSON.stringify(snapshot) === JSON.stringify(durable)
  );
  const save = vi.fn(async () => {
    project = { ...project, updatedAt: project.updatedAt + 1 };
    durable = structuredClone(project);
    revision++;
  });
  const update = vi.fn((updater: Parameters<ProjectTextRewriteAccess['update']>[0]) => {
    project = updater(project);
  });
  const access: ProjectTextRewriteAccess = {
    getProject: () => (opened ? project : null),
    save,
    update,
  };
  return {
    access,
    save,
    update,
    read,
    capture: (changes: Partial<typeof options> = {}) =>
      captureProjectTextRewrite(access, 'document', ['phrase'], { ...options, ...changes }),
    change: (change: (current: VideoProject) => VideoProject) => {
      project = change(project);
    },
    changeDurable: (change: (current: VideoProject) => VideoProject) => {
      if (!durable) throw new Error('Missing durable project');
      durable = change(durable);
    },
    removeDurable: () => {
      durable = null;
    },
    trash: () => {
      trashed = true;
    },
    revise: () => revision++,
    close: () => {
      opened = false;
    },
    get project() {
      return project;
    },
  };
}

function gate() {
  let release = () => {};
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

async function generated(f: ReturnType<typeof fixture>) {
  return generateProjectTextRewrite(f.access, f.capture(), model, signal());
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requestLlmSessionToken).mockResolvedValue('one-use-token');
  vi.mocked(runReviewTextJob).mockResolvedValue(structuredClone(response));
});

describe('montage text rewrite generation', () => {
  it('captures before Save and sends the canonical revision with the exact disclosed text', async () => {
    const f = fixture();
    const preview = f.capture();
    const originalTimestamp = f.project.updatedAt;
    expect(f.save).not.toHaveBeenCalled();
    expect(preview.basis.context.fragments).toEqual([
      { id: 'phrase', text: 'Original text', start: 5, end: 6 },
    ]);
    const complete = await generateProjectTextRewrite(f.access, preview, model, signal());
    expect(f.project.updatedAt).toBe(originalTimestamp + 1);
    expect(runReviewTextJob).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        ...model,
        context: preview.basis.context,
        scope: {
          kind: 'project-text',
          projectId: f.project.id,
          projectRevision: 2,
          projectUpdatedAt: f.project.updatedAt,
          documentId: 'document',
        },
        llmSessionToken: 'one-use-token',
      }),
      expect.any(AbortSignal)
    );
    expect(requestLlmSessionToken).toHaveBeenCalledExactlyOnceWith(
      'review-text',
      expect.objectContaining({ purpose: 'review-text', payloadHash: expect.any(String) })
    );
    expect(complete.proposal).toEqual(response);
    expect(preview.proposal).toBeUndefined();
    expect(f.update).not.toHaveBeenCalled();
  });

  it('accepts a canonical Save timestamp that differs from the local timestamp', async () => {
    const f = fixture();
    f.save.mockImplementationOnce(async () => {
      f.changeDurable((project) => ({ ...project, updatedAt: project.updatedAt + 100 }));
    });
    const complete = await generated(f);
    expect(complete.admitted?.project.updatedAt).toBe(f.project.updatedAt + 100);
  });

  it('refuses local edits during capture Save and canonical reads', async () => {
    const f = fixture();
    const preview = f.capture();
    f.save.mockImplementationOnce(async () => f.change((project) => ({ ...project, clips: [] })));
    await expect(generateProjectTextRewrite(f.access, preview, model, signal())).rejects.toThrow(
      'stale'
    );
    expect(runReviewTextJob).not.toHaveBeenCalled();
    const next = fixture();
    vi.mocked(isCurrentVideoProjectSnapshot).mockImplementationOnce(async () => {
      next.change((project) => ({ ...project, name: 'Concurrent edit' }));
      return true;
    });
    await expect(generated(next)).rejects.toThrow('stale');
    expect(runReviewTextJob).not.toHaveBeenCalled();
  });

  it('refuses a canonical disclosure that differs from the captured source instance', async () => {
    const f = fixture();
    f.save.mockImplementationOnce(async () => {
      f.changeDurable((project) => ({ ...project, clips: [] }));
    });
    await expect(generated(f)).rejects.toThrow('stale');
    expect(requestLlmSessionToken).not.toHaveBeenCalled();
    expect(runReviewTextJob).not.toHaveBeenCalled();
  });

  it('captures model approval before awaits and refuses canonical changes before generation and Apply', async () => {
    const f = fixture();
    const approved = { ...model };
    vi.mocked(requestLlmSessionToken).mockImplementationOnce(async () => {
      approved.approvedModelCode = 'replacement-code';
      return 'token';
    });
    const preview = await generateProjectTextRewrite(f.access, f.capture(), approved, signal());
    expect(runReviewTextJob).toHaveBeenCalledWith(
      expect.objectContaining({ approvedModelCode: model.approvedModelCode }),
      expect.any(AbortSignal)
    );
    f.revise();
    await expect(applyProjectTextRewrite(f.access, preview, signal(), 'replace')).rejects.toThrow(
      'stale'
    );
    expect(f.update).not.toHaveBeenCalled();
    const next = fixture();
    vi.mocked(requestLlmSessionToken).mockImplementationOnce(async () => {
      next.revise();
      return 'token';
    });
    await expect(generated(next)).rejects.toThrow('stale');
    expect(runReviewTextJob).toHaveBeenCalledOnce();
  });

  it.each(['delete', 'trash', 'restore'] as const)(
    'refuses removed or restored canonical projects after an integrity read: %s',
    async (change) => {
      const f = fixture();
      vi.mocked(getVideoProject).mockImplementationOnce(async () => {
        const captured = await f.read();
        if (change === 'delete') f.removeDurable();
        else if (change === 'trash') f.trash();
        else f.changeDurable((project) => ({ ...project, name: 'Restored with same tuple' }));
        return captured;
      });
      await expect(generated(f)).rejects.toThrow('stale');
      expect(isCurrentVideoProjectSnapshot).toHaveBeenCalledOnce();
      expect(runReviewTextJob).not.toHaveBeenCalled();
      expect(f.update).not.toHaveBeenCalled();
    }
  );

  it('rejects a late response after local changes and preserves authored text', async () => {
    const f = fixture();
    const before = structuredClone(f.project.textDocuments);
    vi.mocked(runReviewTextJob).mockImplementationOnce(async () => {
      f.change((project) => ({ ...project, name: 'Newer local edit' }));
      return response;
    });
    await expect(generated(f)).rejects.toThrow('stale');
    expect(f.project.textDocuments).toEqual(before);
    expect(f.update).not.toHaveBeenCalled();
  });

  it('refuses cancellation during Save, token admission and the provider response', async () => {
    for (const phase of ['save', 'token', 'response'] as const) {
      vi.clearAllMocks();
      const f = fixture();
      const controller = new AbortController();
      if (phase === 'save') f.save.mockImplementationOnce(async () => controller.abort());
      else if (phase === 'token')
        vi.mocked(requestLlmSessionToken).mockImplementationOnce(async () => {
          controller.abort();
          return 'token';
        });
      else
        vi.mocked(runReviewTextJob).mockImplementationOnce(async () => {
          controller.abort();
          return response;
        });
      await expect(
        generateProjectTextRewrite(f.access, f.capture(), model, controller.signal)
      ).rejects.toThrow();
      expect(runReviewTextJob).toHaveBeenCalledTimes(phase === 'response' ? 1 : 0);
      expect(f.update).not.toHaveBeenCalled();
    }
  });

  it('retains the captured input after a failed Save and never retries a failed paid job implicitly', async () => {
    const f = fixture();
    const preview = f.capture();
    f.save.mockRejectedValueOnce(new Error('Save failed'));
    await expect(generateProjectTextRewrite(f.access, preview, model, signal())).rejects.toThrow(
      'Save failed'
    );
    expect(runReviewTextJob).not.toHaveBeenCalled();
    vi.mocked(runReviewTextJob).mockRejectedValueOnce(new Error('interrupted'));
    await expect(generateProjectTextRewrite(f.access, preview, model, signal())).rejects.toThrow(
      'interrupted'
    );
    expect(runReviewTextJob).toHaveBeenCalledOnce();
    expect(preview.proposal).toBeUndefined();
    expect(preview.basis.fragments[0]!.text).toBe('Original text');
    expect(f.update).not.toHaveBeenCalled();
  });

  it('checks returned proposal coverage and forbids generating an already completed proposal', async () => {
    const f = fixture();
    vi.mocked(runReviewTextJob).mockResolvedValueOnce({
      version: 1,
      fragments: [{ fromIds: ['unknown'], text: 'Invalid' }],
    });
    await expect(generated(f)).rejects.toThrow('invalid-response');
    const preview = await generated(f);
    await expect(generateProjectTextRewrite(f.access, preview, model, signal())).rejects.toThrow(
      'invalid-request'
    );
    expect(runReviewTextJob).toHaveBeenCalledTimes(2);
  });
});

describe('montage text rewrite application', () => {
  it('applies an edited proposal once through the mounted mutation port and retains source placement', async () => {
    const f = fixture();
    const preview = await generated(f);
    const media = structuredClone([f.project.assets, f.project.clips]);
    preview.proposal!.fragments[0]!.text = 'Edited proposal';
    await applyProjectTextRewrite(f.access, preview, signal(), 'replace');
    expect(f.update).toHaveBeenCalledOnce();
    expect(f.project.textDocuments![0]!.document.fragments[0]).toMatchObject({
      id: 'phrase',
      text: 'Edited proposal',
      start: 4,
      end: 6,
      timeDomain: 'source',
      revision: 1,
    });
    expect([f.project.assets, f.project.clips]).toEqual(media);
    await applyProjectTextRewrite(f.access, preview, signal(), 'replace');
    expect(f.update).toHaveBeenCalledOnce();
    expect(runReviewTextJob).toHaveBeenCalledOnce();
  });

  it('retains a local receipt after failed Save and retries only acknowledgement', async () => {
    const f = fixture();
    const preview = await generated(f);
    f.save.mockRejectedValueOnce(new Error('Save failed'));
    await expect(applyProjectTextRewrite(f.access, preview, signal(), 'variant')).rejects.toThrow(
      'Save failed'
    );
    const accepted = structuredClone(f.project.textDocuments);
    expect(preview.receipt?.mode).toBe('variant');
    expect(accepted![0]!.document.fragments).toHaveLength(2);
    await applyProjectTextRewrite(f.access, preview, signal(), 'variant');
    expect(f.project.textDocuments).toEqual(accepted);
    expect(f.update).toHaveBeenCalledOnce();
    expect(runReviewTextJob).toHaveBeenCalledOnce();
  });

  it('locks the accepted mode and refuses a changed local or durable receipt', async () => {
    const f = fixture();
    const preview = await generated(f);
    await applyProjectTextRewrite(f.access, preview, signal(), 'replace');
    await expect(applyProjectTextRewrite(f.access, preview, signal(), 'variant')).rejects.toThrow(
      'invalid-request'
    );
    f.changeDurable((project) => ({ ...project, textDocuments: [] }));
    await expect(applyProjectTextRewrite(f.access, preview, signal(), 'replace')).rejects.toThrow(
      'stale'
    );
    expect(preview.receipt).toBeDefined();
    expect(f.update).toHaveBeenCalledOnce();
  });

  it('does not resurrect an accepted edit after Undo or deletion', async () => {
    const f = fixture();
    const before = structuredClone(f.project);
    const preview = await generated(f);
    await applyProjectTextRewrite(f.access, preview, signal(), 'variant');
    f.change(() => before);
    await expect(applyProjectTextRewrite(f.access, preview, signal(), 'variant')).rejects.toThrow(
      'stale'
    );
    f.change((project) => ({ ...project, textDocuments: [] }));
    await expect(applyProjectTextRewrite(f.access, preview, signal(), 'variant')).rejects.toThrow(
      'stale'
    );
    expect(f.update).toHaveBeenCalledOnce();
    expect(runReviewTextJob).toHaveBeenCalledOnce();
  });

  it('refuses recreated local identities before generation or receipt acknowledgement', async () => {
    const f = fixture();
    const preview = f.capture();
    f.change((project) => ({ ...project, createdAt: project.createdAt + 1 }));
    await expect(generateProjectTextRewrite(f.access, preview, model, signal())).rejects.toThrow(
      'stale'
    );
    const next = fixture();
    const accepted = await generated(next);
    await applyProjectTextRewrite(next.access, accepted, signal(), 'replace');
    next.change((project) => ({ ...project, createdAt: project.createdAt + 1 }));
    await expect(
      applyProjectTextRewrite(next.access, accepted, signal(), 'replace')
    ).rejects.toThrow('stale');
    expect(next.update).toHaveBeenCalledOnce();
  });

  it('refuses a local replacement at the synchronous mutation boundary', async () => {
    const f = fixture();
    const preview = await generated(f);
    f.update.mockImplementationOnce((updater) => {
      f.change((project) => ({ ...project }));
      f.change(updater);
    });
    await expect(applyProjectTextRewrite(f.access, preview, signal(), 'replace')).rejects.toThrow(
      'stale'
    );
    expect(preview.receipt).toBeUndefined();
    expect(f.project.textDocuments![0]!.document.fragments[0]!.text).toBe('Original text');
  });

  it('retains both partition receipts and refuses partial durable acceptance of retimed text', async () => {
    const f = fixture();
    vi.mocked(runReviewTextJob).mockResolvedValueOnce({
      version: 1,
      fragments: [{ fromIds: ['phrase'], text: 'Independent text', start: 5, end: 6 }],
    });
    const preview = await generateProjectTextRewrite(
      f.access,
      f.capture({ changeIntervals: true }),
      model,
      signal()
    );
    f.save.mockRejectedValueOnce(new Error('Save failed'));
    await expect(applyProjectTextRewrite(f.access, preview, signal(), 'replace')).rejects.toThrow();
    expect(preview.receipt?.documents).toHaveLength(2);
    expect(f.project.textDocuments!.map((entry) => entry.binding.kind)).toEqual([
      'source',
      'project',
    ]);
    const accepted = structuredClone(f.project.textDocuments);
    await applyProjectTextRewrite(f.access, preview, signal(), 'replace');
    expect(f.project.textDocuments).toEqual(accepted);
    f.changeDurable((project) => ({
      ...project,
      textDocuments: project.textDocuments!.slice(1),
    }));
    await expect(applyProjectTextRewrite(f.access, preview, signal(), 'replace')).rejects.toThrow(
      'stale'
    );
    expect(f.update).toHaveBeenCalledOnce();
  });

  it('revalidates the editable proposal before mutation and can retry a refused edit explicitly', async () => {
    const f = fixture();
    const preview = await generated(f);
    preview.proposal!.fragments[0]!.fromIds = ['unknown'];
    await expect(applyProjectTextRewrite(f.access, preview, signal(), 'replace')).rejects.toThrow(
      'invalid'
    );
    expect(preview.receipt).toBeUndefined();
    preview.proposal = structuredClone(response);
    await applyProjectTextRewrite(f.access, preview, signal(), 'replace');
    expect(f.project.textDocuments![0]!.document.fragments[0]!.text).toBe('Clear text');
    expect(runReviewTextJob).toHaveBeenCalledOnce();
  });

  it('retains accepted work after cancellation during Save and retries without another mutation', async () => {
    const f = fixture();
    const preview = await generated(f);
    const controller = new AbortController();
    const saving = gate();
    const entered = gate();
    f.save.mockImplementationOnce(async () => {
      entered.release();
      await saving.promise;
    });
    const applying = applyProjectTextRewrite(f.access, preview, controller.signal, 'variant');
    await entered.promise;
    controller.abort();
    saving.release();
    await expect(applying).rejects.toThrow();
    expect(preview.receipt).toBeDefined();
    await applyProjectTextRewrite(f.access, preview, signal(), 'variant');
    expect(f.update).toHaveBeenCalledOnce();
    expect(runReviewTextJob).toHaveBeenCalledOnce();
  });

  it('acknowledges a no-op without publishing a new project or permitting later resurrection', async () => {
    const f = fixture();
    vi.mocked(runReviewTextJob).mockResolvedValueOnce({
      version: 1,
      fragments: [{ fromIds: ['phrase'], text: 'Original text' }],
    });
    const preview = await generated(f);
    const before = f.project;
    f.save.mockImplementationOnce(async () => {});
    await applyProjectTextRewrite(f.access, preview, signal(), 'replace');
    expect(f.project).toBe(before);
    expect(preview.receipt?.documents).toHaveLength(1);
    f.change((project) => ({ ...project, textDocuments: [] }));
    await expect(applyProjectTextRewrite(f.access, preview, signal(), 'replace')).rejects.toThrow(
      'stale'
    );
    expect(f.update).toHaveBeenCalledOnce();
  });

  it('refuses closed editors and canonical deletion at Save acknowledgement', async () => {
    const f = fixture();
    const preview = await generated(f);
    f.save.mockImplementationOnce(async () => f.removeDurable());
    await expect(applyProjectTextRewrite(f.access, preview, signal(), 'replace')).rejects.toThrow(
      'stale'
    );
    expect(preview.receipt).toBeDefined();
    f.close();
    await expect(applyProjectTextRewrite(f.access, preview, signal(), 'replace')).rejects.toThrow(
      'stale'
    );
    expect(f.update).toHaveBeenCalledOnce();
  });
});

describe('montage text rewrite acknowledgement recovery', () => {
  it.each(['delete', 'trash', 'restore'] as const)(
    'refuses Save retry after canonical %s without overwriting completed work',
    async (change) => {
      const f = fixture();
      const preview = await generated(f);
      f.save.mockRejectedValueOnce(new Error('Save failed'));
      await expect(applyProjectTextRewrite(f.access, preview, signal(), 'variant')).rejects.toThrow(
        'Save failed'
      );
      if (change === 'delete') f.removeDurable();
      else if (change === 'trash') f.trash();
      else f.changeDurable((project) => ({ ...project, name: 'Restored with the same tuple' }));
      await expect(applyProjectTextRewrite(f.access, preview, signal(), 'variant')).rejects.toThrow(
        'stale'
      );
      expect(f.save).toHaveBeenCalledTimes(2);
      expect(f.update).toHaveBeenCalledOnce();
      expect(runReviewTextJob).toHaveBeenCalledOnce();
      expect(preview.receipt).toBeDefined();
    }
  );

  it('acknowledges durable receipts before Save and retains newer local buffers', async () => {
    const f = fixture();
    const preview = await generated(f);
    await applyProjectTextRewrite(f.access, preview, signal(), 'replace');
    f.change((project) => ({ ...project, name: 'Newer unsaved name' }));
    f.save.mockRejectedValueOnce(new Error('Must not flush unrelated buffers'));
    await applyProjectTextRewrite(f.access, preview, signal(), 'replace');
    expect(f.project.name).toBe('Newer unsaved name');
    expect(f.save).toHaveBeenCalledTimes(2);
    expect(f.update).toHaveBeenCalledOnce();
  });
});
