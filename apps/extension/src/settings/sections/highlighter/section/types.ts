import type { HighlighterSettings } from '../../../../features/highlighter/contracts';
import type { HighlighterSectionState } from './useHighlighterSection';

export interface HighlighterSectionContentProps {
  settings: HighlighterSettings;
  state: HighlighterSectionState;
}
