import { type ReactNode } from 'react';
import {
  Film,
  Volume2,
  Keyboard,
  Mouse,
  MousePointer2,
  Focus,
  Shapes,
  Captions,
  Mic,
  Music,
  Webcam,
  History,
  Settings2,
} from 'lucide-react';
import { reviewTrackTitleKeys } from './track-items';
import type { QuickEditTrack } from '../../features/video/review/advanced/types';
import { translate } from '../../platform/i18n';
import { ReviewButton, reviewTextButtonClassName } from './controls';

/** A lane retains its tab and mounted collection while a selected element owns the inspector. */
export function ReviewTrackWorkspace({
  track,
  id,
  list,
  settings,
  tab: requestedTab,
}: {
  track: QuickEditTrack;
  id: string;
  list: ReactNode;
  settings?: ReactNode;
  tab: 'list' | 'settings';
}) {
  const tab = settings ? requestedTab : 'list';
  return (
    <div
      className="flex min-h-0 flex-1 flex-col gap-2"
      data-ui="gallery.videoReview.trackWorkspace"
    >
      <div
        role="tabpanel"
        id={`${id}-list`}
        aria-labelledby={`${id}-list-tab`}
        aria-label={translate('gallery.videoReview.trackList')}
        hidden={tab !== 'list'}
        style={{ display: tab !== 'list' ? 'none' : undefined }}
        className="flex min-h-0 flex-1 flex-col overflow-y-auto"
        key={`list:${track}`}
      >
        {list}
      </div>
      {tab === 'settings' ? (
        <div
          role="tabpanel"
          id={`${id}-settings`}
          aria-labelledby={`${id}-settings-tab`}
          aria-label={translate('gallery.videoReview.trackSettingsTab')}
          className="min-h-0 flex-1 overflow-y-auto"
          key={`settings:${track}`}
        >
          {settings}
        </div>
      ) : null}
    </div>
  );
}

/** Lane navigation occupies the inspector header; unavailable settings have no tab. */
export function ReviewTrackWorkspaceTabs({
  id,
  track,
  tab,
  hasSettings,
  onTabChange,
}: {
  id: string;
  track: QuickEditTrack;
  tab: 'list' | 'settings';
  hasSettings: boolean;
  onTabChange(tab: 'list' | 'settings'): void;
}) {
  const title = translate(reviewTrackTitleKeys[track]);
  const Icon = {
    source: Film,
    originalAudio: Volume2,
    keyboard: Keyboard,
    mouse: Mouse,
    cursorMotion: MousePointer2,
    zoom: Focus,
    annotationEffects: Shapes,
    text: Captions,
    voiceover: Mic,
    music: Music,
    webcam: Webcam,
    actions: History,
  }[track];
  return (
    <div
      role="tablist"
      aria-label={translate('gallery.videoReview.trackSections')}
      className="flex shrink-0 items-center gap-1"
      onKeyDown={(event) => {
        if (!hasSettings) return;
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const next =
          event.key === 'Home'
            ? 'list'
            : event.key === 'End'
              ? 'settings'
              : tab === 'list'
                ? 'settings'
                : 'list';
        onTabChange(next);
        event.currentTarget.querySelector<HTMLButtonElement>(`[data-lane-tab="${next}"]`)?.focus();
      }}
    >
      <ReviewButton
        role="tab"
        id={`${id}-list-tab`}
        data-lane-tab="list"
        aria-controls={`${id}-list`}
        tabIndex={tab === 'list' ? 0 : -1}
        aria-selected={tab === 'list'}
        label={title}
        className={[
          reviewTextButtonClassName,
          'aria-selected:!bg-[var(--sniptale-color-surface-hover)]',
          'aria-selected:!text-[var(--sniptale-color-text-primary)]',
        ].join(' ')}
        onClick={() => onTabChange('list')}
      >
        <Icon size={14} aria-hidden="true" />
        {title}
      </ReviewButton>
      {hasSettings ? (
        <ReviewButton
          role="tab"
          id={`${id}-settings-tab`}
          data-lane-tab="settings"
          aria-controls={`${id}-settings`}
          tabIndex={tab === 'settings' ? 0 : -1}
          aria-selected={tab === 'settings'}
          label={translate('gallery.videoReview.trackSettingsTab')}
          className={[
            reviewTextButtonClassName,
            'aria-selected:!bg-[var(--sniptale-color-surface-hover)]',
            'aria-selected:!text-[var(--sniptale-color-text-primary)]',
          ].join(' ')}
          onClick={() => onTabChange('settings')}
        >
          <Settings2 size={14} aria-hidden="true" />
          {translate('gallery.videoReview.trackSettingsTab')}
        </ReviewButton>
      ) : null}
    </div>
  );
}
