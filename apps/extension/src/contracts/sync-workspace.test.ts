import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import {
  encodeSyncWorkspaceMarker,
  parseSyncWorkspaceIdentity,
  parseSyncWorkspaceMarker,
  SYNC_WORKSPACE_MARKER_KEY,
  SYNC_WORKSPACE_MARKER_MAX_BYTES,
  SyncWorkspaceMarkerError,
} from './sync-workspace';

const spaceId = '10000000-0000-4000-8000-000000000001';
const bootstrapId = '20000000-0000-4000-8000-000000000002';
const marker = {
  format: 'sniptale-sync-workspace',
  version: 1,
  protocol: 'immutable-records-v1',
  protection: 'plaintext',
  spaceId,
  bootstrapId,
};
const text = JSON.stringify(marker);

it('encodes exact existing six-field wire bytes and SHA256 identity', () => {
  const encoded = encodeSyncWorkspaceMarker(spaceId, bootstrapId);
  expect(encoded.text).toBe(text);
  expect(encoded.identity).toEqual({
    spaceId,
    bootstrapId,
    fingerprint: createHash('sha256').update(text, 'utf8').digest('hex'),
  });
  expect(parseSyncWorkspaceMarker(text)).toEqual(encoded.identity);
  expect(SYNC_WORKSPACE_MARKER_KEY).toBe('.sniptale/workspace.json');
  expect(SYNC_WORKSPACE_MARKER_MAX_BYTES).toBe(4096);
});

it.each([
  undefined,
  null,
  {},
  new Uint8Array(),
  '',
  'null',
  '[]',
  '{',
  `${text}\n`,
  ` ${text}`,
  '\ufeff' + text,
  JSON.stringify({ ...marker, extra: true }),
  JSON.stringify(Object.fromEntries(Object.entries(marker).reverse())),
  text.replace('"version":1', '"version":1.0'),
  text.replace('"version":1', '"version":1,"version":1'),
  JSON.stringify({ ...marker, spaceId: spaceId.toUpperCase().replace('10000000', 'ABCDEF00') }),
  JSON.stringify({ ...marker, bootstrapId: '20000000-0000-1000-8000-000000000002' }),
  JSON.stringify({ ...marker, spaceId: '10000000-0000-4000-7000-000000000001' }),
  ' '.repeat(4097),
  JSON.stringify({ ...marker, spaceId: 'é'.repeat(2200) }),
])('refuses noncanonical or invalid marker without exposing input %#', (input) => {
  try {
    parseSyncWorkspaceMarker(input);
    throw new Error('Expected refusal');
  } catch (error) {
    expect(error).toBeInstanceOf(SyncWorkspaceMarkerError);
    expect(error).toMatchObject({ code: 'invalid-marker', message: 'invalid-marker' });
  }
});

it.each([
  { ...marker, format: 'foreign' },
  { ...marker, version: 2 },
  { ...marker, protocol: 'future' },
  { ...marker, protection: 'encrypted' },
])('returns a fixed unsupported-format error for unsupported six-field protocol %#', (input) => {
  expect(() => parseSyncWorkspaceMarker(JSON.stringify(input))).toThrowError('unsupported-format');
});

it('accepts only exact optional identity and rejects unknown encoder inputs', () => {
  const { identity } = encodeSyncWorkspaceMarker(spaceId, bootstrapId);
  expect(parseSyncWorkspaceIdentity(null)).toBeNull();
  expect(parseSyncWorkspaceIdentity(identity)).toEqual(identity);
  for (const input of [
    undefined,
    {},
    text,
    { ...identity, extra: true },
    { ...identity, fingerprint: 'A'.repeat(64) },
    { ...identity, spaceId: 'caller' },
  ])
    expect(() => parseSyncWorkspaceIdentity(input)).toThrowError('invalid-marker');
  for (const input of [undefined, null, {}, 4, spaceId.replace('-4000-', '-1000-')]) {
    expect(() => encodeSyncWorkspaceMarker(input, bootstrapId)).toThrowError('invalid-marker');
    expect(() => encodeSyncWorkspaceMarker(spaceId, input)).toThrowError('invalid-marker');
  }
});
