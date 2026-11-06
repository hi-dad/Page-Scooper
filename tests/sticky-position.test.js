const test = require("node:test");
const assert = require("node:assert/strict");
const {
  calculateResilientStickyPosition,
  calculateStickyPosition
} = require("../utils.js");

const viewport = { top: 0, right: 1200, bottom: 800, left: 0 };
const button = { width: 180, height: 40 };

test("button remains visible from the top through the bottom of a scroll container", () => {
  const panel = { top: 120, right: 900, bottom: 620, left: 100 };
  const contentHeight = 2000;
  const maxScroll = contentHeight - (panel.bottom - panel.top);

  for (let scrollTop = 0; scrollTop <= maxScroll; scrollTop += 25) {
    const target = {
      top: panel.top - scrollTop,
      right: panel.right,
      bottom: panel.top - scrollTop + contentHeight,
      left: panel.left
    };
    const placement = calculateResilientStickyPosition(
      target,
      [panel],
      viewport,
      button
    );

    assert.ok(placement, `missing at scrollTop=${scrollTop}`);
    assert.equal(placement.top, 132, `vertical drift at scrollTop=${scrollTop}`);
    assert.equal(placement.left, 708, `horizontal drift at scrollTop=${scrollTop}`);
    assertWithinViewport(placement);
  }
});

test("button remains anchored when the transcript starts halfway scrolled", () => {
  const panel = { top: 160, right: 1050, bottom: 700, left: 240 };
  const initialScrollTop = 925;
  const placement = calculateStickyPosition(
    {
      top: panel.top - initialScrollTop,
      right: panel.right,
      bottom: panel.top - initialScrollTop + 2400,
      left: panel.left
    },
    [panel],
    viewport,
    button
  );

  assert.deepEqual(placement, { left: 858, top: 172 });
  assertWithinViewport(placement);
});

test("button remains visible through nested page and transcript scrolling", () => {
  const outerPanel = { top: 70, right: 1050, bottom: 740, left: 40 };
  const transcriptPanel = { top: 145, right: 920, bottom: 650, left: 130 };
  const contentHeight = 2300;
  const maxScroll = contentHeight - (transcriptPanel.bottom - transcriptPanel.top);

  for (let scrollTop = 0; scrollTop <= maxScroll; scrollTop += 37) {
    const placement = calculateStickyPosition(
      {
        top: transcriptPanel.top - scrollTop,
        right: transcriptPanel.right,
        bottom: transcriptPanel.top - scrollTop + contentHeight,
        left: transcriptPanel.left
      },
      [outerPanel, transcriptPanel],
      viewport,
      button
    );

    assert.ok(placement, `missing in nested panel at scrollTop=${scrollTop}`);
    assert.equal(placement.top, 157, `nested vertical drift at scrollTop=${scrollTop}`);
    assert.equal(placement.left, 728, `nested horizontal drift at scrollTop=${scrollTop}`);
    assertWithinViewport(placement);
  }
});

test("button remains visible throughout horizontal scrolling", () => {
  const panel = { top: 140, right: 900, bottom: 650, left: 100 };
  const contentWidth = 2100;
  const maxScroll = contentWidth - (panel.right - panel.left);

  for (let scrollLeft = 0; scrollLeft <= maxScroll; scrollLeft += 41) {
    const placement = calculateStickyPosition(
      {
        top: panel.top,
        right: panel.left - scrollLeft + contentWidth,
        bottom: panel.bottom,
        left: panel.left - scrollLeft
      },
      [panel],
      viewport,
      button
    );

    assert.ok(placement, `missing at scrollLeft=${scrollLeft}`);
    assert.equal(placement.left, 708, `horizontal drift at scrollLeft=${scrollLeft}`);
    assertWithinViewport(placement);
  }
});

test("fallback keeps a viewport-visible button reachable when clipping metadata is inconsistent", () => {
  const target = { top: 220, right: 980, bottom: 700, left: 180 };
  const incorrectClip = { top: 0, right: 100, bottom: 100, left: 0 };

  assert.equal(
    calculateStickyPosition(target, [incorrectClip], viewport, button),
    null
  );
  const placement = calculateResilientStickyPosition(
    target,
    [incorrectClip],
    viewport,
    button
  );
  assert.deepEqual(placement, { left: 788, top: 232 });
  assertWithinViewport(placement);
});

test("button hides only after the selected content is fully outside the viewport", () => {
  assert.ok(calculateStickyPosition(
    { top: 799, right: 800, bottom: 900, left: 200 },
    [],
    viewport,
    button
  ));
  assert.equal(calculateStickyPosition(
    { top: 800, right: 800, bottom: 900, left: 200 },
    [],
    viewport,
    button
  ), null);
});

function assertWithinViewport(placement) {
  assert.ok(placement.left >= 8, `left edge outside viewport: ${placement.left}`);
  assert.ok(placement.top >= 8, `top edge outside viewport: ${placement.top}`);
  assert.ok(placement.left + button.width <= viewport.right - 8);
  assert.ok(placement.top + button.height <= viewport.bottom - 8);
}
