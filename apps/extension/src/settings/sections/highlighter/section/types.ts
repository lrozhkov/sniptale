import type { HighlighterSettings } from '../../../../features/highlighter/contracts';
import type {
  HighlighterEffectActions,
  HighlighterPresetController,
} from './useHighlighterSection';
import type { CalloutPresetCatalogController } from '../callout-presets';

export interface HighlighterSectionContentProps {
  calloutPresets: CalloutPresetCatalogController;
  effects: HighlighterEffectActions;
  presets: HighlighterPresetController;
  settings: HighlighterSettings;
}

export type HighlighterEffectsProps = Pick<HighlighterSectionContentProps, 'effects' | 'settings'>;
export type HighlighterPresetsProps = Pick<HighlighterSectionContentProps, 'presets' | 'settings'>;
