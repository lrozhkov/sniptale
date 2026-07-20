import type { ReactNode } from 'react';
import type { TranslationKey } from '../../platform/i18n';

/**
 * Shared action contract for keyboard-first command palette entries.
 */
export interface CommandPaletteAction {
  id: string;
  title: string;
  subtitle?: string;
  section?: string;
  keywords?: readonly string[];
  shortcut?: string;
  icon?: ReactNode;
  disabled?: boolean;
  disabledReason?: string;
  onSelect: () => void | Promise<void>;
}

export interface CommandPaletteGroup {
  id: string;
  label: TranslationKey;
  actions: readonly CommandPaletteAction[];
}

export interface LocalizedCommandPaletteGroup {
  id: string;
  label: string;
  actions: readonly CommandPaletteAction[];
}

export interface CommandPaletteProps {
  isOpen: boolean;
  actions: readonly CommandPaletteAction[];
  onClose: () => void;
  actionError?: string | null;
  onActionError?: (action: CommandPaletteAction, error: unknown) => void;
  onActionStart?: (action: CommandPaletteAction) => void;
  storageKey?: string;
  dataUi?: string;
}
