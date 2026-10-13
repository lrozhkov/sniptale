import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { expect, it, vi } from 'vitest';

import { createTempRoot, initGitRepo, runGit, writeFile } from '../qa/test-support/test-helpers';
import {
  acquireHostQaSlot,
  HOST_QUEUE_TICKET_ENV,
  readHostQueueTickets,
} from '../qa/runtime/locking/host-queue.mjs';

const runnerUrl = new URL('../qa/wrappers/observed/runner.mjs', import.meta.url).href;
const queueUrl = new URL('../qa/runtime/locking/host-queue.mjs', import.meta.url).href;
const cliUrl = new URL('../qa/runtime/process/shared-cli.mjs', import.meta.url).href;
const profilesUrl = new URL('../qa/runtime/scheduling/resource-profile.mjs', import.meta.url).href;
const lockUrl = new URL('../qa/runtime/locking/blocking-wrapper-lock.helpers.mjs', import.meta.url)
  .href;

function prepareFixture(root: string, queueRoot: string) {
  for (const name of ['local.mjs', 'proof-wrapper.mjs', 'release-wrapper.mjs'])
    writeFile(root, `tooling/ci/${name}`, fs.readFileSync(new URL(name, import.meta.url), 'utf8'));
  const mark =
    "import fs from 'node:fs'; const mark = (value) => fs.appendFileSync('trace.log', value + '\\n');\n";
  writeFile(
    root,
    'tooling/ci/control-digest.mjs',
    `${mark}export function createCandidateControlDigest() { mark('digest:' + fs.readFileSync('candidate.txt', 'utf8')); return 'fixture-digest'; }`
  );
  writeFile(
    root,
    'tooling/ci/local-toolchain.mjs',
    `${mark}
export async function ensureLocalToolchain() { mark('toolchain'); return { environment: { ...process.env } }; }
export function resolveLocalExecutionEnvironmentIdentity() { return { kind: 'host-wsl', digest: 'sha256:' + 'a'.repeat(64) }; }
`
  );
  writeFile(
    root,
    'tooling/ci/seal-lane-artifacts.mjs',
    `${mark}
export function sealLaneArtifacts() {
  const ticket = JSON.parse(fs.readFileSync(${JSON.stringify(queueRoot)} + '/' + process.env.SNIPTALE_QA_HOST_QUEUE_TICKET, 'utf8'));
  const lock = JSON.parse(fs.readFileSync('.tmp/qa/locks/blocking-wrapper.lock.json', 'utf8'));
  if (ticket.pid !== process.pid || !ticket.admitted || ticket.released || lock.pid !== process.pid) throw new Error('CI released its slots before sealing.');
  mark('seal'); return true;
}`
  );
  for (const file of [
    'local-project-bootstrap.mjs',
    'verify-project-toolchain.mjs',
    'local-workflow-validation.mjs',
  ])
    writeFile(
      root,
      `tooling/ci/${file}`,
      `${mark}mark(process.argv[1].split('/').at(-1) + ':' + (process.argv[2] ?? 'check'));`
    );
  writeFile(
    root,
    'tooling/ci/mediabunny/normalize.mjs',
    `${mark}export function normalizeMediabunny() { mark('normalize'); }`
  );
  writeFile(
    root,
    'tooling/ci/qa-composition.mjs',
    `${mark}
const collect = ({ session }) => { mark('gate:' + fs.readFileSync('candidate.txt', 'utf8')); return { steps: [], context: { scope: 'workspace' } }; };
export const collectCiProofResults = collect;
export const collectCiReleaseResults = collect;
`
  );
  writeFile(
    root,
    'tooling/qa/runtime/process/shared-cli.mjs',
    `export { isExecutedAsScript } from ${JSON.stringify(cliUrl)};`
  );
  writeFile(
    root,
    'tooling/qa/runtime/scheduling/resource-profile.mjs',
    `export { resolveQaReleaseResourceProfile, resolveQaResourceProfile } from ${JSON.stringify(profilesUrl)};`
  );
  writeFile(
    root,
    'tooling/qa/runtime/locking/blocking-wrapper-lock.helpers.mjs',
    `export { acquireBlockingWrapperLock } from ${JSON.stringify(lockUrl)};`
  );
  writeFile(
    root,
    'tooling/qa/runtime/locking/host-queue.mjs',
    `
import { acquireHostQaSlot as acquire } from ${JSON.stringify(queueUrl)};
export { HOST_QUEUE_TICKET_ENV } from ${JSON.stringify(queueUrl)};
export function acquireHostQaSlot(id, options) { return acquire(id, { ...options, sharedRoot: ${JSON.stringify(queueRoot)} }); }
`
  );
  writeFile(
    root,
    'tooling/qa/wrappers/observed/runner.mjs',
    `
import { runObservedWrapper as run } from ${JSON.stringify(runnerUrl)};
import { acquireHostQaSlot } from ${JSON.stringify(queueUrl)};
export function runObservedWrapper(options) { return run({ contractValidator: () => {}, hostSlotFactory: (id, options) => acquireHostQaSlot(id, { ...options, sharedRoot: ${JSON.stringify(queueRoot)} }), ...options }); }
`
  );
  writeFile(
    root,
    'tooling/ci/local-fast-proof-admission.mjs',
    `${mark}
export function prepareLocalFastProofAdmission() {
  mark('admission');
  const proofRoot = process.cwd() + '/.tmp/inherited';
  const admission = { artifactKind: 'sniptale-fast-proof-admission', outcome: 'admitted', candidateTree: process.env.SNIPTALE_CANDIDATE_TREE, commit: process.env.SNIPTALE_CANDIDATE_SHA, executionEnvironment: { kind: 'host-wsl', digest: 'sha256:' + 'a'.repeat(64) }, workspaceMode: 'local-workspace', proofRoot };
  for (const file of ['unit-proof.json', 'coverage-proof.json']) { const dest = proofRoot + '/.tmp/qa/' + file; fs.mkdirSync(dest.slice(0, dest.lastIndexOf('/')), { recursive: true }); fs.writeFileSync(dest, '{}'); }
  for (const file of ['coverage-final.json', 'coverage-summary.json', 'lcov.info', 'html/index.html']) { const dest = proofRoot + '/.tmp/coverage/canonical/' + file; fs.mkdirSync(dest.slice(0, dest.lastIndexOf('/')), { recursive: true }); fs.writeFileSync(dest, '{}'); }
  const admissionPath = process.cwd() + '/.tmp/admission.json'; fs.writeFileSync(admissionPath, JSON.stringify(admission)); return { admission, admissionPath };
}
`
  );
  writeFile(root, '.gitignore', '.tmp/\ntrace.log\n');
  writeFile(root, 'candidate.txt', 'before');
  initGitRepo(root);
  runGit(root, 'add', '.');
  runGit(root, 'commit', '-m', 'CLI fixture');
}

