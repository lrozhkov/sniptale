import { translate } from '../../../../../platform/i18n';
import { escapeHtml } from '../../helpers';
import { renderScenarioStepHeaderHtml, type ScenarioHtmlSectionRender } from '../fragments';

export function renderMissingCaptureStepHtml(
  heading: string,
  body: string,
  captureIndex: number
): ScenarioHtmlSectionRender {
  return {
    sectionHtml: [
      '<section class="missing-step">',
      '<div class="step-topline">',
      renderScenarioStepHeaderHtml(heading, captureIndex),
      body,
      '</div>',
      '<div class="missing-frame"><div>',
      `<strong>${escapeHtml(translate('scenario.editor.exportMissingAsset'))}</strong>`,
      escapeHtml(translate('scenario.editor.exportMissingAssetHint')),
      '</div></div>',
      '</section>',
    ].join(''),
  };
}
