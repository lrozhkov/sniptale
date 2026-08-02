// policyStateIds: video-camera-recorder-grant, video-post-record-results
// One persistence barrier serializes both recording authority stores.
import {
  runWithPersistenceMutationPermit,
  type PersistenceMutationPermit,
} from '../../../composition/persistence/infrastructure/mutation-barrier';

let mutationQueue: Promise<void> = Promise.resolve();

export function runSerializedVideoRecordingAuthorityMutation<T>(
  mutation: (permit: PersistenceMutationPermit) => Promise<T>
): Promise<T> {
  const next = mutationQueue
    .catch(() => undefined)
    .then(() => runWithPersistenceMutationPermit(mutation));
  mutationQueue = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}
