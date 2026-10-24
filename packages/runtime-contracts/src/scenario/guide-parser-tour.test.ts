import * as headerContracts from '../window-header';
import { expect, it, vi } from 'vitest';
import { parseGuideProject } from './guide-parser';
import type { GuideProject } from './types/guide';

function project(items: GuideProject['items'] = []): GuideProject {
  return {
    version: 4,
    id: 'project-1',
    name: 'Инструкция',
    createdAt: 1,
    updatedAt: 2,
    tags: [],
    style: {
      theme: 'paper',
      font: 'sans',
      density: 'comfortable',
      contentWidth: 'standard',
      imageBorder: 'subtle',
      numberStyle: 'badge',
      accentColor: null,
    },
    print: { pageSize: 'a4', orientation: 'portrait', pagination: 'flow' },
    items,
  };
}

it('admits a detached tour once while retaining root and tour rejection semantics', () => {
  const value = project();
  value.tour = {
    version: 2,
    id: 'tour',
    stage: {
      aspect: '16:9',
      background: '#111827',
      windowHeader: headerContracts.DEFAULT_WINDOW_HEADER,
    },
    style: {
      accent: '#f97316',
      text: '#ffffff',
      surface: '#1f2937',
      textAppearance: { presentation: 'caption-bottom', alignment: 'start', placement: 'auto' },
    },
    playback: { autoplay: false, loop: false, minimumHoldSeconds: 4, autoZoom: true },
    transition: { kind: 'fade', durationMs: 250, hotspotTravelMs: 300 },
    slides: [],
    endScreen: { enabled: true, title: '', description: '', button: null, restart: true },
  };
  const validateHeader = vi.spyOn(headerContracts, 'parseWindowHeader');
  try {
    const parsed = parseGuideProject(value);
    expect(parsed.status).toBe('ok');
    expect(validateHeader).toHaveBeenCalledTimes(1);
    if (parsed.status !== 'ok') throw new Error('Missing admitted project');
    expect(parsed.project).toEqual(value);
    expect(parsed.project.tour).not.toBe(value.tour);
    expect(parseGuideProject({ ...value, extra: true })).toEqual({ status: 'invalid' });
    expect(parseGuideProject({ ...value, purpose: 'step-template' })).toEqual({
      status: 'invalid',
    });
    expect(parseGuideProject({ ...value, tour: { ...value.tour, extra: true } })).toEqual({
      status: 'invalid',
    });
    expect(parseGuideProject({ ...value, tour: { ...value.tour, version: 99 } })).toEqual({
      status: 'unsupported',
      version: 99,
      representation: 'tour',
    });
    expect(
      parseGuideProject({
        ...value,
        tour: {
          ...value.tour,
          slides: [
            {
              kind: 'navigation',
              id: 'nav',
              title: '',
              description: '',
              background: { color: '#111827', image: null },
              buttons: [{ id: 'button', label: '', action: { kind: 'slide', slideId: 'missing' } }],
              narration: null,
              timing: { mode: 'inherit', holdSeconds: 4, truncateNarration: false },
            },
          ],
        },
      })
    ).toEqual({ status: 'invalid' });
  } finally {
    validateHeader.mockRestore();
  }
});
