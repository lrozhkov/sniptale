import type { PageStyleInspectorViewState } from '../types';

export function ImageSelectionPreview(props: { state: PageStyleInspectorViewState }) {
  const element = props.state.selection?.element;
  if (!(element instanceof HTMLImageElement) || (!element.currentSrc && !element.src)) {
    return null;
  }

  return (
    <div
      className={[
        'relative aspect-[16/9] overflow-hidden rounded-[10px] border',
        'border-[color:var(--sniptale-color-border-soft)] bg-[var(--sniptale-color-surface-input)]',
      ].join(' ')}
    >
      <img
        alt=""
        className="h-full w-full object-contain"
        draggable={false}
        src={element.currentSrc || element.src}
      />
    </div>
  );
}
