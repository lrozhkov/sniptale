import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const VALIDATOR_PATH = fileURLToPath(
  new URL('../../release/validate-dependency-legal.mjs', import.meta.url)
);

/** Keeps the synchronous guardrail contract while the legal closure reads installed packages. */
export function validateDependencyLegalClosureSync(root = process.cwd()) {
  const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'sniptale-dependency-legal-'));
  const outputPath = path.join(outputDirectory, 'result.json');
  const outputDescriptor = fs.openSync(outputPath, 'w+');
  let outputOpen = true;
  try {
    const result = spawnSync(process.execPath, [VALIDATOR_PATH, '--root', root], {
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
      stdio: ['ignore', outputDescriptor, 'pipe'],
    });
    if (result.status !== 0) {
      return [`Dependency legal validator failed: ${String(result.stderr || result.error).trim()}`];
    }

    const outputSize = fs.fstatSync(outputDescriptor).size;
    const output = Buffer.alloc(outputSize);
    fs.readSync(outputDescriptor, output, 0, outputSize, 0);
    const parsed = JSON.parse(output.toString('utf8'));
    return Array.isArray(parsed.errors)
      ? parsed.errors
      : ['Dependency legal validator output is invalid'];
  } catch {
    return ['Dependency legal validator output is invalid'];
  } finally {
    if (outputOpen) {
      fs.closeSync(outputDescriptor);
    }
    fs.rmSync(outputDirectory, { force: true, recursive: true });
  }
}
