import { translate } from '../../../../../../platform/i18n';
import type { BorderPadding } from '../../../../../../features/highlighter/contracts';
import { editorInputClassName } from '../../constants';
import { getPaddingLabels } from '../helpers';
import type { EditorState } from '../types';

export function EditorPaddingFields({
  padding,
  updatePadding,
}: Pick<EditorState, 'padding' | 'updatePadding'>) {
  const paddingKeys: Array<keyof BorderPadding> = ['top', 'right', 'bottom', 'left'];
  const labels = getPaddingLabels();

  return (
    <div>
      <label className="mb-2 block text-xs text-[var(--sniptale-color-text-secondary)]">
        {translate('highlighter.editor.paddingLabel')}
      </label>
      <div className="grid grid-cols-4 gap-2">
        {paddingKeys.map((side) => (
          <div key={side}>
            <label className="mb-1 block text-xs uppercase tracking-wider text-[var(--sniptale-color-text-dim)]">
              {labels[side]}
            </label>
            <input
              type="number"
              min="0"
              max="50"
              value={padding[side]}
              onChange={(event) => updatePadding(side, parseInt(event.target.value, 10) || 0)}
              className={`${editorInputClassName} px-2 py-1.5 text-center`}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
