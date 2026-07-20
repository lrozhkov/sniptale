import { describe, expect, it } from 'vitest';
import { createScenarioProjectV3 } from '../../../../features/scenario/project/v3';
import { listBundledScenarioTemplates } from '../../../../features/scenario/project/v3/templates';
import { buildScenarioEditorV3LLMPayload } from './';

describe('scenario editor v3 LLM payload', () => {
  it('builds bounded slide-code, outline, and manifest payload parts', () => {
    const project = createScenarioProjectV3('AI project');
    const payload = buildScenarioEditorV3LLMPayload({
      project,
      selectedSlideId: project.slides[0]!.id,
      templates: listBundledScenarioTemplates(),
    });

    expect(JSON.parse(payload.projectOutlineJson)).toMatchObject({
      name: 'AI project',
      version: 3,
    });
    expect(JSON.parse(payload.selectedSlideCodeJson)).toMatchObject({
      id: project.slides[0]!.id,
      title: 'AI project',
    });
    expect(JSON.parse(payload.toolManifestJson).operations).toContain('updateElement');
    expect(payload.attachments).toEqual([]);
  });

  it('falls back to the first slide and rejects empty projects', () => {
    const project = createScenarioProjectV3('AI project');
    const fallback = buildScenarioEditorV3LLMPayload({
      project,
      selectedSlideId: 'missing',
    });

    expect(JSON.parse(fallback.selectedSlideCodeJson)).toMatchObject({
      id: project.slides[0]!.id,
    });
    expect(() =>
      buildScenarioEditorV3LLMPayload({
        project: { ...project, slides: [] },
        selectedSlideId: 'missing',
      })
    ).toThrow('Scenario v3 project has no slides');
  });
});
