import { WebSnapshotsContent } from './content';
import { useWebSnapshotsController } from './controller';

export function WebSnapshotsSection() {
  return <WebSnapshotsContent state={useWebSnapshotsController()} />;
}
