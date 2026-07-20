import type { ReactNode } from 'react';

export type CanvasToolGroup = 'primary' | 'secondary' | 'workspace' | 'editor';

export interface CanvasToolAction {
  accept?: string;
  active?: boolean;
  disabled?: boolean;
  group?: CanvasToolGroup;
  icon: ReactNode;
  id: string;
  label: string;
  onSelect: () => void;
  onSelectFile?: (file: File) => Promise<void> | void;
}

export interface CanvasToolPanelProps {
  actions: readonly CanvasToolAction[];
  className?: string;
  dataUi: string;
  dividerClassName?: string;
  label: string;
  orientation?: 'horizontal' | 'vertical';
}
