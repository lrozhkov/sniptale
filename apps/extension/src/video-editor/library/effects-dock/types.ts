import type { EffectBundleCatalogEntry } from '../../../features/video/project/effect-bundle/catalog';
import type { VideoAnnotationTemplateCreateInput } from '../../../features/video/project/annotation/template-input';
import type { VideoProjectEffectTarget } from '../../../features/video/project/effect-instance/types';
import type { EffectLibraryOperations } from './operations';

export type VideoEditorEffectCatalogItem =
  | { catalog: EffectBundleCatalogEntry; status: 'ready' }
  | { packId: string; status: 'invalid' };

export interface VideoEditorEffectsLibraryDockProps {
  catalogs: readonly VideoEditorEffectCatalogItem[];
  currentTime: number;
  errorCode: string | null;
  isLoading: boolean;
  isOpen: boolean;
  operations: EffectLibraryOperations;
  onAddAnnotation(input: VideoAnnotationTemplateCreateInput): void;
  onApplyEffect(args: {
    catalog: EffectBundleCatalogEntry;
    documentId: string;
    startTime: number;
    target: VideoProjectEffectTarget;
  }): Promise<string | null>;
  onClose(): void;
  onDeleteEffectBundle(packId: string): Promise<void>;
  onImportEffectFile(file: File): Promise<void>;
  onSetEffectBundleEnabled(packId: string, enabled: boolean): Promise<void>;
  selectedClipId: string | null;
  selectedTransitionId: string | null;
}
