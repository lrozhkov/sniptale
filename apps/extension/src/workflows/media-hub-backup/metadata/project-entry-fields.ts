import { field, readNumber, readRecord, readString } from './readers';

export function readProjectEntryFields(value: unknown) {
  const entry = readRecord(value);
  return {
    createdAt: readNumber(field(entry, 'createdAt')),
    id: readString(field(entry, 'id')),
    project: field(entry, 'project'),
    updatedAt: readNumber(field(entry, 'updatedAt')),
  };
}
