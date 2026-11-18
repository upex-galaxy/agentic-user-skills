import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { encodeWav } from '../engine/wav.js';
import { pageAudio, resolveAudio, resolveProvider, resolveSound, resolveVoice } from './audio.ts';
import { findChrome } from './chrome.ts';
import { pageScenes } from './headless.ts';
import { audioChoice, ensureBuilt, main, resolveTarget } from './index.ts';
import { planVoice } from './voice.ts';

const temps: string[] = [];
function temp(prefix: string): string {
  const d = mkdtempSync(join(tmpdir(), prefix));
  temps.push(d);
  return d;
}
afterAll(() => { for (const d of temps) { rmSync(d, { recursive: true, force: true }); } });

const ENV_KEYS = ['EXPLAIN_SOUND', 'EXPLAIN_VOICE', 'EXPLAIN_VOICE_ID', 'EXPLAIN_ELEVENLABS_MODEL', 'EXPLAIN_PRESET', 'EXPLAIN_VOICE_DIR', 'EXPLAIN_HOME'];
const saved: Record<string, string | undefined> = {};
beforeEach(() => { for (const k of ENV_KEYS) { saved[k] = process.env[k]; delete process.env[k]; } });
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) { delete process.env[k]; }
    else { process.env[k] = saved[k]; }
  }
});

const narrated = (line: string) => `export const title = 'Narrado';
export default ({ scene }) => ({ title, lang: 'es', scenes: [
  scene({ name: 'uno', dur: 2, say: ${JSON.stringify(line)}, transition: { type: 'crossfade', dur: 0.4 }, build(s) { s.heading({ text: 'Uno' }); s.node({ id: 'n', text: 'Fin', x: 700, y: 400, w: 400, h: 200, at: s.voice[0].end }); } }),
  scene({ name: 'dos', dur: 2, build(s) { s.heading({ text: 'Dos' }); } }),
] });
`;

/** A folder with scene.js and a voice cache holding a 3 s Kokoro clip for every cue. */
async function narratedFolder(line = 'Hola, esto es una prueba.') {
  const dir = temp('explain-audio-');
  const cache = temp('explain-voice-');
  process.env.EXPLAIN_VOICE_DIR = cache;
  writeFileSync(join(dir, 'scene.js'), narrated(line));
  const a = await resolveAudio(join(dir, 'scene.js'), { voice: 'kokoro' }, {});
  for (const e of planVoice(a.cues, a.voice!)) {
    writeFileSync(e.wav, encodeWav([new Float32Array(24000 * 3).map((_, i) => Math.sin(i / 9) * 0.3)], 24000));
  }
  return dir;
}

