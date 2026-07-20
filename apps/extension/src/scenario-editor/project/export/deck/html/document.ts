import type { ScenarioProjectV3 } from '@sniptale/runtime-contracts/scenario/types/v3';
import type { ScenarioDeckExportOptions, ScenarioDeckRenderedSlide } from '../types';
import { escapeDeckHtml } from '../helpers';
import { renderScenarioDeckHtmlSlide } from './slide';
import { renderScenarioDeckHtmlStyles } from './styles';

export function renderScenarioDeckHtmlDocument(args: {
  missingAssetIds: readonly string[];
  options: ScenarioDeckExportOptions;
  project: ScenarioProjectV3;
  slides: ScenarioDeckRenderedSlide[];
}): string {
  const missing = args.options.includeMissingPlaceholders
    ? renderMissingAssets(args.missingAssetIds)
    : '';
  const slides = args.slides
    .map((rendered) => renderScenarioDeckHtmlSlide({ options: args.options, rendered }))
    .join('');
  const source = args.options.includeSourceJson ? renderSourceJson(args.project) : '';

  return [
    '<!doctype html><html><head><meta charset="utf-8"/>',
    '<meta name="viewport" content="width=device-width,initial-scale=1"/>',
    `<title>${escapeDeckHtml(args.project.name)}</title>`,
    `<style>${renderScenarioDeckHtmlStyles()}</style>`,
    '</head><body><main class="deck">',
    `<h1>${escapeDeckHtml(args.project.name)}</h1>`,
    missing,
    slides,
    source,
    '</main></body></html>',
  ].join('');
}

function renderMissingAssets(missingAssetIds: readonly string[]): string {
  if (missingAssetIds.length === 0) {
    return '';
  }

  return `<p class="missing">Missing assets: ${missingAssetIds.map(escapeDeckHtml).join(', ')}</p>`;
}

function renderSourceJson(project: ScenarioProjectV3): string {
  const source = escapeDeckHtml(JSON.stringify(project, null, 2));
  return `<template id="scenario-source-json" type="application/json">${source}</template>`;
}
