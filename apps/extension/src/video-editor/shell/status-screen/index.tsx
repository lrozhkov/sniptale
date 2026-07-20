import React from 'react';
import { translate } from '../../../platform/i18n';
import { Skeleton } from '@sniptale/ui/skeleton';
import { VIDEO_EDITOR_PANEL_STYLE } from '../../chrome/styles';

type VideoEditorStatusScreenProps =
  | {
      mode: 'loading';
    }
  | {
      mode: 'error';
      error: string;
    };

/**
 * Renders non-interactive shell states for the video editor entrypoint.
 */
export function VideoEditorStatusScreen(props: VideoEditorStatusScreenProps): React.JSX.Element {
  return props.mode === 'loading' ? (
    <VideoEditorLoadingState />
  ) : (
    <VideoEditorErrorState error={props.error} />
  );
}

function VideoEditorLoadingState(): React.JSX.Element {
  return (
    <div
      className={[
        'flex min-h-screen items-center justify-center',
        'bg-[var(--sniptale-color-surface-canvas)]',
        'text-[var(--sniptale-color-text-primary)]',
      ].join(' ')}
    >
      <div
        style={VIDEO_EDITOR_PANEL_STYLE}
        className={[
          'w-[min(28rem,calc(100vw-32px))] rounded-[16px] border',
          'border-[color:var(--sniptale-color-border-soft)] px-6 py-6 shadow-sm',
        ].join(' ')}
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <Skeleton shape="circle" className="h-10 w-10 shrink-0" />
            <div className="min-w-0 flex-1 space-y-3 pt-1">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-[78%]" />
            </div>
          </div>
          <div className="space-y-2.5">
            <Skeleton className="h-10 w-full rounded-[12px]" />
            <Skeleton className="h-10 w-[62%] rounded-[12px]" />
          </div>
        </div>
        <p className="mt-4 text-sm text-[var(--sniptale-color-text-secondary)]">
          {translate('videoEditor.app.openingProject')}
        </p>
      </div>
    </div>
  );
}

function VideoEditorErrorState({ error }: { error: string }): React.JSX.Element {
  return (
    <div
      className={[
        'flex min-h-screen items-center justify-center',
        'bg-[var(--sniptale-color-surface-canvas)] px-6',
        'text-[var(--sniptale-color-text-primary)]',
      ].join(' ')}
    >
      <div
        className={[
          'max-w-lg rounded-[16px] border',
          'border-[color:color-mix(in_srgb,var(--sniptale-color-danger)_28%,var(--sniptale-color-border-soft)_72%)]',
          'bg-[color:color-mix(in_srgb,var(--sniptale-color-danger-soft)_62%,var(--sniptale-color-surface-panel)_38%)]',
          'px-8 py-7',
          'shadow-sm',
        ].join(' ')}
      >
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--sniptale-color-danger)]">
          {translate('videoEditor.app.title')}
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-[var(--sniptale-color-text-primary-strong)]">
          {translate('videoEditor.app.openFailed')}
        </h1>
        <p className="mt-3 text-sm text-[var(--sniptale-color-text-secondary)]">
          {error || translate('videoEditor.app.projectMissing')}
        </p>
      </div>
    </div>
  );
}
