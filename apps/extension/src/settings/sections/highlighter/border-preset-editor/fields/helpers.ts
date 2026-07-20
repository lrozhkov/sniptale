import { translate } from '../../../../../platform/i18n';
import type { BorderPadding } from '../../../../../features/highlighter/contracts';
import type { EditorState } from './types';

export function getEditorPreviewFrameClassName(cssError: EditorState['cssError']): string {
  return cssError
    ? 'border-2 border-[color:color-mix(in_srgb,var(--sniptale-color-danger)_64%,transparent)]'
    : 'border border-[var(--sniptale-color-border-soft)]';
}

export function getEditorStyleOptions() {
  return [
    { label: translate('highlighter.editor.styleSolid'), value: 'solid' },
    { label: translate('highlighter.editor.styleDashed'), value: 'dashed' },
    { label: translate('highlighter.editor.styleDotted'), value: 'dotted' },
  ] as const;
}

export function getPaddingLabels(): Record<keyof BorderPadding, string> {
  return {
    top: translate('highlighter.editor.paddingTop'),
    right: translate('highlighter.editor.paddingRight'),
    bottom: translate('highlighter.editor.paddingBottom'),
    left: translate('highlighter.editor.paddingLeft'),
  };
}
