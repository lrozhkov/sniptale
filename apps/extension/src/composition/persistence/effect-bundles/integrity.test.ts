import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import type { AnimationCatalogEntry } from '../../../features/video/project/effect-bundle/catalog';
import { readValidAnimationSourceEntry } from './fixture.test-support';
import { assertAnimationCatalogIntegrity } from './integrity';

it('accepts exact source bytes and their complete embedded resource closure', async () => {
  await expect(
    assertAnimationCatalogIntegrity(await readValidAnimationSourceEntry())
  ).resolves.toBeUndefined();
});
it('rejects incorrect source hashes, retained measurements and document identities', async () => {
  const entry = await readValidAnimationSourceEntry();
  for (const invalid of [
    { ...entry, retainedByteLength: entry.retainedByteLength + 1 },
    { ...entry, documents: entry.documents.map((d) => ({ ...d, sha256: '0'.repeat(64) })) },
    { ...entry, documents: entry.documents.map((d) => ({ ...d, id: 'wrong' })) },
  ])
    await failure(invalid);
});
it('rejects malformed JSON even with an updated outer hash', async () => {
  await failure(replaceSource(await readValidAnimationSourceEntry(), '{'));
});
it.each(['size', 'hash', 'signature', 'missing', 'duplicate', 'remapped', 'mime'] as const)(
  'rejects embedded resource %s corruption after the outer digest is updated',
  async (mode) => {
    const entry = await readValidAnimationSourceEntry();
    const document = JSON.parse(entry.documents[0]!.source);
    const resource = document.resources[0];
    expect(resource).toBeDefined();
    if (mode === 'size') resource.byteLength += 1;
    if (mode === 'hash') resource.sha256 = '0'.repeat(64);
    if (mode === 'signature') {
      const bytes = Buffer.from('invalid resource');
      resource.base64 = bytes.toString('base64');
      resource.byteLength = bytes.byteLength;
      resource.sha256 = createHash('sha256').update(bytes).digest('hex');
    }
    if (mode === 'missing') document.resources = [];
    if (mode === 'duplicate') document.resources.push({ ...resource });
    if (mode === 'remapped') resource.path = 'fonts/unknown.ttf';
    if (mode === 'mime') resource.mimeType = 'font/otf';
    await failure(replaceSource(entry, JSON.stringify(document)));
  }
);
function replaceSource(entry: AnimationCatalogEntry, source: string): AnimationCatalogEntry {
  return {
    ...entry,
    retainedByteLength: Buffer.byteLength(source),
    documents: [
      { ...entry.documents[0]!, source, sha256: createHash('sha256').update(source).digest('hex') },
    ],
  };
}
async function failure(entry: AnimationCatalogEntry) {
  await expect(assertAnimationCatalogIntegrity(entry)).rejects.toMatchObject({
    code: 'catalogIntegrityFailure',
  });
}
