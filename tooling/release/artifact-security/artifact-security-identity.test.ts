import JSZip from 'jszip';
import { afterEach, expect, it, vi } from 'vitest';

import { verifyArtifactIdentityFile } from './artifact-security-identity.mjs';

const retiredProducts = [
  ['scr', 'een', 'yx'].join(''),
  ['smart', 'capture'].join(''),
  ['ns', 'mp'].join(''),
  ['s', 'cx'].join(''),
];
const retiredEffects = ['-', '.', '_', ' ', ''].map(
  (separator) => `${['eff', 'ect'].join('')}${separator}${['v', '4'].join('')}`
);

function verify(relativePath: string, contents = 'export const product = "Sniptale";') {
  return verifyArtifactIdentityFile({ contents: Buffer.from(contents), relativePath });
}

afterEach(() => {
  vi.restoreAllMocks();
});

it('accepts clean artifact paths and UTF-8 content', async () => {
  await expect(verify('assets/popup.js')).resolves.toBeUndefined();
  await expect(
    verify('assets/runtime.js', 'import "./target-lookup-BzwSCXIH.js";')
  ).resolves.toBeUndefined();
});

it('rejects every retired product root in artifact paths and text', async () => {
  for (const retiredProduct of retiredProducts) {
    await expect(verify(`assets/${retiredProduct}.js`)).rejects.toThrow('retired product root');
    await expect(verify('assets/popup.js', retiredProduct)).rejects.toThrow('retired product root');
  }
});

it('rejects every retired Effect public version spelling', async () => {
  for (const retiredEffect of retiredEffects) {
    await expect(verify('assets/popup.js', retiredEffect)).rejects.toThrow(
      'retired Effect public version'
    );
  }
});

it('rejects retired identities in nested ZIP entries and text payloads', async () => {
  const entryZip = new JSZip();
  entryZip.file(`effects/${retiredProducts[1]}.json`, '{}');
  await expect(
    verifyArtifactIdentityFile({
      contents: await entryZip.generateAsync({ type: 'nodebuffer' }),
      relativePath: 'assets/entry-effects.zip',
    })
  ).rejects.toThrow('retired product root');

  const payloadZip = new JSZip();
  payloadZip.file('effects/payload.json', JSON.stringify({ schema: retiredEffects[0] }));
  await expect(
    verifyArtifactIdentityFile({
      contents: await payloadZip.generateAsync({ type: 'nodebuffer' }),
      relativePath: 'assets/payload-effects.zip',
    })
  ).rejects.toThrow('retired Effect public version');
});

it('applies the shared bounded archive admission to nested release ZIPs', async () => {
  vi.spyOn(JSZip, 'loadAsync').mockResolvedValue({
    files: {
      payload: {
        _data: { compressedSize: 1, uncompressedSize: 201 },
        dir: false,
        name: 'payload',
      },
    },
  } as never);

  await expect(verify('assets/effects.zip', 'zip')).rejects.toThrow(
    'archive compression-ratio limit exceeded'
  );
});
