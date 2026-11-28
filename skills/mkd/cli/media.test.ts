import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'bun:test';
import { checkPageBudget, fetchLinkPreview, findBlockedResources, imageSize, MediaError, parsePreview, prepareForArtifact, resolveMedia, sanitizeSvg } from './media.ts';
import { render } from './render.ts';
import { SpecError, validateSpec } from './schema.ts';

const dir = mkdtempSync(join(tmpdir(), 'mkd-media-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

/** A real 3x2 PNG (8-bit RGB), so the header parser has something honest to read. */
const PNG = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAMAAAACCAIAAAASFvFNAAAAEklEQVR4nGP4z8DwHwyZGBgYAD3RA/1MIRrOAAAAAElFTkSuQmCC', 'base64'));
writeFileSync(join(dir, 'pic.png'), PNG);
writeFileSync(join(dir, 'clip.mp4'), new Uint8Array(2048));
writeFileSync(join(dir, 'small.webm'), new Uint8Array(1024));

function deck(media: unknown[], extra: Record<string, unknown> = {}) {
  return { session: 's', title: 't', items: [{ id: 'R1', type: 'report', title: 'r', content: 'c', media, ...extra }] };
}

const quiet = { warn: () => {} };

/** The error a promise rejects with (fails the test when it resolves). */
async function failure(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  }
  catch (error) {
    return error as Error;
  }
  throw new Error('expected a rejection');
}

describe('schema: media validation', () => {
  it('leaves a spec without media untouched (no media key)', () => {
    const spec = validateSpec({ session: 's', title: 't', items: [{ id: 'R1', type: 'report', title: 'r', content: 'c' }] });
    expect('media' in spec.items[0]).toBe(false);
  });

  it('requires alt on images and svgs', () => {
    expect(() => validateSpec(deck([{ type: 'image', src: 'a.png' }]))).toThrow('items[0].media[0].alt is required');
    expect(() => validateSpec(deck([{ type: 'svg', svg: '<svg></svg>' }]))).toThrow('alt is required on an svg');
  });

  it('needs exactly one of src or svg on an svg entry', () => {
    expect(() => validateSpec(deck([{ type: 'svg', alt: 'x', src: 'a.svg', svg: '<svg/>' }]))).toThrow('exactly one');
  });

  it('rejects schemes other than local paths, https and data', () => {
    expect(() => validateSpec(deck([{ type: 'image', alt: 'x', src: 'javascript:alert(1)' }]))).toThrow('scheme "javascript:"');
    expect(() => validateSpec(deck([{ type: 'link', url: 'http://example.com' }]))).toThrow('must be an https URL');
  });

  it('turns Loom and YouTube URLs into their embed sources', () => {
    const spec = validateSpec(deck([
      { type: 'embed', url: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ&t=90' },
      { type: 'embed', url: 'https://youtu.be/aqz-KE-bpKQ' },
      { type: 'embed', url: 'https://www.youtube.com/shorts/aqz-KE-bpKQ' },
      { type: 'embed', url: 'https://www.loom.com/share/0123456789abcdef0123456789abcdef?sid=1' },
    ]));
    expect(spec.items[0].media?.map(m => (m as { embedUrl: string }).embedUrl)).toEqual([
      'https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ?start=90',
      'https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ',
      'https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ',
      'https://www.loom.com/embed/0123456789abcdef0123456789abcdef',
    ]);
  });

  it('rejects any other embed host (exit 2 path)', () => {
    expect(() => validateSpec(deck([{ type: 'embed', url: 'https://vimeo.com/1' }]))).toThrow(SpecError);
    expect(() => validateSpec(deck([{ type: 'embed', url: 'https://vimeo.com/1' }]))).toThrow('Loom or YouTube URLs only');
  });

  it('validates diagrams and accepts media on intro, items and options', () => {
    expect(() => validateSpec(deck([{ type: 'diagram', format: 'mermaid', code: '' }]))).toThrow('non-empty string of Mermaid');
    const spec = validateSpec({
      session: 's',
      title: 't',
      intro: { media: [{ type: 'diagram', format: 'mermaid', code: 'flowchart LR\nA-->B' }] },
      items: [{ id: 'D1', type: 'decision', title: 'd', problem: 'p', options: [
        { key: 'A', label: 'a', justification: 'j', media: [{ type: 'image', src: 'x.png', alt: 'x' }] },
        { key: 'B', label: 'b', justification: 'j' },
      ] }],
    });
    expect(spec.intro?.media?.[0].type).toBe('diagram');
    expect(spec.items[0].type === 'decision' && spec.items[0].options[0].media?.[0].type).toBe('image');
  });

  it('keeps the justification rule for media-only options', () => {
    expect(() => validateSpec({ session: 's', title: 't', items: [{ id: 'D1', type: 'decision', title: 'd', problem: 'p', options: [
      { key: 'A', label: 'a', justification: '', media: [{ type: 'image', src: 'x.png', alt: 'x' }] },
      { key: 'B', label: 'b', justification: 'j' },
    ] }] })).toThrow('justification');
  });
});

describe('media: inlining', () => {
  it('inlines a local image as a data URI with its intrinsic size', async () => {
    const { spec, report } = await resolveMedia(validateSpec(deck([{ type: 'image', src: 'pic.png', alt: 'p' }])), dir, quiet);
    const image = spec.items[0].media?.[0] as { src: string, width: number, height: number };
    expect(image.src.startsWith('data:image/png;base64,')).toBe(true);
    expect([image.width, image.height]).toEqual([3, 2]);
    expect(report.weights).toHaveLength(1);
  });

  it('keeps https URLs as URLs', async () => {
    const { spec } = await resolveMedia(validateSpec(deck([{ type: 'image', src: 'https://example.com/a.png', alt: 'p' }])), dir, quiet);
    expect((spec.items[0].media?.[0] as { src: string }).src).toBe('https://example.com/a.png');
  });

  it('names the path of a missing local file (exit 2)', async () => {
    const error = await failure(resolveMedia(validateSpec(deck([{ type: 'image', src: 'nope.png', alt: 'p' }])), dir, quiet));
    expect(error).toBeInstanceOf(MediaError);
    expect(error.message).toContain(`file not found: ${join(dir, 'nope.png')}`);
  });

  it('reads PNG, GIF and JPEG headers', () => {
    expect(imageSize(PNG)).toEqual({ width: 3, height: 2 });
    expect(imageSize(Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 5, 0, 7, 0, 0]))).toEqual({ width: 5, height: 7 });
    expect(imageSize(new Uint8Array(8))).toBeNull();
  });
});

