// image-viewer-core unit tests — reading the displayed backdrop off galgame v2.2's layers. v0.1
//
// galgame v2.2 keeps the backdrop in `--gal-bg-url` on each layer's inline style; in its avoid-dialog
// fill mode the layer's own background-image is `none`, and a viewer reading that opened "No image is
// showing right now." over a stage that was plainly showing one (staging, 2026-09-23).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { BACKDROP_URL_VARIABLE, urlFromCssValue, displayedBackdropUrl } from '../src/features/image/image-viewer-core.js';

// The base layer's inline value, read live on staging in avoid-dialog mode.
const LIVE_BASE = 'url("/user/images/ArtificKoi/ArtificKoi_2026-09-23@21h48m21s551ms.png")';

describe('urlFromCssValue', () => {
  it('reads the URL out of the value galgame writes', () => {
    expect(urlFromCssValue(LIVE_BASE)).toBe('/user/images/ArtificKoi/ArtificKoi_2026-09-23@21h48m21s551ms.png');
  });
  it('undoes galgame\'s backslash escapes for quote and backslash', () => {
    expect(urlFromCssValue(String.raw`url("/a\"b\\c.png")`)).toBe(String.raw`/a"b\c.png`);
  });
  it('takes single-quoted and unquoted url() too, with padding', () => {
    expect(urlFromCssValue("  url( '/x.png' ) ")).toBe('/x.png');
    expect(urlFromCssValue('url(/y.png)')).toBe('/y.png');
  });
  it('is null for no image: empty, none, url(""), or not a url()', () => {
    for (const value of ['', null, undefined, 'none', 'url("")', 'linear-gradient(red, blue)']) {
      expect(urlFromCssValue(value)).toBeNull();
    }
  });
});

describe('displayedBackdropUrl', () => {
  it('the front layer wins while it holds an image (a cross-fade target)', () => {
    expect(displayedBackdropUrl(['url("/front.png")', LIVE_BASE])).toBe('/front.png');
  });
  it('an empty front layer falls through to the base — the settled image', () => {
    expect(displayedBackdropUrl(['', LIVE_BASE])).toBe('/user/images/ArtificKoi/ArtificKoi_2026-09-23@21h48m21s551ms.png');
    expect(displayedBackdropUrl([null, LIVE_BASE])).toBe('/user/images/ArtificKoi/ArtificKoi_2026-09-23@21h48m21s551ms.png');
  });
  it('null when neither layer holds one', () => {
    expect(displayedBackdropUrl(['', ''])).toBeNull();
    expect(displayedBackdropUrl([])).toBeNull();
  });
});

describe('the viewer reads the variable, where galgame writes it', () => {
  // image-viewer.js touches the DOM, so the guard reads its source: the old read — the layer's computed
  // background-image — is exactly what avoid-dialog mode empties.
  const viewer = readFileSync(new URL('../src/features/image/image-viewer.js', import.meta.url), 'utf8');
  it('the variable is the one galgame v2.2 sets', () => {
    expect(BACKDROP_URL_VARIABLE).toBe('--gal-bg-url');
  });
  it('currentBgUrl reads the inline variable and never the layer\'s background-image', () => {
    const fn = viewer.slice(viewer.indexOf('export function currentBgUrl'), viewer.indexOf('let cleanup'));
    expect(fn).toMatch(/\.style\.getPropertyValue\(BACKDROP_URL_VARIABLE\)/);
    expect(fn).not.toMatch(/backgroundImage/);
  });
});
