import type { AnnotationTemplateTag } from '@sniptale/runtime-contracts/highlighter/annotation-template-tags';
import type { ReactNode } from 'react';

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
      className={[
        'inline-flex min-w-0 shrink flex-nowrap gap-1 overflow-hidden',
        props.className ?? '',
      ].join(' ')}
      data-ui="shared.annotation-template-tags.chips"
      title={fullLabel}
    >
      {visible.map((tag) => (
        <span
          aria-hidden="true"
          className={[
            'min-w-0 max-w-24 shrink truncate rounded-full px-2 py-0.5 text-[10px]',
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
            'shrink-0 rounded-full px-2 py-0.5 text-[10px]',
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

export function AnnotationTemplatePresetMetaLine(props: {
  name: ReactNode;
  tags: readonly AnnotationTemplateTag[];
}) {
  return (
    <span
      className="flex min-w-0 items-center gap-1.5 overflow-hidden"
      data-ui="shared.annotation-template-tags.preset-meta-line"
    >
      <span className="min-w-0 flex-1">{props.name}</span>
      <AnnotationTemplateTagChips className="max-w-[55%]" tags={props.tags} />
    </span>
  );
}
