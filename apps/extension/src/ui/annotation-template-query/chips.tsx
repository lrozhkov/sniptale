import type { AnnotationTemplateTag } from '@sniptale/runtime-contracts/highlighter/annotation-template-tags';

export function AnnotationTemplateTagChips(props: {
  className?: string;
  tags: readonly AnnotationTemplateTag[];
}) {
  if (props.tags.length === 0) return null;
  const visible = props.tags.slice(0, 2);
  const hiddenCount = props.tags.length - visible.length;
  const fullLabel = props.tags.map((tag) => tag.label).join(', ');
  return (
    <span
      aria-label={fullLabel}
      className={['flex min-w-0 flex-wrap gap-1', props.className ?? ''].join(' ')}
      data-ui="shared.annotation-template-tags.chips"
      title={fullLabel}
    >
      {visible.map((tag) => (
        <span
          aria-hidden="true"
          className={[
            'max-w-24 truncate rounded-full px-2 py-0.5 text-[10px]',
            'bg-[var(--sniptale-color-surface-muted)]',
            'text-[var(--sniptale-color-text-muted)]',
          ].join(' ')}
          key={tag.id}
        >
          {tag.label}
        </span>
      ))}
      {hiddenCount > 0 ? (
        <span
          aria-hidden="true"
          className={[
            'rounded-full px-2 py-0.5 text-[10px]',
            'bg-[var(--sniptale-color-surface-muted)]',
            'text-[var(--sniptale-color-text-muted)]',
          ].join(' ')}
        >
          +{hiddenCount}
        </span>
      ) : null}
    </span>
  );
}
