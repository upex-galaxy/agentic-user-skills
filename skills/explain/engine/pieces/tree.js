// folderTree: a folder structure from a nested object or an indented string. Rows reveal in order with their
// connectors; `highlight` marks one path at a time. The font and row height auto-size to the area.
import { clamp, ease, hash, lerp, prog } from '../math.js';
import { measure } from '../text.js';

const register = (s, id, rect) => (s.reg.has(id) ? s.reg.get(id) : s.reg.add(id, rect));

/** Nested object -> flat rows. Keys with an object value are folders; any other value is a file. */
function rowsFromObject(obj, depth = 0, parent = '', out = []) {
  for (const [key, val] of Object.entries(obj)) {
    const name = key.replace(/\/$/, '');
    const dir = val !== null && typeof val === 'object';
    const path = parent ? `${parent}/${name}` : name;
    out.push({ name: dir || key.endsWith('/') ? `${name}/` : name, depth, dir: dir || key.endsWith('/'), path });
    if (dir) { rowsFromObject(val, depth + 1, path, out); }
  }
  return out;
}

/** Indented text -> flat rows. The indent unit is the smallest non-zero indent; a trailing "/" or deeper children make a folder. */
function rowsFromText(text) {
  const raw = String(text).split('\n').filter(l => l.trim()).map((l) => {
    const m = /^[ \t]*/.exec(l)[0].replace(/\t/g, '  ');
    return { indent: m.length, name: l.trim() };
  });
  const unit = Math.min(...raw.map(r => r.indent).filter(n => n > 0), Infinity);
  const out = [];
  const stack = [];
  raw.forEach((r, i) => {
    const depth = Number.isFinite(unit) ? Math.round(r.indent / unit) : 0;
    const dir = r.name.endsWith('/') || (raw[i + 1] ? raw[i + 1].indent > r.indent : false);
    const name = r.name.replace(/\/$/, '');
    stack.length = depth;
    stack[depth] = name;
    out.push({ name: dir ? `${name}/` : name, depth, dir, path: stack.slice(0, depth + 1).join('/') });
  });
  return out;
}

/** Parse the `data` option into rows with `last` (last sibling) and `pass` (columns that continue through the row). */
export function parseTree(data, rootName) {
  let rows = typeof data === 'string' ? rowsFromText(data) : rowsFromObject(data);
  if (rootName) {
    const name = rootName.replace(/\/$/, '');
    rows = [{ name: `${name}/`, depth: 0, dir: true, path: name }, ...rows.map(r => ({ ...r, depth: r.depth + 1, path: `${name}/${r.path}` }))];
  }
  const lastOf = [];
  return rows.map((r, i) => {
    let last = true;
    for (let j = i + 1; j < rows.length && rows[j].depth >= r.depth; j++) {
      if (rows[j].depth === r.depth) {
        last = false;
        break;
      }
    }
    const pass = [];
    for (let c = 1; c < r.depth; c++) { if (!lastOf[c]) { pass.push(c); } }
    lastOf[r.depth] = last;
    return { ...r, last, pass };
  });
}

/** Normalize `highlight` to [{ path, at, dur }]: one path at a time, each replaced by the next. */
function windows(hl, start, step) {
  const list = (Array.isArray(hl) ? hl : hl ? [hl] : []).map((h, i) => (typeof h === 'string' ? { path: h, at: start + i * step } : { at: start + i * step, ...h }));
  return list.map((h, i) => ({ ...h, until: list[i + 1] ? list[i + 1].at : Infinity }));
}

/**
 * Folder tree panel. opts: id, data (nested object | indented string), root (optional root folder name), area | rect,
 * at, step (seconds per row), px, highlight (path | [paths] | [{ path, at }]), hlAt, hlStep, hlColor.
 * `place: 'start'` aligns the panel to the area's top-left instead of centering it.
 */
