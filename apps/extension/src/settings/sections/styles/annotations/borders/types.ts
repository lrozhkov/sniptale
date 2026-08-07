import type { HighlighterSettings } from '../../../../../features/highlighter/contracts';
import type {
  HighlighterEffectActions,
  HighlighterPresetController,
} from './useHighlighterSection';

export interface HighlighterSectionContentProps {
  presets: HighlighterPresetController;
  settings: HighlighterSettings;
}

export type HighlighterPresetsProps = Pick<HighlighterSectionContentProps, 'presets' | 'settings'>;
export type HighlighterEffectsProps = {
  effects: HighlighterEffectActions;
  settings: HighlighterSettings;
};
