import { describe, expect, it } from 'vitest';

import { readScenarioEditorProjectId, readScenarioEditorStepId } from './index';

describe('scenario editor session url helpers', () => {
  it('reads the project and step ids from the editor query string', () => {
    expect(readScenarioEditorProjectId('?projectId=project-1')).toBe('project-1');
    expect(readScenarioEditorStepId('?projectId=project-1&stepId=step-2')).toBe('step-2');
    expect(readScenarioEditorProjectId('?foo=bar')).toBeNull();
    expect(readScenarioEditorStepId('?foo=bar')).toBeNull();
  });

  it('decodes project and step identifiers without interpreting unrelated parameters', () => {
    const search = '?projectId=project%201&stepId=step%202&view=unknown';
    expect(readScenarioEditorProjectId(search)).toBe('project 1');
    expect(readScenarioEditorStepId(search)).toBe('step 2');
  });
});
