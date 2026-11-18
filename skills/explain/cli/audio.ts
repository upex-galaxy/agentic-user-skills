// Audio settings of one build: sound effects on or off, the voice provider and its voice, resolved from the flags,
// explain.json, the environment and the defaults, plus the narration manifest a build embeds. Nothing here
// synthesizes speech: missing clips make the build fail with the command that makes them (voice kokoro / voice plan).
import type { PlanEntry, VoiceSettings } from './voice.ts';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { kit as engineKit } from '../engine/index.js';
import { scriptCover as engineCover, specCues as engineCues, formatCover as engineFormatCover } from '../engine/narration.js';
import { detectLang as engineLang } from '../engine/pieces/titles.js';
import { decodeWav as engineDecode } from '../engine/wav.js';
import { defaultVoiceId, ingest, planVoice } from './voice.ts';

/** One narration line of a spec (engine/narration.js specCues). */
export interface Cue { id: string, scene: string, sceneIndex: number, index: number, text: string, spoken: string, at?: number }

// The engine is untyped JS: give its exports the shapes this module relies on.
const kit = engineKit as unknown;
const specCues = engineCues as (spec: unknown) => Cue[];
/** One narrated scene's script weight (engine/narration.js scriptCover). */
export interface SceneCover { scene: string, dur: number, speech: number, words: number }
const scriptCover = engineCover as (spec: unknown) => SceneCover[];
/** The `voice plan` lines for a script's cover: one per narrated scene, THIN under half its authored dur. */
export const formatCover = engineFormatCover as (cover: SceneCover[]) => string[];
const detectLang = engineLang as (texts: (string | undefined)[]) => string;
const decodeWav = engineDecode as (bytes: Uint8Array) => { sampleRate: number, channels: Float32Array[] };

export type Provider = 'none' | 'kokoro' | 'elevenlabs';
export const PROVIDERS: Provider[] = ['none', 'kokoro', 'elevenlabs'];
export const DEFAULT_ELEVENLABS_MODEL = 'eleven_flash_v2_5';

/** What explain.json may say about audio. */
export interface AudioConfig {
  sound?: 'on' | 'off'
  voice?: { provider?: Provider, id?: string, model?: string }
}

/** Resolved audio settings of one build. `voice` is null when the provider is none. */
export interface AudioSettings {
  sound: boolean
  provider: Provider
  voice: VoiceSettings | null
}

type Flags = Record<string, string | true>;
type Env = Record<string, string | undefined>;

export class AudioUsageError extends Error {}

const onOff = (v: unknown, where: string): 'on' | 'off' | undefined => {
  if (v === undefined) { return undefined; }
  if (v === 'on' || v === 'off') { return v; }
  throw new AudioUsageError(`${where} must be on or off, got ${JSON.stringify(v)}`);
};
const provider = (v: unknown, where: string): Provider | undefined => {
  if (v === undefined) { return undefined; }
  if (typeof v === 'string' && (PROVIDERS as string[]).includes(v)) { return v as Provider; }
  throw new AudioUsageError(`${where} must be one of ${PROVIDERS.join(', ')}, got ${JSON.stringify(v)}`);
};
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

/** Sound on or off: --sound, explain.json, EXPLAIN_SOUND, off. */
export function resolveSound(flags: Flags, cfg: AudioConfig, env: Env = process.env): boolean {
  return (onOff(flags.sound, '--sound') ?? onOff(cfg.sound, 'explain.json sound') ?? onOff(str(env.EXPLAIN_SOUND), 'EXPLAIN_SOUND') ?? 'off') === 'on';
}

/** The voice provider: --voice, explain.json voice.provider, EXPLAIN_VOICE, none. */
export function resolveProvider(flags: Flags, cfg: AudioConfig, env: Env = process.env): Provider {
  return provider(flags.voice, '--voice') ?? provider(cfg.voice?.provider, 'explain.json voice.provider') ?? provider(str(env.EXPLAIN_VOICE), 'EXPLAIN_VOICE') ?? 'none';
}

/**
 * Voice settings for a provider other than none. The voice id: --voice-id, explain.json voice.id (only when it names
 * the same provider), EXPLAIN_VOICE_ID, then the provider default (Kokoro: ef_dora for Spanish, af_heart otherwise;
 * ElevenLabs has none). The ElevenLabs model: --voice-model, explain.json voice.model, EXPLAIN_ELEVENLABS_MODEL,
 * eleven_flash_v2_5 (the cheapest speech model).
 */
