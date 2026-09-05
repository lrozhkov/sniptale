import { useRef, useState } from 'react';
import { Film, Image, Music } from 'lucide-react';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { FloatingChromePanel } from '@sniptale/ui/floating-chrome';
import { translate } from '../../../platform/i18n';
import { VideoEditorFileInputNodes } from '../../chrome/file-inputs';
import type { PreviewStageImportHandlers, VideoEditorImportKind } from '../../contracts/insertion';
import type { VideoProject, VideoProjectAsset } from '../../../features/video/project/types';

const MATERIAL_IMPORT_OPTIONS = [
  { kind: 'video', icon: Film, labelKey: 'videoEditor.app.materialsVideo' },
  { kind: 'image', icon: Image, labelKey: 'videoEditor.app.materialsImage' },
  { kind: 'audio', icon: Music, labelKey: 'videoEditor.app.materialsAudio' },
] as const;

export function VideoEditorMaterials(props: {
  project: VideoProject;
  onImport: PreviewStageImportHandlers;
  selectedAssetId: string | null;
  onSelect: (asset: VideoProjectAsset) => void;
}) {
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const audioInputRef = useRef<HTMLInputElement | null>(null);
  const inputRefs = { video: videoInputRef, image: imageInputRef, audio: audioInputRef };
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
    <aside data-ui="video-editor.materials" className="h-full w-52 min-w-0 shrink-0 pr-2">
      <FloatingChromePanel className="h-full overflow-hidden">
        <div className="flex h-full min-h-0 flex-col gap-1.5 p-2.5" aria-busy={pending}>
          <h2 className="text-[13px] font-semibold">
            {translate('videoEditor.app.materialsTitle')}
          </h2>
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
            {MATERIAL_IMPORT_OPTIONS.map(({ kind, icon: Icon, labelKey }) => (
              <ProductActionButton
                key={kind}
                compact
                tone="secondary"
                disabled={pending}
                title={translate(labelKey)}
                onClick={() => inputRefs[kind].current?.click()}
              >
                <Icon size={16} aria-hidden="true" />
                <span className="sr-only">{translate(labelKey)}</span>
              </ProductActionButton>
            ))}
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
                active={props.selectedAssetId === asset.id}
                className="w-full min-w-0 justify-start text-left"
                aria-pressed={props.selectedAssetId === asset.id}
                onClick={() => props.onSelect(asset)}
              >
                <span className="truncate" title={asset.name}>
                  {asset.name}
                </span>
              </ProductActionButton>
            ))}
          </div>
        </div>
      </FloatingChromePanel>
    </aside>
  );
}
