import { bootstrapOffscreenDocument } from './runtime/bootstrap';
import { registerOffscreenRuntimeMessageListener } from './runtime';

bootstrapOffscreenDocument();
registerOffscreenRuntimeMessageListener();
