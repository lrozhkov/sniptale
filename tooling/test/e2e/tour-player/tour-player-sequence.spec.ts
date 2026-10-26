import type { TourDocument } from '@sniptale/runtime-contracts/scenario/types/tour';
import { parseTourDocument } from '@sniptale/runtime-contracts/scenario/tour-parser';
import { test, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { buildPlayerHtml, slide, tour } from './tour-player-artifact.fixture';

function continuousTour(): TourDocument {
  const sequential: TourDocument = {
    ...tour,
    playback: { ...tour.playback, autoZoom: false },
    slides: [0, 1, 2].map((index) => {
      const image = slide(`sequence-${index}`, `Author slide ${index + 1}`);
      return {
        ...image,
        actions: [0, 1, 2].map((number) => ({
          type: 'hotspot' as const,
          object: {
            ...image.actions[0]!.object,
            id: `action-${index * 3 + number + 1}`,
            label: `Action ${index * 3 + number + 1}`,
            text: `Instruction ${index * 3 + number + 1}`,
            visual:
              number === 0
                ? { kind: 'point' as const, pulse: true }
                : {
                    kind:
                      index === 0
                        ? ('highlight' as const)
                        : index === 1
                          ? ('frame' as const)
                          : ('spotlight' as const),
                    rect: { x: 0.2, y: 0.2, width: 0.25, height: 0.2 },
                    color: '#f97316',
                    opacity: 0.4,
                    animation: {
                      enter: { kind: 'none' as const, durationMs: 250 },
                      exit: { kind: 'none' as const, durationMs: 250 },
                    },
                  },
          },
        })),
      };
    }),
  };
  sequential.slides.splice(1, 0, {
    kind: 'navigation',
    id: 'chapter',
    title: 'Contents',
    description: 'Continue with the next action',
    background: { color: '#111827', image: null },
    buttons: [],
    narration: null,
    timing: { mode: 'inherit', holdSeconds: 4, truncateNarration: false },
  });
  return sequential;
}

for (const viewport of PRIMARY_BROWSER_VIEWPORTS) {
  test(`continuous actions and unnumbered contents at ${viewport.size.width}x${viewport.size.height}`, async ({
    page,
  }, info) => {
    const sequential = continuousTour();
    const output = info.outputPath('sequence.html');
    await writeFile(output, await buildPlayerHtml(sequential));
    await page.setViewportSize(viewport.size);
    await page.goto(pathToFileURL(output).href);
    for (let action = 1; action <= 9; action += 1) {
      await expect(page.locator('#tour-player')).toHaveAttribute(
        'data-action-id',
        `action-${action}`
      );
      await expect(page.locator('[data-tour-counter]')).toHaveText(`${action} / 9`);
      await expect(page.locator('[data-tour-hint-text]')).toHaveText(`Instruction ${action}`);
      await expect(page.locator('[data-tour-object-id]')).toHaveCount(1);
      const active = page.locator('[data-tour-object-id]');
      await active.hover();
      await expect(page.locator('#tour-player')).toHaveAttribute(
        'data-action-id',
        `action-${action}`
      );
      if ([2, 5, 8].includes(action))
        await page.screenshot({ path: info.outputPath(`active-${action}.png`), fullPage: false });
      await active.click();
      if (action === 3) {
        await expect(page.locator('#tour-player')).toHaveAttribute('data-slide-id', 'chapter');
        await expect(page.locator('[data-tour-counter]')).toBeHidden();
        await expect(page.locator('[data-tour-object-id]')).toHaveCount(0);
        await page.locator('[data-tour-next]').click();
      }
    }
    await expect(page.locator('#tour-player')).toHaveAttribute('data-slide-id', 'end');
    await page.getByRole('button', { name: 'Restart', exact: true }).click();
    await expect(page.locator('[data-tour-counter]')).toHaveText('1 / 9');
    await page.locator('[data-tour-contents]').click();
    const rows = page.locator('.tour-contents-list button');
    await expect(rows).toHaveCount(11);
    await expect(rows.nth(3)).toHaveText('Contents');
    await expect(rows.nth(4)).toHaveText('4. Instruction 4');
    await page.screenshot({ path: info.outputPath('sequence-menu.png'), fullPage: false });
    await rows.filter({ hasText: '7. Instruction 7' }).click();
    await expect(page.locator('[data-tour-counter]')).toHaveText('7 / 9');
    await page.locator('[data-tour-previous]').click();
    await expect(page.locator('[data-tour-counter]')).toHaveText('6 / 9');
    await page.locator('#tour-player').focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('[data-tour-counter]')).toHaveText('7 / 9');
  });
}

