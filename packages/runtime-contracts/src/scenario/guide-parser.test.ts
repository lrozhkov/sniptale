import { describe, expect, it } from 'vitest';
import { parseGuideProject } from './guide-parser';
import {
  GUIDE_LIMITS,
  type GuideCaptureSource,
  type GuideImageBlock,
  type GuideParagraph,
  type GuideProject,
  type GuideStep,
} from './types/guide';

function paragraph(text: string, href: string | null = null): GuideParagraph {
  return { runs: [{ text, bold: false, italic: false, href }] };
}

function image(id = 'image-1'): GuideImageBlock {
  return {
    kind: 'image',
    id,
    assetId: 'asset-1',
    galleryAssetId: null,
    editDocumentId: 'annotation-version-1',
    alt: 'Настройки',
    caption: '',
    source: { kind: 'import', filename: 'settings.png' },
    frame: { width: 960, height: 540 },
    fit: 'contain',
    contentTransform: { x: 0, y: 0, scale: 1 },
  };
}

function step(): GuideStep {
  return {
    kind: 'step',
    id: 'step-1',
    title: '',
    showNumber: false,
    layout: 'stacked',
    templateId: null,
    styleOverrides: {},
    blocks: [],
  };
}

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

function capture(): GuideCaptureSource {
  return {
    kind: 'capture',
    captureSurface: 'selection',
    sourceKind: 'manual',
    page: {
      title: 'Настройки',
      url: 'https://example.test/settings',
      viewport: { x: 0, y: 0, width: 1440, height: 900 },
      scrollX: 0,
      scrollY: 400,
      devicePixelRatio: 2,
    },
    target: {
      selector: '#save',
      iframeSelector: null,
      tagName: 'BUTTON',
      role: 'button',
      text: 'Сохранить',
      ariaLabel: null,
      title: null,
      rect: { x: 200, y: 300, width: 100, height: 30 },
      framePadding: { top: 4, left: 4, right: 4, bottom: 4 },
    },
    interactionPoint: { x: 220, y: 312 },
    cursorPoint: { x: 221, y: 313 },
    captureMetadata: {
      trigger: 'pointer-up',
      pointerRange: {
        start: { x: 220, y: 312 },
        end: { x: 221, y: 313 },
        minX: 220,
        minY: 312,
        maxX: 221,
        maxY: 313,
        distance: 1.4,
        durationMs: 20,
      },
      scroll: { startX: 0, startY: 200, endX: 0, endY: 400, deltaX: 0, deltaY: 200 },
    },
  };
}

