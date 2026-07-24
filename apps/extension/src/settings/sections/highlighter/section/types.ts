import type { HighlighterSettings } from '../../../../features/highlighter/contracts';
import type {
  HighlighterEffectActions,
  HighlighterPresetController,
} from './useHighlighterSection';

export interface HighlighterSectionContentProps {
  effects: HighlighterEffectActions;
  presets: HighlighterPresetController;
  settings: HighlighterSettings;
}

export type HighlighterEffectsProps = Pick<HighlighterSectionContentProps, 'effects' | 'settings'>;
export type HighlighterPresetsProps = Pick<HighlighterSectionContentProps, 'presets' | 'settings'>;
