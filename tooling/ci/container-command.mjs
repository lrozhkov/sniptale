const TRUSTED_CONTAINER_WORKDIR = '/workspace';
const CANONICAL_IMAGE_ENVIRONMENT = Object.freeze({
  DEBIAN_FRONTEND: 'noninteractive',
  NODE_VERSION: '22.22.1',
  PATH: '/opt/codeql:/opt/semgrep/bin:/usr/local/bin:/usr/local/sbin:/usr/sbin:/usr/bin:/sbin:/bin',
  PLAYWRIGHT_BROWSERS_PATH: '/opt/playwright',
  XDG_CACHE_HOME: '/workspace/.tmp/ci-cache',
  YARN_VERSION: '1.22.22',
  npm_config_cache: '/workspace/.tmp/npm-cache',
});

export function validateCandidateImageEnvironment(entries) {
  if (!Array.isArray(entries) || entries.some((entry) => typeof entry !== 'string')) {
    throw new Error('Candidate QA image environment is malformed.');
  }
  const observed = new Map();
  for (const entry of entries) {
    const separator = entry.indexOf('=');
    if (separator < 1) throw new Error('Candidate QA image environment is malformed.');
    const name = entry.slice(0, separator);
    if (observed.has(name)) throw new Error(`Candidate QA image environment repeats ${name}.`);
    observed.set(name, entry.slice(separator + 1));
  }
  const actual = [...observed].sort(([left], [right]) => left.localeCompare(right));
  const expected = Object.entries(CANONICAL_IMAGE_ENVIRONMENT).sort(([left], [right]) =>
    left.localeCompare(right)
  );
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error('Candidate QA image environment differs from the trusted locked baseline.');
  }
  return Object.fromEntries(observed);
}

const EXECUTABLE_PATHS = Object.freeze({
  node: '/usr/local/bin/node',
  npm: '/usr/local/bin/npm',
  'node_modules/.bin/ast-grep': '/workspace/node_modules/.bin/ast-grep',
});

export function createTrustedPhaseCommands(lane) {
  if (!['proof', 'release'].includes(lane)) {
    throw new Error(`Unsupported trusted container lane: ${String(lane)}`);
  }
  return [
    ['install', 'npm', ['ci', '--ignore-scripts']],
    [
      'verify-project-toolchain',
      'node',
      ['/opt/sniptale-trusted/tooling/ci/verify-project-toolchain.mjs'],
    ],
    ['provision-canvas', 'npm', ['rebuild', 'canvas']],
    [
      'verify-canvas',
      'node',
      [
        '-e',
        "const { createCanvas } = require('canvas'); if (!createCanvas(1, 1).getContext('2d')) process.exit(1);",
      ],
    ],
    ['provision-ast-grep', 'node', ['node_modules/@ast-grep/cli/postinstall.js']],
    ['verify-ast-grep', 'node_modules/.bin/ast-grep', ['--version']],
    [
      lane,
      'node',
      [
        ...(lane === 'proof' ? ['--max-old-space-size=8192'] : ['--max-old-space-size=12288']),
        `tooling/ci/${lane}-wrapper.mjs`,
      ],
    ],
  ];
}

export function appendCandidatePhaseInvocation(dockerArgs, { args, executable, image }) {
  if (!Array.isArray(dockerArgs) || dockerArgs.length === 0) {
    throw new Error('Trusted container invocation requires Docker run arguments.');
  }
  if (typeof image !== 'string' || image.length === 0) {
    throw new Error('Trusted container invocation requires an image reference.');
  }
  const entrypoint = EXECUTABLE_PATHS[executable];
  if (!entrypoint || !Array.isArray(args) || args.some((value) => typeof value !== 'string')) {
    throw new Error(`Unsupported trusted phase executable: ${String(executable)}`);
  }
  return [
    ...dockerArgs,
    `--workdir=${TRUSTED_CONTAINER_WORKDIR}`,
    `--entrypoint=${entrypoint}`,
    image,
    ...args,
  ];
}

export { CANONICAL_IMAGE_ENVIRONMENT, TRUSTED_CONTAINER_WORKDIR };
