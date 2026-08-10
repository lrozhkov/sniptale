import { field, readNumber, readRecord, readString } from './readers';
import { parseLibraryLifecycle } from '../../../composition/persistence/library-lifecycle/parser';

export function readProjectEntryFields(value: unknown) {
  const entry = readRecord(value);
  const updatedAt = readNumber(field(entry, 'updatedAt'));
  const lifecycle = parseLibraryLifecycle(field(entry, 'lifecycle'), {
    storageClass: 'library',
    updatedAt,
  });
  if (!lifecycle) throw new Error('Invalid project lifecycle backup metadata.');
  const revisionValue = field(entry, 'workspaceRevision');
  const workspaceRevision = revisionValue === undefined ? 0 : readNumber(revisionValue);
  if (!Number.isInteger(workspaceRevision) || workspaceRevision < 0) {
    throw new Error('Invalid project workspace revision.');
  }
  return {
    createdAt: readNumber(field(entry, 'createdAt')),
    id: readString(field(entry, 'id')),
    project: field(entry, 'project'),
    lifecycle: { ...lifecycle, storageClass: 'library', savedAt: lifecycle.savedAt ?? updatedAt },
    updatedAt,
    workspaceRevision,
  };
}
