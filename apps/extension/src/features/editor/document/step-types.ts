import type {
  StepBadgeAlphabet,
  StepBadgeSizeLevel,
  StepBadgeType,
} from '../../highlighter/contracts';

export interface EditorStepSettings {
  type: StepBadgeType;
  alphabet: StepBadgeAlphabet;
  sizeLevel: StepBadgeSizeLevel;
  value: string;
  color: string;
  opacity: number;
  textColor: string;
  strokeColor: string;
  strokeOpacity: number;
  strokeWidth: number;
}
