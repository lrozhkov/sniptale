import { describe, expect, it } from 'vitest';
import {
  createScenarioDividerStep,
  createScenarioNoteStep,
  createScenarioSectionStep,
} from '../../../../features/scenario/project/public';
import { renderTextStepHtml } from './text';

describe('renderTextStepHtml', () => {
  it('renders divider, section, and note steps through the correct html variants', () => {
    expect(renderTextStepHtml(createScenarioDividerStep(), 0).sectionHtml).toContain(
      'divider-step'
    );

    const sectionHtml = renderTextStepHtml(
      createScenarioSectionStep({ title: 'Section title', body: 'Section body' }),
      1
    ).sectionHtml;
    expect(sectionHtml).toContain('class="section-step"');
    expect(sectionHtml).toContain('Section title');
    expect(sectionHtml).toContain('Section body');

    const noteHtml = renderTextStepHtml(
      createScenarioNoteStep({ title: 'Note title', body: 'Note body', tone: 'info' }),
      2
    ).sectionHtml;
    expect(noteHtml).toContain('class="note-step"');
    expect(noteHtml).toContain('data-tone="info"');
    expect(noteHtml).toContain('Note body');
  });
});
