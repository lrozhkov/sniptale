import type { ScenarioSlideCanvas } from './geometry';
import type { ScenarioElement } from './elements';
import type {
  ScenarioBackgroundTransitionSettings,
  ScenarioSlideClickSettings,
  ScenarioSlideGuideMetadata,
  ScenarioSlideLayoutSettings,
  ScenarioSlideSource,
  ScenarioTransitionSettings,
} from './presentation';

export interface ScenarioSlide {
  backgroundTransition: ScenarioBackgroundTransitionSettings | null;
  canvas: ScenarioSlideCanvas;
  clicks: ScenarioSlideClickSettings;
  createdAt: number;
  elements: ScenarioElement[];
  guide: ScenarioSlideGuideMetadata | null;
  id: string;
  layout: ScenarioSlideLayoutSettings;
  notes: string;
  source: ScenarioSlideSource;
  templateId: string | null;
  title: string;
  transition: ScenarioTransitionSettings | null;
  updatedAt: number;
}

export interface ScenarioTrashedSlide {
  deletedAt: number;
  originalIndex: number;
  slide: ScenarioSlide;
}
