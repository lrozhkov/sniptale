import { walkAllDocuments } from '../../../../../platform/frame';

export function applyAiPickDocumentMode(enabled: boolean): void {
  walkAllDocuments((doc) => {
    if (!doc.body) {
      return;
    }

    if (enabled) {
      doc.body.classList.add('sniptale-ai-pick-mode');
      doc.body.style.userSelect = 'none';
      doc.body.style.webkitUserSelect = 'none';
      return;
    }

    doc.body.classList.remove('sniptale-ai-pick-mode');
    doc.body.style.userSelect = '';
    doc.body.style.webkitUserSelect = '';
  });
}
