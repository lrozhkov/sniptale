import type { EffectFileImportResult } from '../../../composition/persistence/effect-bundles/import-files';
import type { EffectBundleCatalogEntry } from '../../../features/video/project/effect-bundle/catalog';
import type { VideoProjectEffectTarget } from '../../../features/video/project/effect-instance/types';
import type { EffectLibraryOperations } from './operations';

export type VideoEditorEffectCatalogItem =
  | { catalog: EffectBundleCatalogEntry; status: 'ready' }
  | { packId: string; status: 'invalid' };

export interface VideoEditorEffectsLibraryDockProps {
  catalogs: readonly VideoEditorEffectCatalogItem[];
  currentTime: number;
  appendTime?: number;
  kind?: 'standalone' | 'targetEffect' | 'transition';
  capturePreviewFrame?: () => HTMLCanvasElement | null;
  errorCode: string | null;
  isLoading: boolean;
  isOpen: boolean;
  operations: EffectLibraryOperations;
  onApplyEffect(args: {
    catalog: EffectBundleCatalogEntry;
    documentId: string;
    startTime: number;
    standaloneDuration?: number;
    controlPresetId?: string;
    target: VideoProjectEffectTarget;
    trackId?: string;
    timelineLaneId?: string | null;
  }): Promise<string | null>;
  onDeleteEffectBundle(packId: string): Promise<void>;
  onImportEffectFiles(files: readonly File[]): Promise<EffectFileImportResult[]>;
  onSetEffectBundleEnabled(packId: string, enabled: boolean): Promise<void>;
  effectTarget?: VideoProjectEffectTarget | null;
  selectedTrackId?: string | null;
  selectedClipId: string | null;
  selectedTransitionId: string | null;
}
