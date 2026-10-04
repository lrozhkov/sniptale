import { translate } from '../../../../platform/i18n';
import type { EditorInspectorFramePanelProps } from '../types';

type BackgroundModeProps = Pick<
  EditorInspectorFramePanelProps,
  'frameDraft' | 'lastFillModeRef' | 'setBackgroundMode'
>;

export function EditorInspectorFrameBackgroundModeControl(props: BackgroundModeProps) {
  return (
    <div
      role="group"
      aria-label={translate('editor.scene.backgroundTypeSection')}
      data-ui="editor.frame.background-mode"
      className="grid grid-cols-3 gap-1 rounded-lg bg-[var(--sniptale-color-surface-hover)] p-1"
    >
      {(['color', 'gradient', 'image'] as const).map((mode) => (
        <button
          key={mode}
          type="button"
          aria-pressed={props.frameDraft.backgroundMode === mode}
          data-ui={`editor.frame.background-mode.${mode}`}
          className={[
            'min-w-0 rounded-md px-2 py-1.5 text-xs',
            'focus-visible:outline-2 focus-visible:outline-[var(--sniptale-color-focus-ring)]',
            props.frameDraft.backgroundMode === mode
              ? [
                  'bg-[var(--sniptale-color-surface-panel)] font-medium shadow-sm',
                  'text-[var(--sniptale-color-text-primary)]',
                ].join(' ')
              : [
                  'text-[var(--sniptale-color-text-secondary)]',
                  'hover:bg-[var(--sniptale-color-surface-panel)]',
                ].join(' '),
          ].join(' ')}
          onClick={() => props.setBackgroundMode(mode)}
        >
          {translate(
            mode === 'color'
              ? 'editor.compact.frameBackgroundModeColor'
              : mode === 'gradient'
                ? 'editor.compact.frameBackgroundModeGradient'
                : 'editor.compact.frameBackgroundModeImage'
          )}
        </button>
      ))}
    </div>
  );
}
