import type { HighlighterSettings } from '../../../../features/highlighter/contracts';
import type {
  HighlighterEffectActions,
  HighlighterPresetController,
} from './useHighlighterSection';
import type { CalloutPresetCatalogController } from '../callout-presets';
import type { StepBadgePresetCatalogController } from '../step-badge-presets';

export interface HighlighterSectionContentProps {
  calloutPresets: CalloutPresetCatalogController;
  effects: HighlighterEffectActions;
  presets: HighlighterPresetController;
  settings: HighlighterSettings;
  stepBadgePresets?: StepBadgePresetCatalogController;
}

export type HighlighterEffectsProps = Pick<HighlighterSectionContentProps, 'effects' | 'settings'>;
export type HighlighterPresetsProps = Pick<HighlighterSectionContentProps, 'presets' | 'settings'>;