describe('audio settings precedence', () => {
  test('flag, explain.json, env, default', () => {
    expect(resolveSound({}, {}, {})).toBe(false);
    expect(resolveSound({}, {}, { EXPLAIN_SOUND: 'on' })).toBe(true);
    expect(resolveSound({}, { sound: 'off' }, { EXPLAIN_SOUND: 'on' })).toBe(false);
    expect(resolveSound({ sound: 'on' }, { sound: 'off' }, {})).toBe(true);
    expect(() => resolveSound({ sound: 'yes' }, {}, {})).toThrow('on or off');
    expect(resolveProvider({}, {}, {})).toBe('none');
    expect(resolveProvider({}, {}, { EXPLAIN_VOICE: 'kokoro' })).toBe('kokoro');
    expect(resolveProvider({ voice: 'none' }, {}, { EXPLAIN_VOICE: 'kokoro' })).toBe('none');
    expect(resolveProvider({}, { voice: { provider: 'elevenlabs' } }, { EXPLAIN_VOICE: 'kokoro' })).toBe('elevenlabs');
  });

  test('voice ids: provider default, explain.json only for its own provider, ElevenLabs needs one', () => {
    expect(resolveVoice('kokoro', {}, {}, 'es', {}).voiceId).toBe('ef_dora');
    expect(resolveVoice('kokoro', {}, {}, 'en', {}).voiceId).toBe('af_heart');
    expect(resolveVoice('kokoro', {}, { voice: { provider: 'elevenlabs', id: 'EL1' } }, 'es', {}).voiceId).toBe('ef_dora');
    const el = resolveVoice('elevenlabs', {}, { voice: { provider: 'elevenlabs', id: 'EL1' } }, 'es', {});
    expect(el).toMatchObject({ voiceId: 'EL1', model: 'eleven_flash_v2_5' });
    expect(resolveVoice('elevenlabs', { 'voice-model': 'eleven_v3' }, {}, 'es', { EXPLAIN_VOICE_ID: 'X' }).model).toBe('eleven_v3');
    expect(() => resolveVoice('elevenlabs', {}, {}, 'es', {})).toThrow('creative_list_voices');
    // EXPLAIN_VOICE_ID belongs to EXPLAIN_VOICE's provider: the Kokoro fallback never gets an ElevenLabs id.
    const env = { EXPLAIN_VOICE: 'elevenlabs', EXPLAIN_VOICE_ID: '21m00Tcm4TlvDq8ikWAM' };
    expect(resolveVoice('kokoro', {}, {}, 'es', env).voiceId).toBe('ef_dora');
    expect(resolveVoice('elevenlabs', {}, {}, 'es', env).voiceId).toBe('21m00Tcm4TlvDq8ikWAM');
  });

  test('nothing to narrate resolves no voice, so ElevenLabs needs no id then', async () => {
    const dir = temp('explain-nosay-');
    writeFileSync(join(dir, 'scene.js'), 'export default ({ scene }) => ({ scenes: [scene({ name: \'a\', dur: 2, build() {} })] });\n');
    const a = await resolveAudio(join(dir, 'scene.js'), { voice: 'elevenlabs' }, {}, {});
    expect(a.voice).toBeNull();
  });

  test('new and audio use write only what a flag or env var chose', () => {
    expect(audioChoice({}, {})).toEqual({});
    expect(audioChoice({}, { EXPLAIN_SOUND: 'on' })).toEqual({ sound: 'on' });
    expect(audioChoice({ voice: 'kokoro' }, { EXPLAIN_SOUND: 'off' })).toEqual({ sound: 'off', voice: { provider: 'kokoro' } });
    expect(audioChoice({ 'voice-id': 'v' }, {}, { voice: { provider: 'elevenlabs', model: 'eleven_v3' } })).toEqual({ voice: { provider: 'elevenlabs', id: 'v', model: 'eleven_v3' } });
    // The ElevenLabs model is recorded even when it is the default (it is part of every line's key).
    expect(audioChoice({ 'voice': 'elevenlabs', 'voice-id': 'v' }, {})).toEqual({ voice: { provider: 'elevenlabs', id: 'v', model: 'eleven_flash_v2_5' } });
  });
});