export function resolveVoice(p: Exclude<Provider, 'none'>, flags: Flags, cfg: AudioConfig, lang: string, env: Env = process.env): VoiceSettings {
  const same = cfg.voice?.provider === p ? cfg.voice : undefined;
  // EXPLAIN_VOICE_ID belongs to EXPLAIN_VOICE's provider: an ElevenLabs id never reaches Kokoro (or the reverse).
  const envId = !str(env.EXPLAIN_VOICE) || str(env.EXPLAIN_VOICE) === p ? str(env.EXPLAIN_VOICE_ID) : undefined;
  const voiceId = str(flags['voice-id']) ?? str(same?.id) ?? envId ?? defaultVoiceId(p, lang);
  if (!voiceId) {
    throw new AudioUsageError('The ElevenLabs voice needs a voice id: pick one with the ElevenLabs MCP (creative_list_voices) and pass --voice-id <id>, save it with `audio use <dir> --voice elevenlabs --voice-id <id>`, or set EXPLAIN_VOICE_ID.');
  }
  const model = p === 'kokoro' ? 'kokoro' : str(flags['voice-model']) ?? str(same?.model) ?? str(env.EXPLAIN_ELEVENLABS_MODEL) ?? DEFAULT_ELEVENLABS_MODEL;
  return { provider: p, voiceId, model, speed: 1, lang };
}

/** The scene spec built in Bun with the kit (no browser): titles, langs and `say` cues are readable before a build. */
export async function loadSpec(scenePath: string): Promise<{ title?: string, lang?: string, scenes: { name?: string, say?: unknown }[] }> {
  // Bun caches a module by path for the life of the process: each CLI command is its own process, so it reads the file as it is now.
  const mod = await import(pathToFileURL(resolve(scenePath)).href) as { default: (k: unknown) => { title?: string, lang?: string, scenes: [] } };
  return mod.default(kit);
}

/** The narration language: the spec's lang, else detected from the title and the spoken lines. */
export function narrationLang(spec: { title?: string, lang?: string }, cues: { text: string }[]): string {
  return spec.lang ?? detectLang([spec.title, ...cues.map(c => c.text)]);
}

/** Every audio setting of one build. */
export async function resolveAudio(scenePath: string, flags: Flags, cfg: AudioConfig, env: Env = process.env): Promise<AudioSettings & { cues: Cue[], cover: SceneCover[] }> {
  const sound = resolveSound(flags, cfg, env);
  const p = resolveProvider(flags, cfg, env);
  const spec = await loadSpec(scenePath);
  const cues = specCues(spec);
  const cover = scriptCover(spec);
  // Nothing to narrate: no voice to resolve (an ElevenLabs provider without an id is fine then).
  if (p === 'none' || !cues.length) { return { sound, provider: p, voice: null, cues, cover }; }
  return { sound, provider: p, voice: resolveVoice(p, flags, cfg, narrationLang(spec, cues), env), cues, cover };
}

/** Narration embedded in a page: cue -> clip key and exact seconds, and each clip once as base64 WAV (24 kHz mono). */
export interface NarrationBlob {
  provider: Provider
  voice: string
  model: string
  cues: { id: string, key: string, seconds: number, chars: number }[]
  clips: Record<string, string>
}

/** What a page carries about audio (JSON in <script id="explain-audio">). */
export interface PageAudio {
  sound: boolean
  narration: NarrationBlob | null
}

/** The next command for missing clips. */
export function missingMessage(n: number, s: VoiceSettings, target: string): string {
  const cli = 'bun <skill-dir>/cli/index.ts';
  const lines = `${n} narration line${n === 1 ? ' is' : 's are'} not synthesized yet`;
  return s.provider === 'kokoro'
    ? `${lines} (Kokoro, voice ${s.voiceId}). Run: ${cli} voice kokoro ${target}  (or build with --voice none)`
    : `${lines} (ElevenLabs, voice ${s.voiceId}, model ${s.model}). Run: ${cli} voice plan ${target}, generate each listed line with the ElevenLabs MCP and save it at its target path, then run this command again  (or build with --voice none)`;
}

/**
 * The page audio of a build: picks up downloaded ElevenLabs takes (ingest), then reads every clip from the cache.
 * Throws with the next command when a clip is missing. Returns the blob and a hash of the settings and clip contents.
 */
export async function pageAudio(a: AudioSettings & { cues: Cue[] }, target: string): Promise<{ audio: PageAudio, hash: string, entries: PlanEntry[] }> {
  const h = createHash('sha256');
  h.update(JSON.stringify({ sound: a.sound, provider: a.provider, voice: a.voice }));
  if (!a.voice || !a.cues.length) { return { audio: { sound: a.sound, narration: null }, hash: h.digest('hex').slice(0, 16), entries: [] }; }
  const entries = planVoice(a.cues, a.voice);
  if (a.voice.provider === 'elevenlabs') { await ingest(entries, a.voice); }
  const missing = entries.filter(e => !existsSync(e.wav));
  if (missing.length) { throw new Error(missingMessage(missing.length, a.voice, target)); }
  const clips: Record<string, string> = {};
  const cues = entries.map((e) => {
    const bytes = readFileSync(e.wav);
    const w = decodeWav(bytes);
    if (!clips[e.key]) {
      clips[e.key] = bytes.toString('base64');
      h.update(e.key);
      h.update(createHash('sha256').update(bytes).digest('hex'));
    }
    return { id: e.id, key: e.key, seconds: w.channels[0].length / w.sampleRate, chars: e.chars };
  });
  return { audio: { sound: a.sound, narration: { provider: a.voice.provider, voice: a.voice.voiceId, model: a.voice.model, cues, clips } }, hash: h.digest('hex').slice(0, 16), entries };
}
