import { vi } from 'vitest';
import { createEmptyVideoProject } from '../../features/video/project/factories/creation';
import {
  getVideoProject,
  prepareProjectAsset,
  type PreparedProjectAsset,
} from '../../composition/persistence/projects';
import { isCurrentVideoProjectSnapshot } from '../../composition/persistence/projects/revision';
import type { ProjectVoiceTakeAccess, ProjectVoiceTakePreview } from './project-voice-take';

export function fixture() {
  let project = createEmptyVideoProject('Voice');
  project.version = 5;
  let durable = structuredClone(project);
  let revision = 1;
  let alive = true;
  let deleted = false;
  const order: string[] = [];
  const prepared: PreparedProjectAsset = {
    id: 'private-voice',
    ref: {
      assetId: 'physical-voice',
      createdAt: 1,
      location: { kind: 'opfs', objectKey: 'voice' },
      mimeType: 'audio/mpeg',
      sha256: null,
      size: 4,
    },
    protect: vi.fn(async () => undefined),
    publish: vi.fn(async () => {
      order.push('publish');
    }),
    cancel: vi.fn(async () => undefined),
    discard: vi.fn(async () => undefined),
    retainForSession: vi.fn(),
  };
  vi.mocked(prepareProjectAsset).mockImplementation(async (_blob, _mime, _name, id) => {
    order.push('prepare');
    prepared.id = id!;
    return prepared;
  });
  vi.mocked(getVideoProject).mockImplementation(async () =>
    deleted
      ? { status: 'notFound' }
      : {
          status: 'ready',
          project: structuredClone(durable),
          workspaceRevision: revision,
        }
  );
  vi.mocked(isCurrentVideoProjectSnapshot).mockImplementation(
    async (snapshot, rev) =>
      !deleted && revision === rev && JSON.stringify(snapshot) === JSON.stringify(durable)
  );
  const save = vi.fn(async () => {
    order.push('save');
    project = { ...project, updatedAt: project.updatedAt + 1 };
    durable = structuredClone(project);
    revision++;
  });
  const update = vi.fn((updater: (current: typeof project) => typeof project) => {
    order.push('update');
    project = updater(project);
  });
  const access: ProjectVoiceTakeAccess = {
    getProject: () => (alive ? project : null),
    update,
    save,
  };
  const preview: ProjectVoiceTakePreview = {
    origin: access,
    projectId: project.id,
    filename: 'Historical words',
    source: {
      kind: 'speech',
      scope: {
        projectId: project.id,
        projectRevision: 1,
        projectUpdatedAt: project.updatedAt,
        target: { kind: 'project-text', documentId: 'deleted-document', fragmentId: 'old-phrase' },
        basisHash: `sha256:${'a'.repeat(64)}`,
      },
      staged: { id: 'staged', mimeType: 'audio/mpeg', size: 4 },
    },
    blob: new Blob(['data'], { type: 'audio/mpeg' }),
    duration: 12,
    url: 'blob:preview',
    expiresAt: Date.now() + 60_000,
    textSnapshot: {
      version: 1,
      documentId: 'deleted-document',
      binding: { kind: 'project' },
      basisHash: `sha256:${'a'.repeat(64)}`,
      text: {
        kind: 'ai',
        textId: 'old-phrase',
        revision: 1,
        timingRevision: 1,
        text: 'Historical words',
        start: 1,
        end: 2,
        timeDomain: 'result',
        profile: { modelId: 'model', voiceId: 'voice', responseFormat: 'mp3' },
      },
    },
  };
  return {
    access,
    preview,
    prepared,
    save,
    update,
    order,
    project: () => project,
    durable: () => durable,
    undo: () => {
      project = { ...project, clips: [] };
    },
    edit: () => {
      project = { ...project, name: 'Edited' };
    },
    remove: () => {
      deleted = true;
    },
    close: () => {
      alive = false;
    },
    restore: () => {
      durable = { ...durable, name: 'Restored same tuple' };
    },
    recreate: () => {
      durable = { ...durable, createdAt: durable.createdAt - 1 };
    },
  };
}
