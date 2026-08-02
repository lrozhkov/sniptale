import type { ScenarioSlide } from '@sniptale/runtime-contracts/scenario/types/v3';
import type { ScenarioSlideRenderAssetMap } from '../../project/stage-render/slide';

export interface ScenarioSlideRailProps {
  assets?: ScenarioSlideRenderAssetMap;
  embedded?: boolean;
  onCollapsePanel?: () => void;
  onAddSlide: () => void;
  onDeleteSlide: (slideId: string) => void;
  onDuplicateSlide: (slideId: string) => void;
  onMoveSlide: (slideId: string, direction: 'down' | 'up') => void;
  onSelectSlide: (slideId: string) => void;
  selectedSlideId: string | null;
  slides: ScenarioSlide[];
}
