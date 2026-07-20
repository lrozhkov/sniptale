import type {
  ScenarioSlide,
  ScenarioTemplateDefinition,
} from '@sniptale/runtime-contracts/scenario/types/v3';
import type { ScenarioSlideRenderAssetMap } from '../../project/stage-render/slide';

export interface ScenarioSlideRailProps {
  assets?: ScenarioSlideRenderAssetMap;
  embedded?: boolean;
  onCollapsePanel?: () => void;
  onAddSlide: () => void;
  onDeleteSlide: (slideId: string) => void;
  onDuplicateSlide: (slideId: string) => void;
  onCreateTemplateSlide: (template: ScenarioTemplateDefinition) => void;
  onMoveSlide: (slideId: string, direction: 'down' | 'up') => void;
  onOpenTemplateManager: () => void;
  onSelectSlide: (slideId: string) => void;
  onToggleTemplatePicker: () => void;
  selectedSlideId: string | null;
  slides: ScenarioSlide[];
  templatePickerOpen: boolean;
  templates: readonly ScenarioTemplateDefinition[];
}
