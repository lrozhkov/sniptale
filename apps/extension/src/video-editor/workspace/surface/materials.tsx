import { useRef, useState } from 'react';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { FloatingChromePanel } from '@sniptale/ui/floating-chrome';
import { translate } from '../../../platform/i18n';
import { VideoEditorFileInputNodes } from '../../chrome/file-inputs';
import type { PreviewStageImportHandlers, VideoEditorImportKind } from '../../contracts/insertion';
import type { VideoProject, VideoProjectAsset } from '../../../features/video/project/types';
import type { VideoEditorMaterialPlacementResult } from '../../contracts/insertion';

export function VideoEditorMaterials(props: {
  project: VideoProject;
  onImport: PreviewStageImportHandlers;
  onAppend: (asset: VideoProjectAsset) => VideoEditorMaterialPlacementResult;
  onInsert: (asset: VideoProjectAsset) => VideoEditorMaterialPlacementResult;
  onOverlay: (asset: VideoProjectAsset) => VideoEditorMaterialPlacementResult;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [placementError, setPlacementError] = useState<string | null>(null);
  const pendingRef = useRef(false);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const audioInputRef = useRef<HTMLInputElement | null>(null);
  const selected = props.project.assets.find(({ id }) => id === selectedId) ?? null;
  const place = (action: typeof props.onAppend) => {
    if (!selected) return;
    const result = action(selected);
    setPlacementError(
      result.status === 'placed'
        ? null
        : translate(
            result.reason === 'locked-track'
              ? 'videoEditor.app.materialsLocked'
              : result.reason === 'invalid-cut'
                ? 'videoEditor.app.materialsInvalidCut'
                : 'videoEditor.app.materialsUnavailable'
          )
    );
  };
  const importFile = async (kind: VideoEditorImportKind, file: File) => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    try {
      await props.onImport[kind](file, { destination: 'materials' });
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  };
  return (
    <aside data-ui="video-editor.materials" className="h-full w-60 min-w-0 shrink-0 pr-2">
      <FloatingChromePanel className="h-full overflow-hidden">
        <div
          className="flex h-full min-h-0 flex-col gap-1.5 overflow-y-auto p-3"
          aria-busy={pending}
        >
          <h2 className="font-semibold">{translate('videoEditor.app.materialsTitle')}</h2>
          {props.project.assets.length === 0 && (
            <p className="text-xs text-[var(--sniptale-color-text-muted)]">
              {translate('videoEditor.app.materialsHint')}
            </p>
          )}
          <VideoEditorFileInputNodes
            audioInputRef={audioInputRef}
            imageInputRef={imageInputRef}
            videoInputRef={videoInputRef}
            onImportAudio={(file) => void importFile('audio', file)}
            onImportImage={(file) => void importFile('image', file)}
            onImportVideo={(file) => void importFile('video', file)}
          />
          <div className="flex flex-wrap gap-1">
            <ProductActionButton
              compact
              tone="secondary"
              disabled={pending}
              onClick={() => videoInputRef.current?.click()}
            >
              {translate('videoEditor.app.materialsVideo')}
            </ProductActionButton>
            <ProductActionButton
              compact
              tone="secondary"
              disabled={pending}
              onClick={() => imageInputRef.current?.click()}
            >
              {translate('videoEditor.app.materialsImage')}
            </ProductActionButton>
            <ProductActionButton
              compact
              tone="secondary"
              disabled={pending}
              onClick={() => audioInputRef.current?.click()}
            >
              {translate('videoEditor.app.materialsAudio')}
            </ProductActionButton>
          </div>
          {pending && <p role="status">{translate('videoEditor.app.materialsLoading')}</p>}
          <div className="min-h-10 flex-1 space-y-1 overflow-y-auto">
            {props.project.assets.length === 0 && (
              <p className="text-sm">{translate('videoEditor.app.materialsEmpty')}</p>
            )}
            {props.project.assets.map((asset) => (
              <ProductActionButton
                key={asset.id}
                compact
                tone="toggle"
                active={selected?.id === asset.id}
                className="w-full min-w-0 justify-start"
                aria-pressed={selected?.id === asset.id}
                onClick={() => {
                  setSelectedId(asset.id);
                  setPlacementError(null);
                }}
              >
                <span className="truncate" title={asset.name}>
                  {asset.name}
                </span>
              </ProductActionButton>
            ))}
          </div>
          {placementError && (
            <p role="alert" className="text-sm text-[var(--sniptale-color-danger)]">
              {placementError}
            </p>
          )}
          <ProductActionButton
            compact
            disabled={!selected || pending}
            onClick={() => place(props.onAppend)}
          >
            {translate('videoEditor.app.materialsAppend')}
          </ProductActionButton>
          <ProductActionButton
            compact
            disabled={!selected || pending}
            onClick={() => place(props.onInsert)}
            aria-describedby="material-insert-hint"
          >
            {translate('videoEditor.app.materialsInsert')}
          </ProductActionButton>
          <p id="material-insert-hint" className="text-xs text-[var(--sniptale-color-text-muted)]">
            {translate('videoEditor.app.materialsInsertHint')}
          </p>
          <ProductActionButton
            compact
            disabled={!selected || pending}
            onClick={() => place(props.onOverlay)}
          >
            {translate('videoEditor.app.materialsOverlay')}
          </ProductActionButton>
        </div>
      </FloatingChromePanel>
    </aside>
  );
}
