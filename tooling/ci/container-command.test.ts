import { expect, it } from 'vitest';

import {
  appendCandidatePhaseInvocation,
  CANONICAL_IMAGE_ENVIRONMENT,
  TRUSTED_CONTAINER_WORKDIR,
  createTrustedPhaseCommands,
  validateCandidateImageEnvironment,
} from './container-command.mjs';

const canonicalEnvironment = () =>
  Object.entries(CANONICAL_IMAGE_ENVIRONMENT).map(([name, value]) => `${name}=${value}`);

function resolveEffectiveProcess(
  invocation: string[],
  image: string,
  candidateConfig: { Entrypoint: string[]; WorkingDir: string }
) {
  const imageIndex = invocation.indexOf(image);
  const options = invocation.slice(0, imageIndex);
  const command = invocation.slice(imageIndex + 1);
  const explicitEntrypoint = options
    .find((value) => value.startsWith('--entrypoint='))
    ?.slice('--entrypoint='.length);
  const explicitWorkdir = options
    .find((value) => value.startsWith('--workdir='))
    ?.slice('--workdir='.length);
  return {
    process: [
      ...(explicitEntrypoint ? [explicitEntrypoint] : candidateConfig.Entrypoint),
      ...command,
    ],
    workingDirectory: explicitWorkdir ?? candidateConfig.WorkingDir,
  };
}

it('dispatches every mandatory proof phase from the trusted host plan', () => {
  expect(createTrustedPhaseCommands('proof').map(([id]) => id)).toEqual([
    'install',
    'verify-project-toolchain',
    'provision-canvas',
    'verify-canvas',
    'provision-ast-grep',
    'verify-ast-grep',
    'proof',
  ]);
  expect(createTrustedPhaseCommands('release').at(-1)).toEqual([
    'release',
    'node',
    ['--max-old-space-size=12288', 'tooling/ci/release-wrapper.mjs'],
  ]);
});

it('overrides hostile candidate image process metadata for each phase', () => {
  const image = 'sniptale-qa:hostile-candidate';
  const invocation = appendCandidatePhaseInvocation(['run', '--rm'], {
    args: ['ci', '--ignore-scripts'],
    executable: 'npm',
    image,
  });
  const effective = resolveEffectiveProcess(invocation, image, {
    Entrypoint: ['/candidate/forge-proof'],
    WorkingDir: '/candidate-controlled',
  });

  expect(effective).toEqual({
    process: ['/usr/local/bin/npm', 'ci', '--ignore-scripts'],
    workingDirectory: TRUSTED_CONTAINER_WORKDIR,
  });
  expect(effective.process).not.toContain('/candidate/forge-proof');
});

it('rejects an unknown lane or executable before Docker can start candidate configuration', () => {
  expect(() => createTrustedPhaseCommands('unknown')).toThrow(
    /Unsupported trusted container lane/u
  );
  expect(() =>
    appendCandidatePhaseInvocation(['run', '--rm'], {
      args: [],
      executable: '/candidate/forge-proof',
      image: 'sniptale-qa:candidate',
    })
  ).toThrow(/Unsupported trusted phase executable/u);
});

it.each([
  'BASH_ENV=/candidate/forge-proof.sh',
  'NODE_OPTIONS=--require=/candidate/forge-proof.js',
  'LD_PRELOAD=/candidate/forge-proof.so',
  'LD_AUDIT=/candidate/forge-proof.so',
])('rejects candidate image startup hook %s', (hostileEntry) => {
  expect(() =>
    validateCandidateImageEnvironment([...canonicalEnvironment(), hostileEntry])
  ).toThrow(/differs from the trusted locked baseline/u);
});

it('rejects a candidate PATH override and accepts only the locked image environment', () => {
  const hostile = canonicalEnvironment().filter((entry) => !entry.startsWith('PATH='));
  hostile.push('PATH=/candidate/bin:/usr/local/bin:/usr/bin:/bin');
  expect(() => validateCandidateImageEnvironment(hostile)).toThrow(/locked baseline/u);
  expect(validateCandidateImageEnvironment(canonicalEnvironment())).toEqual(
    CANONICAL_IMAGE_ENVIRONMENT
  );
});
