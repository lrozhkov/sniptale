import { expect, it } from 'vitest';
import {
  animationRuntimeDuration,
  animationRuntimeFrameIndex,
  parseRuntimeAnimationDocument,
  parseRuntimeAnimationFrame,
  verifyRuntimeAnimationSource,
} from './animation';

function template() {
  const document = parseRuntimeAnimationDocument({
    format: 'sniptale-animation',
    version: 1,
    id: 'runtime-proof',
    label: { en: 'Proof' },
    controls: [],
    bindings: [],
    resources: [],
    animation: { v: '5.12.2', w: 320, h: 180, fr: 30, ip: 30, op: 90, layers: [], assets: [] },
  });
  if (!document) throw new Error('Invalid fixture.');
  return document;
}
function frame() {
  return {
    width: 320,
    height: 180,
    inputFrames: {},
    controls: {},
    duration: 2,
    time: 0.5,
    progress: 0.25,
    fps: 60,
    frameIndex: 30,
  };
}
async function digest(source: string) {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source))),
    (value) => value.toString(16).padStart(2, '0')
  ).join('');
}
it('derives local duration from nonzero in-point and preserves the checked source', () => {
  const document = template();
  expect(animationRuntimeDuration(document)).toBe(2);
  expect(parseRuntimeAnimationFrame(frame(), document)).toMatchObject({
    timing: { time: 0.5, duration: 2, progress: 0.25 },
  });
  expect(document.animation.ip).toBe(30);
});
it.each([
  { duration: 3 },
  { time: -1 },
  { time: 2.1 },
  { progress: 0.2 },
  { fps: 241 },
  { frameIndex: 0.5 },
  { controls: { foreign: 1 } },
  { width: 319 },
  { inputFrames: { source: {} } },
])('rejects inconsistent frame fields %j', (patch) => {
  expect(parseRuntimeAnimationFrame({ ...frame(), ...patch }, template())).toBeNull();
});
it('checks the exact source digest and refuses the retired document format', async () => {
  const source = JSON.stringify(template());
  expect(await verifyRuntimeAnimationSource(source, await digest(source))).toEqual(template());
  expect(await verifyRuntimeAnimationSource(source, '0'.repeat(64))).toBeNull();
  const retired = JSON.stringify({ version: 1, kind: 'annotation', duration: 2, graph: {} });
  expect(await verifyRuntimeAnimationSource(retired, await digest(retired))).toBeNull();
});
it('rejects resource digest poisoning even when the complete package digest matches', async () => {
  const document = template();
  document.resources.push({
    path: 'fonts/proof.ttf',
    mimeType: 'font/ttf',
    fontFamily: 'Proof',
    base64: 'AAEAAAECAwQ=',
    byteLength: 8,
    sha256: '0'.repeat(64),
  });
  const source = JSON.stringify(document);
  expect(await verifyRuntimeAnimationSource(source, await digest(source))).toBeNull();
});

it.each([
  { fr: 30, ip: 30, op: 90, time: 0, expected: 0 },
  { fr: 30, ip: 30, op: 90, time: 1 / 30 - Number.EPSILON, expected: 0 },
  { fr: 30, ip: 30, op: 90, time: 1 / 30, expected: 1 },
  { fr: 30, ip: 30, op: 90, time: 2, expected: 59 },
  { fr: 29.97, ip: 120, op: 240, time: 120 / 29.97, expected: 119 },
  { fr: 30, ip: 0.5, op: 60, time: 59.5 / 30, expected: 59 },
])(
  'uses the same relative integer frame at source clock boundaries %j',
  ({ time, expected, ...animation }) => {
    expect(animationRuntimeFrameIndex(animation, time)).toBe(expected);
  }
);