describe('guide content admission', () => {
  it('accepts an empty document and a step without title, numbering, text or image', () => {
    for (const input of [project(), project([step()])]) {
      expect(parseGuideProject(input)).toEqual({ status: 'ok', project: input });
    }
  });

  it('preserves ordered sections and multiple kinds of content under a single step', () => {
    const first = step();
    first.title = 'Измените параметры';
    first.showNumber = true;
    first.styleOverrides = { density: 'spacious' };
    first.blocks = [
      { kind: 'heading', id: 'heading-1', text: 'До изменения' },
      {
        kind: 'text',
        id: 'text-1',
        paragraphs: [paragraph('Первый абзац'), paragraph('Второй абзац')],
      },
      image(),
      { kind: 'heading', id: 'heading-2', text: 'После изменения' },
      { ...image('image-2'), contentTransform: { x: -0.25, y: 0.1, scale: 2 } },
      {
        kind: 'note',
        id: 'note-1',
        tone: 'warning',
        paragraphs: [paragraph('Проверьте результат')],
      },
    ];
    const input = project([
      { kind: 'section', id: 'section-1', title: 'Подготовка', paragraphs: [] },
      first,
      { ...step(), id: 'step-2', title: 'Готово' },
    ]);
    const parsed = parseGuideProject(JSON.parse(JSON.stringify(input)));
    expect(parsed).toEqual({ status: 'ok', project: input });
    if (parsed.status !== 'ok') throw new Error('Expected admitted document');
    expect(parseGuideProject(JSON.parse(JSON.stringify(parsed.project)))).toEqual(parsed);
  });

  it('detaches accepted content while allowing shared immutable resource references', () => {
    const input = project([{ ...step(), blocks: [image(), image('image-2')] }]);
    const result = parseGuideProject(input);
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') throw new Error('Expected admitted document');
    expect(result.project).not.toBe(input);
    expect(result.project.items).not.toBe(input.items);
    input.name = 'Changed later';
    input.items.splice(0);
    expect(result.project.name).toBe('Инструкция');
    expect(result.project.items).toHaveLength(1);
  });

  it('keeps capture metadata on each image rather than on the whole step', () => {
    const source = capture();
    const input = project([
      {
        ...step(),
        blocks: [
          { ...image(), source },
          { ...image('image-2'), source: { ...source, page: { ...source.page, scrollY: 800 } } },
        ],
      },
    ]);
    expect(parseGuideProject(input)).toEqual({ status: 'ok', project: input });
  });

  it('preserves a decoded video frame independently of the original recording', () => {
    const input = project([
      {
        ...step(),
        blocks: [
          {
            ...image(),
            source: {
              kind: 'video-frame',
              recordingId: null,
              filename: 'demo.mp4',
              timeSeconds: 12.125,
            },
          },
        ],
      },
    ]);
    expect(parseGuideProject(input)).toEqual({ status: 'ok', project: input });
  });

  it('retains literal markup as text and safe inline formatting', () => {
    const input = project([
      {
        ...step(),
        blocks: [
          {
            kind: 'text',
            id: 'text-1',
            paragraphs: [
              {
                runs: [
                  {
                    text: '<script>alert(1)</script> & русский текст',
                    bold: true,
                    italic: true,
                    href: 'https://example.test/help?a=1&b=2',
                  },
                ],
              },
            ],
          },
        ],
      },
    ]);
    expect(parseGuideProject(input)).toEqual({ status: 'ok', project: input });
  });

  it.each([2, 3, 5, 999])(
    'reports unsupported version %s without attempting a migration',
    (version) => {
      expect(parseGuideProject({ version })).toEqual({ status: 'unsupported', version });
    }
  );

  it('rejects legacy presentation fields mixed into a version 4 document', () => {
    expect(parseGuideProject({ ...project(), slides: [], presentation: {} })).toEqual({
      status: 'invalid',
    });
    expect(
      parseGuideProject({
        ...project(),
        items: [{ ...step(), blocks: [{ ...image(), animation: 'fade' }] }],
      })
    ).toEqual({ status: 'invalid' });
  });
});

