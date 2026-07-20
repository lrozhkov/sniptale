import { describe, expect, it } from 'vitest';

import {
  readScenarioEditorPresentationSessionId,
  readScenarioEditorPresentationView,
  readScenarioEditorProjectId,
  readScenarioEditorStepId,
} from './index';

describe('scenario editor session url helpers', () => {
  it('reads the project and step ids from the editor query string', () => {
    expect(readScenarioEditorProjectId('?projectId=project-1')).toBe('project-1');
    expect(readScenarioEditorStepId('?projectId=project-1&stepId=step-2')).toBe('step-2');
    expect(readScenarioEditorProjectId('?foo=bar')).toBeNull();
    expect(readScenarioEditorStepId('?foo=bar')).toBeNull();
  });

  it('reads supported audience presentation query params', () => {
    const search = '?projectId=project-1&presentationView=audience&presentationSessionId=session-1';

    expect(readScenarioEditorPresentationView(search)).toBe('audience');
    expect(readScenarioEditorPresentationSessionId(search)).toBe('session-1');
    expect(readScenarioEditorPresentationView('?presentationView=presenter')).toBeNull();
    expect(readScenarioEditorPresentationSessionId('?foo=bar')).toBeNull();
  });
});
