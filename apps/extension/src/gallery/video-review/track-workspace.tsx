import { useCallback, useSyncExternalStore, type ReactNode } from 'react';
import type { ReviewInspectorTrackView } from './inspector-navigation';
import { ReviewInspectorSectionNavigation } from './inspector-section-navigation';
import { ReviewInspectorActionTray, type ReviewInspectorSection } from './inspector-sections';
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
  List,
} from 'lucide-react';
import { reviewTrackTitleKeys } from './track-items';
import type { QuickEditTrack } from '../../features/video/review/advanced/types';
import { translate } from '../../platform/i18n';

/** Lane navigation occupies the inspector header; unavailable settings have no tab. */
export function ReviewTrackWorkspaceHeading({ id, track }: { id: string; track: QuickEditTrack }) {
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
    <h2 id={`${id}-title`} className="flex min-w-0 items-center gap-2 text-sm font-semibold">
      <Icon
        size={16}
        className="shrink-0 text-[var(--sniptale-color-text-secondary)]"
        aria-hidden="true"
      />
      <span className="truncate">{title}</span>
    </h2>
  );
}

/** Lane lists stay mounted while the common section row selects individual settings. */
export function ReviewTrackWorkspace({
  id,
  track,
  view,
  list,
  sections,
}: {
  id: string;
  track: QuickEditTrack;
  view: ReviewInspectorTrackView;
  list: ReactNode;
  sections: readonly ReviewInspectorSection[];
}) {
  const read = useCallback(() => view.read(track), [view, track]);
  const { tab, section: remembered } = useSyncExternalStore(view.subscribe, read);
  const parameters = sections.filter((section) => section.id !== 'actions');
  const actions = sections.find((section) => section.id === 'actions');
  const current = parameters.find((section) => section.id === remembered) ?? parameters[0];
  const selected = tab === 'settings' && current ? current.id : 'list';
  const choices = [
    { id: 'list', label: translate('gallery.videoReview.trackTab'), icon: List },
    ...parameters,
  ];
  const choose = (value: string) => {
    view.choose(track, value);
  };
  return (
    <div
      className="flex min-h-0 min-w-0 flex-1 flex-col"
      data-ui="gallery.videoReview.trackWorkspace"
    >
      <ReviewInspectorSectionNavigation
        id={id}
        value={selected}
        items={choices}
        onChange={choose}
      />
      <div
        id={`${id}-list`}
        role="tabpanel"
        aria-label={translate('gallery.videoReview.trackTab')}
        aria-labelledby={choices.length > 1 ? `${id}-list-tab` : undefined}
        hidden={selected !== 'list'}
        style={{ display: selected !== 'list' ? 'none' : undefined }}
        className="flex min-h-0 flex-1 flex-col overflow-y-auto"
      >
        {list}
      </div>
      {selected !== 'list' && current ? (
        <div
          key={current.id}
          role="tabpanel"
          id={`${id}-${current.id}`}
          aria-labelledby={`${id}-${current.id}-tab`}
          tabIndex={0}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-3"
        >
          {current.content}
        </div>
      ) : null}
      {actions ? <ReviewInspectorActionTray>{actions.content}</ReviewInspectorActionTray> : null}
    </div>
  );
}
