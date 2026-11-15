import {
  parseAnimationTemplateSource,
  validateAnimationTemplate,
} from '@sniptale/runtime-contracts/animation-template';
import type { VideoProject } from '../types';
import { verifyVideoProjectEffectSnapshotIntegrity } from './integrity';
import { resolveEffectObjectControls } from './layout';

/** Materialize current controls into a self-contained package without changing the retained source. */
export async function exportEffectInstance(
  project: VideoProject,
  instanceId: string
): Promise<{ blob: Blob; filename: string }> {
  const instance = project.effectInstances?.find((entry) => entry.id === instanceId);
  const snapshot = project.effectSnapshots?.find((entry) => entry.id === instance?.snapshotId);
  if (!instance || !snapshot) throw new Error('Effect instance is unavailable');
  await verifyVideoProjectEffectSnapshotIntegrity({ ...project, effectSnapshots: [snapshot] });
  const parsed = parseAnimationTemplateSource(snapshot.source);
  if (!parsed.ok) throw new Error('Invalid effect snapshot');
  const document = parsed.template;
  const host = project.clips.find(
    (clip) => clip.type === 'EFFECT' && clip.effectInstanceId === instance.id
  );
  if (!host) throw new Error('Missing effect body');
  const controls = resolveEffectObjectControls(document, instance, host.transform);
  delete document.controlPresets;
  delete document.defaultControlPresetId;
  for (const control of document.controls) {
    delete control.localizedDefaultValue;
    const value = controls[control.id] ?? control.defaultValue;
    if (control.kind === 'number' && typeof value === 'number') control.defaultValue = value;
    else if (control.kind !== 'number' && typeof value === 'string') control.defaultValue = value;
    else throw new Error('Invalid effect control');
  }
  const validation = validateAnimationTemplate(document);
  if (!validation.ok) throw new Error('Invalid exported animation');
  const basename = `animation-${document.id.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 100)}`;
  return {
    blob: new Blob([JSON.stringify(validation.template, null, 2)], { type: 'application/json' }),
    filename: `${basename}.sniptale-animation.json`,
  };
}
