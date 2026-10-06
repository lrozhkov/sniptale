import { expect, it } from 'vitest';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { runtimeVideoExportLifecycleContracts } from './export-lifecycle';

const parse =
  runtimeVideoExportLifecycleContracts[VideoMessageType.PROJECT_EXPORT_PROGRESS].parseRequest;
const message = {
  type: VideoMessageType.PROJECT_EXPORT_PROGRESS,
  jobId: 'job',
  status: { phase: 'RENDERING', progress: 30, message: 'Rendering' },
};
it('accepts legacy status and a finite optional advisory estimate', () => {
  expect(parse(message)).toEqual(message);
  const estimated = {
    ...message,
    status: { ...message.status, timeEstimate: { remainingMs: 1234 } },
  };
  expect(parse(estimated)).toEqual(estimated);
});
it.each([
  null,
  100,
  {},
  { remainingMs: '20' },
  { remainingMs: NaN },
  { remainingMs: Infinity },
  { remainingMs: -1 },
  { remainingMs: Number.MAX_VALUE },
])('rejects invalid estimate %j at the receiving boundary', (timeEstimate) => {
  expect(() => parse({ ...message, status: { ...message.status, timeEstimate } })).toThrow();
});
