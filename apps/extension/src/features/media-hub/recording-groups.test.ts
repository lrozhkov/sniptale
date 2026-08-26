import { expect, it } from 'vitest';
import { parseRecordingGroupMember } from './recording-groups';

it('parses stable recording group membership and rejects malformed roles or order', () => {
  const member = {
    dimensions: { height: 720, width: 1280 },
    groupId: 'capture-1',
    order: 2,
    role: 'webcam',
    sourceFavicon: 'https://example.com/favicon.ico',
    sourceLabel: null,
    sourceUrl: 'https://example.com/page',
  };
  expect(parseRecordingGroupMember(member)).toEqual(member);
  expect(parseRecordingGroupMember({ ...member, role: 'unknown' })).toBeNull();
  expect(parseRecordingGroupMember({ ...member, order: -1 })).toBeNull();
  expect(parseRecordingGroupMember({ ...member, groupId: ' ' })).toBeNull();
  expect(parseRecordingGroupMember({ ...member, sourceUrl: 42 })).toBeNull();
  expect(
    parseRecordingGroupMember({ ...member, dimensions: { height: 0, width: 1280 } })
  ).toBeNull();
});
