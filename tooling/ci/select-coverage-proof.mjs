import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { isExecutedAsScript } from '../qa/core/shared.mjs';
import { verifyMainProof } from './verify-main-proof.mjs';

const PROOF_FILE = '.tmp/qa/coverage-proof.json';
const REPORT_DIRECTORY = '.tmp/coverage/canonical';

function runGh(args) {
  const result = spawnSync('gh', args, { encoding: 'utf8' });
  if (result.status !== 0) throw new Error((result.stderr ?? '').trim() || 'gh command failed');
  return result.stdout;
}

function selectRun(value, commit) {
  const runs = JSON.parse(value).filter(
    (run) => run.headSha === commit && Number.isSafeInteger(run.databaseId)
  );
  if (runs.length === 0) throw new Error('Expected a successful main proof run.');
  return runs[0].databaseId;
}

export function selectVerifiedCoverageProof(
  artifactRoot,
  commit,
  proofDestination,
  reportsDestination
) {
  const root = path.resolve(artifactRoot);
  const { manifest } = verifyMainProof(root, commit);
  const admitted = new Set(manifest.files.map(({ file }) => file));
  if (!admitted.has(PROOF_FILE))
    throw new Error('Successful main proof does not contain a coverage receipt.');
  const reportFiles = [...admitted].filter((file) => file.startsWith(`${REPORT_DIRECTORY}/`));
  if (reportFiles.length === 0)
    throw new Error('Successful main proof does not contain coverage reports.');
  fs.mkdirSync(path.dirname(proofDestination), { recursive: true });
  fs.copyFileSync(path.join(root, PROOF_FILE), proofDestination, fs.constants.COPYFILE_EXCL);
  fs.mkdirSync(reportsDestination, { recursive: false });
  try {
    for (const file of reportFiles) {
      const relative = file.slice(REPORT_DIRECTORY.length + 1);
      const source = path.join(root, file);
      const stat = fs.lstatSync(source);
      if (!stat.isFile() || stat.isSymbolicLink())
        throw new Error(`Unsafe coverage proof report: ${file}`);
      const destination = path.join(reportsDestination, relative);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
    }
  } catch (error) {
    fs.rmSync(proofDestination, { force: true });
    fs.rmSync(reportsDestination, { recursive: true, force: true });
    throw error;
  }
  return {
    proofPath: path.resolve(proofDestination),
    reportsPath: path.resolve(reportsDestination),
  };
}

export function restoreVerifiedMainCoverageProof(
  commit,
  artifactRoot,
  proofDestination,
  reportsDestination,
  { commandRunner = runGh } = {}
) {
  try {
    const runId = selectRun(
      commandRunner([
        'run',
        'list',
        '--workflow',
        'quality-gate.yml',
        '--branch',
        'main',
        '--commit',
        commit,
        '--status',
        'success',
        '--limit',
        '20',
        '--json',
        'databaseId,headSha',
      ]),
      commit
    );
    commandRunner([
      'run',
      'download',
      String(runId),
      '--name',
      `canonical-qa-${commit}-${runId}`,
      '--dir',
      artifactRoot,
    ]);
    return selectVerifiedCoverageProof(artifactRoot, commit, proofDestination, reportsDestination);
  } catch {
    for (const target of [artifactRoot, proofDestination, reportsDestination]) {
      const base = path.basename(path.resolve(target));
      if (!/^(main-coverage-proof-|coverage-proof-|coverage-reports-)/u.test(base))
        throw new Error(`Refusing unsafe coverage proof cleanup target: ${target}`);
      fs.rmSync(target, { recursive: target !== proofDestination, force: true });
    }
    return null;
  }
}

if (isExecutedAsScript(import.meta.url)) {
  const [mode, first, second, third, fourth] = process.argv.slice(2);
  const restored =
    mode === 'restore'
      ? restoreVerifiedMainCoverageProof(first, second, third, fourth)
      : selectVerifiedCoverageProof(mode, first, second, third);
  if (restored) process.stdout.write(`${JSON.stringify(restored)}\n`);
  else
    process.stderr.write(
      'Verified main coverage proof unavailable; full release coverage will run.\n'
    );
}
