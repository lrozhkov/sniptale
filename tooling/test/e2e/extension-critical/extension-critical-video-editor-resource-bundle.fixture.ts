import { createHash } from 'node:crypto';
import { parseAnimationTemplateSource } from '@sniptale/runtime-contracts/animation-template';
import { exportEffectCatalog } from '../../../../apps/extension/src/features/video/project/effect-bundle/catalog/export';

export async function resourcePresetBundle() {
  const base64 =
    'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAALklEQVR4nO3OIQEAAAgDsMcgMbVPDMzE/NKdfoqAgICAgICAgICAgICAgMB34ADatHCXNZ2OmQAAAABJRU5ErkJggg==';
  const bytes = Buffer.from(base64, 'base64');
  const identity = {
    a: { a: 0, k: [0, 0, 0] },
    p: { a: 0, k: [0, 0, 0] },
    s: { a: 0, k: [100, 100, 100] },
    r: { a: 0, k: 0 },
    o: { a: 0, k: 100 },
  };
  const rect = (
    ind: number,
    x: number,
    y: number,
    width: number,
    height: number,
    color: number[],
    accent = false
  ) => ({
    ty: 4,
    ind,
    ddd: 0,
    sr: 1,
    ip: 0,
    op: 90,
    st: 0,
    ks: { ...identity, o: accent ? { a: 0, k: 80, sid: 'intensity' } : identity.o },
    shapes: [
      {
        ty: 'rc',
        p: { a: 0, k: [x + width / 2, y + height / 2] },
        s: { a: 0, k: [width, height] },
        r: { a: 0, k: 0 },
      },
      {
        ty: 'fl',
        c: accent ? { a: 0, k: color, sid: 'accent' } : { a: 0, k: color },
        o: { a: 0, k: 100 },
        r: 1,
      },
    ],
  });
  const source = JSON.stringify({
    format: 'sniptale-animation',
    version: 1,
    id: 'neutral-runtime-conformance',
    label: { en: 'Resource proof', ru: 'Проверка ресурсов' },
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
        defaultValue: 80,
        min: 0,
        max: 100,
        step: 5,
        unit: 'percent',
        group: 'appearance',
        label: { en: 'Intensity', ru: 'Интенсивность' },
      },
    ],
    resources: [
      {
        path: 'images/mark.png',
        mimeType: 'image/png',
        byteLength: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        base64,
      },
    ],
    bindings: [
      { kind: 'color', slot: 'accent', control: 'accent' },
      { kind: 'scalar', slot: 'intensity', control: 'intensity' },
    ],
    defaultControlPresetId: 'bright',
    controlPresets: [
      {
        id: 'bright',
        label: { en: 'Bright', ru: 'Светлый' },
        theme: { id: 'resource-proof', label: { en: 'Resource theme', ru: 'Ресурсная тема' } },
        style: { id: 'bright', label: { en: 'Bright', ru: 'Светлый' } },
        values: { accent: '#7cf7ff', intensity: 80 },
      },
      {
        id: 'deep',
        label: { en: 'Deep', ru: 'Глубокий' },
        theme: { id: 'resource-proof', label: { en: 'Resource theme', ru: 'Ресурсная тема' } },
        style: { id: 'deep', label: { en: 'Deep', ru: 'Глубокий' } },
        values: { accent: '#e020b0', intensity: 50 },
      },
    ],
    animation: {
      v: '5.12.2',
      w: 1280,
      h: 720,
      fr: 30,
      ip: 0,
      op: 90,
      ddd: 0,
      assets: [{ id: 'mark', w: 32, h: 32, u: 'images/', p: 'mark.png', e: 0 }],
      slots: {
        accent: { p: { a: 0, k: [124 / 255, 247 / 255, 1, 1] } },
        intensity: { p: { a: 0, k: 80 } },
      },
      layers: [
        {
          ty: 2,
          ind: 1,
          refId: 'mark',
          ddd: 0,
          sr: 1,
          ip: 0,
          op: 90,
          st: 0,
          ks: { ...identity, p: { a: 0, k: [520, 240, 0] }, s: { a: 0, k: [750, 750, 100] } },
        },
        rect(2, 10, 10, 100, 100, [124 / 255, 247 / 255, 1, 1], true),
        rect(3, 0, 0, 1280, 720, [16 / 255, 24 / 255, 32 / 255, 1]),
      ],
    },
  });
  const parsed = parseAnimationTemplateSource(source);
  if (!parsed.template) throw new Error('Invalid resource animation fixture.');
  const sha256 = createHash('sha256').update(source).digest('hex');
  const result = await exportEffectCatalog({
    packId: 'animation.resource-proof',
    label: { en: 'Resource pack', ru: 'Ресурсный пакет' },
    description: {
      en: 'Embedded resource and preset proof',
      ru: 'Проверка встроенных ресурсов и пресетов',
    },
    documents: [
      {
        id: parsed.template.id,
        kind: 'standalone',
        schemaVersion: 'sniptale.animation.v1',
        sha256,
        source,
        assets: [],
      },
    ],
    assets: [],
    source: 'sniptale-animation',
    sourceSha256: sha256,
    retainedByteLength: Buffer.byteLength(source),
    enabled: true,
    createdAt: 1,
    updatedAt: 1,
    version: '1',
  });
  return Buffer.from(await result.blob.arrayBuffer());
}
