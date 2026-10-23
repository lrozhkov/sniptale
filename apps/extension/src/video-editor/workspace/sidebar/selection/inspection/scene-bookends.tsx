import { useState } from 'react';
import { Plus, Settings2 } from 'lucide-react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import type { VideoProject } from '../../../../../features/video/project/types/model';
import { translate } from '../../../../../platform/i18n';
import type { VideoEditorBookendPlacementResult } from '../../../../contracts/insertion';
import { useVideoEditorTimelineEditingPort } from '../../../../runtime/controller/store';
import { SceneBookendMaterials } from './scene-bookend-materials';
import { SceneBookendPreset } from './scene-bookend-preset';

/** Explicit recipes create ordinary clips; existing instances keep independent edits. */
export function SceneBookendFields(props: { project: VideoProject; side: 'intro' | 'outro' }) {
  const place = useVideoEditorTimelineEditingPort((port) => port.placeBookendMaterial);
  const [error, setError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const preset = props.project.bookendPresets?.[props.side];
  const activeId =
    preset?.mode === 'image'
      ? preset.image.assetId
      : preset?.mode === 'video'
        ? preset.video.assetId
        : null;
  const label = translate(
    props.side === 'intro'
      ? 'videoEditor.sidebar.bookendInsertIntro'
      : 'videoEditor.sidebar.bookendInsertOutro'
  );
  const insert = (assetId: string) =>
    setError(bookendPlacementError(place(assetId, props.side, props.project)));
  const settingsLabel = translate('videoEditor.sidebar.bookendPreset');
  return (
    <div className="min-w-0 space-y-2" data-ui={`video-editor.scene-bookends.${props.side}`}>
      <div className="flex flex-wrap items-center gap-2">
        {activeId ? (
          <ContentToolbarButton
            type="button"
            tone="outline"
            size="compact"
            className="flex max-w-full items-center gap-1.5"
            onClick={() => insert(activeId)}
          >
            <Plus size={16} aria-hidden="true" />
            {label}
          </ContentToolbarButton>
        ) : (
          <SceneBookendMaterials project={props.project} label={label} onChoose={insert} />
        )}
        <ContentToolbarButton
          type="button"
          tone="utility"
          size="compact"
          aria-label={settingsLabel}
          title={settingsLabel}
          aria-expanded={settingsOpen}
          onClick={() => setSettingsOpen(!settingsOpen)}
        >
          <Settings2 size={16} aria-hidden="true" />
        </ContentToolbarButton>
      </div>
      {settingsOpen && <SceneBookendPreset {...props} />}
      {error && (
        <p role="alert" className="text-xs text-[var(--sniptale-color-text-muted)]">
          {error}
        </p>
      )}
    </div>
  );
}

function bookendPlacementError(result: VideoEditorBookendPlacementResult): string | null {
  if (result.status === 'placed') return null;
  switch (result.reason) {
    case 'locked-track':
      return translate('videoEditor.sidebar.bookendLocked');
    case 'history-busy':
      return translate('videoEditor.sidebar.bookendBusy');
    case 'stale-project':
      return translate('videoEditor.sidebar.bookendStale');
    case 'history-unavailable':
    case 'invalid-cut':
    case 'invalid-project':
    case 'invalid-range':
    case 'invalid-target':
    case 'missing-material':
    case 'no-project':
    case 'occupied-target':
      return translate('common.errors.actionFailed');
  }
}
