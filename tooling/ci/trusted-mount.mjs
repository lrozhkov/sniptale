import fs from 'node:fs';

export function assertReservedMountAvailable(mountPath) {
  try {
    fs.lstatSync(mountPath);
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }
  throw new Error('Candidate workspace occupies the reserved trusted tooling mount path.');
}
