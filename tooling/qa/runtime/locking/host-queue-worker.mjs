import {
  admitHostQueueTicket,
  assertHostQueueDirectory,
  isHostQueueOwnerAlive,
  readHostQueueTickets,
  removeAbandonedHostTickets,
} from './host-queue.mjs';

const [root, name] = process.argv.slice(2);
try {
  assertHostQueueDirectory(root);
  await removeAbandonedHostTickets(root);
  const tickets = readHostQueueTickets(root);
  const own = tickets.find((ticket) => ticket.name === name);
  if (!own || !isHostQueueOwnerAlive(own.record)) {
    process.exitCode = 0;
  } else if (tickets[0]?.name !== name) {
    process.stdout.write('waiting\n');
  } else {
    admitHostQueueTicket(own);
    process.stdout.write('acquired\n');
    process.stdin.resume();
    process.stdin.once('end', () => process.exit(0));
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : 'QA host admission failed.'}\n`);
  process.exitCode = 1;
}
