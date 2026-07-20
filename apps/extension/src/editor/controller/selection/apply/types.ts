import type { EditorObjectType } from '../../../../features/editor/document/types';

export type AdvancedSelectionType = Extract<
  EditorObjectType,
  'arrow' | 'line' | 'meta-stamp' | 'rich-shape' | 'step' | 'text'
>;
