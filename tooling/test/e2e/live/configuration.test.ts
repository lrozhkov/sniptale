import normalConfig from '../../../../playwright.config';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { parseLiveProfile, readLiveCredential, readLiveProfileSelection } from './configuration';
import { LIVE_PROFILES } from './profiles';

const temporary: string[] = [];
afterEach(() => {
  for (const folder of temporary.splice(0)) rmSync(folder, { recursive: true, force: true });
});
it('admits the shipped operation profiles and freezes nested operation configuration', () => {
  const profile = parseLiveProfile(LIVE_PROFILES['routerai']);
  expect(profile.models.transcription?.audio?.transcription?.structuredOutput).toBe('json_object');
  expect(Object.isFrozen(profile)).toBe(true);
  expect(Object.isFrozen(profile.models.transcription?.audio?.transcription)).toBe(true);
  expect(parseLiveProfile(LIVE_PROFILES['neuraldeep']).models.text?.modelId).toBe(
    'qwen3.6-35b-a3b-noreason'
  );
});
it.each([
  { apiKey: 'synthetic-rejected-value' },
  { endpoint: 'https://user:synthetic-rejected-value@example.com/v1' },
  { endpoint: 'https://example.com/v1?key=synthetic-rejected-value' },
  { endpoint: 'http://remote.example/v1' },
  { connectionType: 'gigachat' },
  { connectionType: 'synthetic-rejected-value' },
  { connectionType: 'chrome-built-in' },
  { connectionType: 'ollama' },
  { connectionType: 'anthropic' },
  { models: {} },
  { models: { speech: { modelId: 'm', displayName: 'm' } } },
  {
    models: {
      transcription: {
        modelId: 'm',
        displayName: 'm',
        audio: {
          transcription: {
            transport: 'audio-chat',
            responseFormat: 'verbose_json',
            timestampGranularity: 'word',
          },
        },
      },
    },
  },
])('rejects unsafe or unusable configuration without reflecting values', (override) => {
  expect(() => parseLiveProfile({ ...LIVE_PROFILES['neuraldeep'], ...override })).toThrow(
    'Invalid live provider configuration.'
  );
  try {
    parseLiveProfile({ ...LIVE_PROFILES['neuraldeep'], ...override });
  } catch (error) {
    expect(String(error)).not.toContain('synthetic-rejected-value');
  }
});
it('reads one trimmed inline or external plaintext credential', () => {
  expect(readLiveCredential({ SNIPTALE_LIVE_API_KEY: ' synthetic-key ' })).toBe('synthetic-key');
  const folder = mkdtempSync(join(tmpdir(), 'sniptale-live-key-'));
  temporary.push(folder);
  const path = join(folder, 'key');
  writeFileSync(path, ' synthetic-key\n');
  expect(readLiveCredential({ SNIPTALE_LIVE_KEY_FILE: path })).toBe('synthetic-key');
});
it.each([
  {},
  { SNIPTALE_LIVE_API_KEY: '' },
  { SNIPTALE_LIVE_API_KEY: 'a\nb' },
  { SNIPTALE_LIVE_API_KEY: 'synthetic-key', SNIPTALE_LIVE_KEY_FILE: '/missing' },
  { SNIPTALE_LIVE_KEY_FILE: '/missing/synthetic-rejected-value' },
])('rejects absent, ambiguous or invalid credentials with a fixed error', (environment) => {
  expect(() => readLiveCredential(environment)).toThrow();
  try {
    readLiveCredential(environment);
  } catch (error) {
    expect(String(error)).not.toContain('synthetic-rejected-value');
    expect(String(error)).not.toContain('synthetic-key');
  }
});

it('excludes the live owner from ordinary Playwright discovery', () => {
  expect(normalConfig.testIgnore).toEqual(['**/live/**']);
});

it('retains the run provider snapshot when the external file changes before another worker starts', () => {
  const folder = mkdtempSync(join(tmpdir(), 'sniptale-live-profile-'));
  temporary.push(folder);
  const path = join(folder, 'profile.json');
  writeFileSync(path, JSON.stringify(LIVE_PROFILES['neuraldeep']));
  const first = readLiveProfileSelection({ SNIPTALE_LIVE_CONFIG: path });
  const snapshot = JSON.stringify(first);
  writeFileSync(path, JSON.stringify(LIVE_PROFILES['routerai']));
  const worker = readLiveProfileSelection({
    SNIPTALE_LIVE_CONFIG: path,
    SNIPTALE_LIVE_RESOLVED_PROFILE: snapshot,
  });
  expect(worker.id).toBe('neuraldeep');
  expect(worker.endpoint).toBe(first.endpoint);
  expect(worker.models).toEqual(first.models);
});
