import type React from 'react';

export interface EditorInspectorMeta {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
}

export function createInspectorMeta(
  title: string,
  subtitle: string,
  icon: React.ReactNode
): EditorInspectorMeta {
  return { title, subtitle, icon };
}