export function folderTree(s, o) {
  const id = o.id ?? s.uid('tree');
  const rows = parseTree(o.data ?? {}, o.root);
  if (!rows.length) { throw new Error('folderTree needs data'); }
  const area = o.rect ?? o.area ?? s.area;
  const d = s.style.defaults;
  const padX = 34;
  const padY = 26;
  const font = px => s.style.font('mono', px);
  const maxPx = o.px ?? d.nodePx * 0.85;
  const minPx = o.minPx ?? 14;
  let px = maxPx;
  let overflow = false;
  let contentW = 0;
  for (; px >= minPx; px--) {
    const indent = px * 1.3;
    contentW = Math.max(...rows.map(r => r.depth * indent + measure(s.ctx, r.name, font(px))));
    const rh = px * 1.55;
    overflow = contentW > area.w - padX * 2 + 0.5 || rows.length * rh > area.h - padY * 2 + 0.5;
    if (!overflow) { break; }
  }
  px = Math.max(px, minPx);
  const indent = px * 1.3;
  const rh = px * 1.55;
  const lineH = px * 1.2;
  const pw = clamp(contentW + padX * 2 + px * 2, Math.min(area.w, 720), area.w);
  const ph = rows.length * rh + padY * 2;
  const start = o.place === 'start';
  const rect = register(s, id, { x: area.x + (start ? 0 : (area.w - pw) / 2), y: area.y + (start ? 0 : (area.h - ph) / 2), w: pw, h: ph });
  const at = o.at ?? 0;
  const step = o.step ?? clamp(3 / rows.length, 0.08, 0.4);
  const rowsAt = at + 0.5;
  const rowT = i => rowsAt + i * step;
  const hl = windows(o.highlight, o.hlAt ?? rowT(rows.length) + 0.4, o.hlStep ?? 1.4);
  const geom = rows.map((r, i) => {
    const top = rect.y + padY + i * rh;
    const x = rect.x + padX + r.depth * indent;
    return { top, cy: top + rh / 2, x, w: measure(s.ctx, r.name, font(px)) };
  });
  const colX = c => rect.x + padX + (c - 1) * indent + indent * 0.35;
  const panelP = t => ease.out(prog(t, at, 0.5));
  return {
    kind: 'tree',
    id,
    z: o.z ?? 0,
    rect,
    paths: rows.map(r => r.path),
    texts: () => rows.map(r => r.name),
    draw(api, t) {
      const pp = panelP(t);
      if (pp <= 0) { return; }
      api.style.shape(api, rect, { kind: 'round', p: pp, stroke: 'dim', fill: 'panel', lw: 2.5, seed: hash(id) });
      rows.forEach((r, i) => {
        const g = geom[i];
        const hp = hl.reduce((m, h) => {
          if (h.path !== r.path) { return m; }
          return Math.max(m, ease.out(prog(t, h.at, 0.3)) * (1 - ease.out(prog(t, h.until, 0.3))));
        }, 0);
        if (hp > 0) { api.style.highlight(api, { x: rect.x + 8, y: g.top + 3, w: rect.w - 16, h: rh - 6 }, { p: hp, color: o.hlColor ?? 'accent' }); }
        const k = prog(t, rowT(i), 0.28);
        if (k <= 0) { return; }
        const seed = hash(`${id}${i}`);
        const e = ease.out(k);
        if (r.depth > 0) {
          const x = colX(r.depth);
          const bottom = r.last ? g.cy : g.top + rh;
          api.style.line(api, [[x, g.top], [x, bottom]], { p: e, color: 'dim', lw: 2.5, seed });
          api.style.line(api, [[x, g.cy], [g.x - px * 0.25, g.cy]], { p: e, color: 'dim', lw: 2.5, seed: seed + 1 });
        }
        for (const c of r.pass) { api.style.line(api, [[colX(c), g.top], [colX(c), g.top + rh]], { p: e, color: 'dim', lw: 2.5, seed: seed + c }); }
        api.style.text(api, r.name, g.x + lerp(-14, 0, e), g.cy, { px, role: 'mono', weight: r.dir ? 700 : undefined, color: r.dir ? (o.dirColor ?? 'accent') : 'ink', alpha: e });
      });
    },
    qa: (api, t) => ({
      rect,
      alpha: panelP(t),
      container: true,
      texts: rows.map((r, i) => ({ text: r.name, rect: { x: geom[i].x, y: geom[i].cy - lineH / 2, w: geom[i].w, h: lineH }, overflow: overflow && i === 0, px })),
    }),
  };
}

export const pieces = { folderTree };
