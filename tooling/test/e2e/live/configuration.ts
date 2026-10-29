import { readFileSync, statSync } from 'node:fs';
import { z } from 'zod';
import {
  getAIProviderDefinition,
  getAIProviderOperations,
  isAIProviderType,
} from '../../../../apps/extension/src/contracts/settings/ai-provider';
import {
  isValidAIModelOperationConfiguration,
  type AIModelAudioParameters,
} from '../../../../apps/extension/src/contracts/settings/model-operation';
import { LIVE_PROFILES, type LiveProfile } from './profiles';

const text = z.string().trim().min(1).max(500);
const audio = z.custom<AIModelAudioParameters>(
  (value: unknown) =>
    isValidAIModelOperationConfiguration({ operation: 'transcription', audio: value }) ||
    isValidAIModelOperationConfiguration({ operation: 'speech', audio: value })
);
const model = z.object({ modelId: text, displayName: text, audio: audio.optional() }).strict();
const schema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/u),
    label: text,
    connectionType: z.custom<LiveProfile['connectionType']>(
      (value: unknown) =>
        isAIProviderType(value) &&
        getAIProviderDefinition(value).available &&
        getAIProviderDefinition(value).credential === 'api-key'
    ),
    endpoint: z
      .string()
      .max(2000)
      .refine((value) => {
        try {
          const url = new URL(value);
          return (
            !url.username &&
            !url.password &&
            !url.search &&
            !url.hash &&
            (url.protocol === 'https:' ||
              (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))
          );
        } catch {
          return false;
        }
      }),
    management: z.enum(['automatic', 'manual']),
    models: z
      .object({ text: model.optional(), transcription: model.optional(), speech: model.optional() })
      .strict(),
  })
  .strict()
  .superRefine((value, context) => {
    if (!Object.values(value.models).some(Boolean))
      context.addIssue({ code: 'custom', message: 'An operation is required.' });
    for (const operation of ['text', 'transcription', 'speech'] as const) {
      const entry = value.models[operation];
      if (!entry) continue;
      if (!getAIProviderOperations(value.connectionType).includes(operation))
        context.addIssue({ code: 'custom', message: 'The adapter does not admit this operation.' });
      if (
        !isValidAIModelOperationConfiguration({
          operation,
          ...(entry.audio ? { audio: entry.audio } : {}),
        })
      )
        context.addIssue({ code: 'custom', message: 'Operation parameters are invalid.' });
      if (operation !== 'text' && !entry.audio?.[operation])
        context.addIssue({ code: 'custom', message: 'Audio operation parameters are required.' });
    }
  });

/** Parses secret-free profile data. Validation never includes rejected input in an error. */
export function parseLiveProfile(value: unknown): LiveProfile {
  const parsed = schema.safeParse(value);
  if (!parsed.success)
    throw new Error(
      'Invalid live provider configuration. Check the documented configuration fields.'
    );
  for (const entry of Object.values(parsed.data.models)) {
    if (!entry) continue;
    if (entry.audio?.transcription) Object.freeze(entry.audio.transcription);
    if (entry.audio?.speech) Object.freeze(entry.audio.speech);
    if (entry.audio) Object.freeze(entry.audio);
    Object.freeze(entry);
  }
  Object.freeze(parsed.data.models);
  return Object.freeze(parsed.data);
}

/** Reads explicit profile input or the validated parent-process snapshot. */
export function readLiveProfileSelection(environment: NodeJS.ProcessEnv): LiveProfile {
  const snapshot = environment['SNIPTALE_LIVE_RESOLVED_PROFILE'];
  const name = environment['SNIPTALE_LIVE_PROFILE'];
  const file = environment['SNIPTALE_LIVE_CONFIG'];
  if (name && file)
    throw new Error('Select a named live profile or a configuration file, not both.');
  let input: unknown;
  try {
    if (snapshot !== undefined) {
      if (snapshot.length > 65536) throw new Error('oversized');
      input = JSON.parse(snapshot);
    } else if (file) {
      if (statSync(file).size > 65536) throw new Error('oversized');
      input = JSON.parse(readFileSync(file, 'utf8'));
    } else input = name ? LIVE_PROFILES[name] : undefined;
  } catch {
    throw new Error('Cannot read the live provider configuration.');
  }
  return parseLiveProfile(input);
}

let selected: LiveProfile | undefined;
/** Freezes the run selection before workers start. Workers never reread a changed profile file. */
export function getLiveProfile(): LiveProfile {
  if (selected) return selected;
  selected = readLiveProfileSelection(process.env);
  process.env['SNIPTALE_LIVE_RESOLVED_PROFILE'] = JSON.stringify(selected);
  return selected;
}

/** Reads one external credential without exposing file contents or operating-system errors. */
export function readLiveCredential(environment: NodeJS.ProcessEnv = process.env): string {
  const inline = environment.SNIPTALE_LIVE_API_KEY;
  const file = environment.SNIPTALE_LIVE_KEY_FILE;
  if (inline !== undefined && file !== undefined)
    throw new Error('Use exactly one live credential source.');
  let key: string;
  try {
    if (file !== undefined) {
      if (statSync(file).size > 16384) throw new Error('oversized');
      key = readFileSync(file, 'utf8').trim();
    } else key = inline?.trim() ?? '';
  } catch {
    throw new Error('Cannot read the external live credential file.');
  }
  if (!key || key.length > 8192 || /[\r\n\0]/u.test(key))
    throw new Error('A nonempty single-line live credential is required.');
  return key;
}
