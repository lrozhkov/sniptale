import type {
  ScenarioCaptureStep,
  ScenarioNoteStep,
  ScenarioSectionStep,
  ScenarioStep,
} from '../../../../features/scenario/contracts/types/project';
import { escapeHtml, resolveStepHeading } from '../helpers';
import { renderScenarioTextBodyHtml, type ScenarioHtmlSectionRender } from './fragments';

function renderDividerStepHtml(): ScenarioHtmlSectionRender {
  return { sectionHtml: '<hr class="divider-step" />' };
}

function renderSectionStepHtml(
  step: ScenarioSectionStep,
  fallbackIndex: number
): ScenarioHtmlSectionRender {
  return {
    sectionHtml: [
      '<section class="section-step">',
      '<div class="section-content">',
      `<h2>${escapeHtml(resolveStepHeading(step, fallbackIndex))}</h2>`,
      renderScenarioTextBodyHtml(step.body),
      '</div>',
      '</section>',
    ].join(''),
  };
}

function renderNoteStepHtml(
  step: ScenarioNoteStep,
  fallbackIndex: number
): ScenarioHtmlSectionRender {
  return {
    sectionHtml: [
      `<section class="note-step" data-tone="${step.tone}">`,
      `<h3>${escapeHtml(resolveStepHeading(step, fallbackIndex))}</h3>`,
      renderScenarioTextBodyHtml(step.body),
      '</section>',
    ].join(''),
  };
}

export function renderTextStepHtml(
  step: Exclude<ScenarioStep, ScenarioCaptureStep>,
  fallbackIndex: number
): ScenarioHtmlSectionRender {
  if (step.kind === 'divider') {
    return renderDividerStepHtml();
  }

  if (step.kind === 'section') {
    return renderSectionStepHtml(step, fallbackIndex);
  }

  return renderNoteStepHtml(step, fallbackIndex);
}
