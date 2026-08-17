import { spawnSync } from 'node:child_process';

import { collectLaneArtifacts } from './artifacts.mjs';

const lane = process.argv[2];
const trustedRoot = process.env.SNIPTALE_TRUSTED_CI_ROOT;
const wrapper = (name, ...args) => [
  'node',
  [
    ...(name === 'release' ? ['--max-old-space-size=8192'] : []),
    trustedRoot
      ? `/opt/sniptale-trusted/tooling/qa/wrappers/${name}.mjs`
      : `tooling/qa/wrappers/${name}.mjs`,
    ...args,
  ],
];
const commands = {
  release: [
    wrapper('release-harness'),
    wrapper('release'),
    ...(process.env.SNIPTALE_RELEASE_AUDIT === '1'
      ? [wrapper('audit', '--profile', 'release')]
      : []),
  ],
  security: [
    wrapper('audit', '--profile', 'security'),
    [
      'node',
      [
        trustedRoot
          ? '/opt/sniptale-trusted/tooling/qa/audits/licenses.mjs'
          : 'tooling/qa/audits/licenses.mjs',
      ],
    ],
  ],
  coverage: [wrapper('audit', '--profile', 'coverage')],
};
if (!commands[lane]) throw new Error(`Usage: run-lane.mjs <${Object.keys(commands).join('|')}>`);
if (process.env.SNIPTALE_CI_IN_CONTAINER !== '1') {
  throw new Error('Canonical lanes may only run inside the locked QA container.');
}

const startedAtMs = Date.now();
let status = 0;
const executed = [['npm', ['ci', '--ignore-scripts']]];
for (const command of [...executed, ...commands[lane]]) {
  const result = spawnSync(command[0], command[1], { stdio: 'inherit', env: process.env });
  if (result.status !== 0) {
    status = result.status ?? 1;
    break;
  }
}
let artifactPath;
try {
  artifactPath = collectLaneArtifacts({
    lane,
    startedAtMs,
    status: status === 0 ? 'passed' : 'failed',
    command: commands[lane].map(([name, args]) => [name, ...args].join(' ')),
    containerDigest: process.env.SNIPTALE_CI_CONTAINER_DIGEST,
  });
  process.stdout.write(`SNIPTALE_ARTIFACT_PATH=${artifactPath}\n`);
} catch (error) {
  process.stderr.write(
    `Artifact collection failed: ${error instanceof Error ? error.message : String(error)}\n`
  );
  status = status || 1;
}
process.exit(status);
