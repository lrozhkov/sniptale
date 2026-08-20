import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { getRecording } from '../../../composition/persistence/recordings';
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
  const media = useRecordingPreview(props.recording?.id ?? null);
  const [zoom, setZoom] = useState(1);

  useEffect(() => setZoom(1), [props.recording?.id]);

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
      <MediaPreviewPlayer
        filename={props.recording.filename}
        media={media}
        thumbnailUrl={props.thumbnailUrl}
        zoom={zoom}
      />
      <label className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 text-xs">
        <Search size={14} aria-hidden />
        <span className="sr-only">{translate('videoEditor.sidebar.mediaPreviewZoomLabel')}</span>
        <input
          type="range"
          min="1"
          max="2"
          step="0.1"
          value={zoom}
          onChange={(event) => setZoom(Number(event.currentTarget.value))}
          aria-label={translate('videoEditor.sidebar.mediaPreviewZoomLabel')}
        />
        <span className="tabular-nums text-[var(--sniptale-color-text-muted)]">
          {Math.round(zoom * 100)}%
        </span>
      </label>
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

type RecordingPreviewState =
  | { status: 'idle' | 'loading' | 'unavailable'; url: null }
  | { status: 'ready'; url: string };

function useRecordingPreview(recordingId: string | null): RecordingPreviewState {
  const [state, setState] = useState<RecordingPreviewState>({ status: 'idle', url: null });

  useEffect(() => {
    let disposed = false;
    let objectUrl: string | null = null;
    if (!recordingId) {
      setState({ status: 'idle', url: null });
      return () => undefined;
    }
    setState({ status: 'loading', url: null });
    void getRecording(recordingId)
      .then((recording) => {
        if (disposed) return;
        if (!recording) {
          setState({ status: 'unavailable', url: null });
          return;
        }
        objectUrl = URL.createObjectURL(recording.file);
        setState({ status: 'ready', url: objectUrl });
      })
      .catch(() => {
        if (!disposed) setState({ status: 'unavailable', url: null });
      });
    return () => {
      disposed = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [recordingId]);

  return state;
}

function MediaPreviewPlayer(props: {
  filename: string;
  media: RecordingPreviewState;
  thumbnailUrl: string | undefined;
  zoom: number;
}) {
  if (props.media.status === 'ready') {
    return (
      <div
        className="aspect-video overflow-auto rounded-[8px] bg-black"
        data-ui="library-media-player"
      >
        <video
          className="h-full w-full origin-center object-contain transition-transform"
          style={{ transform: `scale(${props.zoom})` }}
          src={props.media.url}
          controls
          preload="metadata"
          aria-label={props.filename}
        />
      </div>
    );
  }

  return (
    <div className="relative">
      <LibraryPreviewSlot
        alt={props.filename}
        fallback="recording"
        hero
        thumbnailUrl={props.thumbnailUrl}
      />
      <div
        className="absolute inset-x-2 bottom-2 rounded-[6px] bg-black/70 px-2 py-1 text-center text-[11px] text-white"
        role={props.media.status === 'unavailable' ? 'alert' : 'status'}
      >
        {translate(
          props.media.status === 'unavailable'
            ? 'videoEditor.sidebar.mediaPreviewUnavailable'
            : 'common.states.loading'
        )}
      </div>
    </div>
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
