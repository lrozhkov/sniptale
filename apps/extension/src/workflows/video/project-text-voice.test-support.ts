import { vi } from 'vitest';
import { getVideoProject } from '../../composition/persistence/projects';
import { isCurrentVideoProjectSnapshot } from '../../composition/persistence/projects/revision';
import { createEmptyVideoProject } from '../../features/video/project/factories/creation';
import { createLibraryLifecycle } from '../../composition/persistence/library-lifecycle/contracts';
import type { ProjectVoiceReadAccess } from './project-voice-take';
import { captureProjectTextVoice } from './project-text-voice';

export const approvedSelection = {
  modelId: 'model',
  approvedProviderId: 'provider',
  approvedModelCode: 'speech',
  approvedDestination: `sha256:${'a'.repeat(64)}`,
};

const profile = { modelId: 'model', voiceId: 'voice', responseFormat: 'mp3' as const };
export function fixture() {
  let project = createEmptyVideoProject('Voice');
  project.version = 5;
  project.duration = 3;
  project.textDocuments = [
    {
      id: 'script',
      binding: { kind: 'project' },
      document: {
        version: 1,
        fragments: [
          {
            id: 'phrase',
            text: 'Speak this',
            originalText: '',
            revision: 1,
            timingRevision: 2,
            start: 1,
            end: 2,
            timeDomain: 'result',
            alignment: 'manual',
            showInVideo: true,
          },
        ],
      },
    },
  ];
  let durable: typeof project | null = structuredClone(project);
  let revision = 1;
  let trashed = false;
  let opened = true;
  vi.mocked(getVideoProject).mockImplementation(async () =>
    durable
      ? {
          status: 'ready',
          project: structuredClone(durable),
          workspaceRevision: revision,
          ...(trashed
            ? { lifecycle: { ...createLibraryLifecycle('library', 1), trashedAt: 2 } }
            : {}),
        }
      : { status: 'notFound' }
  );
  vi.mocked(isCurrentVideoProjectSnapshot).mockImplementation(
    async (value, rev) =>
      !trashed && revision === rev && JSON.stringify(durable) === JSON.stringify(value)
  );
  const save = vi.fn(async () => {
    project.updatedAt++;
    durable = structuredClone(project);
    revision++;
  });
  const access: ProjectVoiceReadAccess = { getProject: () => (opened ? project : null), save };
  return {
    access,
    project,
    save,
    capture: () =>
      captureProjectTextVoice(access, 'script', 'phrase', profile, new AbortController().signal),
    remove: () => {
      durable = null;
    },
    trash: () => {
      trashed = true;
    },
    close: () => {
      opened = false;
    },
    restore: () => {
      durable!.textDocuments![0]!.document.fragments[0]!.text = 'Restored same tuple';
    },
    recreate: () => {
      durable!.createdAt--;
    },
    change: () => {
      project.textDocuments![0]!.document.fragments[0]!.text = 'New words';
    },
  };
}