describe('cli wiring', () => {
  test('EXPLAIN_SOUND=on new x, then build x, gives sound on; new pins no preset nor defaults', async () => {
    const home = temp('explain-new-');
    process.env.EXPLAIN_HOME = home;
    process.env.EXPLAIN_SOUND = 'on';
    const log = console.log;
    let out = '';
    console.log = (s: string) => { out += `${s}\n`; };
    try { expect(await main(['new', 'sonido'])).toBe(0); }
    finally { console.log = log; }
    const dir = join(out.trim(), '..');
    expect(JSON.parse(readFileSync(join(dir, 'explain.json'), 'utf8'))).toEqual({ title: 'sonido', sound: 'on' });
    delete process.env.EXPLAIN_SOUND;
    const html = readFileSync((await ensureBuilt(resolveTarget(dir), undefined)).index, 'utf8');
    expect(html).toContain('<script type="application/json" id="explain-audio">{"sound":true,"narration":null}</script>');
  });

  test('a silent build carries no audio block; voice on with a missing clip names the next command', async () => {
    const dir = temp('explain-silent-');
    process.env.EXPLAIN_VOICE_DIR = temp('explain-voice-');
    writeFileSync(join(dir, 'scene.js'), narrated('Una línea.'));
    const t = resolveTarget(dir);
    expect(readFileSync((await ensureBuilt(t, undefined)).index, 'utf8')).not.toContain('<script type="application/json" id="explain-audio">');
    const err = await ensureBuilt(t, undefined, false, { voice: 'kokoro' }).then(() => null, (e: Error) => e);
    expect(err?.message).toContain('voice kokoro');
    process.env.EXPLAIN_VOICE_ID = 'abc';
    const el = await ensureBuilt(t, undefined, false, { voice: 'elevenlabs' }).then(() => null, (e: Error) => e);
    expect(el?.message).toContain('voice plan');
  });

  test('narration embeds every clip once, and editing one say text rebuilds the page', async () => {
    const dir = await narratedFolder();
    const t = resolveTarget(dir);
    const a = await resolveAudio(t.scene, { voice: 'kokoro' }, {});
    const first = await pageAudio(a, dir);
    expect(first.audio.narration?.cues).toEqual([{ id: '0.0', key: expect.any(String), seconds: 3, chars: 25 }]);
    const html = readFileSync((await ensureBuilt(t, undefined, false, { voice: 'kokoro' })).index, 'utf8');
    expect(html).toContain('"provider":"kokoro"');
    // A new process (each CLI command is one) reads the edited scene: its new line has no clip yet.
    writeFileSync(join(dir, 'scene.js'), narrated('Otra línea distinta.'));
    const p = Bun.spawn(['bun', join(import.meta.dir, 'index.ts'), 'build', dir, '--voice', 'kokoro'], { stdout: 'pipe', stderr: 'pipe', env: { ...process.env } });
    const [stderr, code] = await Promise.all([new Response(p.stderr).text(), p.exited]);
    expect(code).toBe(1);
    expect(stderr).toContain('1 narration line is not synthesized yet');
  });

  test('check --preset sketch with a voice flag leaves explain.json byte-identical; audio use writes it', async () => {
    const dir = await narratedFolder();
    const cfg = '{\n  "preset": "hologram",\n  "title": "x"\n}\n';
    writeFileSync(join(dir, 'explain.json'), cfg);
    await ensureBuilt(resolveTarget(dir), 'sketch', false, { voice: 'kokoro', sound: 'on' });
    expect(readFileSync(join(dir, 'explain.json'), 'utf8')).toBe(cfg);
    const log = console.log;
    console.log = () => {};
    try { expect(await main(['audio', 'use', dir, '--sound', 'on', '--voice', 'kokoro', '--voice-id', 'em_alex'])).toBe(0); }
    finally { console.log = log; }
    expect(JSON.parse(readFileSync(join(dir, 'explain.json'), 'utf8'))).toEqual({ preset: 'hologram', title: 'x', sound: 'on', voice: { provider: 'kokoro', id: 'em_alex' } });
  });
});

const maybe = findChrome() ? test : test.skip;

describe('narrated timing in the page', () => {
  maybe('the page stretches the scene to the clip, the same in every command', async () => {
    const dir = await narratedFolder();
    const t = resolveTarget(dir);
    const silent = await pageScenes(readFileSync((await ensureBuilt(t, undefined)).index, 'utf8'));
    expect(silent.scenes[0].dur).toBe(2);
    const voiced = await pageScenes(readFileSync((await ensureBuilt(t, undefined, false, { voice: 'kokoro' })).index, 'utf8'));
    // First cue at max(0.3, 0 + 0.1), 3 s of clip, 0.5 s tail, 0.4 s transition.
    expect(voiced.scenes[0].dur).toBeCloseTo(0.3 + 3 + 0.5 + 0.4, 6);
    expect(voiced.duration).toBeCloseTo(silent.duration + (voiced.scenes[0].dur - 2), 6);
    expect(existsSync(join(dir, 'index.html'))).toBe(true);
  }, 120_000);
});
