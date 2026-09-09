import type React from 'react';

export type InspectorSectionSemantic =
  | 'info'
  | 'timing'
  | 'placement'
  | 'framing'
  | 'audio'
  | 'canvas'
  | 'grid'
  | 'background'
  | 'appearance'
  | 'camera'
  | 'animation'
  | 'tracking'
  | 'effects'
  | 'content'
  | 'history'
  | 'track'
  | 'transition';

export interface InspectorGroupDefinition<TId extends string> {
  content: React.ReactNode;
  semantic: InspectorSectionSemantic;
  defaultActive?: boolean;
  id: TId;
  label: string;
  meta?: React.ReactNode;
  visible?: boolean;
}
