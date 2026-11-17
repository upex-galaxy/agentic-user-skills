// `architecture`: boxes grouped in zones (layers or columns), auto-laid out from a description.
// s.architecture({ zones: [{ id: 'client', title: 'Cliente', nodes: [{ id: 'web', text: 'App web' }] }, ...],
//   links: [['web', 'api', 'HTTPS'], ...], layout: 'layers' | 'columns', at: 0.3 })
// Reveal order: zones, then nodes, then links. Node ids are registered, so edges and motion helpers can use them.
import { ease, hash, prog } from '../math.js';
import { edge, node } from './base.js';
import { blockRect, chipItem, drawFit, fitIn, TOKENS } from './diagram-kit.js';

/** Pure layout. Returns zone rects and node rects. layout 'layers' stacks zones top to bottom, 'columns' puts them side by side. */
export function architectureLayout({ zones, area, layout = 'layers', titleH = 56, pad = 26 }) {
  const n = zones.length;
  const out = { zones: {}, nodes: {} };
  if (layout === 'columns') {
    const gap = 120;
    const zw = Math.min(520, (area.w - gap * (n - 1)) / n);
    const zh = Math.min(area.h, 880);
    const x0 = area.x + (area.w - (zw * n + gap * (n - 1))) / 2;
    const y0 = area.y + (area.h - zh) / 2;
    zones.forEach((z, i) => {
      const zr = { x: x0 + i * (zw + gap), y: y0, w: zw, h: zh };
      out.zones[z.id] = zr;
      const k = z.nodes.length;
      const ng = 36;
      const nh = Math.min(130, (zh - titleH - pad * 2 - ng * (k - 1)) / k);
      const nw = zw - pad * 2;
      const total = nh * k + ng * (k - 1);
      const top = zr.y + titleH + (zh - titleH - total) / 2;
      z.nodes.forEach((nd, j) => { out.nodes[nd.id] = { x: zr.x + pad, y: top + j * (nh + ng), w: nw, h: nh }; });
    });
    return out;
  }
  const gap = 72;
  const zh = Math.min(250, (area.h - gap * (n - 1)) / n);
  const y0 = area.y + (area.h - (zh * n + gap * (n - 1))) / 2;
  zones.forEach((z, i) => {
    const zr = { x: area.x, y: y0 + i * (zh + gap), w: area.w, h: zh };
    out.zones[z.id] = zr;
    const k = z.nodes.length;
    const ng = 170;
    const nh = Math.min(130, zh - titleH - pad);
    const nw = Math.min(340, (zr.w - pad * 2 - ng * (k - 1)) / k);
    const total = nw * k + ng * (k - 1);
    const left = zr.x + (zr.w - total) / 2;
    z.nodes.forEach((nd, j) => { out.nodes[nd.id] = { x: left + j * (nw + ng), y: zr.y + titleH + (zr.h - titleH - nh) / 2 - 4, w: nw, h: nh }; });
  });
  return out;
}

export const architecture = (s, o) => {
  const pid = o.id ?? s.uid('arch');
  const area = o.area ?? s.area;
  const zones = (o.zones ?? []).map(z => ({ ...z, nodes: (z.nodes ?? []).map(nd => (typeof nd === 'string' ? { id: nd, text: nd } : { text: nd.id, ...nd })) }));
  if (!zones.length) { throw new Error('architecture needs zones'); }
  const L = architectureLayout({ zones, area, layout: o.layout });
  const at0 = o.at ?? 0;
  const zoneStep = o.zoneStep ?? 0.5;
  const nodesAt = at0 + zoneStep * zones.length + 0.1;
  const allNodes = zones.flatMap(z => z.nodes.map(nd => ({ ...nd, zone: z.id })));
  const nodeStep = o.nodeStep ?? 0.2;
  const linksAt = nodesAt + nodeStep * allNodes.length + 0.3;
  const linkStep = o.linkStep ?? 0.5;
  const handle = { zones: L.zones, nodes: L.nodes, end: linksAt + (o.links?.length ?? 0) * linkStep };

  zones.forEach((z, i) => {
    const rect = L.zones[z.id];
    const color = z.color ?? TOKENS[i % TOKENS.length];
    const at = at0 + zoneStep * i;
    const titleRect = { x: rect.x + 22, y: rect.y + 8, w: rect.w - 44, h: 46 };
    const fit = z.title ? fitIn(s, z.title, titleRect, { px: Math.round(s.style.defaults.labelPx * 0.8), pad: 0, font: 'display' }) : null;
    const k = t => ease.out(prog(t, at, 0.7));
    s.reg.add(z.id, rect);
    s.add({
      kind: 'group',
      id: z.id,
      z: -1,
      rect,
      contains: z.nodes.map(nd => nd.id),
      texts: () => (z.title ? [z.title] : []),
      draw(api, t) {
        const p = k(t);
        if (p <= 0) { return; }
        api.style.shape(api, rect, { kind: 'round', p, stroke: color, fill: null, lw: 2.5, dash: [14, 10], alpha: p, seed: hash(z.id) });
        if (fit) { drawFit(api, fit, titleRect, { align: 'left', role: 'display', color, alpha: p }); }
      },
      qa: (_api, t) => ({ rect, alpha: k(t), container: true, contains: z.nodes.map(nd => nd.id), texts: fit ? [{ text: z.title, rect: blockRect(fit, titleRect, 'left'), overflow: fit.overflow, px: fit.px }] : [] }),
    });
  });

  allNodes.forEach((nd, i) => {
    const zi = zones.findIndex(z => z.id === nd.zone);
    s.add(node(s, { id: nd.id, text: nd.text, rect: L.nodes[nd.id], at: nodesAt + nodeStep * i, color: nd.color ?? zones[zi].color ?? TOKENS[zi % TOKENS.length], shape: nd.shape }));
  });

  (o.links ?? []).forEach((raw, i) => {
    const l = Array.isArray(raw) ? { from: raw[0], to: raw[1], label: raw[2] } : raw;
    for (const end of [l.from, l.to]) { if (!L.nodes[end]) { throw new Error(`architecture link ${i}: unknown node "${end}"`); } }
    const at = linksAt + linkStep * i;
    const e = edge(s, { from: l.from, to: l.to, id: `${pid}-link-${i}`, at, dur: 0.6, color: l.color ?? 'ink', dash: l.dash, gap: 8 });
    s.add(e);
    if (l.label) {
      const [a, b] = [e.conn.pts[0], e.conn.pts[e.conn.pts.length - 1]];
      s.add(chipItem(s, { id: `${pid}-link-${i}-label`, text: l.label, center: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], at: at + 0.4, color: l.color ?? 'dim', bounds: area, overlapWith: zones.map(z => z.id) }));
    }
  });
  return { kind: 'architecture', id: pid, z: -2, rect: area, ...handle, texts: () => [], draw() {} };
};

export const pieces = { architecture };