describe('media: svg sanitizing', () => {
  const dirty = '<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY x "y">]><!-- c --><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" onload="alert(1)"><script>alert(2)</script><style>@import url(https://evil/x.css); .a{fill:url(https://evil/p)} .b{fill:url(#g)}</style><a href="javascript:alert(3)"><text>t</text></a><foreignObject><div>x</div></foreignObject><image href="https://evil/t.png"/><image href="data:image/png;base64,AA=="/><use href="#g"/><rect style="fill:url(https://evil)" onclick="x()"/><set attributeName="href" to="javascript:alert(4)"/></svg>';

  it('strips script, handlers, foreignObject, external refs and links', async () => {
    const clean = await sanitizeSvg(dirty);
    expect(clean.startsWith('<svg')).toBe(true);
    for (const bad of ['<script', 'onload', 'onclick', 'foreignObject', '<a ', 'javascript:', 'https://evil', '@import', '<set', 'DOCTYPE', '<!--']) {
      expect(clean).not.toContain(bad);
    }
    expect(clean).toContain('<text>t</text>');
    expect(clean).toContain('href="#g"');
    expect(clean).toContain('href="data:image/png;base64,AA=="');
    expect(clean).toContain('url(#g)');
  });

  it('renders an inline svg as an image data URI, never inline markup', async () => {
    const { spec } = await resolveMedia(validateSpec(deck([{ type: 'svg', alt: 'logo', svg: dirty }])), dir, quiet);
    const html = render(spec, { mode: 'copy' });
    expect(html).toContain('<img class="mkd-media__img" src="data:image/svg+xml;base64,');
    expect(html).not.toContain('alert(2)');
  });
});

