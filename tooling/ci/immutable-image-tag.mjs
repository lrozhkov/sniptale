import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const IMAGE_PATTERN = /^ghcr\.io\/lrozhkov\/sniptale-(?:qa|controller):sha-[a-f0-9]{40}$/u;
const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/u;

function runInspect(image) {
  return spawnSync('docker', ['buildx', 'imagetools', 'inspect', image], {
    encoding: 'utf8',
    timeout: 30_000,
  });
}

export function admitImmutableImageTag(image, expectedDigest, commandRunner = runInspect) {
  if (!IMAGE_PATTERN.test(image) || !DIGEST_PATTERN.test(expectedDigest)) {
    throw new Error('Immutable image admission requires canonical image and digest identities.');
  }
  const result = commandRunner(image);
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
  if (result.error || result.signal) {
    throw new Error(`Unable to inspect immutable image tag: ${image}.`);
  }
  if (result.status === 0) {
    const digest = output.match(/^Digest:\s+(sha256:[a-f0-9]{64})$/mu)?.[1];
    if (digest !== expectedDigest) {
      throw new Error(`Refusing immutable image tag drift: ${image}.`);
    }
    return 'exact';
  }
  if (output.includes('manifest unknown') || output.includes(`${image}: not found`)) {
    return 'absent';
  }
  throw new Error(`Unable to inspect immutable image tag: ${image}.`);
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const [image, expectedDigest] = process.argv.slice(2);
  const disposition = admitImmutableImageTag(image, expectedDigest);
  process.stdout.write(`${disposition}\n`);
}