test('autoplay visits every action and waits at contents until Continue', async ({
  page,
}, info) => {
  const sequence = continuousTour();
  sequence.playback = { ...sequence.playback, autoplay: true, minimumHoldSeconds: 0.1 };
  for (const slide of sequence.slides)
    slide.timing = { mode: 'manual', holdSeconds: 0.1, truncateNarration: false };
  const epoch = new Date('2026-01-01T00:00:00Z');
  await page.clock.install({ time: epoch });
  await page.clock.pauseAt(epoch);
  const output = info.outputPath('autoplay.html');
  await writeFile(output, await buildPlayerHtml(sequence));
  await page.goto(pathToFileURL(output).href);
  const player = page.locator('#tour-player');
  async function advanceTo(id: string, field = 'data-action-id') {
    for (let frame = 0; frame < 40 && (await player.getAttribute(field)) !== id; frame += 1)
      await page.clock.runFor(16);
    await expect(player).toHaveAttribute(field, id);
  }
  await advanceTo('action-1');
  await advanceTo('action-2');
  await advanceTo('action-3');
  await advanceTo('chapter', 'data-slide-id');
  await page.clock.runFor(2000);
  await expect(player).toHaveAttribute('data-slide-id', 'chapter');
  await page.locator('[data-tour-play]').click();
  for (let action = 4; action <= 9; action += 1) {
    await advanceTo(`action-${action}`);
    await expect(page.locator('[data-tour-counter]')).toHaveText(`${action} / 9`);
  }
  await advanceTo('end', 'data-slide-id');
});