describe('media: link cards', () => {
  let delay = 0;
  const server = Bun.serve({
    port: 0,
    async fetch(req) {
      const path = new URL(req.url).pathname;
      if (path === '/slow') {
        await Bun.sleep(delay);
      }
      if (path === '/missing') {
        return new Response('no', { status: 404 });
      }
      if (path === '/moved') {
        return Response.redirect('/og', 302);
      }
      return new Response('<html><head><title>Fallback &amp; title</title><meta property="og:title" content="OG &quot;title&quot;"><meta name="description" content="A description"><meta property="og:image" content="/img.png"></head><body>x</body></html>', { headers: { 'content-type': 'text/html; charset=utf-8' } });
    },
  });
  afterAll(async () => server.stop());
  const base = `http://localhost:${server.port}`;
  const deps = { ...quiet, fetch: async (u: string, i?: RequestInit) => fetch(u, i), ogTimeoutMs: 200, ogMaxBytes: 65536 };

  it('parses Open Graph, follows redirects and resolves relative images', async () => {
    const preview = await fetchLinkPreview(`${base}/moved`, { ...(await import('./media.ts')).defaultDeps, ...deps });
    expect(preview.title).toBe('OG "title"');
    expect(preview.description).toBe('A description');
    expect(preview.image).toBeUndefined();
    expect(parsePreview('<meta property="og:image" content="https://cdn.example/i.png">', 'https://example.com/').image).toBe('https://cdn.example/i.png');
  });

  it('falls back to a plain titled link on 404 and on timeout, with a stderr note', async () => {
    const notes: string[] = [];
    delay = 1000;
    const raw = deck([{ type: 'link', url: 'https://example.com/a' }, { type: 'link', url: 'https://example.com/b' }]);
    const urls = [`${base}/missing`, `${base}/slow`];
    let call = 0;
    const { spec } = await resolveMedia(validateSpec(raw), dir, { ...deps, warn: (m: string) => notes.push(m), fetch: async (_u: string, i?: RequestInit) => fetch(urls[call++], i) });
    const links = spec.items[0].media as { title: string }[];
    expect(links.map(l => l.title)).toEqual(['example.com', 'example.com']);
    expect(notes).toHaveLength(2);
    expect(notes[0]).toContain('HTTP 404');
    expect(notes[1]).toMatch(/timed out|abort|timeout/i);
  });

  it('never fetches when the author gave title, description and image', async () => {
    let fetched = false;
    const raw = deck([{ type: 'link', url: 'https://example.com', title: 'T', description: 'D', image: 'https://example.com/i.png' }]);
    await resolveMedia(validateSpec(raw), dir, { ...deps, fetch: async () => {
      fetched = true;
      return new Response('');
    } });
    expect(fetched).toBe(false);
  });
});

describe('media: video budgets', () => {
  const noFfmpeg = { ...quiet, which: () => null };

  it('inlines as is and warns when ffmpeg is missing', async () => {
    const notes: string[] = [];
    const { spec } = await resolveMedia(validateSpec(deck([{ type: 'video', src: 'clip.mp4' }])), dir, { ...noFfmpeg, warn: (m: string) => notes.push(m) });
    const video = spec.items[0].media?.[0] as { src: string, mime: string };
    expect(video.src.startsWith('data:video/mp4;base64,')).toBe(true);
    expect(video.mime).toBe('video/mp4');
    expect(notes[0]).toContain('ffmpeg not found');
  });

  it('inlines a small WebM as is without transcoding', async () => {
    const notes: string[] = [];
    let ran = false;
    await resolveMedia(validateSpec(deck([{ type: 'video', src: 'small.webm' }])), dir, { warn: (m: string) => notes.push(m), which: () => '/bin/ffmpeg', run: async () => {
      ran = true;
      return { code: 0, stdout: '', stderr: '' };
    } });
    expect(ran).toBe(false);
    expect(notes[0]).toContain('already a small WebM');
  });

  it('refuses a video over the per-video budget, naming it (exit 2)', async () => {
    const error = await failure(resolveMedia(validateSpec(deck([{ type: 'video', src: 'clip.mp4' }])), dir, { ...noFfmpeg, videoBudget: 1000 }));
    expect(error.message).toContain('per-video budget');
  });

  it('refuses an artifact page over 14 MB and warns above 8 MB', () => {
    const report = { inlinedBytes: 0, weights: [{ path: 'items[2].media[0].src', kind: 'video', bytes: 13 * 1024 * 1024 }] };
    expect(() => checkPageBudget(15 * 1024 * 1024, 'artifact', report, () => {})).toThrow('items[2].media[0].src (video, 13.00 MB)');
    const notes: string[] = [];
    checkPageBudget(9 * 1024 * 1024, 'copy', report, m => notes.push(m));
    expect(notes[0]).toContain('over 8.00 MB');
    expect(() => checkPageBudget(15 * 1024 * 1024, 'copy', report, () => {})).not.toThrow();
  });
});

