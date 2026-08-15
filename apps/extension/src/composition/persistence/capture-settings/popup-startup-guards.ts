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

function parsePopupPage(value: unknown): PopupStartupState['lastPage'] | null {
  if (value === 'home') return 'screenshots';
  return value === 'screenshots' ||
    value === 'video' ||
    value === 'menu' ||
    value === 'tools' ||
    value === 'export'
    ? value
    : null;
}

export function parseStoredPopupStartupState(value: unknown): Partial<PopupStartupState> {
  if (!isRecord(value)) return {};
  const parsed: Partial<PopupStartupState> = {};
  if (isPopupStartupSelection(value['selection'])) parsed.selection = value['selection'];
  const lastPage = parsePopupPage(value['lastPage']);
  if (lastPage) parsed.lastPage = lastPage;
  return parsed;
}
