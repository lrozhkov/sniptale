import { useState, type CSSProperties, type ReactNode } from 'react';
import { translate } from '../../platform/i18n';

export interface BackgroundThumbnail {
  id: string;
  name: string;
  style?: CSSProperties;
  content?: ReactNode;
  active?: boolean;
  disabled?: boolean;
}
/** Compact ordered choices; the final cell reveals the next thirty items. */
export function BackgroundThumbnails(props: {
  items: readonly BackgroundThumbnail[];
  label: string;
  onSelect(id: string): void;
  disabled?: boolean;
  dataUi?: string;
}) {
  const [count, setCount] = useState(9);
  return (
    <div
      className="grid grid-cols-5 gap-2"
      role="group"
      aria-label={props.label}
      data-ui={props.dataUi}
    >
      {props.items.slice(0, count).map((item) => (
        <button
          key={item.id}
          type="button"
          title={item.name}
          aria-label={item.name}
          aria-pressed={item.active ?? false}
          disabled={props.disabled || item.disabled}
          className={[
            'h-8 min-w-0 overflow-hidden rounded border border-[var(--sniptale-color-border-subtle)]',
            'transition-opacity hover:opacity-80 disabled:opacity-40 aria-pressed:outline',
            'aria-pressed:outline-1 aria-pressed:outline-offset-1',
            'aria-pressed:outline-[var(--sniptale-color-text-secondary)] focus-visible:outline',
            'focus-visible:outline-2 focus-visible:outline-[var(--sniptale-color-accent)]',
          ].join(' ')}
          style={item.style}
          onClick={() => props.onSelect(item.id)}
        >
          {item.content}
        </button>
      ))}
      {count < props.items.length && (
        <button
          type="button"
          className={[
            'h-8 min-w-0 rounded border border-[var(--sniptale-color-border-subtle)]',
            'text-[var(--sniptale-color-text-secondary)] hover:bg-[var(--sniptale-color-surface-hover)]',
          ].join(' ')}
          title={translate('settings.editor.backgrounds.showMore')}
          aria-label={translate('settings.editor.backgrounds.showMore')}
          onClick={() => setCount((value) => value + 30)}
        >
          …
        </button>
      )}
    </div>
  );
}
