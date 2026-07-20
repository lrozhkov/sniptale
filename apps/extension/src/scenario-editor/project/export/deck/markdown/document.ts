import type { ScenarioProjectV3 } from '@sniptale/runtime-contracts/scenario/types/v3';
import type { ScenarioDeckExportOptions, ScenarioDeckRenderedSlide } from '../types';
import { escapeDeckMarkdown } from '../helpers';
import { renderScenarioDeckMarkdownSlide } from './slide';

export function renderScenarioDeckMarkdownDocument(args: {
  missingAssetIds: readonly string[];
  options: ScenarioDeckExportOptions;
  project: ScenarioProjectV3;
  slides: ScenarioDeckRenderedSlide[];
}): string {
  const parts = [
    `# ${escapeDeckMarkdown(args.project.name)}`,
    renderMissingAssets(args.options.includeMissingPlaceholders, args.missingAssetIds),
    ...args.slides.map((rendered) =>
      renderScenarioDeckMarkdownSlide({
        options: args.options,
        rendered,
        slideAssetPath: `slides/slide-${rendered.index + 1}.svg`,
      })
    ),
  ];

  return parts.filter(Boolean).join('\n\n');
}

function renderMissingAssets(include: boolean, missingAssetIds: readonly string[]): string {
  if (!include || missingAssetIds.length === 0) {
    return '';
  }

  return `Missing assets: ${missingAssetIds.map((id) => `\`${escapeDeckMarkdown(id)}\``).join(', ')}`;
}
