import type { EffectBundleCatalogEntry } from '../../../features/video/project/effect-bundle/catalog';
import type { VideoProjectEffectTarget } from '../../../features/video/project/effect-instance/types';
import type { VideoProjectEffectInstancePatch } from './patches';

export interface VideoEditorEffectInstanceActions {
  selectEffectInstance(instanceId: string): void;
  setClipEffectsBypassed(clipId: string, bypassed: boolean): void;
  applyEffectDocument(args: {
    catalog: EffectBundleCatalogEntry;
    documentId: string;
    startTime: number;
    target: VideoProjectEffectTarget;
    trackId?: string;
    timelineLaneId?: string | null;
  }): Promise<string | null>;
  deleteEffectInstance(instanceId: string): void;
  duplicateEffectInstance(instanceId: string): string | null;
  moveEffectInstance(instanceId: string, direction: 'down' | 'up'): void;
  updateEffectInstance(instanceId: string, patch: VideoProjectEffectInstancePatch): void;
}
