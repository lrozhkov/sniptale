import { formatPreciseTime } from '../../contracts/time-format';
import { CompactSelect } from '../../../ui/compact-inspector-controls/select';
import { formatBytes } from '../../../platform/i18n/format-bytes';
import {
  getProjectAssetUses,
  type ProjectAssetUse,
} from '../../../features/video/project/media-usage';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { isComposedEventWithinAnyElement } from '@sniptale/ui/dom-events';
import { useGlassSelectOverlay } from '@sniptale/ui/glass-select/overlay-state';
import {
  resolveThemeSafePortalTarget,
  useResolvedPortalTheme,
} from '@sniptale/ui/theme/safe-portal';
import { ProductToolbarMenu, ProductToolbarMenuItem } from '@sniptale/ui/product-menus/toolbar';
import {
  Check,
  ChevronDown,
  Film,
  FolderKanban,
  Image,
  Music,
  Mic,
  Trash2,
  Upload,
  Search,
  X,
  ListFilter,
} from 'lucide-react';
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
  onRecordAudio?: () => void;
  onShowUse: (use: ProjectAssetUse) => void;
  onRemoveUnused: (assetIds?: readonly string[]) => void;
  project: VideoProject;
  onImport: PreviewStageImportHandlers;
  selectedAssetId: string | null;
  onSelect: (asset: VideoProjectAsset) => void;
}) {
  const panelRef = useRef<HTMLElement | null>(null);
  const uses = getProjectAssetUses(props.project);
  const usage = new Set(uses.map((use) => use.assetId));
  const [category, setCategory] = useState<'all' | VideoProjectAsset['type']>('all');
  const [query, setQuery] = useState('');
  const [hideUsed, setHideUsed] = useState(false);

  const visibleAssets = props.project.assets.filter(
    (asset) =>
      (category === 'all' ||
        asset.type === category ||
        (category === 'VIDEO' && asset.type === 'RECORDING')) &&
      (!hideUsed || !usage.has(asset.id)) &&
      asset.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
  );
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
    const index = ids ? visibleAssets.findIndex(({ id }) => id === ids[0]) : -1;
    props.onRemoveUnused(ids);
    requestAnimationFrame(() => {
      const rows = panelRef.current?.querySelectorAll<HTMLButtonElement>(
        '[data-material-id] button[aria-pressed]'
      );
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
        <MaterialsFilters
          category={category}
          onCategoryChange={setCategory}
          query={query}
          onQueryChange={setQuery}
          hideUsed={hideUsed}
          onHideUsedChange={setHideUsed}
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
          {props.project.assets.length > 0 && visibleAssets.length === 0 && (
            <p className="px-2 py-3 text-xs text-[var(--sniptale-color-text-muted)]">
              {translate('videoEditor.sidebar.materialsNoMatches')}
            </p>
          )}
          {visibleAssets.map((asset) => (
            <MaterialRow
              key={asset.id}
              asset={asset}
              project={props.project}
              uses={uses.filter((use) => use.assetId === asset.id)}
              onShowUse={props.onShowUse}
              selected={props.selectedAssetId === asset.id}
              used={usage.has(asset.id)}
              disabled={pending}
              onSelect={() => props.onSelect(asset)}
              onRemove={() => removeMaterials([asset.id])}
            />
          ))}
        </div>
        <MaterialsFooter
          pending={pending}
          unusedCount={unusedCount}
          onOpenLibrary={props.onOpenLibrary}
          onRecordAudio={props.onRecordAudio}
          onChoose={(kind) => inputRefs[kind].current?.click()}
          onRemoveUnused={() => removeMaterials()}
        />
      </div>
    </aside>
  );
}

function MaterialsFilters(props: {
  category: 'all' | VideoProjectAsset['type'];
  onCategoryChange: (category: 'all' | VideoProjectAsset['type']) => void;
  query: string;
  onQueryChange: (query: string) => void;
  hideUsed: boolean;
  onHideUsedChange: (hideUsed: boolean) => void;
}) {
  const filterRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  return (
    <div
      ref={filterRef}
      className={[
        'flex shrink-0 items-center gap-1 border-b px-2 py-1.5',
        'border-[color:var(--sniptale-color-border-soft)]',
      ].join(' ')}
      data-ui="video-editor.materials.filters"
    >
      {searchOpen ? (
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <Search
            size={14}
            aria-hidden
            className="shrink-0 text-[var(--sniptale-color-text-muted)]"
          />
          <input
            ref={searchRef}
            value={props.query}
            onChange={(event) => props.onQueryChange(event.target.value)}
            aria-label={translate('videoEditor.sidebar.materialsSearch')}
            placeholder={translate('videoEditor.sidebar.materialsSearch')}
            className={[
              'h-8 min-w-0 flex-1 bg-transparent text-sm outline-none',
              'placeholder:text-[var(--sniptale-color-text-muted)] focus:placeholder:text-transparent',
            ].join(' ')}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.stopPropagation();
                props.onQueryChange('');
                setSearchOpen(false);
                requestAnimationFrame(() =>
                  filterRef.current
                    ?.querySelector<HTMLButtonElement>('[data-ui="video-editor.materials.search"]')
                    ?.focus()
                );
              }
            }}
          />
          <ProductActionButton
            compact
            tone="secondary"
            aria-label={translate('videoEditor.sidebar.materialsCloseSearch')}
            onClick={() => {
              props.onQueryChange('');
              setSearchOpen(false);
              requestAnimationFrame(() =>
                filterRef.current
                  ?.querySelector<HTMLButtonElement>('[data-ui="video-editor.materials.search"]')
                  ?.focus()
              );
            }}
          >
            <X size={14} aria-hidden />
          </ProductActionButton>
        </div>
      ) : (
        <>
          <CompactSelect
            appearance="plain"
            value={props.category}
            onChange={props.onCategoryChange}
            aria-label={translate('videoEditor.sidebar.materialsCategory')}
            options={[
              { value: 'all', label: translate('videoEditor.sidebar.materialsAll') },
              ...MATERIAL_IMPORT_OPTIONS.map((option) => ({
                value:
                  option.kind === 'video'
                    ? ('VIDEO' as const)
                    : option.kind === 'audio'
                      ? ('AUDIO' as const)
                      : ('IMAGE' as const),
                label: translate(option.labelKey),
              })),
            ]}
          />
          <ProductActionButton
            data-ui="video-editor.materials.search"
            compact
            tone="secondary"
            aria-label={translate('videoEditor.sidebar.materialsSearch')}
            title={translate('videoEditor.sidebar.materialsSearch')}
            onClick={() => {
              setSearchOpen(true);
              requestAnimationFrame(() => searchRef.current?.focus());
            }}
          >
            <Search size={15} aria-hidden />
          </ProductActionButton>
        </>
      )}
      <ProductActionButton
        compact
        tone="toggle"
        active={props.hideUsed}
        aria-pressed={props.hideUsed}
        aria-label={translate('videoEditor.sidebar.materialsHideUsed')}
        title={translate('videoEditor.sidebar.materialsHideUsed')}
        onClick={() => props.onHideUsedChange(!props.hideUsed)}
      >
        <ListFilter size={15} aria-hidden />
      </ProductActionButton>
    </div>
  );
}

