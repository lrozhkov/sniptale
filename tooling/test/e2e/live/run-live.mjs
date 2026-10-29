import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
let mode = 'live';
let profile;
let config;
let list = false;
let grep;
for (let index = 0; index < args.length; index++) {
  const arg = args[index];
  if (arg === '--local-errors') mode = 'local-errors';
  else if (arg === '--list') list = true;
  else if (['--profile', '--config', '--grep'].includes(arg)) {
    const value = args[++index];
    if (!value || value.startsWith('--')) throw new Error('A live command option needs a value.');
    if (arg === '--profile') profile = value;
    if (arg === '--config') config = value;
    if (arg === '--grep') grep = value;
  } else throw new Error('Unknown live command option. Use the README launch examples.');
}
if (profile && config)
  throw new Error('Select a named live profile or a configuration file, not both.');
if (mode === 'local-errors' && (profile || config))
  throw new Error('Local error tests do not accept a live provider.');
if (mode === 'live' && !profile && !config)
  throw new Error('Select --profile or --config explicitly.');
if (mode === 'live' && !list) {
  const hasKey = process.env.SNIPTALE_LIVE_API_KEY !== undefined;
  const hasFile = process.env.SNIPTALE_LIVE_KEY_FILE !== undefined;
  if (hasKey === hasFile) throw new Error('Use exactly one live credential source.');
}
const environment = {
  ...process.env,
  SNIPTALE_LIVE_MODE: mode,
  SNIPTALE_LIVE_LIST_ONLY: list ? '1' : '0',
  SNIPTALE_LIVE_RUN_ID: randomUUID(),
  PLAYWRIGHT_NO_COPY_PROMPT: '1',
};
delete environment.SNIPTALE_LIVE_PROFILE;
delete environment.SNIPTALE_LIVE_CONFIG;
delete environment.SNIPTALE_LIVE_RESOLVED_PROFILE;
if (profile) environment.SNIPTALE_LIVE_PROFILE = profile;
if (config) environment.SNIPTALE_LIVE_CONFIG = config;
if (mode === 'local-errors') {
  delete environment.SNIPTALE_LIVE_API_KEY;
  delete environment.SNIPTALE_LIVE_KEY_FILE;
}
console.log(
  mode === 'local-errors'
    ? 'Local AI errors: synthetic endpoint only.'
    : `Live provider selection: ${profile ? 'named profile' : 'configuration file'}. No automatic fallback.`
);
const cli = fileURLToPath(new URL('../../../../node_modules/playwright/cli.js', import.meta.url));
const options = [
  'test',
  '--config',
  fileURLToPath(new URL('./playwright.config.ts', import.meta.url)),
];
if (list) options.push('--list');
if (grep) options.push('--grep', grep);
const result = spawnSync(process.execPath, [cli, ...options], {
  stdio: 'inherit',
  env: environment,
});
if (result.error) console.error('The live E2E process could not start.');
process.exitCode = result.status ?? 1;
