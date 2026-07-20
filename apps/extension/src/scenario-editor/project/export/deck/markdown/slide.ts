import type { ScenarioElement } from '@sniptale/runtime-contracts/scenario/types/v3';
import type { ScenarioDeckExportOptions, ScenarioDeckRenderedSlide } from '../types';
import { escapeDeckMarkdown, fenceDeckCode } from '../helpers';

export function renderScenarioDeckMarkdownSlide(args: {
  options: ScenarioDeckExportOptions;
  rendered: ScenarioDeckRenderedSlide;
  slideAssetPath: string;
}): string {
  const title = args.rendered.slide.title || `Slide ${args.rendered.index + 1}`;
  const parts = [
    `## ${escapeDeckMarkdown(title)}`,
    `![${escapeDeckMarkdown(title)}](${args.slideAssetPath})`,
    ...args.rendered.slide.elements.flatMap(renderElementMarkdown),
    args.options.includeNotes && args.rendered.slide.notes.trim()
      ? `> Notes: ${escapeDeckMarkdown(args.rendered.slide.notes.trim())}`
      : '',
  ];

  return parts.filter(Boolean).join('\n\n');
}

function renderElementMarkdown(element: ScenarioElement): string[] {
  switch (element.kind) {
    case 'text':
      return [escapeDeckMarkdown(element.text.trim())];
    case 'callout':
      return [escapeDeckMarkdown(element.text.trim())];
    case 'code':
      return [
        `Code: ${escapeDeckMarkdown(element.language || 'plain')}\n\n${fenceDeckCode(element.code)}`,
      ];
    case 'image':
      return [`Image asset: \`${escapeDeckMarkdown(element.assetRef.assetId)}\``];
    case 'shape':
      return [`Shape: ${element.shape}`];
    case 'line':
    case 'arrow':
      return [`Connector: ${element.kind}`];
  }
}