test('long action text scrolls without consuming Next', async ({ page }, info) => {
  const sequence = continuousTour();
  const first = sequence.slides[0]!;
  if (first.kind !== 'image') throw new Error('Expected image fixture');
  first.actions[0]!.object.text = 'Long instruction. '.repeat(100) + 'END OF INSTRUCTION';
  await page.setViewportSize({ width: 1280, height: 560 });
  await page.setContent(await buildPlayerHtml(sequence));
  const body = page.locator('[data-tour-hint-text]');
  await expect(body).toBeVisible();
  expect(await body.evaluate((node) => node.scrollHeight > node.clientHeight)).toBe(true);
  await body.evaluate((node) => {
    node.scrollTop = node.scrollHeight;
  });
  expect(await body.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
  await expect(page.locator('#tour-player')).toHaveAttribute('data-action-id', 'action-1');
  await page.screenshot({ path: info.outputPath('long-action-scroll.png'), fullPage: false });
  await page.locator('[data-tour-hint-next]').click();
  await expect(page.locator('#tour-player')).toHaveAttribute('data-action-id', 'action-2');
});

for (const kind of ['annotation', 'hotspot'] as const) {
  test(`caption dismissal stays explicit before showing the next ${kind} on the same image`, async ({
    page,
  }, info) => {
    const sequence = continuousTour();
    const first = sequence.slides[0]!;
    if (first.kind !== 'image') throw new Error('Expected image fixture');
    first.actions[0] = {
      type: 'annotation',
      object: { id: 'action-1', text: 'Introduction', anchor: null, appearance: null },
    };
    if (kind === 'annotation')
      first.actions[1] = {
        type: 'annotation',
        object: { id: 'action-2', text: 'Second instruction', anchor: null, appearance: null },
      };
    await page.setViewportSize({ width: 1280, height: 560 });
    await page.setContent(await buildPlayerHtml(sequence));
    const hint = page.locator('[data-tour-hint]');
    await expect(hint).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(hint).toBeHidden();
    if (kind === 'annotation') await page.keyboard.press('ArrowRight');
    else await page.locator('[data-tour-next]').click();
    await expect(page.locator('[data-tour-counter]')).toHaveText('2 / 9');
    await expect(hint).toBeHidden();
    await page.locator('[data-tour-hints]').click();
    await expect(hint).toBeVisible();
    await expect(page.locator('[data-tour-hint-text]')).toHaveText(
      kind === 'annotation' ? 'Second instruction' : 'Instruction 2'
    );
    await page.screenshot({ path: info.outputPath(`caption-to-${kind}.png`), fullPage: false });
    if (kind === 'annotation') await page.keyboard.press('Escape');
    else await hint.locator('[data-tour-hint-close]').click();
    await page.locator('[data-tour-previous]').click();
    await expect(hint).toBeHidden();
    await page.locator('[data-tour-hints]').click();
    await expect(hint).toBeVisible();
    await expect(page.locator('[data-tour-hint-text]')).toHaveText('Introduction');
  });
}

test('keyboard and touch activate only the current action once', async ({ browser }, info) => {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 560 },
    hasTouch: true,
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  try {
    await page.setContent(await buildPlayerHtml(continuousTour()));
    const active = page.locator('[data-tour-object-id]');
    await expect(active).toHaveCount(1);
    await active.focus();
    await expect(active).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-tour-counter]')).toHaveText('2 / 9');
    await active.focus();
    await page.keyboard.press('Space');
    await expect(page.locator('[data-tour-counter]')).toHaveText('3 / 9');
    await active.tap();
    await expect(page.locator('#tour-player')).toHaveAttribute('data-slide-id', 'chapter');
    await expect(active).toHaveCount(0);
    await page.locator('[data-tour-next]').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-tour-counter]')).toHaveText('4 / 9');
    await expect(active).toHaveCount(1);
    await page.keyboard.press('End');
    await expect(page.locator('[data-tour-counter]')).toHaveText('9 / 9');
    await page.keyboard.press('Home');
    await expect(page.locator('[data-tour-counter]')).toHaveText('1 / 9');
    await page.screenshot({ path: info.outputPath('keyboard-touch.png'), fullPage: false });
  } finally {
    await context.close();
  }
});

