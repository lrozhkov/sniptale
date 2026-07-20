import { translate } from '../../../platform/i18n';
import { AddRecordingAction, LibraryPreviewSlot } from '../items/cards';
import type { RecordingListItem } from '../contracts/items';
import { formatDuration, formatSize } from '../../chrome/display';
import { formatDimensions } from '../items/cards';

export function MediaPreviewPane(props: {
  onAddRecording: (recordingId: string) => void;
  recording: RecordingListItem | null;
  thumbnailUrl: string | undefined;
}) {
  if (!props.recording) {
    return (
      <aside data-ui="video-editor.library.media-preview" className={getPreviewPaneClassName()}>
        <p className="text-sm font-semibold text-[var(--sniptale-color-text-primary)]">
          {translate('videoEditor.sidebar.libraryMediaPreviewTitle')}
        </p>
        <p className="mt-2 text-xs text-[var(--sniptale-color-text-muted)]">
          {translate('videoEditor.sidebar.libraryMediaPreviewEmpty')}
        </p>
      </aside>
    );
  }

  return (
    <aside data-ui="video-editor.library.media-preview" className={getPreviewPaneClassName()}>
      <LibraryPreviewSlot
        alt={props.recording.filename}
        fallback="recording"
        hero
        thumbnailUrl={props.thumbnailUrl}
      />
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-[var(--sniptale-color-text-primary)]">
          {props.recording.filename}
        </p>
        <dl className="mt-2 grid gap-1.5 text-xs text-[var(--sniptale-color-text-secondary)]">
          {getMediaPreviewDetails(props.recording).map((item) => (
            <div key={item.label} className="grid grid-cols-[5rem_minmax(0,1fr)] gap-2">
              <dt className="text-[var(--sniptale-color-text-muted)]">{item.label}</dt>
              <dd className="truncate text-[var(--sniptale-color-text-primary)]">{item.value}</dd>
            </div>
          ))}
        </dl>
      </div>
      <AddRecordingAction
        fullWidth
        onAddRecording={props.onAddRecording}
        recordingId={props.recording.id}
        variant="card"
      />
    </aside>
  );
}

function getPreviewPaneClassName(): string {
  return [
    'grid content-start gap-3 rounded-[12px] border p-3',
    'border-[color:var(--sniptale-color-border-soft)]',
    'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_86%,transparent)]',
  ].join(' ');
}

function getMediaPreviewDetails(recording: RecordingListItem) {
  return [
    {
      label: translate('videoEditor.sidebar.mediaPreviewTypeLabel'),
      value: recording.mimeType,
    },
    {
      label: translate('videoEditor.sidebar.mediaPreviewDurationLabel'),
      value: recording.duration === null ? '—' : formatDuration(recording.duration),
    },
    {
      label: translate('videoEditor.sidebar.mediaPreviewSizeLabel'),
      value: formatSize(recording.size),
    },
    {
      label: translate('videoEditor.sidebar.mediaPreviewFrameLabel'),
      value: formatDimensions(recording.width, recording.height) ?? '—',
    },
  ];
}
