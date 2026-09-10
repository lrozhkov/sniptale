import {
  parseEffectV1Source,
  resolveEffectLocaleText,
} from '@sniptale/runtime-contracts/effect-v1';
import { getCurrentLocale, translate } from '../../../../platform/i18n';
import type { VideoProject, VideoProjectEffectClip } from '../types';
import type { VideoProjectEffectSnapshot } from './types';

// Immutable snapshots own cached labels; discarded projects are not retained by this cache.
const labels = new WeakMap<VideoProjectEffectSnapshot, Record<string, string | undefined>>();

export function getEffectClipLabel(project: VideoProject, clip: VideoProjectEffectClip): string {
  if (clip.name.trim()) return clip.name;
  const instance = project.effectInstances?.find(({ id }) => id === clip.effectInstanceId);
  const snapshot = project.effectSnapshots?.find(({ id }) => id === instance?.snapshotId);
  if (!snapshot) return translate('videoEditor.effectsLibrary.unavailableEffect');
  let label = labels.get(snapshot);
  if (!label) {
    label = parseEffectV1Source(snapshot.source).document?.label ?? {};
    labels.set(snapshot, label);
  }
  return (
    resolveEffectLocaleText(label, getCurrentLocale()) ||
    translate('videoEditor.effectsLibrary.unavailableEffect')
  );
}
