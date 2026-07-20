import type { ScenarioSlide } from '@sniptale/runtime-contracts/scenario/types/v3';
import { escapeDeckHtml } from '../helpers';

export function renderScenarioDeckHtmlNotes(args: {
  includeNotes: boolean;
  slide: ScenarioSlide;
}): string {
  if (!args.includeNotes || !args.slide.notes.trim()) {
    return '';
  }

  return `<aside class="notes">${escapeDeckHtml(args.slide.notes)}</aside>`;
}
