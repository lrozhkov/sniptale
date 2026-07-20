import { getCurrentLocale, translate } from '../../../../platform/i18n';
import type { ScenarioProject } from '../../../../features/scenario/contracts/types/project';
import { escapeHtml } from '../helpers';
import { buildScenarioHtmlScript } from './script';
import { buildScenarioHtmlStyles } from './styles';

export function buildScenarioHtmlDocument(
  project: ScenarioProject,
  sections: string[],
  lightboxes: string[]
): string {
  const locale = getCurrentLocale();

  return [
    '<!DOCTYPE html>',
    `<html lang="${locale}">`,
    '<head>',
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    `<title>${escapeHtml(project.name)}</title>`,
    `<style>${buildScenarioHtmlStyles()}</style>`,
    '</head>',
    '<body>',
    '<main class="page">',
    '<header class="export-header">',
    `<h1>${escapeHtml(project.name)}</h1>`,
    '</header>',
    `<section class="export-document" aria-label="${escapeHtml(
      translate('scenario.editor.exportDocumentLabel', locale)
    )}">`,
    ...sections,
    '</section>',
    '</main>',
    ...lightboxes,
    `<script>${buildScenarioHtmlScript()}</script>`,
    '</body>',
    '</html>',
  ].join('');
}