describe('guide input boundaries', () => {
  it.each([
    'javascript:alert(1)',
    'data:text/html,hi',
    'file:///etc/passwd',
    '//example.test',
    'https://user:secret@example.test',
    ' https://example.test',
    'https://example.test/\npath',
  ])('rejects an unsafe inline link: %s', (href) => {
    expect(
      parseGuideProject(
        project([
          {
            ...step(),
            blocks: [
              {
                kind: 'text',
                id: 'text-1',
                paragraphs: [paragraph('Link', href)],
              },
            ],
          },
        ])
      )
    ).toEqual({ status: 'invalid' });
  });

  it('rejects identities duplicated across steps, sections and blocks, not repeated asset references', () => {
    for (const items of [
      [step(), step()],
      [step(), { kind: 'section', id: 'step-1', title: '', paragraphs: [] }],
      [{ ...step(), blocks: [image('step-1')] }],
      [{ ...step(), blocks: [image(), image()] }],
    ])
      expect(parseGuideProject({ ...project(), items })).toEqual({ status: 'invalid' });
    expect(
      parseGuideProject(project([{ ...step(), blocks: [image(), image('another-image')] }])).status
    ).toBe('ok');
  });

  it.each([0, -1, Infinity, NaN, GUIDE_LIMITS.maxDimension + 1])(
    'rejects invalid image frame width %s',
    (width) => {
      expect(
        parseGuideProject(
          project([{ ...step(), blocks: [{ ...image(), frame: { width, height: 100 } }] }])
        )
      ).toEqual({ status: 'invalid' });
    }
  );

  it('rejects invalid source metadata, video times and image transforms', () => {
    const blocks = [
      { ...image(), contentTransform: { x: 0, y: 0, scale: 0 } },
      {
        ...image(),
        source: { kind: 'video-frame', recordingId: null, filename: '', timeSeconds: -1 },
      },
      { ...image(), source: { ...capture(), page: { ...capture().page, devicePixelRatio: 0 } } },
      { ...image(), source: { ...capture(), target: { ...capture().target, selector: 7 } } },
    ];
    for (const block of blocks) {
      expect(parseGuideProject({ ...project(), items: [{ ...step(), blocks: [block] }] })).toEqual({
        status: 'invalid',
      });
    }
  });

  it('rejects unknown or executable style values and undefined overrides', () => {
    for (const styleOverrides of [
      { accentColor: 'url(https://example.test)' },
      { css: 'display:none' },
      { theme: undefined },
    ]) {
      expect(parseGuideProject({ ...project(), items: [{ ...step(), styleOverrides }] })).toEqual({
        status: 'invalid',
      });
    }
  });

  it('rejects missing versions, wrong primitive types and overlong text', () => {
    for (const input of [
      null,
      [],
      {},
      { version: '4' },
      { ...project(), createdAt: '1' },
      project([
        {
          ...step(),
          blocks: [
            {
              kind: 'text',
              id: 'text-1',
              paragraphs: [paragraph('x'.repeat(GUIDE_LIMITS.maxTextLength + 1))],
            },
          ],
        },
      ]),
    ]) {
      expect(parseGuideProject(input)).toEqual({ status: 'invalid' });
    }
  });

  it('rejects cyclic, sparse and excessive input before schema traversal', () => {
    const cyclic: Record<string, unknown> = { ...project() };
    cyclic['items'] = [cyclic];
    expect(parseGuideProject(cyclic)).toEqual({ status: 'invalid' });
    expect(parseGuideProject({ ...project(), items: new Array(1_000_000) })).toEqual({
      status: 'invalid',
    });
    expect(
      parseGuideProject({
        ...project(),
        items: Array.from({ length: GUIDE_LIMITS.maxItems + 1 }, (_, i) => ({
          ...step(),
          id: `step-${i}`,
        })),
      })
    ).toEqual({ status: 'invalid' });
    let nested: unknown = project();
    for (let index = 0; index < GUIDE_LIMITS.maxInputDepth + 1; index++) nested = { nested };
    expect(parseGuideProject(nested)).toEqual({ status: 'invalid' });
  });

  it('bounds total text and object visits, including unknown fields', () => {
    expect(
      parseGuideProject({ ...project(), extra: 'x'.repeat(GUIDE_LIMITS.maxInputTextLength + 1) })
    ).toEqual({ status: 'invalid' });
    expect(
      parseGuideProject({
        ...project(),
        extra: Array.from({ length: GUIDE_LIMITS.maxInputVisits + 1 }, () => 0),
      })
    ).toEqual({ status: 'invalid' });
  });

  it('does not execute accessors or admit non-document objects', () => {
    const input = {
      ...project(),
      get extra(): string {
        throw new Error('Accessor executed');
      },
    };
    expect(parseGuideProject(input)).toEqual({ status: 'invalid' });
    expect(parseGuideProject({ ...project(), extra: new Date() })).toEqual({ status: 'invalid' });
  });
});

it('roundtrips an empty image slot without accepting phantom resource references', () => {
  const slot = {
    kind: 'image-slot',
    id: 'slot',
    frame: { width: 960, height: 540 },
    fit: 'contain',
    alt: '',
    caption: '',
  };
  const value = { ...project(), items: [{ ...step(), blocks: [slot] }] };
  expect(parseGuideProject(JSON.parse(JSON.stringify(value)))).toEqual({
    status: 'ok',
    project: value,
  });
  for (const invalid of [
    { ...slot, assetId: 'fake' },
    { ...slot, frame: { width: 0, height: 540 } },
  ])
    expect(parseGuideProject({ ...value, items: [{ ...step(), blocks: [invalid] }] }).status).toBe(
      'invalid'
    );
});

