import { CaptureResourcesContent } from './content';
import { useCaptureResourcesController } from './controller';

export function CaptureResourcesSettings() {
  return <CaptureResourcesContent state={useCaptureResourcesController()} />;
}
