import { getProjectAssetUseCounts } from '../../../features/video/project/media-usage';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { isComposedEventWithinAnyElement } from '@sniptale/ui/dom-events';
import { useGlassSelectOverlay } from '@sniptale/ui/glass-select/overlay-state';
import {
  resolveThemeSafePortalTarget,
  useResolvedPortalTheme,
} from '@sniptale/ui/theme/safe-portal';
import { ProductToolbarMenu, ProductToolbarMenuItem } from '@sniptale/ui/product-menus/toolbar';
import { Check, ChevronDown, Film, FolderKanban, Image, Music, Trash2, Upload } from 'lucide-react';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
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
  onOpenLibrary: () => void;
  onRemoveUnused: (assetIds?: readonly string[]) => void;
  project: VideoProject;
  onImport: PreviewStageImportHandlers;
  selectedAssetId: string | null;
  onSelect: (asset: VideoProjectAsset) => void;
}) {
  const panelRef = useRef<HTMLElement | null>(null);
  const usage = getProjectAssetUseCounts(props.project);
  const unusedCount = props.project.assets.filter(({ id }) => !usage.has(id)).length;
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
  const removeMaterials = (ids?: readonly string[]) => {
    const index = ids ? props.project.assets.findIndex(({ id }) => id === ids[0]) : -1;
    props.onRemoveUnused(ids);
    requestAnimationFrame(() => {
      const rows = panelRef.current?.querySelectorAll<HTMLButtonElement>('button[aria-pressed]');
      const next = index >= 0 && rows?.length ? rows[Math.min(index, rows.length - 1)] : null;
      (
        next ??
        panelRef.current?.querySelector<HTMLButtonElement>(
          '[data-ui="video-editor.materials.import"]'
        )
      )?.focus();
    });
  };
  return (
    <aside
      ref={panelRef}
      data-ui="video-editor.materials"
      className="@container/materials h-full min-w-0"
    >
      <div className="flex h-full min-h-0 flex-col" aria-busy={pending}>
        <VideoEditorFileInputNodes
          audioInputRef={audioInputRef}
          imageInputRef={imageInputRef}
          videoInputRef={videoInputRef}
          onImportAudio={(file) => void importFile('audio', file)}
          onImportImage={(file) => void importFile('image', file)}
          onImportVideo={(file) => void importFile('video', file)}
        />
        {pending && <p role="status">{translate('videoEditor.app.materialsLoading')}</p>}
        <div className="min-h-10 flex-1 space-y-1 overflow-y-auto p-2">
          {props.project.assets.length === 0 && (
            <div className="px-2 py-3">
              <p className="text-xs font-medium">{translate('videoEditor.app.materialsEmpty')}</p>
              <p className="mt-1 text-xs text-[var(--sniptale-color-text-muted)]">
                {translate('videoEditor.app.materialsHint')}
              </p>
            </div>
          )}
          {props.project.assets.map((asset) => (
            <MaterialRow
              key={asset.id}
              asset={asset}
              selected={props.selectedAssetId === asset.id}
              used={usage.has(asset.id)}
              disabled={pending}
              onSelect={() => props.onSelect(asset)}
              onRemove={() => removeMaterials([asset.id])}
            />
          ))}
        </div>
        <footer
          data-ui="video-editor.materials.footer"
          className={[
            'grid shrink-0 grid-cols-1 @min-[300px]/materials:grid-cols-2 items-center gap-1 border-t',
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
          <ProductActionButton
            compact
            tone="secondary"
            className="col-span-full !min-h-8 justify-start !px-2 text-[var(--sniptale-color-text-muted)]"
            disabled={pending || unusedCount === 0}
            onClick={() => removeMaterials()}
            data-ui="video-editor.materials.remove-unused"
          >
            <Trash2 size={14} aria-hidden="true" />
            {translate('videoEditor.app.materialsRemoveUnused')}
          </ProductActionButton>
        </footer>
      </div>
    </aside>
  );
}

function MaterialRow(props: {
  asset: VideoProjectAsset;
  selected: boolean;
  used: boolean;
  disabled: boolean;
  onSelect: () => void;
  onRemove: () => void;
}) {
  const Icon = props.asset.type === 'AUDIO' ? Music : props.asset.type === 'IMAGE' ? Image : Film;
  return (
    <div
      className="group/material flex min-w-0 items-center gap-1"
      data-material-id={props.asset.id}
    >
      <div className="relative flex size-8 shrink-0 items-center justify-center">
        <Icon size={16} aria-hidden="true" className="text-[var(--sniptale-color-text-muted)]" />
        {!props.used && (
          <ProductActionButton
            compact
            tone="danger"
            disabled={props.disabled}
            className={[
              'absolute inset-0 !size-8 !min-h-8 !p-0 opacity-0',
              'group-hover/material:opacity-100 group-focus-within/material:opacity-100',
              '!bg-[var(--sniptale-color-surface-base)]',
            ].join(' ')}
            aria-label={`${translate('videoEditor.app.materialsRemove')}: ${props.asset.name}`}
            title={translate('videoEditor.app.materialsRemove')}
            data-ui="video-editor.materials.remove"
            onClick={props.onRemove}
          >
            <Trash2 size={15} aria-hidden="true" />
          </ProductActionButton>
        )}
      </div>
      <ProductActionButton
        compact
        tone="toggle"
        active={props.selected}
        className="!min-h-12 min-w-0 flex-1 flex-col !items-start justify-center !gap-0.5 !px-2 text-left"
        aria-pressed={props.selected}
        aria-label={props.asset.name}
        aria-describedby={`material-usage-${props.asset.id}`}
        onClick={props.onSelect}
      >
        <span className="w-full truncate text-[13px]" title={props.asset.name}>
          {props.asset.name}
        </span>
        <span
          id={`material-usage-${props.asset.id}`}
          className="flex items-center gap-1 text-[11px] text-[var(--sniptale-color-text-muted)]"
        >
          {props.used && <Check size={12} aria-hidden="true" />}
          {translate(
            props.used ? 'videoEditor.app.materialsUsed' : 'videoEditor.app.materialsUnused'
          )}
        </span>
      </ProductActionButton>
    </div>
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