function MaterialRow(props: {
  asset: VideoProjectAsset;
  project: VideoProject;
  uses: ProjectAssetUse[];
  onShowUse: (use: ProjectAssetUse) => void;
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
      <div className="min-w-0 flex-1">
        <ProductActionButton
          compact
          tone="toggle"
          active={props.selected}
          className="!min-h-12 w-full min-w-0 flex-1 flex-col !items-start justify-center !gap-0.5 !px-2 text-left"
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
            <span>{formatBytes(props.asset.metadata.size)} ·</span>
            {props.used && <Check size={12} aria-hidden="true" />}
            {translate(
              props.used ? 'videoEditor.app.materialsUsed' : 'videoEditor.app.materialsUnused'
            )}
          </span>
        </ProductActionButton>
        {props.uses.some((use) => use.kind !== 'analysis') && (
          <CompactSelect
            appearance="plain"
            controlSize="sm"
            value=""
            aria-label={`${translate('videoEditor.sidebar.materialsShowUses')}: ${props.asset.name}`}
            placeholder={translate('videoEditor.sidebar.materialsShowUses')}
            onChange={(value) => {
              const use = props.uses[Number(value)];
              if (use && use.kind !== 'analysis') props.onShowUse(use);
            }}
            options={props.uses.flatMap((use, index) => {
              if (use.kind === 'analysis') return [];
              if (use.kind === 'scene')
                return [
                  {
                    value: String(index),
                    label: translate('videoEditor.sidebar.materialsSceneUse'),
                  },
                ];
              const clip = props.project.clips.find((clip) => clip.id === use.clipId);
              if (!clip) return [];
              const track = props.project.tracks.find((track) => track.id === clip.trackId);
              return [
                {
                  value: String(index),
                  label: `${track?.name ?? ''} · ${formatPreciseTime(clip.startTime)}`,
                },
              ];
            })}
          />
        )}
      </div>
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

function MaterialsFooter(props: {
  pending: boolean;
  unusedCount: number;
  onOpenLibrary: () => void;
  onRecordAudio: (() => void) | undefined;
  onChoose: (kind: VideoEditorImportKind) => void;
  onRemoveUnused: () => void;
}) {
  return (
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
      <MaterialsImportMenu disabled={props.pending} onChoose={props.onChoose} />
      <ProductActionButton
        tone="secondary"
        className="col-span-full justify-start !px-2"
        onClick={props.onRecordAudio}
        data-ui="video-editor.materials.record-audio"
      >
        <Mic size={16} aria-hidden="true" />
        {translate('videoEditor.app.recordAudioMicrophone')}
      </ProductActionButton>
      <ProductActionButton
        compact
        tone="secondary"
        className="col-span-full !min-h-8 justify-start !px-2 text-[var(--sniptale-color-text-muted)]"
        disabled={props.pending || props.unusedCount === 0}
        onClick={props.onRemoveUnused}
        data-ui="video-editor.materials.remove-unused"
      >
        <Trash2 size={14} aria-hidden="true" />
        {translate('videoEditor.app.materialsRemoveUnused')}
      </ProductActionButton>
    </footer>
  );
}
