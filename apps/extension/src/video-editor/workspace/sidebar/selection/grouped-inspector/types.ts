import type React from 'react';

export interface InspectorGroupDefinition<TId extends string> {
  content: React.ReactNode;
  defaultActive?: boolean;
  id: TId;
  label: string;
  meta?: React.ReactNode;
  visible?: boolean;
}
