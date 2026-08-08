import type { ReactNode } from 'react';

export type SettingsCollectionAction =
  | { type: 'toggle'; itemId: string; nextChecked: boolean }
  | { type: 'edit' | 'set-default' | 'reset' | 'delete'; itemId: string };

export type SettingsCollectionMoveIntent = {
  itemId: string;
  groupId: string | null;
  beforeItemId: string | null;
  source: 'drag' | 'menu' | 'keyboard';
};

export type SettingsCollectionActionId =
  | 'edit'
  | 'toggle'
  | 'set-default'
  | 'reset'
  | 'delete'
  | 'move-up'
  | 'move-down';

export type SettingsCollectionItem = {
  id: string;
  title: ReactNode;
  meta?: ReactNode;
  preview?: ReactNode;
  badges?: readonly {
    id: string;
    label: string;
    tone: 'neutral' | 'success' | 'warning';
  }[];
  enabled?: boolean;
  isDefault?: boolean;
  busy?: boolean;
  capabilities: {
    edit?: boolean;
    toggle?: boolean;
    setDefault?: boolean;
    reset?: boolean;
    delete?: boolean;
    reorder?: boolean;
  };
  actionLabels?: {
    reset?: string;
  };
  disabledActions?: Partial<Record<SettingsCollectionActionId, string>>;
};

export type SettingsCollectionGroup = {
  id: string;
  label?: ReactNode;
  description?: ReactNode;
  itemIds: readonly string[];
};

export type SettingsCollectionProps = {
  ariaLabel: string;
  title?: ReactNode;
  description?: ReactNode;
  items: readonly SettingsCollectionItem[];
  groups?: readonly SettingsCollectionGroup[];
  countLabel?: ReactNode;
  addAction?: { label: string; disabled?: boolean; onInvoke(): void };
  state?: 'ready' | 'loading' | 'error';
  emptyState?: ReactNode;
  errorState?: ReactNode;
  onAction(action: SettingsCollectionAction): void;
  onMove?(intent: SettingsCollectionMoveIntent): void;
};

export type SettingsCollectionResolvedGroup = {
  id: string | null;
  label?: ReactNode;
  description?: ReactNode;
  items: readonly SettingsCollectionItem[];
};