it('roundtrips composition for every block kind and rejects unsupported widths', () => {
  const item = step();
  item.blocks = [
    { kind: 'heading', id: 'heading', text: '' },
    { kind: 'text', id: 'text', paragraphs: [] },
    { kind: 'note', id: 'note', tone: 'info', paragraphs: [] },
    image(),
    {
      kind: 'image-slot',
      id: 'slot',
      frame: { width: 400, height: 300 },
      fit: 'contain',
      alt: '',
      caption: '',
    },
  ];
  for (const width of ['half', 'full', 20, 37, 50, 100] as const) {
    item.blocks.forEach((block) => {
      block.width = width;
      block.rowStart = true;
    });
    const value = project([item]);
    const parsed = parseGuideProject(JSON.parse(JSON.stringify(value)));
    expect(parsed).toEqual({ status: 'ok', project: value });
  }
  for (const rowStart of [null, 1, 'true', {}]) {
    for (const block of item.blocks) {
      expect(
        parseGuideProject({ ...project(), items: [{ ...item, blocks: [{ ...block, rowStart }] }] })
      ).toMatchObject({ status: 'invalid' });
    }
  }
  for (const width of [0, 19, 101, 33.5, Infinity, NaN, 'quarter', '100%', null, {}]) {
    for (const block of item.blocks) {
      expect(
        parseGuideProject({ ...project(), items: [{ ...item, blocks: [{ ...block, width }] }] })
      ).toMatchObject({ status: 'invalid' });
    }
  }
});

it('preserves explicit step/section numbering through canonical JSON roundtrips', () => {
  const source = project([
    { kind: 'section', id: 'section', title: '', paragraphs: [], numbering: { restartAt: 5 } },
    { ...step(), numbering: { restartAt: 3, label: 'A.1' } },
  ]);
  const parsed = parseGuideProject(source);
  expect(parsed.status).toBe('ok');
  if (parsed.status !== 'ok') throw new Error('Expected valid numbering');
  expect(parsed.project).toEqual(source);
  expect(parseGuideProject(JSON.parse(JSON.stringify(parsed.project)))).toEqual(parsed);
});
it.each([0, -1, 1.5, 10_000, Infinity, '1', null])(
  'rejects invalid numbering restart %s on both item types',
  (restartAt) => {
    for (const item of [step(), { kind: 'section', id: 'section', title: '', paragraphs: [] }]) {
      expect(
        parseGuideProject({ ...project(), items: [{ ...item, numbering: { restartAt } }] }).status
      ).toBe('invalid');
    }
  }
);
it.each(['', '   ', 'x'.repeat(33), 2, null])(
  'rejects invalid manual numbering label %s',
  (label) => {
    expect(
      parseGuideProject({ ...project(), items: [{ ...step(), numbering: { label } }] }).status
    ).toBe('invalid');
  }
);
it('rejects unknown numbering fields and manual section labels', () => {
  expect(
    parseGuideProject({ ...project(), items: [{ ...step(), numbering: { counter: 1 } }] }).status
  ).toBe('invalid');
  expect(
    parseGuideProject({
      ...project(),
      items: [
        {
          kind: 'section',
          id: 's',
          title: '',
          paragraphs: [],
          numbering: { restartAt: 1, label: 'A' },
        },
      ],
    }).status
  ).toBe('invalid');
});

