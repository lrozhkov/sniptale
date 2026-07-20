export type StepBadgeType = 'number' | 'letter' | 'manual';
export type StepBadgeAlphabet = 'cyrillic' | 'latin';
export type StepBadgeSize = 'standard' | 'large' | 'extra-large';
export type StepBadgeCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

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