describe('render: media markup', () => {
  it('ships media in the markup only, never twice in the embedded spec', async () => {
    const { spec } = await resolveMedia(validateSpec(deck([{ type: 'image', src: 'pic.png', alt: 'p' }])), dir, quiet);
    const html = render(spec, { mode: 'copy' });
    const embedded = /window\.__MKD__ = (.*?);window/.exec(html)?.[1] ?? '';
    expect(embedded).not.toContain('"media"');
    expect(html.match(/data:image\/png;base64/g)).toHaveLength(1);
  });

  it('renders embeds sandboxed with an always-visible open link, and several entries as a carousel', () => {
    const spec = validateSpec(deck([{ type: 'embed', url: 'https://youtu.be/aqz-KE-bpKQ' }, { type: 'link', url: 'https://example.com', title: 'Ex' }]));
    const html = render(spec, { mode: 'copy' });
    expect(html).toContain('sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"');
    expect(html).toContain('referrerpolicy="strict-origin-when-cross-origin"');
    expect(html).toContain('<a class="mkd-embed__open" href="https://youtu.be/aqz-KE-bpKQ" target="_blank" rel="noopener noreferrer">');
    expect(html).toContain('aria-roledescription="carousel"');
    expect(html).toContain('<span class="mkd-carousel__count" aria-hidden="true">1/2</span>');
  });

  it('loads Mermaid only for decks with a diagram, pinned with SRI', () => {
    const plain = render(validateSpec(deck([{ type: 'link', url: 'https://example.com', title: 'x' }])), { mode: 'copy' });
    const withDiagram = render(validateSpec(deck([{ type: 'diagram', format: 'mermaid', code: 'flowchart LR\nA-->B' }])), { mode: 'copy' });
    expect(plain).not.toContain('window.__MKD_MERMAID__ = ');
    expect(withDiagram).toContain('window.__MKD_MERMAID__ = {"src":"https://cdn.jsdelivr.net/npm/mermaid@11.17.2/dist/mermaid.min.js","integrity":"sha384-');
    expect(withDiagram).toContain('<pre class="mkd-diagram__src"><code>flowchart LR\nA--&gt;B</code></pre>');
  });

  const optionDeck = (extra: Record<string, unknown> = {}) => ({ session: 's', title: 't', items: [{ id: 'D1', type: 'decision', title: 'd', problem: 'p', ...extra, options: [
    { key: 'A', label: 'a', justification: 'j', media: [{ type: 'image', src: 'https://example.com/a.png', alt: 'a' }, { type: 'link', url: 'https://example.com' }] },
    { key: 'B', label: 'b', justification: 'j' },
  ] }] });
  const optionA = (html: string) => /<button type="button" class="mkd-opt" data-opt-key="A">([\s\S]*?)<\/button>\s*<button type="button" class="mkd-opt/.exec(html)?.[1] ?? '';

  it('keeps option media non-interactive inside the option button (large layout by default)', () => {
    const html = render(validateSpec(optionDeck()), { mode: 'copy' });
    const option = optionA(html);
    const visible = option.replace(/<template[\s\S]*?<\/template>/, '');
    expect(visible).toContain('<span class="mkd-opt__preview" aria-hidden="true"><span class="mkd-opt__gallery mkd-opt__gallery--one"><span class="mkd-opt__shot" data-opt-zoom="0"><img src="https://example.com/a.png"');
    expect(visible).toContain('<span class="mkd-opt__chip" data-opt-zoom="1">');
    expect(visible).not.toMatch(/<(?:a|button|iframe|video)\b/);
    expect(option).toContain('<template class="mkd-opt__full">');
    expect(html).toContain('<div class="mkd-opts has-gallery">');
    expect(html).toContain('data-opt-media>View option media <kbd>V</kbd></button>');
  });

  it('keeps the older thumbnail row with optionMediaLayout "compact"', () => {
    const html = render(validateSpec(optionDeck({ optionMediaLayout: 'compact' })), { mode: 'copy' });
    expect(optionA(html)).toContain('class="mkd-opt__media" aria-hidden="true"><span class="mkd-opt__thumb">');
    expect(html).not.toContain('<div class="mkd-opts has-gallery');
  });

  it('rejects an unknown optionMediaLayout', () => {
    expect(() => validateSpec(optionDeck({ optionMediaLayout: 'huge' }))).toThrow('optionMediaLayout (id "D1") must be one of: large, compact.');
  });

  it('inlines a local full-size source and carries it on the figure for the viewer only', async () => {
    const { spec } = await resolveMedia(validateSpec(deck([{ type: 'image', src: 'https://example.com/small.png', alt: 'p', full: 'pic.png' }])), dir, quiet);
    const html = render(spec, { mode: 'copy' });
    expect(html).toContain('<img class="mkd-media__img" src="https://example.com/small.png" alt="p" loading="lazy" decoding="async" data-remote data-full="data:image/png;base64,');
    expect(() => validateSpec(deck([{ type: 'image', src: 'a.png', alt: 'p', full: 'ftp://x/y.png' }]))).toThrow('media[0].full must be a local path or an https URL');
  });

  it('stores a repeated picture once in the media pool', async () => {
    const raw = { session: 's', title: 't', items: [{ id: 'D1', type: 'decision', title: 'd', problem: 'p', media: [{ type: 'image', src: 'pic.png', alt: 'p' }], options: [
      { key: 'A', label: 'a', justification: 'j', media: [{ type: 'image', src: 'pic.png', alt: 'a' }] },
      { key: 'B', label: 'b', justification: 'j', media: [{ type: 'image', src: 'pic.png', alt: 'b', full: 'pic.png' }] },
    ] }] };
    const { spec } = await resolveMedia(validateSpec(raw), dir, quiet);
    const html = render(spec, { mode: 'copy' });
    expect(html.match(/data:image\/png;base64/g)).toHaveLength(1);
    expect(html).toContain('<script type="application/json" id="mkd-media-pool">{"m0":"data:image/png;base64,');
    expect(html.match(/data-mkd-src="m0"/g)).toHaveLength(5);
    expect(html).toContain('data-mkd-full="m0"');
    expect(findBlockedResources(html)).toEqual([]);
  });

  it('pools an unencoded data URI as written, not as escaped attribute text', () => {
    const src = 'data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' data-q="a&amp;b"><text>&lt;</text></svg>';
    const media = [{ type: 'image', src, alt: 'a', full: `${src}<!-- full -->` }];
    const raw = { session: 's', title: 't', items: [{ id: 'D1', type: 'decision', title: 'd', problem: 'p', options: [
      { key: 'A', label: 'a', justification: 'j', media },
      { key: 'B', label: 'b', justification: 'j', media },
    ] }] };
    const html = render(validateSpec(raw), { mode: 'copy' });
    const json = /<script type="application\/json" id="mkd-media-pool">([\s\S]*?)<\/script>/.exec(html)?.[1] ?? '';
    expect(json).not.toContain('<');
    expect(Object.values(JSON.parse(json) as Record<string, string>)).toEqual([src, `${src}<!-- full -->`]);
  });
});

