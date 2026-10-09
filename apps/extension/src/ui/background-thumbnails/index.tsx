import { Fragment, useState, type CSSProperties, type ReactNode } from 'react';
import { Ellipsis, LoaderCircle } from 'lucide-react';
import { translate } from '../../platform/i18n';

export interface BackgroundThumbnail {
  id: string;
  name: string;
  /** Starts a visible group without counting its heading as a paginated choice. */
  groupLabel?: string | undefined;
  style?: CSSProperties;
  content?: ReactNode;
  active?: boolean;
  loading?: boolean;
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
        <Fragment key={item.id}>
          {item.groupLabel && (
            <span
              data-ui="shared.ui.backgroundThumbnails.group"
              className="col-span-full text-xs text-[var(--sniptale-color-text-secondary)]"
            >
              {item.groupLabel}
            </span>
          )}
          <button
            type="button"
            title={item.name}
            aria-label={item.name}
            aria-pressed={item.active ?? false}
            aria-busy={item.loading ?? false}
            disabled={props.disabled || item.disabled}
            className={[
              'relative h-8 min-w-0 overflow-hidden rounded border border-[var(--sniptale-color-border-subtle)]',
              'transition-opacity hover:opacity-80 aria-pressed:outline',
              item.loading ? 'disabled:opacity-100' : 'disabled:opacity-40',
              'aria-pressed:outline-1 aria-pressed:outline-offset-1',
              'aria-pressed:outline-[var(--sniptale-color-text-secondary)] focus-visible:outline',
              'focus-visible:outline-2 focus-visible:outline-[var(--sniptale-color-accent)]',
            ].join(' ')}
            style={item.style}
            onClick={() => props.onSelect(item.id)}
          >
            {item.content}
            {item.loading && (
              <span
                role="status"
                aria-label={translate('settings.editor.backgrounds.loading')}
                className="absolute inset-0 flex items-center justify-center
                bg-[var(--sniptale-color-surface-panel)]/70 text-[var(--sniptale-color-text-primary)]"
              >
                <LoaderCircle
                  size={14}
                  className="animate-spin motion-reduce:animate-none"
                  aria-hidden="true"
                />
              </span>
            )}
          </button>
        </Fragment>
      ))}
      {count < props.items.length && (
        <button
          type="button"
          className={[
            'flex h-8 min-w-0 items-center justify-center rounded',
            'text-[var(--sniptale-color-text-primary)] hover:bg-[var(--sniptale-color-surface-hover)]',
            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--sniptale-color-accent)]',
          ].join(' ')}
          title={translate('settings.editor.backgrounds.showMore')}
          aria-label={translate('settings.editor.backgrounds.showMore')}
          onClick={() => setCount((value) => value + 30)}
        >
          <Ellipsis size={20} strokeWidth={3} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
