import { isRecord } from '../infrastructure/guards/primitives';
import {
  POPUP_STARTUP_TARGETS,
  type PopupStartupSelection,
  type PopupStartupState,
} from './popup-startup-contracts';

// policyStateIds: [] - popup startup targets are an immutable parser allowlist, not authority state.
const TARGETS = new Set<string>(POPUP_STARTUP_TARGETS);

function isPopupStartupSelection(value: unknown): value is PopupStartupSelection {
  return value === 'remember-last' || (typeof value === 'string' && TARGETS.has(value));
}

function isPopupPage(value: unknown): value is PopupStartupState['lastPage'] {
  return value === 'home' || value === 'video' || value === 'export';
}

export function parseStoredPopupStartupState(value: unknown): Partial<PopupStartupState> {
  if (!isRecord(value)) return {};
  const parsed: Partial<PopupStartupState> = {};
  if (isPopupStartupSelection(value['selection'])) parsed.selection = value['selection'];
  if (isPopupPage(value['lastPage'])) parsed.lastPage = value['lastPage'];
  return parsed;
}
