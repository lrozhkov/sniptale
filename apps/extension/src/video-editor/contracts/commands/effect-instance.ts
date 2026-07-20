import type { EffectBundleCatalogEntry } from '../../../features/video/project/effect-bundle/catalog';
import type { VideoProjectEffectTarget } from '../../../features/video/project/effect-instance/types';
import type { VideoProjectEffectInstancePatch } from './patches';

export interface VideoEditorEffectInstanceActions {
  applyEffectDocument(args: {
    catalog: EffectBundleCatalogEntry;
    documentId: string;
    startTime: number;
    target: VideoProjectEffectTarget;
  }): Promise<string | null>;
  deleteEffectInstance(instanceId: string): void;
  duplicateEffectInstance(instanceId: string): string | null;
  moveEffectInstance(instanceId: string, direction: 'down' | 'up'): void;
  updateEffectInstance(instanceId: string, patch: VideoProjectEffectInstancePatch): void;
}
