import { z } from 'zod';
// policyStateIds: [] - package field and forbidden-key sets are immutable import validation policy.
import {
  SETTINGS_TRANSFER_FORMAT,
  SETTINGS_TRANSFER_FORMAT_VERSION,
  SETTINGS_TRANSFER_MAX_BYTES,
  SETTINGS_TRANSFER_MAX_DEPTH,
  SETTINGS_TRANSFER_MAX_DOMAINS,
  SETTINGS_TRANSFER_MAX_JSON_NODES,
} from './limits';
import type { SettingsTransferJsonValue, SettingsTransferPackageV1 } from './types';

export type SettingsTransferPackageParseErrorCode =
  | 'file-too-large'
  | 'invalid-json'
  | 'invalid-package'
  | 'future-format'
  | 'limit-exceeded'
  | 'secret-material';

export class SettingsTransferPackageError extends Error {
  constructor(
    readonly code: SettingsTransferPackageParseErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'SettingsTransferPackageError';
  }
}

const packageSchema = z
  .object({
    format: z.literal(SETTINGS_TRANSFER_FORMAT),
    formatVersion: z.number().int().positive(),
    exportKind: z.enum(['backup', 'selective']),
    exportedAt: z.iso.datetime({ offset: true }),
    source: z.object({ appVersion: z.string().min(1).max(128) }).strict(),
    domains: z.record(
      z.string().min(1).max(128).refine(isDomainId),
      z
        .object({
          schemaVersion: z.number().int().positive(),
          data: z.unknown(),
        })
        .strict()
    ),
  })
  .strict();

function isDomainId(value: string): boolean {
  const segments = value.split(/[.-]/u);
  return (
    segments.length > 0 &&
    segments.every(
      (segment, index) =>
        segment.length > 0 &&
        [...segment].every((character, characterIndex) =>
          index === 0 && characterIndex === 0
            ? character >= 'a' && character <= 'z'
            : (character >= 'a' && character <= 'z') || (character >= '0' && character <= '9')
        )
    )
  );
}

const FORBIDDEN_NORMALIZED_KEYS = new Set([
  'apikey',
  'passphrase',
  'encryptedenvelope',
  'encryptedsecret',
  'kdf',
  'kdfmetadata',
  'protectionmetadata',
  'hasstoredapikey',
  'microphonedeviceid',
  'webcamdeviceid',
]);

export function parseSettingsTransferPackageText(fileText: string): SettingsTransferPackageV1 {
  if (new TextEncoder().encode(fileText).byteLength > SETTINGS_TRANSFER_MAX_BYTES) {
    throw new SettingsTransferPackageError('file-too-large', 'Settings package exceeds 2 MiB');
  }

  let value: unknown;
  try {
    value = JSON.parse(fileText) as unknown;
  } catch {
    throw new SettingsTransferPackageError('invalid-json', 'Settings package is not valid JSON');
  }

  enforceJsonLimitsAndSecretPolicy(value);
  const parsed = packageSchema.safeParse(value);
  if (!parsed.success) {
    throw new SettingsTransferPackageError('invalid-package', 'Settings package shape is invalid');
  }
  if (parsed.data.formatVersion > SETTINGS_TRANSFER_FORMAT_VERSION) {
    throw new SettingsTransferPackageError(
      'future-format',
      'Settings package was created by a newer format version'
    );
  }
  if (parsed.data.formatVersion !== SETTINGS_TRANSFER_FORMAT_VERSION) {
    throw new SettingsTransferPackageError(
      'invalid-package',
      'Unsupported settings package version'
    );
  }
  if (Object.keys(parsed.data.domains).length > SETTINGS_TRANSFER_MAX_DOMAINS) {
    throw new SettingsTransferPackageError(
      'limit-exceeded',
      'Settings package has too many domains'
    );
  }

  return parsed.data as SettingsTransferPackageV1;
}

export function stringifySettingsTransferPackage(value: SettingsTransferPackageV1): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function enforceJsonLimitsAndSecretPolicy(
  value: unknown
): asserts value is SettingsTransferJsonValue {
  let nodes = 0;
  const pending: Array<{ value: unknown; depth: number }> = [{ value, depth: 1 }];
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) break;
    nodes += 1;
    if (nodes > SETTINGS_TRANSFER_MAX_JSON_NODES) {
      throw new SettingsTransferPackageError('limit-exceeded', 'Settings package is too complex');
    }
    if (current.depth > SETTINGS_TRANSFER_MAX_DEPTH) {
      throw new SettingsTransferPackageError(
        'limit-exceeded',
        'Settings package is too deeply nested'
      );
    }
    if (
      current.value === null ||
      typeof current.value === 'boolean' ||
      typeof current.value === 'string'
    ) {
      continue;
    }
    if (typeof current.value === 'number') {
      if (!Number.isFinite(current.value)) {
        throw new SettingsTransferPackageError('invalid-package', 'Non-finite number is not JSON');
      }
      continue;
    }
    if (Array.isArray(current.value)) {
      for (const item of current.value) pending.push({ value: item, depth: current.depth + 1 });
      continue;
    }
    if (typeof current.value !== 'object') {
      throw new SettingsTransferPackageError('invalid-package', 'Unsupported JSON value');
    }
    const record = current.value as Record<string, unknown>;
    for (const [key, item] of Object.entries(record)) {
      const normalizedKey = key.replace(/[^a-z0-9]/gi, '').toLowerCase();
      if (FORBIDDEN_NORMALIZED_KEYS.has(normalizedKey)) {
        throw new SettingsTransferPackageError(
          'secret-material',
          'Settings package contains excluded secret or device material'
        );
      }
      pending.push({ value: item, depth: current.depth + 1 });
    }
  }
}