describe('cli: media errors exit 2', () => {
  it('names a missing local file and prints nothing on stdout', () => {
    const home = mkdtempSync(join(tmpdir(), 'mkd-media-cli-'));
    const specPath = join(home, 'spec-m.json');
    writeFileSync(specPath, JSON.stringify(deck([{ type: 'image', src: 'gone.png', alt: 'g' }])));
    const proc = Bun.spawnSync(['bun', join(import.meta.dir, 'index.ts'), specPath, '--artifact'], { env: { ...process.env, HOME: home }, stdout: 'pipe', stderr: 'pipe' });
    rmSync(home, { recursive: true, force: true });
    expect(proc.exitCode).toBe(2);
    expect(proc.stdout.toString()).toBe('');
    expect(proc.stderr.toString()).toContain(`items[0].media[0].src: file not found: ${join(home, 'gone.png')}`);
  });
});

describe('artifact mode: nothing remote', () => {
  const JPEG = Uint8Array.from([0xFF, 0xD8, 0xFF, 0xE0, 0, 0, 0, 0]);
  /** A fake network: url -> response factory; anything else fails. */
  function net(routes: Record<string, () => Response>, seen: string[] = []) {
    return async (url: string) => {
      seen.push(url);
      const route = routes[url];
      if (!route) {
        throw new Error(`offline: ${url}`);
      }
      return route();
    };
  }
  const img = (bytes: Uint8Array, type = 'image/jpeg') => () => new Response(Buffer.from(bytes), { headers: { 'content-type': type, 'content-length': String(bytes.length) } });
  const embeds = [
    { type: 'embed', url: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ' },
    { type: 'embed', url: 'https://www.loom.com/share/0123456789abcdef0123456789abcdef' },
  ];
  const loomOembed = `https://www.loom.com/v1/oembed?url=${encodeURIComponent('https://www.loom.com/share/0123456789abcdef0123456789abcdef')}`;

  it('turns embeds into poster cards with inlined thumbnails (YouTube hqdefault, Loom still JPEG first)', async () => {
    const seen: string[] = [];
    const fetch = net({
      'https://i.ytimg.com/vi/aqz-KE-bpKQ/hqdefault.jpg': img(JPEG),
      [loomOembed]: () => Response.json({ thumbnail_url: 'https://cdn.loom.com/t/x-00001.gif' }),
      'https://cdn.loom.com/t/x-00001.jpg': img(JPEG),
    }, seen);
    const { spec } = await prepareForArtifact(validateSpec(deck(embeds)), { ...quiet, fetch });
    const html = render(spec, { mode: 'artifact' });
    expect(html).not.toContain('<iframe');
    expect(html.match(/<a class="mkd-videocard has-image" href="https:\/\/(?:www\.youtube\.com|www\.loom\.com)\/[^"]+" target="_blank" rel="noopener noreferrer"/g)).toHaveLength(2);
    expect(html).toContain('Open video in a new tab &#8599;');
    // Both thumbnails are the same bytes: pooled once, referenced twice.
    expect(html.match(/class="mkd-videocard__img" data-mkd-src="m0"/g)).toHaveLength(2);
    expect(html.match(/data:image\/jpeg;base64,/g)).toHaveLength(1);
    expect(seen).not.toContain('https://cdn.loom.com/t/x-00001.gif');
    expect(findBlockedResources(html)).toEqual([]);
  });

  it('shows a plain play card when the thumbnail is over the cap or unreachable', async () => {
    const notes: string[] = [];
    const big = new Uint8Array(200 * 1024);
    big.set(JPEG);
    const fetch = net({ 'https://i.ytimg.com/vi/aqz-KE-bpKQ/hqdefault.jpg': img(big) });
    const { spec } = await prepareForArtifact(validateSpec(deck(embeds)), { warn: (m: string) => notes.push(m), fetch });
    const html = render(spec, { mode: 'artifact' });
    expect(html.match(/<a class="mkd-videocard" href=/g)).toHaveLength(2);
    expect(notes.some(n => n.includes('over the 150 KB cap'))).toBe(true);
    expect(findBlockedResources(html)).toEqual([]);
  });

  it('inlines remote images, link-card images and posters within 200 KB; drops what it cannot', async () => {
    const notes: string[] = [];
    const fetch = net({
      'https://example.com/ok.png': img(PNG, 'image/png'),
      'https://example.com/og.jpg': img(JPEG),
    });
    const raw = deck([
      { type: 'image', src: 'https://example.com/ok.png', alt: 'fine' },
      { type: 'image', src: 'https://example.com/gone.png', alt: 'A chart of weekly signups' },
      { type: 'link', url: 'https://example.com/a', title: 'A', description: 'd', image: 'https://example.com/og.jpg' },
      { type: 'link', url: 'https://example.com/b', title: 'B', description: 'd', image: 'https://example.com/404.jpg' },
      { type: 'video', src: 'https://example.com/v.mp4', poster: 'https://example.com/gone.jpg' },
    ]);
    const { spec } = await prepareForArtifact(validateSpec(raw), { warn: (m: string) => notes.push(m), fetch });
    const html = render(spec, { mode: 'artifact' });
    expect(html).toContain('<img class="mkd-media__img" src="data:image/png;base64,');
    expect(html).toContain('<div class="mkd-media__missing" role="img" aria-label="A chart of weekly signups"><span class="mkd-media__missing-label">Image not available here</span><span class="mkd-media__missing-alt">A chart of weekly signups</span></div>');
    expect(html).toContain('<img class="mkd-linkcard__img" src="data:image/jpeg;base64,');
    expect(html).toContain('<a class="mkd-linkcard" href="https://example.com/b"');
    expect(html).toContain('<a class="mkd-videocard" href="https://example.com/v.mp4"');
    expect(findBlockedResources(html)).toEqual([]);
    expect(notes).toHaveLength(3);
  });

  it('leaves copy and wait pages as they were (frames and remote images stay)', () => {
    const spec = validateSpec(deck([...embeds, { type: 'image', src: 'https://example.com/a.png', alt: 'a' }]));
    for (const mode of ['copy', 'wait'] as const) {
      const html = render(spec, { mode, submitToken: 't' });
      expect(html.match(/<iframe class="mkd-embed__frame"/g)).toHaveLength(2);
      expect(html).toContain('src="https://example.com/a.png"');
      expect(html).not.toContain('<a class="mkd-videocard');
    }
  });

  it('pins Mermaid to an exact jsdelivr npm version with SRI, injected with crossorigin', () => {
    const html = render(validateSpec(deck([{ type: 'diagram', format: 'mermaid', code: 'flowchart LR\nA-->B' }])), { mode: 'artifact' });
    const config = JSON.parse(/window\.__MKD_MERMAID__ = (\{.*?\});/.exec(html)?.[1] ?? '{}') as { src: string, integrity: string };
    expect(config.src).toMatch(/^https:\/\/cdn\.jsdelivr\.net\/npm\/mermaid@\d+\.\d+\.\d+\/dist\/mermaid\.min\.js$/);
    expect(config.integrity).toMatch(/^sha384-[\w+/]{64}$/);
    expect(html).toContain('script.crossOrigin = \'anonymous\';');
    expect(html.indexOf('script.integrity = mermaidConfig.integrity')).toBeLessThan(html.indexOf('script.src = mermaidConfig.src'));
    expect(findBlockedResources(html)).toEqual([]);
  });
});

describe('findBlockedResources', () => {
  it('names remote img, iframe, video, source, stylesheet and script', () => {
    const html = '<img src="https://a.test/i.png"><iframe src="https://b.test/f"></iframe><video poster="https://c.test/p.jpg"><source src="https://c.test/v.mp4"></video><link rel="stylesheet" href="https://d.test/s.css"><script src="https://e.test/x.js"></script><img srcset="https://f.test/1.png 1x, data:image/png;base64,AA 2x">';
    expect(findBlockedResources(html)).toEqual([
      '<img src="https://a.test/i.png">',
      '<iframe src="https://b.test/f">',
      '<video poster="https://c.test/p.jpg">',
      '<source src="https://c.test/v.mp4">',
      '<link href="https://d.test/s.css">',
      '<script src="https://e.test/x.js">',
      '<img srcset="https://f.test/1.png">',
    ]);
  });

  it('allows Google Fonts, jsdelivr npm scripts, data: URIs, links and inline script text', () => {
    const html = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=X"><script src="https://cdn.jsdelivr.net/npm/mermaid@11.17.2/dist/mermaid.min.js"></script><img src="data:image/png;base64,AA"><a href="https://example.com">x</a><script>const s = \'<img src="https://evil.test/x.png">\';</script>';
    expect(findBlockedResources(html)).toEqual([]);
  });
});
