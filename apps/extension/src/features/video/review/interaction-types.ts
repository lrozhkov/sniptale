export type ReviewInteractionFamily = 'keyboard' | 'mouse';
export type ReviewAuthoredPress = {
  id: string;
  family: ReviewInteractionFamily;
  start: number;
  end: number;
  label: string;
  keys?: string[];
  button: number;
  x: number;
  y: number;
};
type ReviewInteractionOverride = {
  ref: { kind: 'action' | 'signal' | 'cursor'; id: string };
  start: number;
  end: number;
  enabled: boolean;
  source?: ReviewAuthoredPress;
  sourceRange?: { start: number; end: number };
};
export type ReviewInteractionTimeline = {
  presses: ReviewAuthoredPress[];
  overrides: ReviewInteractionOverride[];
};