it.skipIf(process.platform !== 'linux').each(['proof', 'release'])(
  'admits the actual local %s CLI before setup, proof identity, or checks',
  async (lane) => {
    const root = createTempRoot('ci-host-admission-');
    const queueRoot = createTempRoot('ci-host-admission-queue-');
    fs.chmodSync(queueRoot, 0o700);
    prepareFixture(root, queueRoot);
    const owner = await acquireHostQaSlot('qa:checkpoint', { sharedRoot: queueRoot });
    const environment = {
      ...process.env,
      SNIPTALE_QA_CPU_TOKENS: '2',
      SNIPTALE_QA_MEMORY_MIB: '6144',
      SNIPTALE_QA_VITEST_MAX_WORKERS: '1',
    };
    delete environment[HOST_QUEUE_TICKET_ENV];
    delete environment.SNIPTALE_QA_OBSERVABILITY_ROOT;
    const child = spawn(process.execPath, [path.join(root, 'tooling/ci/local.mjs'), lane], {
      cwd: root,
      env: environment,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (value) => {
      output += value.toString();
    });
    child.stderr.on('data', (value) => {
      output += value.toString();
    });
    const exited = new Promise<number | null>((resolve, reject) => {
      child.once('exit', resolve);
      child.once('error', reject);
    });
    try {
      await vi.waitFor(
        () =>
          expect(
            fs.existsSync(path.join(root, 'trace.log')) ||
              readHostQueueTickets(queueRoot).length === 2
          ).toBe(true),
        { timeout: 3000 }
      );
      expect(fs.existsSync(path.join(root, 'trace.log'))).toBe(false);
      fs.writeFileSync(path.join(root, 'candidate.txt'), 'after');
      owner.release();
      const code = await exited;
      expect(code, output).toBe(0);
      const trace = fs.readFileSync(path.join(root, 'trace.log'), 'utf8');
      expect(trace).toContain('digest:after');
      expect(trace).toContain('gate:after');
      expect(trace).toContain('normalize');
      expect(trace).toContain('seal');
      if (lane === 'release') expect(trace).toContain('admission');
      expect(readHostQueueTickets(queueRoot)).toHaveLength(0);
    } finally {
      for (const { record } of readHostQueueTickets(queueRoot)) {
        if (record.pid !== process.pid) process.kill(record.pid, 'SIGKILL');
      }
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      owner.release();
      await exited;
    }
  }
);
