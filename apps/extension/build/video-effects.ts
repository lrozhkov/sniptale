import { readFile, readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { createHash } from 'node:crypto';
import {
  parseBuiltinAnimationCollection,
  parseBuiltinEffectIndex,
} from '../src/features/video/project/effect-bundle/catalog/builtin-index';
import { verifyRuntimeAnimationSource } from '../src/contracts/effect-runtime/animation';
import { projectCatalogPresentation } from '../src/features/video/project/effect-bundle/catalog/presentation';

const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

/** Validate every shipped package, embedded resource and legal notice without network or SDK sources. */
export async function buildVideoEffectIndex(root: string) {
  const actual = await readdir(root, { recursive: true, withFileTypes: true });
  if (actual.some((entry) => entry.isSymbolicLink()))
    throw new Error('Symlink in animation collection');
  const manifestBytes = await readFile(join(root, 'collection.json'));
  const input: unknown = JSON.parse(manifestBytes.toString('utf8'));
  const manifest = parseBuiltinAnimationCollection(input);
  const expected = new Set([
    'collection.json',
    ...manifest.documents.map((entry) => entry.path),
    ...manifest.notices.map((entry) => entry.path),
  ]);
  for (const entry of actual.filter((entry) => entry.isFile())) {
    const name = relative(root, join(entry.parentPath, entry.name)).split(sep).join('/');
    if (!expected.has(name)) throw new Error(`Undeclared animation resource: ${name}`);
  }
  for (const entry of manifest.notices) {
    const bytes = await readFile(join(root, entry.path));
    if (bytes.byteLength > 16 * 1024 * 1024 || hash(bytes) !== entry.sha256)
      throw new Error(`Builtin animation notice integrity failure: ${entry.path}`);
  }
  const documents = [];
  for (const entry of manifest.documents) {
    const bytes = await readFile(join(root, entry.path));
    if (bytes.byteLength !== entry.byteLength || hash(bytes) !== entry.sha256)
      throw new Error(`Builtin animation integrity failure: ${entry.path}`);
    const source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const document = await verifyRuntimeAnimationSource(source, entry.sha256);
    if (!document || document.id !== entry.id)
      throw new Error(`Invalid builtin animation: ${entry.path}`);
    documents.push({
      id: entry.id,
      kind: 'standalone' as const,
      presentation: projectCatalogPresentation(document),
    });
  }
  return parseBuiltinEffectIndex({ manifest, sourceSha256: hash(manifestBytes), documents });
}
