// QA is exposed to the page as `window.__explainQA(times?, opts?)` (engine/player.js -> engine/qa.js).
// It returns a JSON report: { ok, errors: [{ type, scene, id, t, count, detail }], warnings, stats }.
//   errors:   out-of-bounds, overlap, text-overflow, opening-punctuation (¿ ¡), nondeterministic
//   audio (sound or voice on): see engine/audio-qa.js; the report gains `audio` and the summary one line
//   warnings: composition-balance (lopsided or small content once a scene settles), widow (a lone short word on a last line)
// A headless runner (cli/export.ts) will call it later; until then run it from the browser console on the built page.

export interface QaIssue {
  type: string
  scene: string
  id?: string
  t?: number
  count?: number
  detail: string
}

export interface QaReport {
  ok: boolean
  errors: QaIssue[]
  warnings: QaIssue[]
  /** Present when the page has sound or voice. */
  audio?: { integratedLufs: number, peakDbfs: number, voiceSeconds: number, sfxEvents: number }
  stats: { samples: number, elements: number, scenes: string[], balance?: Record<string, Record<string, number>> }
}

export const QA_PAGE_CALL = 'window.__explainQA(times?, opts?)';

/** One line per issue, errors first. */
export function summarizeReport(report: QaReport): string {
  const line = (kind: string, i: QaIssue) => `${kind} ${i.type} [${i.scene}${i.id ? ` / ${i.id}` : ''}]${i.t !== undefined ? ` t=${i.t}s` : ''}: ${i.detail}`;
  const lines = [
    ...report.errors.map(e => line('ERROR', e)),
    ...report.warnings.map(w => line('WARN ', w)),
  ];
  if (report.audio) {
    const a = report.audio;
    lines.push(`audio: ${a.integratedLufs.toFixed(1)} LUFS, peak ${a.peakDbfs.toFixed(1)} dBFS, voice ${a.voiceSeconds.toFixed(1)} s, ${a.sfxEvents} effects`);
  }
  lines.push(report.ok ? `QA passed (${report.stats.samples} samples, ${report.warnings.length} warnings)` : `QA failed: ${report.errors.length} errors`);
  return lines.join('\n');
}
