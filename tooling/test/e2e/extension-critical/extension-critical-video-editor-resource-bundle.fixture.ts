import { createHash } from 'node:crypto';
import JSZip from 'jszip';
import { parseEffectV1Source } from '@sniptale/runtime-contracts/effect-v1';

export async function resourcePresetBundle(archive: Uint8Array) {
  const zip = await JSZip.loadAsync(archive);
  const documentFile = zip.file('effects/neutral-runtime-conformance.sniptale-effect.json');
  if (!documentFile) throw new Error('Missing actual resource effect');
  const base = parseEffectV1Source(await documentFile.async('string'));
  if (!base.document) throw new Error('Invalid actual resource effect');
  const source = JSON.stringify({
    ...base.document,
    objectLayout: { width: 1280, height: 720, resize: 'scale' },
    controls: [
      {
        id: 'accent',
        kind: 'color',
        defaultValue: '#7cf7ff',
        group: 'appearance',
        label: { en: 'Accent', ru: 'Акцент' },
      },
      {
        id: 'intensity',
        kind: 'number',
        defaultValue: 0.8,
        min: 0,
        max: 1,
        step: 0.05,
        group: 'appearance',
        label: { en: 'Intensity', ru: 'Интенсивность' },
      },
    ],
    program: {
      kind: 'graph',
      version: 1,
      commands: [
        { op: 'clear', color: '#101820' },
        {
          op: 'shape',
          shape: 'rect',
          x: 10,
          y: 10,
          width: 100,
          height: 100,
          fill: { op: 'read', path: 'controls.accent' },
          alpha: { op: 'read', path: 'controls.intensity' },
        },
        { op: 'svgParts', assetId: 'neutral-mark', x: 520, y: 240, width: 240, height: 240 },
      ],
    },
    defaultControlPresetId: 'bright',
    controlPresets: [
      {
        id: 'bright',
        label: { en: 'Bright', ru: 'Светлый' },
        theme: { id: 'resource-proof', label: { en: 'Resource theme', ru: 'Ресурсная тема' } },
        style: { id: 'bright', label: { en: 'Bright', ru: 'Светлый' } },
        values: { accent: '#7cf7ff', intensity: 0.8 },
      },
      {
        id: 'deep',
        label: { en: 'Deep', ru: 'Глубокий' },
        theme: { id: 'resource-proof', label: { en: 'Resource theme', ru: 'Ресурсная тема' } },
        style: { id: 'deep', label: { en: 'Deep', ru: 'Глубокий' } },
        values: { accent: '#e020b0', intensity: 0.5 },
      },
    ],
  });
  const parsed = parseEffectV1Source(source);
  if (!parsed.document) throw new Error(JSON.stringify(parsed.diagnostics));
  const manifestFile = zip.file('manifest.json');
  if (!manifestFile) throw new Error('Missing bundle manifest');
  const manifest: unknown = JSON.parse(await manifestFile.async('string'));
  if (
    !manifest ||
    typeof manifest !== 'object' ||
    !('effectDocuments' in manifest) ||
    !Array.isArray(manifest.effectDocuments)
  )
    throw new Error('Invalid actual bundle manifest');
  const document = manifest.effectDocuments.find(
    (value: unknown) =>
      value && typeof value === 'object' && 'id' in value && value.id === base.document?.id
  );
  if (
    !document ||
    typeof document !== 'object' ||
    !('path' in document) ||
    typeof document.path !== 'string'
  )
    throw new Error('Missing manifest document');
  const bytes = Buffer.from(source);
  Object.assign(document, {
    byteLength: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  });
  zip.file(document.path, bytes);
  zip.file('manifest.json', JSON.stringify(manifest));
  return zip.generateAsync({ type: 'nodebuffer' });
}