describe('bounded prose appearance', () => {
  it('retains valid typography for each prose kind', () => {
    const item = step();
    item.blocks = [
      {
        kind: 'heading',
        id: 'heading',
        text: 'Title',
        textStyle: { size: 'large', alignment: 'center' },
      },
      { kind: 'text', id: 'text', paragraphs: [], textStyle: { size: 'small', alignment: 'end' } },
      {
        kind: 'note',
        id: 'note',
        paragraphs: [],
        tone: 'info',
        textStyle: { size: 'normal', alignment: 'start' },
      },
    ];
    expect(parseGuideProject(project([item]))).toEqual({ status: 'ok', project: project([item]) });
  });
  it.each([
    { size: 'huge', alignment: 'start' },
    { size: 'normal', alignment: 'justify' },
    { size: 'normal', alignment: 'start', css: 'url(https://example.com)' },
    { size: undefined, alignment: 'start' },
    { size: 'normal' },
    null,
    undefined,
  ])('rejects unsupported or undefined typography %j', (textStyle) => {
    const item = step();
    expect(
      parseGuideProject({
        ...project([item]),
        items: [{ ...item, blocks: [{ kind: 'text', id: 'text', paragraphs: [], textStyle }] }],
      })
    ).toEqual({ status: 'invalid' });
  });
  it('rejects prose typography on images', () => {
    const item = step();
    expect(
      parseGuideProject({
        ...project([item]),
        items: [
          { ...item, blocks: [{ ...image(), textStyle: { size: 'large', alignment: 'center' } }] },
        ],
      })
    ).toEqual({ status: 'invalid' });
  });
});

it('roundtrips bounded common and per-image HTML settings without changing media', () => {
  const settings = {
    content: 'frame',
    optimize: true,
    maxEdge: 1920,
    quality: 0.85,
    viewer: false,
  };
  const value = {
    ...project(),
    items: [{ ...step(), blocks: [{ ...image(), htmlExport: settings }] }],
    htmlExport: settings,
  };
  const parsed = parseGuideProject(value);
  expect(parsed.status).toBe('ok');
  if (parsed.status === 'ok') expect(parsed.project).toEqual(value);
});

it.each([
  { quality: 1 },
  { quality: NaN },
  { maxEdge: 8000 },
  { content: 'url' },
  { viewer: 'true' },
  { extra: true },
])('rejects noncanonical HTML options %j', (patch) => {
  const settings = {
    content: 'full',
    optimize: false,
    maxEdge: 2560,
    quality: 0.85,
    viewer: true,
    ...patch,
  };
  expect(parseGuideProject({ ...project(), htmlExport: settings }).status).toBe('invalid');
  expect(
    parseGuideProject({
      ...project(),
      items: [{ ...step(), blocks: [{ ...image(), htmlExport: settings }] }],
    }).status
  ).toBe('invalid');
});

it('admits a detached single-step template and rejects ambiguous template contents', () => {
  const template = { ...project([step()]), purpose: 'step-template' };
  expect(parseGuideProject(template)).toEqual({ status: 'ok', project: template });
  for (const items of [
    [],
    [step(), { ...step(), id: 'second' }],
    [{ kind: 'section', id: 'section', title: '', paragraphs: [] }],
  ]) {
    expect(parseGuideProject({ ...template, items })).toEqual({ status: 'invalid' });
  }
  expect(parseGuideProject({ ...template, purpose: 'unknown' })).toEqual({ status: 'invalid' });
  expect(parseGuideProject(project([step(), { ...step(), id: 'second' }])).status).toBe('ok');
});

it('preserves bounded prose minimum heights and rejects invalid size metadata', () => {
  for (const minHeight of [0, 180, 7680]) {
    const item = step();
    item.blocks = [
      { kind: 'heading', id: 'heading-height', text: '', minHeight },
      { kind: 'text', id: 'text-height', paragraphs: [], minHeight },
      { kind: 'note', id: 'note-height', paragraphs: [], tone: 'info', minHeight },
    ];
    const input = project([item]);
    expect(parseGuideProject(input)).toEqual({ status: 'ok', project: input });
  }
  for (const minHeight of [-1, 7681, 1.5, '200px', null, NaN, Infinity]) {
    expect(
      parseGuideProject({
        ...project(),
        items: [
          { ...step(), blocks: [{ kind: 'text', id: 'text-height', paragraphs: [], minHeight }] },
        ],
      }).status
    ).toBe('invalid');
  }
});
