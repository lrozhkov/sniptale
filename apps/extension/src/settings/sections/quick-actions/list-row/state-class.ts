import type { QuickActionsSectionState } from '../section';

export function getQuickActionRowStateClassName(props: {
  action: QuickActionsSectionState['actions'][number];
  draggedId: string | null;
  dragOverId: string | null;
}): string {
  return [
    !props.action.status && 'opacity-50',
    props.draggedId === props.action.id && 'scale-[0.98] opacity-50',
    props.dragOverId === props.action.id &&
      'border-t-2 border-[var(--sniptale-color-border-accent-strong)]',
  ]
    .filter(Boolean)
    .join(' ');
}
