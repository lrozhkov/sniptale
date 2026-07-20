import type { ScenarioDeckExportOptions, ScenarioDeckRenderedSlide } from '../types';
import { escapeDeckHtml } from '../helpers';
import { renderScenarioDeckHtmlNotes } from './notes';

export function renderScenarioDeckHtmlSlide(args: {
  options: ScenarioDeckExportOptions;
  rendered: ScenarioDeckRenderedSlide;
}): string {
  const title = args.rendered.slide.title || `Slide ${args.rendered.index + 1}`;
  const notes = renderScenarioDeckHtmlNotes({
    includeNotes: args.options.includeNotes,
    slide: args.rendered.slide,
  });

  return [
    `<article class="slide" data-slide-id="${escapeDeckHtml(args.rendered.slide.id)}">`,
    `<h2 class="slide-title">${escapeDeckHtml(title)}</h2>`,
    `<div class="slide-frame">${args.rendered.svg}</div>`,
    notes,
    '</article>',
  ]
    .filter(Boolean)
    .join('');
}
