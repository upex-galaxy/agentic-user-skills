// Screen bands and the fill rule shared by the scene builder and the pieces.
const FILL_TARGET = 0.8; // share of the area's width or height (whichever binds) a scaled piece aims for
const FILL_BELOW = 0.7; // pieces already filling this much are left alone
const FILL_MAX = 2.2; // largest scale-up

/** Screen furniture bands (1920x1080 reference): the heading sits above the content area, the caption and footer below it. */
export function bands(W, H) {
  return {
    heading: { x: 120, y: 124, w: W - 240, h: 104 },
    area: { x: 80, y: 244, w: W - 160, h: H - 244 - 200 },
  };
}

/** Uniform scale that takes a content box to FILL_TARGET of `area`, or shrinks it to fit; 1 when it already fills enough. */
export function fillScale(b, area) {
  const r = Math.max(b.w / area.w, b.h / area.h);
  if (!(r > 0)) { return 1; }
  if (r > 1.005) { return 1 / r; }
  return r < FILL_BELOW ? Math.min(FILL_MAX, FILL_TARGET / r) : 1;
}
