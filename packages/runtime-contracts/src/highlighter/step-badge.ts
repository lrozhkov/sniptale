import type { AnnotationTemplateTagId } from './annotation-template-tags';
import type { AnnotationSessionDefaults } from './border-preset';

export type StepBadgeType = 'number' | 'letter' | 'manual';
export type StepBadgeAlphabet = 'cyrillic' | 'latin';
export type StepBadgeSize = 'standard' | 'large' | 'extra-large';
export type StepBadgeCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
export type StepBadgeColorSource = 'custom' | 'frame-border' | 'frame-fill';
export type StepBadgeOutlineColorSource = StepBadgeColorSource | 'surface';
export type StepBadgeSizeSource = 'frame-border' | 'custom';

export const SYSTEM_STEP_BADGE_PRESET_KEYS = [
  'system-classic',
  'system-outline',
  'system-compact',
  'system-large',
  'system-letters',
] as const;

export type SystemStepBadgePresetKey = (typeof SYSTEM_STEP_BADGE_PRESET_KEYS)[number];
export type StepBadgePresetOrigin = 'system' | 'user';

export type StepBadgeAnchor =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'middle-left'
  | 'center'
  | 'middle-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';

export type StepBadgeOffsetDirection = 'up' | 'down' | 'left' | 'right';
export type StepBadgeBoundarySide = 'top' | 'right' | 'bottom' | 'left';

export interface StepBadgeManualPlacement {
  side: StepBadgeBoundarySide;
  /** Normalized position along the selected frame side, from 0 to 1. */
  position: number;
}
export type StepBadgeSizeLevel =
  | 0
  | 1
  | 2
  | 3
  | 4
  | 5
  | 6
  | 7
  | 8
  | 9
  | 10
  | 11
  | 12
  | 13
  | 14
  | 15
  | 16
  | 17
  | 18
  | 19
  | 20;

export interface StepBadgeVisualStyle {
  sizeSource: StepBadgeSizeSource;
  /** Custom diameter and fallback for a linked diameter, in CSS pixels. */
  diameter: number;
  backgroundColorSource: StepBadgeColorSource;
  backgroundColor: string;
  textColorSource: StepBadgeColorSource;
  textColor: string;
  outlineColorSource: StepBadgeOutlineColorSource;
  outlineColor: string;
  /** Outline thickness in CSS pixels. Missing legacy values resolve to 2px. */
  outlineWidth?: number;
  /** Optional safe decorative CSS for the badge and its text. */
  customCss?: string;
}

export interface StepBadgeTemplateSettings {
  anchor: StepBadgeAnchor;
  offsetDirections: StepBadgeOffsetDirection[];
  type: StepBadgeType;
  alphabet: StepBadgeAlphabet;
  value: string;
  auto: boolean;
  style: StepBadgeVisualStyle;
}

export interface StepBadgeSettings {
  enabled: boolean;
  corner?: StepBadgeCorner;
  anchor?: StepBadgeAnchor;
  offsetDirections?: StepBadgeOffsetDirection[];
  type: StepBadgeType;
  alphabet?: StepBadgeAlphabet;
  value: string;
  size?: StepBadgeSize;
  sizeLevel?: StepBadgeSizeLevel;
  auto?: boolean;
  manualPlacement?: StepBadgeManualPlacement | undefined;
  style?: StepBadgeVisualStyle;
  /** Explicit undefined clears the preset link after a manual edit. */
  sourcePresetId?: string | undefined;
}

export interface StepBadgePreset {
  id: string;
  name: string;
  enabled?: boolean;
  order: number;
  settings: StepBadgeTemplateSettings;
  origin?: StepBadgePresetOrigin;
  systemPresetKey?: SystemStepBadgePresetKey;
  basedOnRevision?: number;
  customized?: boolean;
  tagIds: AnnotationTemplateTagId[];
}

export interface StepBadgePresetCatalog {
  defaultPresetId: string;
  newSessionDefaults?: AnnotationSessionDefaults;
  presets: StepBadgePreset[];
  systemCatalogRevision: number;
  catalogCustomized?: boolean;
}

export function isSystemStepBadgePresetKey(value: unknown): value is SystemStepBadgePresetKey {
  return (
    typeof value === 'string' &&
    (SYSTEM_STEP_BADGE_PRESET_KEYS as readonly string[]).includes(value)
  );
}

export interface GlobalStepBadgeSettings {
  autoMode: boolean;
}

export const CYRILLIC_ALPHABET = [
  'А',
  'Б',
  'В',
  'Г',
  'Д',
  'Е',
  'Ж',
  'З',
  'И',
  'К',
  'Л',
  'М',
  'Н',
  'О',
  'П',
  'Р',
  'С',
  'Т',
  'У',
  'Ф',
  'Х',
  'Ц',
  'Ч',
  'Ш',
  'Щ',
  'Э',
  'Ю',
  'Я',
];

export const LATIN_ALPHABET = [
  'A',
  'B',
  'C',
  'D',
  'E',
  'F',
  'G',
  'H',
  'I',
  'J',
  'K',
  'L',
  'M',
  'N',
  'O',
  'P',
  'Q',
  'R',
  'S',
  'T',
  'U',
  'V',
  'W',
  'X',
  'Y',
  'Z',
];
