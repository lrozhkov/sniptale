import latin from '@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2?inline';
import cyrillic from '@fontsource-variable/manrope/files/manrope-cyrillic-wght-normal.woff2?inline';
import extended from '@fontsource-variable/manrope/files/manrope-latin-ext-wght-normal.woff2?inline';
import { isWindowHeaderFavicon, windowHeaderGeometry, type WindowHeader } from './header';

const headerFontCss = [
  [latin, 'U+0000-00FF,U+2000-206F'],
  [cyrillic, 'U+0400-052F,U+2116'],
  [extended, 'U+0100-024F,U+1E00-1EFF'],
]
  .map(
    ([url, range]) =>
      `@font-face{font-family:WindowHeaderFont;font-style:normal;` +
      `font-weight:200 800;src:url("${url}") format("woff2");unicode-range:${range}}`
  )
  .join('');

function esc(value: string): string {
  return Array.from(value)
    .filter((character) => {
      // XML 1.0 permits these scalar ranges; iteration preserves valid Unicode pairs.
      const code = character.codePointAt(0)!;
      return (
        code === 0x09 ||
        code === 0x0a ||
        code === 0x0d ||
        (code >= 0x20 && code <= 0xd7ff) ||
        (code >= 0xe000 && code <= 0xfffd) ||
        code >= 0x10000
      );
    })
    .join('')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
const paths: Record<string, string> = {
  close: 'M-4-4 4 4M4-4-4 4',
  min: 'M-5 0H5',
  max: 'M-4-4H4V4H-4Z',
  back: 'M3-5-2 0 3 5M-2 0H7',
  forward: 'M-3-5 2 0-3 5M2 0H-7',
  reload: 'M4-3A5 5 0 1 0 5 2M4-7V-2H-1',
  plus: 'M-5 0H5M0-5V5',
  chevron: 'M-3-1 0 2 3-1',
  star: 'M0-6 1.9-2 6.2-1.4 3.1 1.6 3.8 6 0 3.9-3.8 6-3.1 1.6-6.2-1.4-1.9-2Z',
  tune: 'M-5-3H5M-5 3H5M-2-5V-1M2 1V5',
  puzzle: 'M-5-5H-1V-7A2 2 0 0 1 3-7V-5H6V-1H8A2 2 0 0 1 8 3H6V6H2V4A2 2 0 0 0-2 4V6H-5Z',
};
// Browser glyphs share a 24-unit grid, rendered at 18px; caption controls retain their OS geometry.
const browserGlyphs: Record<string, string> = {
  back: 'M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.42-1.41L7.83 13H20v-2Z',
  forward: 'm12 4-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8-8-8Z',
  reload:
    'M17.65 6.35A7.95 7.95 0 0 0 12 4a8 8 0 1 0 7.75 10h-2.08A6 6 0 1 1 12 6' +
    'c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35Z',
  puzzle:
    'M20 11h-1V7a2 2 0 0 0-2-2h-4V4a2 2 0 0 0-4 0v1H5a2 2 0 0 0-2 2v3h1a3 3 0 0 1 0 6H3v3' +
    'a2 2 0 0 0 2 2h3v-1a3 3 0 0 1 6 0v1h3a2 2 0 0 0 2-2v-4h1a2 2 0 0 0 0-4ZM17 13v6h-1.1' +
    'a5 5 0 0 0-9.8 0H5v-1.1a5 5 0 0 0 0-9.8V7h6V4h0v3h6v6Z',
  star:
    'm12 3 2.78 5.63L21 9.54l-4.5 4.39 1.06 6.2L12 17.2l-5.56 2.93 1.06-6.2L3 9.54l6.22-.91' +
    'L12 3Zm0 4.52-1.45 2.94-3.24.47 2.35 2.29-.56 3.23L12 14.93' +
    'l2.9 1.52-.56-3.23 2.35-2.29-3.24-.47L12 7.52Z',
};
const extensionGlyphPath =
  'M840.026 59.2694H839.505C839.229 59.2694 839.005 59.4933 839.005 59.7694V61.4762H839' +
  'H836.033V63.0234C837.069 63.0987 837.886 63.963 837.886 65.0181V65.5388' +
  'C837.886 66.594 837.069 67.4583 836.033 67.5335V69.0808H843.498V66.0375L845.345 66.0388' +
  'C845.621 66.0388 845.845 65.815 845.845 65.5388V65.0181' +
  'C845.845 64.742 845.621 64.5181 845.345 64.5181L843.498 64.5227V61.4762L840.526 61.4641' +
  'V59.7694C840.526 59.4933 840.302 59.2694 840.026 59.2694ZM834.533 66.0388H835.886' +
  'C836.162 66.0388 836.386 65.815 836.386 65.5388V65.0181' +
  'C836.386 64.742 836.162 64.5181 835.886 64.5181H834.533V61.2262' +
  'C834.533 60.5358 835.093 59.9762 835.783 59.9762H837.505V59.7694' +
  'C837.505 58.6648 838.4 57.7694 839.505 57.7694H840.026' +
  'C841.13 57.7694 842.026 58.6648 842.026 59.7694V59.9762H843.748' +
  'C844.438 59.9762 844.998 60.5358 844.998 61.2262V63.0181H845.345' +
  'C846.449 63.0181 847.345 63.9135 847.345 65.0181V65.5388' +
  'C847.345 66.6434 846.449 67.5388 845.345 67.5388H844.998V69.3308' +
  'C844.998 70.0211 844.438 70.5808 843.748 70.5808H835.783' +
  'C835.093 70.5808 834.533 70.0211 834.533 69.3308L834.533 66.0388Z';

function icon(name: string, x: number, y: number, c: string, sw = 1.4) {
  if (name === 'puzzle')
    return (
      `<path d="${extensionGlyphPath}" transform="translate(${x - 840.25} ${y - 64.5})" ` +
      `fill="${c}" fill-rule="evenodd"/>`
    );
  if (browserGlyphs[name])
    return (
      `<path d="${browserGlyphs[name]}" transform="translate(${x - 9} ${y - 9}) scale(.75)" ` +
      `fill="${c}" fill-rule="evenodd"/>`
    );
  if (name === 'tune')
    return (
      `<g transform="translate(${x} ${y})" fill="none" stroke="${c}" stroke-width="1.4" ` +
      `stroke-linecap="round"><path d="M-6-3H-3M1-3H6M-6 3H1M5 3H6"/><circle cx="-1" ` +
      `cy="-3" r="2"/><circle cx="3" cy="3" r="2"/></g>`
    );
  return (
    `<path d="${paths[name]}" transform="translate(${x} ${y})" fill="none" stroke="${c}" ` +
    `stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>`
  );
}

// Reference asset: tab close occupies 6px, new-tab plus 8px; caption controls are independent.
function tabGlyph(name: string, x: number, y: number, c: string) {
  const path = name === 'close' ? 'M-2.5-2.5 2.5 2.5M2.5-2.5-2.5 2.5' : 'M-3.25 0H3.25M0-3.25V3.25';
  return (
    `<path d="${path}" transform="translate(${x} ${y})" fill="none" ` +
    `stroke="${c}" stroke-width="1.5" stroke-linecap="round"/>`
  );
}

function favicon(x: number, y: number, c: string, header: WindowHeader) {
  if (
    header.faviconEnabled &&
    header.faviconDataUrl &&
    isWindowHeaderFavicon(header.faviconDataUrl)
  )
    return `<image x="${x}" y="${y}" width="16" height="16" href="${esc(header.faviconDataUrl)}"/>`;
  return (
    `<g fill="none" stroke="${c}" stroke-width="1.1"><circle cx="${x + 8}" cy="${y + 8}" ` +
    `r="6"/><ellipse cx="${x + 8}" cy="${y + 8}" rx="3.4" ry="6"/><path d="M${x + 2} ` +
    `${y + 8}h12"/></g>`
  );
}
function traffic(y: number) {
  return ['#ff5f57', '#febc2e', '#28c840']
    .map(
      (c, i) =>
        `<circle cx="${20 + i * 20}" cy="${y}" r="6" fill="${c}" stroke="#000" ` +
        `stroke-opacity=".13" stroke-width=".7"/>`
    )
    .join('');
}
function controls(os: string, w: number, y: number, c: string, dark: boolean) {
  if (os === 'mac') return traffic(y);
  if (os === 'linux')
    return (
      `<circle cx="${w - 25}" cy="${y}" r="12" fill="${dark ? '#48484b' : '#deddda'}"/>` +
      icon('close', w - 25, y, c, 1.6)
    );
  return (
    icon('min', w - 115, y, c, 1) + icon('max', w - 69, y, c, 1) + icon('close', w - 23, y, c, 1)
  );
}
/** Self-contained SVG: no external resources and one continuous tab/toolbar surface. */
export function composeWindowHeaderSvg(
  header: WindowHeader,
  source: { width: number; height: number },
  rasterHeight?: number
): string {
  const geometry = windowHeaderGeometry(header, source);
  const { kind, title } = header;
  const os = header.style === 'windows' ? 'win' : header.style === 'macos' ? 'mac' : 'linux';
  const dark = header.theme === 'dark';
  const w = geometry.layoutWidth;
  const outputHeight = rasterHeight ?? geometry.height;
  const h = outputHeight / geometry.scale;
  let s =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${geometry.width}" ` +
    `height="${outputHeight}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${kind} ` +
    `${os} ${dark ? 'dark' : 'light'}"><title>${esc(title)}</title>` +
    `<style>${headerFontCss}text{font-family:WindowHeaderFont,sans-serif}</style>`;
  s +=
    kind === 'browser'
      ? composeBrowserChrome(header, w, h, os, dark)
      : composeApplicationChrome(header, w, h, os, dark);
  s += `<path d="M0 ${h - 0.5}H${w}" stroke="#000" stroke-opacity="${dark ? '.4' : '.12'}"/></svg>`;
  return s;
}

/** Tab strip and address toolbar reflow together around fixed-size browser controls. */
function composeBrowserChrome(
  header: WindowHeader,
  w: number,
  h: number,
  os: string,
  dark: boolean
) {
  const { title, url } = header;
  let fg = dark ? '#e3e3e3' : '#242424',
    top = dark ? '#202124' : '#dfe1e6',
    base = dark ? '#35363a' : '#ffffff',
    address = dark ? '#202124' : '#eceff7';
  let iconColor = dark ? '#b9bdc5' : '#5e6064',
    captionColor = dark ? '#a1a5ad' : '#84888c',
    disabledColor = dark ? '#666a72' : '#b8bcc3';
  let s = '';
  let tx = os === 'mac' ? 88 : 40,
    tw = Math.min(233, w - tx - (os === 'win' ? 180 : 80));
  s +=
    `<rect width="${w}" height="${h}" fill="${top}"/><path d="M${tx - 10} 40Q${tx} 40 ${tx} ` +
    `30V14Q${tx} 6 ${tx + 8} 6H${tx + tw - 8}Q${tx + tw} 6 ${tx + tw} 14V30Q${tx + tw} 40 ` +
    `${tx + tw + 10} 40H${w}V${h}H0V40Z" fill="${base}"/>`;
  s += controls(os, w, os === 'win' ? 17 : 20, captionColor, dark);
  if (os !== 'mac')
    s +=
      `<rect x="5" y="6" width="28" height="28" rx="8" fill="${base}"/>` +
      icon('chevron', 19, 20, iconColor);
  s +=
    favicon(tx + 14, 12, fg, header) +
    clipHeaderLabel(
      `<text x="${tx + 38}" y="24.75" font-family="Arial,sans-serif" font-size="13" ` +
        `fill="${fg}">${esc(title)}</text>`,
      tx + 38,
      tw - 67,
      40
    ) +
    tabGlyph('close', tx + tw - 16, 20, iconColor) +
    tabGlyph('plus', tx + tw + 21, 20, iconColor);
  s +=
    icon('back', 23, 63, iconColor) +
    icon('forward', 59, 63, disabledColor) +
    icon('reload', 95, 63, iconColor);
  s +=
    `<rect x="121" y="46" width="${w - 233}" height="34" rx="17" fill="${address}"/>` +
    icon('tune', 137, 63, iconColor) +
    clipHeaderLabel(
      `<text x="157" y="68" font-family="Arial,sans-serif" font-size="14" ` +
        `fill="${fg}">${esc(url)}</text>`,
      157,
      w - 307,
      86
    ) +
    icon('star', w - 131, 63, iconColor, 1.2) +
    icon('puzzle', w - 91, 63, iconColor, 1.2) +
    `<circle cx="${w - 56}" cy="63" r="9" fill="${dark ? '#737f93' : '#e0e5ee'}"/><circle ` +
    `cx="${w - 56}" cy="60" r="3" fill="${dark ? '#e1e7f1' : '#788495'}"/><path ` +
    `d="M${w - 62} 69C${w - 62} 63 ${w - 50} 63 ${w - 50} 69Z" ` +
    `fill="${dark ? '#e1e7f1' : '#788495'}"/>` +
    [59, 63, 67]
      .map((y) => `<circle cx="${w - 22}" cy="${y}" r="1" fill="${iconColor}"/>`)
      .join('');
  return s;
}

/** Native application captions use their own title placement and surface colors. */
function composeApplicationChrome(
  header: WindowHeader,
  w: number,
  h: number,
  os: string,
  dark: boolean
) {
  const { title } = header;
  const fg = dark ? '#e3e3e3' : '#242424';
  let s = '';
  let bg =
    os === 'mac'
      ? dark
        ? '#303030'
        : '#ededed'
      : os === 'linux'
        ? dark
          ? '#303030'
          : '#ebebeb'
        : dark
          ? '#202020'
          : '#f3f3f3';
  s += `<rect width="${w}" height="${h}" fill="${bg}"/>` + controls(os, w, h / 2, fg, dark);
  if (os === 'win')
    s += clipHeaderLabel(
      `<text x="16" y="20" font-family="Segoe UI Variable,Segoe UI,Arial,sans-serif" ` +
        `font-size="12" fill="${fg}">${esc(title)}</text>`,
      16,
      w - 168,
      h
    );
  else
    s += clipHeaderLabel(
      `<text x="${w / 2}" y="${h / 2 + 4.5}" text-anchor="middle" ` +
        `font-family="${os === 'linux' ? 'Cantarell,' : ' '}Arial,sans-serif" font-size="13" ` +
        `font-weight="600" fill="${fg}">${esc(title)}</text>`,
      90,
      w - 180,
      h
    );
  return s;
}

/** Text uses the actual font advance; a trailing alpha fade protects neighboring controls. */
function clipHeaderLabel(markup: string, x: number, width: number, height: number) {
  const id = `label-${x}-${height}`;
  return (
    `<svg x="${x}" y="0" width="${width}" height="${height}" overflow="hidden">` +
    `<defs><linearGradient id="${id}-fade" gradientUnits="userSpaceOnUse" ` +
    `x1="${Math.max(0, width - 14)}" x2="${width}"><stop stop-color="white"/>` +
    `<stop offset="1" stop-color="white" stop-opacity="0"/></linearGradient>` +
    `<mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="${width}" height="${height}">` +
    `<rect width="${width}" height="${height}" fill="url(#${id}-fade)"/></mask></defs>` +
    `<g mask="url(#${id})"><g transform="translate(${-x} 0)">${markup}</g></g></svg>`
  );
}
