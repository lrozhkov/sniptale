import { beforeEach, describe, expect, it, vi } from 'vitest';

const { saveScenarioProjectRecordV3Mock } = vi.hoisted(() => ({
  saveScenarioProjectRecordV3Mock: vi.fn(),
}));

vi.mock('../../../composition/persistence/scenario/store/v3', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../composition/persistence/scenario/store/v3')>();
  return {
    ...actual,
    saveScenarioProjectRecordV3: saveScenarioProjectRecordV3Mock,
  };
});
vi.mock('../../../platform/i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../platform/i18n')>();
  return {
    ...actual,
    translate: (key: string) => key,
  };
});

import { createScenarioProjectV3 } from '../../../features/scenario/project/v3';
import { getScenarioV3RuntimeErrorMessage, saveScenarioV3EditorProject } from './save';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('scenario v3 runtime save helpers', () => {
  it('saves through the v3 project store seam', async () => {
    const project = withUpdatedAt(createScenarioProjectV3('Saved'), 10);
    saveScenarioProjectRecordV3Mock.mockResolvedValue(project);

    await expect(saveScenarioV3EditorProject(project, { baseUpdatedAt: 10 })).resolves.toBe(
      project
    );

    expect(saveScenarioProjectRecordV3Mock).toHaveBeenCalledWith(project, { baseUpdatedAt: 10 });
  });

  it('keeps an externally advanced project when the editor saves from a stale baseline', async () => {
    const loadedProject = withUpdatedAt(createScenarioProjectV3('Loaded'), 10);
    const externallySavedProject = { ...loadedProject, name: 'External', updatedAt: 20 };
    let persistedProject = externallySavedProject;
    saveScenarioProjectRecordV3Mock.mockImplementation(async (nextProject, options) => {
      if (options?.baseUpdatedAt !== persistedProject.updatedAt) {
        throw new Error('Scenario project changed before save completed');
      }
      persistedProject = nextProject;
      return nextProject;
    });

    await expect(
      saveScenarioV3EditorProject(
        { ...loadedProject, name: 'Stale local edit', updatedAt: 30 },
        { baseUpdatedAt: loadedProject.updatedAt }
      )
    ).rejects.toThrow('Scenario project changed before save completed');

    expect(persistedProject).toBe(externallySavedProject);
    expect(saveScenarioProjectRecordV3Mock).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Stale local edit' }),
      { baseUpdatedAt: 10 }
    );
  });

  it('normalizes unknown failures into explicit user-facing messages', () => {
    expect(getScenarioV3RuntimeErrorMessage(new Error('Disk full'))).toBe('Disk full');
    expect(getScenarioV3RuntimeErrorMessage('nope')).toBe('scenario.editor.v3OperationFailed');
  });
});

function withUpdatedAt(project: ReturnType<typeof createScenarioProjectV3>, updatedAt: number) {
  return { ...project, updatedAt };
}
