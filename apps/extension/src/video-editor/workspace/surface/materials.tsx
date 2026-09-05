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
  headerAction?: React.ReactNode;
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
    <aside data-ui="video-editor.materials" className="h-full min-w-0">
      <FloatingChromePanel className="h-full overflow-hidden">
        <div className="flex h-full min-h-0 flex-col" aria-busy={pending}>
          <div
            className={[
              'flex h-9 shrink-0 items-center justify-between gap-2 border-b',
              'border-[color:var(--sniptale-color-border-soft)] px-2.5',
            ].join(' ')}
          >
            <h2 className="text-[13px] font-semibold">
              {translate('videoEditor.app.materialsTitle')}
            </h2>
            {props.headerAction}
          </div>
          <VideoEditorFileInputNodes
            audioInputRef={audioInputRef}
            imageInputRef={imageInputRef}
            videoInputRef={videoInputRef}
            onImportAudio={(file) => void importFile('audio', file)}
            onImportImage={(file) => void importFile('image', file)}
            onImportVideo={(file) => void importFile('video', file)}
          />
          <div
            className={[
              'flex shrink-0 items-center gap-1 border-b',
              'border-[color:var(--sniptale-color-border-soft)] px-2 py-1',
            ].join(' ')}
          >
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
          <div className="min-h-10 flex-1 space-y-1 overflow-y-auto p-2">
            {props.project.assets.length === 0 && (
              <div className="px-1 py-4 text-center">
                <p className="text-xs font-medium">{translate('videoEditor.app.materialsEmpty')}</p>
                <p className="mt-2 text-xs text-[var(--sniptale-color-text-muted)]">
                  {translate('videoEditor.app.materialsHint')}
                </p>
              </div>
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
