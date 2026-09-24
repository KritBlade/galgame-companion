// image-regen-core unit tests — when a regenerated image must be painted onto the stage by us. v0.1
//
// galgame repaints its stage for the newest AI floor only (process-message.js: every other floor logs
// "不是最后一条AI消息，跳过全局UI更新"). Live 2026-09-24: the stage stood on floor 8 of a chat whose newest
// reply was floor 10; the regenerate swapped floor 8's image, the scene was renamed and the new URL filed,
// and the stage kept the old picture until the player navigated away and back.
import { describe, it, expect } from 'vitest';
import { basename, cssUrlValue, decideRegenRepaint } from '../src/features/image/image-regen-core.js';

const OLD = '/user/images/ArtificKoi/ArtificKoi_2026-09-24@10h58m02s411ms.png';
const NEW = '/user/images/ArtificKoi/ArtificKoi_2026-09-24@11h15m15s100ms.png';

// The live shape: reading back on floor 8, newest reply is floor 10, the stage shows the image being regenerated.
function live(overrides = {}) {
  return { floor: 8, lastAiFloor: 10, stageFloor: 8, displayedUrl: OLD, oldSrc: OLD, newSrc: NEW, ...overrides };
}

describe('basename', () => {
  it('is the filename alone — absolute, relative and query-suffixed forms of one image agree', () => {
    expect(basename(OLD)).toBe('ArtificKoi_2026-09-24@10h58m02s411ms.png');
    expect(basename('http://10.0.1.249:7598' + OLD + '?v=2')).toBe(basename(OLD));
    expect(basename(null)).toBe('');
  });
});

describe('cssUrlValue', () => {
  it('writes the value galgame writes: url("…") with quotes and backslashes escaped, newlines dropped', () => {
    expect(cssUrlValue(NEW)).toBe(`url("${NEW}")`);
    expect(cssUrlValue('/a"b\\c\n.png')).toBe('url("/a\\"b\\\\c.png")');
  });
});

describe('decideRegenRepaint', () => {
  it('THE BUG (live 2026-09-24): an older floor still showing the regenerated image is repainted by us', () => {
    const d = decideRegenRepaint(live());
    expect(d).toMatchObject({ repaint: true, landed: true });
    expect(d.reason).toContain('floor 8');
  });

  it('has not landed while the image at that position is unchanged — same file under another URL form included', () => {
    expect(decideRegenRepaint(live({ newSrc: null }))).toMatchObject({ repaint: false, landed: false });
    expect(decideRegenRepaint(live({ newSrc: OLD }))).toMatchObject({ repaint: false, landed: false });
    expect(decideRegenRepaint(live({ newSrc: 'http://10.0.1.249:7598' + OLD }))).toMatchObject({ repaint: false, landed: false });
  });

  it('the newest AI floor is galgame\'s to repaint — landed, but not ours', () => {
    const d = decideRegenRepaint(live({ floor: 10, stageFloor: 10 }));
    expect(d).toMatchObject({ repaint: false, landed: true });
    expect(d.reason).toContain('galgame repaints it itself');
  });

  it('a stage showing some other floor is left alone, and says which floor it shows', () => {
    const d = decideRegenRepaint(live({ stageFloor: 6 }));
    expect(d).toMatchObject({ repaint: false, landed: true });
    expect(d.reason).toContain('floor 6');
    expect(decideRegenRepaint(live({ stageFloor: -1 })).repaint).toBe(false);
  });

  it('a stage that moved on to another image of the same floor is left alone', () => {
    const d = decideRegenRepaint(live({ displayedUrl: '/user/images/ArtificKoi/other.png' }));
    expect(d).toMatchObject({ repaint: false, landed: true });
    expect(decideRegenRepaint(live({ displayedUrl: null })).repaint).toBe(false);
  });

  it('the newest-floor rule outranks the stage checks, so an unstamped stage on the newest floor never repaints', () => {
    expect(decideRegenRepaint(live({ floor: 10, stageFloor: -1, displayedUrl: null })).reason).toContain('galgame repaints');
  });
});
