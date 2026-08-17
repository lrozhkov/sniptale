import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import type { AnnotationTemplateTagId } from '@sniptale/runtime-contracts/highlighter/annotation-template-tags';
import { ANNOTATION_TEMPLATE_TAG_LIMITS } from '@sniptale/runtime-contracts/highlighter/annotation-template-tags';
import { translate } from '../../platform/i18n';
import { useAnnotationTemplateTagState } from './state';
import { getAnnotationTemplateTagDisplayName } from './tag-display-name';
import { FloatingFilterMenu, useFloatingFilterMenu } from './floating-filter-menu';

export function AnnotationTemplateTagAssignment(props: {
  onChange: (tagIds: AnnotationTemplateTagId[]) => void;
  value: readonly AnnotationTemplateTagId[];
}) {
  const tagState = useAnnotationTemplateTagState();
  const [open, setOpen] = useState(false);
  const floating = useFloatingFilterMenu(open, setOpen);
  const selectedLabels = tagState.state.tags
    .filter((tag) => props.value.includes(tag.id))
    .map((tag) => getAnnotationTemplateTagDisplayName(tag));
  const empty = tagState.state.tags.length === 0;
  return (
    <fieldset className="grid gap-1.5" data-ui="shared.annotation-template-tag-assignment">
      <legend className="text-xs font-semibold text-[var(--sniptale-color-text-secondary)]">
        {translate('highlighter.templateTags.assignmentLabel')}
      </legend>
      <div className="relative" data-floating-ui-owner-id={floating.ownerId} ref={floating.rootRef}>
        <button
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label={translate('highlighter.templateTags.assignmentLabel')}
          className={[
            'flex h-9 w-full items-center justify-between gap-2 border-0 bg-transparent p-0',
            'text-left text-xs text-[var(--sniptale-color-text-primary)]',
            'focus-visible:outline-none focus-visible:ring-2',
            'focus-visible:ring-[var(--sniptale-color-focus-ring)]',
            empty ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
          ].join(' ')}
          disabled={empty}
          onClick={(event) => {
            if (!open) {
              floating.focusFirstItemOnOpenRef.current = event.detail === 0;
              floating.position();
            }
            setOpen((value) => !value);
          }}
          ref={floating.triggerRef}
          type="button"
        >
          <span
            className={
              selectedLabels.length === 0 ? 'text-[var(--sniptale-color-text-dim)]' : 'truncate'
            }
          >
            {selectedLabels.length > 0
              ? selectedLabels.join(', ')
              : translate(
                  empty
                    ? 'highlighter.templateTags.assignmentEmpty'
                    : 'highlighter.templateTags.assignmentPlaceholder'
                )}
          </span>
          <ChevronDown
            aria-hidden="true"
            className={open ? 'rotate-180 transition-transform' : 'transition-transform'}
            size={14}
          />
        </button>
        <FloatingFilterMenu
          activeFilterTagIds={props.value}
          clearLabel={translate('highlighter.templateTags.clearAssignment')}
          maximumSelected={ANNOTATION_TEMPLATE_TAG_LIMITS.maximumTagsPerTemplate}
          menuRef={floating.menuRef}
          onActiveFilterTagIdsChange={props.onChange}
          open={open}
          ownerId={floating.ownerId}
          style={floating.style}
          tags={tagState.state.tags}
          triggerRef={floating.triggerRef}
        />
      </div>
    </fieldset>
  );
}
