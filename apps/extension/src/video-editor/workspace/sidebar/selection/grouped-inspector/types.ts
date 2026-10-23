import type React from 'react';

export type InspectorSectionSemantic =
  | 'actions'
  | 'source-audio'
  | 'comments'
  | 'watermark'
  | 'info'
  | 'timing'
  | 'placement'
  | 'framing'
  | 'audio'
  | 'canvas'
  | 'grid'
  | 'background'
  | 'typography'
  | 'geometry'
  | 'processing'
  | 'advanced'
  | 'appearance'
  | 'camera'
  | 'animation'
  | 'tracking'
  | 'effects'
  | 'content'
  | 'keyboard'
  | 'history'
  | 'track'
  | 'transition'
  | 'perspective'
  | 'depth';

export interface InspectorGroupDefinition<TId extends string> {
  content: React.ReactNode;
  semantic: InspectorSectionSemantic;
  defaultActive?: boolean;
  id: TId;
  label: string;
  meta?: React.ReactNode;
  visible?: boolean;
}
