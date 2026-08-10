import { beforeEach, expect, it } from 'vitest';
import { publishVideoEditorSaveReadiness, waitForVideoEditorSave } from './save-readiness';

beforeEach(() => {
  publishVideoEditorSaveReadiness({ projectId: 'project-1', saveState: 'saved' });
});

it('returns immediately for the matching saved project', async () => {
  await expect(waitForVideoEditorSave('project-1')).resolves.toBeUndefined();
});

it('waits for an in-progress save to settle', async () => {
  publishVideoEditorSaveReadiness({ projectId: 'project-1', saveState: 'saving' });
  const settled = waitForVideoEditorSave('project-1');

  publishVideoEditorSaveReadiness({ projectId: 'project-1', saveState: 'saved' });

  await expect(settled).resolves.toBeUndefined();
});

it('waits through the dirty debounce before persistence starts', async () => {
  publishVideoEditorSaveReadiness({ projectId: 'project-1', saveState: 'dirty' });
  const settled = waitForVideoEditorSave('project-1');

  publishVideoEditorSaveReadiness({ projectId: 'project-1', saveState: 'saving' });
  publishVideoEditorSaveReadiness({ projectId: 'project-1', saveState: 'saved' });

  await expect(settled).resolves.toBeUndefined();
});

it('rejects when saving fails or the open project changes', async () => {
  publishVideoEditorSaveReadiness({ projectId: 'project-1', saveState: 'saving' });
  const failed = waitForVideoEditorSave('project-1');
  publishVideoEditorSaveReadiness({ projectId: 'project-1', saveState: 'error' });
  await expect(failed).rejects.toThrow('could not be saved');

  publishVideoEditorSaveReadiness({ projectId: 'project-1', saveState: 'saving' });
  const changed = waitForVideoEditorSave('project-1');
  publishVideoEditorSaveReadiness({ projectId: 'project-2', saveState: 'saved' });
  await expect(changed).rejects.toThrow('could not be saved');
});
