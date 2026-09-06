import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { isComposedEventWithinAnyElement } from '@sniptale/ui/dom-events';
import { useGlassSelectOverlay } from '@sniptale/ui/glass-select/overlay-state';
import {
  resolveThemeSafePortalTarget,
  useResolvedPortalTheme,
} from '@sniptale/ui/theme/safe-portal';
import { ProductToolbarMenu, ProductToolbarMenuItem } from '@sniptale/ui/product-menus/toolbar';
import { ChevronDown, Film, FolderKanban, Image, Music, Upload } from 'lucide-react';
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
  headerTitle?: React.ReactNode;
  onOpenLibrary: () => void;
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
    <aside data-ui="video-editor.materials" className="@container/materials h-full min-w-0">
      <FloatingChromePanel className="h-full overflow-hidden">
        <div className="flex h-full min-h-0 flex-col" aria-busy={pending}>
          <div
            className={[
              'flex h-[52px] shrink-0 items-center justify-between gap-2 border-b',
              'border-[color:var(--sniptale-color-border-soft)] px-3',
            ].join(' ')}
          >
            {props.headerTitle ?? (
              <h2 className="text-[13px] font-semibold">
                {translate('videoEditor.app.materialsTitle')}
              </h2>
            )}
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
              'grid shrink-0 grid-cols-1 @min-[300px]/materials:grid-cols-2 items-center gap-1 border-b',
              'border-[color:var(--sniptale-color-border-soft)] px-2 py-1',
            ].join(' ')}
          >
            <ProductActionButton
              tone="secondary"
              className="min-w-0 justify-start !px-2"
              onClick={props.onOpenLibrary}
              data-ui="video-editor.materials.library"
            >
              <FolderKanban size={16} aria-hidden="true" />
              <span className="truncate">{translate('videoEditor.app.materialsFromLibrary')}</span>
            </ProductActionButton>
            <MaterialsImportMenu
              disabled={pending}
              onChoose={(kind) => inputRefs[kind].current?.click()}
            />
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
                className="!min-h-10 w-full min-w-0 justify-start !text-[13px] text-left"
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

function MaterialsImportMenu(props: {
  disabled: boolean;
  onChoose: (kind: VideoEditorImportKind) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const setVisible = useCallback((value: boolean | ((current: boolean) => boolean)) => {
    setOpen(value);
    if (value === false) containerRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
  }, []);
  const { portalStyle } = useGlassSelectOverlay({
    portal: true,
    isOpen: open,
    setIsOpen: setVisible,
    containerRef,
    menuRef,
  });
  const theme = useResolvedPortalTheme(containerRef.current);
  useMaterialsImportKeyboard(open, containerRef, menuRef, setVisible, setOpen);
  return (
    <div ref={containerRef} className="w-full">
      <ProductActionButton
        tone="secondary"
        className="w-full min-w-0 justify-start !px-2"
        disabled={props.disabled}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        data-ui="video-editor.materials.import"
      >
        <Upload size={16} aria-hidden="true" />
        <span className="flex-1 text-left">{translate('videoEditor.app.materialsFromDisk')}</span>
        <ChevronDown size={14} aria-hidden="true" />
      </ProductActionButton>
      {open
        ? createPortal(
            <div
              ref={menuRef}
              style={{ ...portalStyle, width: 240 }}
              data-theme={theme ?? undefined}
              data-ui="video-editor.materials.import-menu"
            >
              <ProductToolbarMenu
                compact
                title={translate('videoEditor.app.materialsFromDisk')}
                style={{
                  position: 'relative',
                  top: 'auto',
                  left: 'auto',
                  width: '100%',
                  minWidth: 0,
                  animation: 'none',
                }}
              >
                {MATERIAL_IMPORT_OPTIONS.map(({ kind, icon: Icon, labelKey }) => (
                  <ProductToolbarMenuItem
                    key={kind}
                    disabled={props.disabled}
                    onClick={() => {
                      setVisible(false);
                      props.onChoose(kind);
                    }}
                  >
                    <Icon size={16} aria-hidden="true" />
                    <span>{translate(labelKey)}</span>
                  </ProductToolbarMenuItem>
                ))}
              </ProductToolbarMenu>
            </div>,
            resolveThemeSafePortalTarget(containerRef.current)
          )
        : null}
    </div>
  );
}

function useMaterialsImportKeyboard(
  open: boolean,
  containerRef: React.RefObject<HTMLDivElement | null>,
  menuRef: React.RefObject<HTMLDivElement | null>,
  setVisible: (value: boolean) => void,
  setOpen: (value: boolean) => void
) {
  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      setVisible(false);
    };
    const dismissOnFocusLeave = (event: FocusEvent) => {
      if (!isComposedEventWithinAnyElement(event, [containerRef.current, menuRef.current])) {
        setOpen(false);
      }
    };
    document.addEventListener('keydown', dismissOnEscape, true);
    document.addEventListener('focusin', dismissOnFocusLeave);
    return () => {
      document.removeEventListener('keydown', dismissOnEscape, true);
      document.removeEventListener('focusin', dismissOnFocusLeave);
    };
  }, [open, containerRef, menuRef, setVisible, setOpen]);
}