test('largest admitted menu fixture scrolls to its last action and restores focus on Escape', async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  function candidate(hotspotCount: number): TourDocument {
    let ordinal = 0;
    return {
      ...tour,
      playback: { ...tour.playback, autoZoom: false },
      slides: Array.from({ length: 300 }, (_, slideIndex) => {
        const image = slide(`maximum-${slideIndex}`, `Source ${slideIndex + 1}`);
        return {
          ...image,
          actions: [
            ...Array.from({ length: 20 }, () => {
              ordinal += 1;
              return {
                type: 'annotation' as const,
                object: {
                  id: `maximum-action-${ordinal}`,
                  text: `Action ${ordinal}`,
                  anchor: null,
                  appearance: null,
                },
              };
            }),
            ...Array.from(
              { length: Math.max(0, Math.min(20, hotspotCount - (299 - slideIndex) * 20)) },
              () => {
                ordinal += 1;
                return {
                  ...image.actions[0]!,
                  object: {
                    ...image.actions[0]!.object,
                    id: `maximum-action-${ordinal}`,
                    label: `Action ${ordinal}`,
                    text: `Action ${ordinal}`,
                  },
                };
              }
            ),
          ],
        };
      }),
    };
  }
  // The graph-visit admission budget is stricter than the separate 300×40 count ceilings.
  // Find the boundary for this representative fixture family without changing either policy.
  let accepted = 0;
  let refused = 6000;
  expect(parseTourDocument(candidate(accepted)).status).toBe('ok');
  expect(parseTourDocument(candidate(refused)).status).toBe('invalid');
  while (refused - accepted > 1) {
    const middle = Math.floor((accepted + refused) / 2);
    if (parseTourDocument(candidate(middle)).status === 'ok') accepted = middle;
    else refused = middle;
  }
  const maximum = candidate(accepted);
  const count = 6000 + accepted;
  expect(parseTourDocument(maximum).status).toBe('ok');
  expect(parseTourDocument(candidate(accepted + 1)).status).toBe('invalid');
  await page.setViewportSize({ width: 1280, height: 560 });
  await page.setContent(await buildPlayerHtml(maximum));
  await expect(page.locator('[data-tour-counter]')).toHaveText(`1 / ${count}`);
  const trigger = page.locator('[data-tour-contents]');
  await trigger.click();
  const list = page.locator('.tour-contents-list');
  await expect(list.locator('button')).toHaveCount(count + 1);
  const lastAction = list.getByRole('button', { name: `${count}. Action ${count}`, exact: true });
  await lastAction.scrollIntoViewIfNeeded();
  await expect(lastAction).toBeInViewport();
  expect(await list.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
  await lastAction.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-tour-counter]')).toHaveText(`${count} / ${count}`);
  await expect(page.locator('[data-tour-object-id]')).toHaveCount(1);
  await trigger.click();
  await expect(lastAction).toBeFocused();
  await expect(lastAction).toBeInViewport();
  await page.screenshot({ path: info.outputPath('largest-menu-open.png'), fullPage: false });
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-tour-navigation]')).toBeHidden();
  await expect(trigger).toBeFocused();
  await page.screenshot({
    path: info.outputPath('maximum-menu-final-action.png'),
    fullPage: false,
  });
});

test('start consecutive and final contents stay unnumbered in offline playback', async ({
  page,
}, info) => {
  const sequence = continuousTour();
  const chapter = sequence.slides[1]!;
  sequence.slides.unshift({ ...chapter, id: 'start', title: 'Start contents' });
  sequence.slides.splice(3, 0, { ...chapter, id: 'second-chapter', title: 'Second contents' });
  sequence.slides.push({ ...chapter, id: 'final', title: 'Final contents' });
  const output = info.outputPath('all-contents-positions.html');
  await writeFile(output, await buildPlayerHtml(sequence));
  await page.setViewportSize({ width: 1280, height: 560 });
  await page.goto(pathToFileURL(output).href);
  for (const slide of sequence.slides) {
    if (slide.kind === 'navigation') {
      await expect(page.locator('#tour-player')).toHaveAttribute('data-slide-id', slide.id);
      await expect(page.locator('[data-tour-counter]')).toBeHidden();
      await expect(page.locator('[data-tour-object-id]')).toHaveCount(0);
      await page.locator('[data-tour-next]').click();
    } else {
      for (const action of slide.actions) {
        await expect(page.locator('#tour-player')).toHaveAttribute(
          'data-action-id',
          action.object.id
        );
        await page.locator('[data-tour-next]').click();
      }
    }
  }
  await expect(page.locator('#tour-player')).toHaveAttribute('data-slide-id', 'end');
  await expect(page.locator('[data-tour-counter]')).toHaveText('Finished');
  await page.getByRole('button', { name: 'Restart', exact: true }).click();
  await expect(page.locator('#tour-player')).toHaveAttribute('data-slide-id', 'start');
});

