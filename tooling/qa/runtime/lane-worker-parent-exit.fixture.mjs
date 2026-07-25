import { runQaLaneWorker } from './lane-worker-runner.mjs';

const pidFile = process.argv[2];

process.once('SIGTERM', () => process.exit(143));

void runQaLaneWorker({
  label: 'orchestrator exit fixture',
  memoryMiB: 256,
  resultParser: (value) => value,
  workerArguments: ['spawn-child'],
  workerData: { pidFile },
  workerUrl: new URL('./lane-worker-process.fixture.mjs', import.meta.url),
});
