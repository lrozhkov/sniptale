import { Plus } from 'lucide-react';

import { settingsAddButtonClassName } from '../classes';
import type { SettingsCollectionProps } from './types';

type HeaderProps = Pick<
  SettingsCollectionProps,
  'addAction' | 'description' | 'title' | 'toolbarControls'
>;

export function SettingsCollectionHeader(props: HeaderProps) {
  if (
    props.title === undefined &&
    props.description === undefined &&
    props.toolbarControls === undefined &&
    props.addAction === undefined
  ) {
    return null;
  }
  return (
    <div
      className="flex min-w-0 items-center justify-between gap-3"
      data-ui="settings.collection.toolbar"
    >
      <div className="min-w-0 flex-1">
        {props.toolbarControls === undefined ? (
          <>
            {props.title === undefined ? null : (
              <h2 className="text-sm font-semibold">{props.title}</h2>
            )}
            {props.description === undefined ? null : (
              <p className="mt-1 text-xs text-[var(--sniptale-color-text-dim)]">
                {props.description}
              </p>
            )}
          </>
        ) : (
          props.toolbarControls
        )}
      </div>
      <div className="flex flex-none items-center gap-3">
        {props.addAction === undefined ? null : (
          <button
            type="button"
            className={`${settingsAddButtonClassName} !w-auto gap-1.5`}
            disabled={props.addAction.disabled}
            onClick={props.addAction.onInvoke}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{props.addAction.label}</span>
          </button>
        )}
      </div>
    </div>
  );
}