for (const viewport of PRIMARY_BROWSER_VIEWPORTS) {
  test(`hint hover and focus preserve the paused sequence ${viewport.name}`, async ({
    page,
  }, info) => {
    const output = info.outputPath('hint-interactions.html');
    await writeFile(output, await buildPlayerHtml(continuousTour()));
    await page.setViewportSize(viewport.size);
    await page.goto(pathToFileURL(output).href);
    const player = page.locator('#tour-player');
    const hint = player.locator('[data-tour-hint]');
    const visibility = player.locator('[data-tour-hints]');
    const identity = () =>
      player.evaluate((root) => ({
        slide: root.getAttribute('data-slide-id'),
        action: root.getAttribute('data-action-id'),
        counter: root.querySelector('[data-tour-counter]')?.textContent,
        seek: root.querySelector<HTMLInputElement>('[data-tour-seek]')?.value,
      }));
    for (const [index, kind] of ['point', 'region'].entries()) {
      if (index) await player.locator('[data-tour-next]').click();
      await expect(player).toHaveAttribute('data-tour-playing', 'false');
      await expect(visibility).toHaveAttribute('aria-pressed', 'true');
      const before = await identity();
      await visibility.click();
      await expect(visibility).toHaveAttribute('aria-pressed', 'false');
      await expect(hint).toBeHidden();
      const target = player.locator('[data-tour-object-id]');
      await target.hover();
      await expect(hint).toBeVisible();
      expect(await identity()).toEqual(before);
      await hint.hover();
      await expect(hint).toBeVisible();
      expect(await identity()).toEqual(before);
      await expect(
        hint.locator(
          '[data-tour-hint-title], [data-tour-hint-action-title], ' +
            '[data-tour-narration-toggle], [data-tour-narration-replay]'
        )
      ).toHaveCount(0);
      for (const [selector, name] of [
        ['hint-previous', 'Back'],
        ['hint-next', 'Next'],
        ['hint-close', 'Close'],
      ] as const) {
        const control = hint.locator(`[data-tour-${selector}]`);
        await expect(control).toHaveAccessibleName(name);
        await expect(control.locator('svg')).toHaveCount(1);
        expect((await control.textContent())?.trim()).toBe('');
      }
      await hint.locator('[data-tour-hint-close]').click();
      await expect(hint).toBeHidden();
      await expect(target).toBeFocused();
      expect(await identity()).toEqual(before);
      await player.focus();
      await page.mouse.move(0, 0);
      await target.focus();
      await expect(hint).toBeVisible();
      expect(await identity()).toEqual(before);
      await hint.locator('[data-tour-hint-close]').focus();
      await page.keyboard.press('Enter');
      await expect(hint).toBeHidden();
      await expect(target).toBeFocused();
      await expect(visibility).toHaveAttribute('aria-pressed', 'false');
      await visibility.click();
      await expect(hint).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await expect(player.locator('[data-tour-stage]')).toHaveAttribute('data-motion', 'settled');
      await page.screenshot({ path: info.outputPath(`hint-${kind}.png`), fullPage: false });
    }
  });
}

test('annotation without a marker remains available through the hint toggle', async ({ page }) => {
  const sequence = continuousTour();
  const first = sequence.slides[0]!;
  if (first.kind !== 'image') throw new Error('Expected image fixture');
  first.actions[0] = {
    type: 'annotation',
    object: {
      id: 'action-1',
      text: 'Text without a spatial marker',
      anchor: null,
      appearance: null,
    },
  };
  await page.setViewportSize(PRIMARY_BROWSER_VIEWPORTS[0].size);
  await page.setContent(await buildPlayerHtml(sequence));
  await expect(page.locator('[data-tour-object-id]')).toHaveCount(0);
  const hint = page.locator('[data-tour-hint]');
  await hint.locator('[data-tour-hint-close]').click();
  await expect(hint).toBeHidden();
  await page.locator('[data-tour-hints]').click();
  await expect(hint).toBeVisible();
  await expect(page.locator('#tour-player')).toHaveAttribute('data-action-id', 'action-1');
});
