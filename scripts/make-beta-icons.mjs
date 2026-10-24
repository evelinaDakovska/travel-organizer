/**
 * Builds the Beta launcher icons from the stable ones: the same book with a red "BETA" banner across
 * it, so Travel Organizer Beta can never be mistaken for the stable app on a home screen or in a
 * share sheet. The output is committed in assets/beta/; run this again only if the stable icons change.
 *
 *   node scripts/make-beta-icons.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PNG } from 'pngjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'assets', 'beta');

/** 5 × 7 block letters. */
const GLYPHS = {
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
};
const WORD = 'BETA';
const BANNER = [198, 40, 40, 255]; // #C62828
const LETTER = [255, 255, 255, 255];

function setPixel(png, x, y, [r, g, b, a]) {
  const i = (png.width * y + x) << 2;
  png.data[i] = r;
  png.data[i + 1] = g;
  png.data[i + 2] = b;
  png.data[i + 3] = a;
}

/**
 * A banner centred on (cx, cy) with the word in it. `cell` is one letter pixel's size; `letter`
 * may be transparent, which cuts the word out of the banner (the monochrome icon is alpha only).
 */
function drawBanner(png, { cx, cy, cell, letter = LETTER }) {
  const textW = (WORD.length * 6 - 1) * cell;
  const textH = 7 * cell;
  const padX = cell * 3;
  const padY = cell * 2;
  const left = Math.round(cx - textW / 2 - padX);
  const top = Math.round(cy - textH / 2 - padY);
  const width = textW + padX * 2;
  const height = textH + padY * 2;
  for (let y = top; y < top + height; y++) {
    for (let x = left; x < left + width; x++) setPixel(png, x, y, BANNER);
  }
  [...WORD].forEach((char, index) => {
    GLYPHS[char].forEach((row, gy) => {
      [...row].forEach((on, gx) => {
        if (on !== '1') return;
        const x0 = left + padX + (index * 6 + gx) * cell;
        const y0 = top + padY + gy * cell;
        for (let y = y0; y < y0 + cell; y++) {
          for (let x = x0; x < x0 + cell; x++) setPixel(png, x, y, letter);
        }
      });
    });
  });
}

function make(source, target, banner) {
  const png = PNG.sync.read(readFileSync(join(root, 'assets', source)));
  drawBanner(png, banner);
  writeFileSync(join(out, target), PNG.sync.write(png));
  console.log(`assets/beta/${target}`);
}

mkdirSync(out, { recursive: true });
// Adaptive layers are 432 px; the launcher mask keeps a 264 px circle in the centre, so the banner
// sits low but inside it.
make('android-icon-foreground.png', 'android-icon-foreground.png', { cx: 216, cy: 300, cell: 5 });
make('android-icon-monochrome.png', 'android-icon-monochrome.png', {
  cx: 216,
  cy: 300,
  cell: 5,
  letter: [0, 0, 0, 0],
});
make('icon.png', 'icon.png', { cx: 512, cy: 900, cell: 14 });
