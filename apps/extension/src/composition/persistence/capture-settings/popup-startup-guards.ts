import { isRecord } from '../infrastructure/guards/primitives';
import {
  POPUP_STARTUP_TARGETS,
  type PopupStartupSelection,
  type PopupStartupState,
  type PopupStartupTarget,
} from './popup-startup-contracts';

// policyStateIds: [] - popup startup targets are an immutable parser allowlist, not authority state.
const TARGETS = new Set<string>(POPUP_STARTUP_TARGETS);
const LEGACY_TARGETS: Record<string, PopupStartupSelection> = {
  'screenshots:tools': 'tools',
  'video:area': 'video:tab',
};

function isPopupStartupTarget(value: string): value is PopupStartupTarget {
  return TARGETS.has(value);
}

function parsePopupStartupSelection(value: unknown): PopupStartupSelection | null {
  if (value === 'remember-last') return value;
  if (typeof value !== 'string') return null;
  if (isPopupStartupTarget(value)) return value;
  return LEGACY_TARGETS[value] ?? null;
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

function parseExportDestination(value: unknown): PopupStartupState['lastExportDestination'] | null {
  return value === 'export' || value === 'save' ? value : null;
}

export function parseStoredPopupStartupState(value: unknown): Partial<PopupStartupState> {
  if (!isRecord(value)) return {};
  const parsed: Partial<PopupStartupState> = {};
  const selection = parsePopupStartupSelection(value['selection']);
  if (selection) parsed.selection = selection;
  const lastPage = parsePopupPage(value['lastPage']);
  if (lastPage) parsed.lastPage = lastPage;
  const lastExportDestination = parseExportDestination(value['lastExportDestination']);
  if (lastExportDestination) parsed.lastExportDestination = lastExportDestination;
  return parsed;
}
