// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { translate } from '../../platform/i18n';
import { ReviewProjectInfo } from './project-info';
import { createQuickEditWebcam } from '../../features/video/review/advanced/webcam';
const read = vi.hoisted(() => vi.fn());
vi.mock('../../workflows/video-review/webcam-source', () => ({
  readReviewWebcamInformation: read,
}));
vi.mock('./project-controls', () => ({
  ReviewProjectTitle: ({ name }: { name: string }) => <span>{name}</span>,
}));
const source = { width: 640, height: 480, duration: 12, size: 16836, mimeType: 'video/webm' };
const base = {
  resource: { file: new File(['video'], 'screen.webm'), source },
  name: 'Project',
  busy: false,
  onRename: undefined,
  index: null,
  camera: createQuickEditWebcam('project-asset:camera', source, source),
  cameraPending: true,
  cameraAttempt: 0,
  active: true,
};
afterEach(() => {
  read.mockReset();
  vi.unstubAllGlobals();
});
it('waits for camera publication, then displays the retained source facts and original name', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  const root = createRoot(host);
  read.mockResolvedValue({ source, filename: 'original-camera.webm' });
  try {
    await act(async () => root.render(<ReviewProjectInfo {...base} />));
    expect(read).not.toHaveBeenCalled();
    await act(async () => root.render(<ReviewProjectInfo {...base} cameraPending={false} />));
    expect(read).toHaveBeenCalledOnce();
    expect(read.mock.calls[0]?.[0]).toBe('project-asset:camera');
    const camera = host.querySelector('[data-ui="gallery.videoReview.projectCameraInfo"]')!;
    expect(camera.textContent).toContain('original-camera.webm');
    expect(camera.textContent).toContain('640 × 480');
    expect(camera.textContent).not.toContain('project-asset:');
    expect(host.textContent).toContain('Project');
  } finally {
    await act(async () => root.unmount());
  }
});
it('cancels a stale metadata read and permits an explicit recovery attempt after failure', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  const root = createRoot(host);
  let finish!: (value: { source: typeof source; filename: string }) => void;
  read.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  try {
    await act(async () => root.render(<ReviewProjectInfo {...base} cameraPending={false} />));
    const signal: AbortSignal = read.mock.calls[0]![1];
    await act(async () =>
      root.render(<ReviewProjectInfo {...base} cameraPending={false} active={false} />)
    );
    expect(signal.aborted).toBe(true);
    await act(async () => finish({ source, filename: 'stale.webm' }));
    expect(host.textContent).not.toContain('stale.webm');
    read.mockRejectedValueOnce(new Error('unavailable'));
    await act(async () => root.render(<ReviewProjectInfo {...base} cameraPending={false} />));
    expect(host.textContent).toContain('Project');
    expect(
      host.querySelector('[data-ui="gallery.videoReview.projectCameraInfo"]')?.textContent
    ).toContain(translate('gallery.preview.sourceMissing'));
    read.mockResolvedValueOnce({ source, filename: 'recovered.webm' });
    await act(async () =>
      root.render(<ReviewProjectInfo {...base} cameraPending={false} cameraAttempt={1} />)
    );
    expect(host.textContent).toContain('recovered.webm');
  } finally {
    await act(async () => root.unmount());
  }
});
