import { createTrustedPhaseCommands } from './container-command.mjs';

export function parseTrustedPhaseReceipt(receipt) {
  if (!receipt || typeof receipt !== 'object' || !['proof', 'release'].includes(receipt.lane)) {
    throw new Error('Trusted phase receipt is malformed.');
  }
  if (!Number.isFinite(receipt.startedAtMs) || !Number.isInteger(receipt.status)) {
    throw new Error('Trusted phase receipt timing or status is malformed.');
  }
  const commands = createTrustedPhaseCommands(receipt.lane);
  if (!Array.isArray(receipt.phases) || receipt.phases.length !== commands.length) {
    throw new Error('Trusted phase receipt is incomplete.');
  }
  let failed = false;
  for (const [index, phase] of receipt.phases.entries()) {
    const [id, executable, args] = commands[index];
    const expectedCommand = [executable, ...args].join(' ');
    const validStatus = failed
      ? phase?.status === 'blocked'
      : phase?.status === 'passed' || phase?.status === 'failed';
    if (
      !phase ||
      typeof phase !== 'object' ||
      phase.id !== id ||
      !validStatus ||
      (phase.status === 'blocked' ? phase.command !== null : phase.command !== expectedCommand)
    ) {
      throw new Error(`Trusted phase receipt differs from the mandatory phase graph at ${id}.`);
    }
    if (phase.status === 'failed') failed = true;
  }
  if ((receipt.status === 0) !== !failed) {
    throw new Error('Trusted phase receipt result differs from its phase graph.');
  }
  return { ...receipt, commands };
}
