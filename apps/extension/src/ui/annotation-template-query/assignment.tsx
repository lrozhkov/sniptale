import type { AnnotationTemplateTagId } from '@sniptale/runtime-contracts/highlighter/annotation-template-tags';
import { translate } from '../../platform/i18n';
import { useAnnotationTemplateTagState } from './state';
import { getAnnotationTemplateTagDisplayName } from './tag-display-name';

export function AnnotationTemplateTagAssignment(props: {
  onChange: (tagIds: AnnotationTemplateTagId[]) => void;
  value: readonly AnnotationTemplateTagId[];
}) {
  const tagState = useAnnotationTemplateTagState();
  return (
    <fieldset className="grid gap-2">
      <legend className="text-xs font-semibold text-[var(--sniptale-color-text-secondary)]">
        {translate('highlighter.templateTags.assignmentLabel')}
      </legend>
      {tagState.state.tags.length === 0 ? (
        <div className="text-xs text-[var(--sniptale-color-text-dim)]">
          {translate('highlighter.templateTags.assignmentEmpty')}
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {tagState.state.tags.map((tag) => {
            const selected = props.value.includes(tag.id);
            return (
              <button
                aria-pressed={selected}
                className={[
                  'rounded-full border px-2.5 py-1 text-xs transition',
                  selected
                    ? 'border-[var(--sniptale-color-border-accent-strong)] bg-[var(--sniptale-color-accent-soft)]'
                    : 'border-[var(--sniptale-color-border-soft)] bg-[var(--sniptale-color-surface-input)]',
                ].join(' ')}
                disabled={!selected && props.value.length >= 8}
                key={tag.id}
                onClick={() =>
                  props.onChange(
                    selected
                      ? props.value.filter((tagId) => tagId !== tag.id)
                      : [...props.value, tag.id]
                  )
                }
                type="button"
              >
                {getAnnotationTemplateTagDisplayName(tag)}
              </button>
            );
          })}
        </div>
      )}
    </fieldset>
  );
}
