import { settingsAddButtonClassName } from '../classes';
import type { SettingsCollectionProps } from './types';

type HeaderProps = Pick<
  SettingsCollectionProps,
  'addAction' | 'countLabel' | 'description' | 'title'
>;

export function SettingsCollectionHeader(props: HeaderProps) {
  if (
    props.title === undefined &&
    props.description === undefined &&
    props.countLabel === undefined &&
    props.addAction === undefined
  ) {
    return null;
  }
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        {props.title === undefined ? null : (
          <h2 className="text-sm font-semibold">{props.title}</h2>
        )}
        {props.description === undefined ? null : (
          <p className="mt-1 text-xs text-[var(--sniptale-color-text-dim)]">{props.description}</p>
        )}
      </div>
      <div className="flex flex-none items-center gap-3">
        {props.countLabel === undefined ? null : (
          <span className="text-xs text-[var(--sniptale-color-text-dim)]">{props.countLabel}</span>
        )}
        {props.addAction === undefined ? null : (
          <button
            type="button"
            className={settingsAddButtonClassName}
            disabled={props.addAction.disabled}
            onClick={props.addAction.onInvoke}
          >
            {props.addAction.label}
          </button>
        )}
      </div>
    </div>
  );
}
