import { translate } from '../../../platform/i18n';
import type { SaveStateMeta } from './types';

const NON_TEXT_ENTRY_INPUT_TYPES = new Set([
  'button',
  'checkbox',
  'color',
  'file',
  'hidden',
  'image',
  'radio',
  'range',
  'reset',
  'submit',
]);

/**
 * Builds the canonical editor URL for the current project workspace.
 */
export function buildVideoEditorUrl(projectId: string, recordingId: string | null): string {
  const params = new URLSearchParams();

  params.set('project', projectId);
  if (recordingId) {
    params.set('id', recordingId);
  }

  return `${window.location.pathname}?${params.toString()}`;
}

/**
 * Maps store save state into user-facing label and shell styling.
 */
export function getSaveStateMeta(saveState: 'idle' | 'saving' | 'saved' | 'error'): SaveStateMeta {
  if (saveState === 'saved') {
    return {
      label: translate('common.states.saved'),
      className:
        'border-[color:color-mix(in_srgb,var(--sniptale-color-success)_30%,var(--sniptale-color-border-soft)_70%)] ' +
        'bg-[color:color-mix(in_srgb,var(--sniptale-color-success-soft)_88%,transparent)] ' +
        'text-[var(--sniptale-color-success)]',
    };
  }

  if (saveState === 'saving') {
    return {
      label: translate('common.states.saving'),
      className:
        'border-[color:color-mix(in_srgb,var(--sniptale-color-info)_30%,var(--sniptale-color-border-soft)_70%)] ' +
        'bg-[color:color-mix(in_srgb,var(--sniptale-color-info)_14%,transparent)] ' +
        'text-[var(--sniptale-color-info)]',
    };
  }

  if (saveState === 'error') {
    return {
      label: translate('common.states.error'),
      className:
        'border-[color:color-mix(in_srgb,var(--sniptale-color-danger)_30%,var(--sniptale-color-border-soft)_70%)] ' +
        'bg-[color:color-mix(in_srgb,var(--sniptale-color-danger-soft)_72%,var(--sniptale-color-surface-panel)_28%)] ' +
        'text-[var(--sniptale-color-danger)]',
    };
  }

  return {
    label: translate('common.states.draft'),
    className:
      'border-[var(--sniptale-color-border-soft)] ' +
      'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-overlay)_78%,transparent)] ' +
      'text-[var(--sniptale-color-text-primary)]',
  };
}

/**
 * Prevents global shortcuts from firing while the user edits text controls.
 */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  if (target.isContentEditable || hasContentEditableOwner(target)) {
    return true;
  }

  if (target instanceof HTMLTextAreaElement) {
    return true;
  }

  if (!(target instanceof HTMLInputElement)) {
    return false;
  }

  return isTextEntryInputType(target.type);
}

function isTextEntryInputType(type: string): boolean {
  return !NON_TEXT_ENTRY_INPUT_TYPES.has(type);
}

function hasContentEditableOwner(target: HTMLElement): boolean {
  const editableOwner = target.closest('[contenteditable]');
  return editableOwner !== null && editableOwner.getAttribute('contenteditable') !== 'false';
}
