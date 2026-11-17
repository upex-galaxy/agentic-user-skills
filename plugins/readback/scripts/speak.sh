#!/usr/bin/env bash
# Stop hook: speaks the marked line of the last message, if this session has voice on.
# Never fails outward: any problem ends with exit 0, and is written to readback.log.
#
# Engine chain (PROVIDER=auto): ElevenLabs -> Kokoro -> macOS `say`.
# An explicit PROVIDER runs first and the rest of the chain still follows it:
# a worse voice beats no voice.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(dirname "$HERE")}"
DATA_DIR="${CLAUDE_PLUGIN_DATA:-$HOME/.claude/readback-data}"
LOCKDIR="$DATA_DIR/speak.lock.d"
LOG="$DATA_DIR/readback.log"

# Values come from the plugin's userConfig, exported by Claude Code to hook
# processes as CLAUDE_PLUGIN_OPTION_*. The READBACK_* variables override them for tests.
opt() { local name="$1" cfg="$2" def="$3" v
  eval "v=\${READBACK_$name:-\${CLAUDE_PLUGIN_OPTION_$cfg:-}}"
  printf '%s' "${v:-$def}"; }
PROVIDER="$(opt PROVIDER PROVIDER auto)"
KOKORO_URL="$(opt KOKORO_URL KOKORO_URL http://127.0.0.1:8880)"
VOICE="$(opt VOICE VOICE af_heart)"
SPEED="$(opt SPEED SPEED 1.0)"
VOLUME="$(opt VOLUME VOLUME 1.5)"
LANGUAGE="$(opt LANGUAGE LANGUAGE '')"
EL_VOICE_ID="$(opt EL_VOICE_ID ELEVENLABS_VOICE_ID '')"
EL_MODEL="$(opt EL_MODEL ELEVENLABS_MODEL eleven_flash_v2_5)"
EL_KEY="${ELEVENLABS_API_KEY:-${CLAUDE_PLUGIN_OPTION_ELEVENLABS_API_KEY:-}}"
NORMALIZE="$(opt NORMALIZE NORMALIZE on)"
SHOW_USAGE="$(opt SHOW_USAGE SHOW_USAGE on)"
PERSONA="$(opt PERSONA PERSONA companion)"
DRY_RUN="${READBACK_DRY_RUN:-0}"

mkdir -p "$DATA_DIR/sessions" "$DATA_DIR/notices"

# Persona: voice settings that go with the personality (see config/personas/).
case "$PERSONA" in companion|sarcastic|serious|professional) ;; *) PERSONA=companion ;; esac
STABILITY=""; STYLE=""
if [ -f "$PLUGIN_ROOT/config/personas/$PERSONA.conf" ]; then
  STABILITY=$(sed -n 's/^STABILITY=//p' "$PLUGIN_ROOT/config/personas/$PERSONA.conf" | head -1)
  STYLE=$(sed -n 's/^STYLE=//p' "$PLUGIN_ROOT/config/personas/$PERSONA.conf" | head -1)
fi

# One line per event. Never the spoken text, never the key.
log() {
  printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >> "$LOG" 2>/dev/null || true
  if [ -f "$LOG" ] && [ "$(wc -c < "$LOG" 2>/dev/null || echo 0)" -gt 262144 ]; then
    tail -n 500 "$LOG" > "$LOG.tmp" 2>/dev/null && mv "$LOG.tmp" "$LOG" 2>/dev/null || true
  fi
}

payload=$(cat)
[ "${READBACK_DEBUG:-0}" = "1" ] && printf '%s\n' "$payload" >> "$DATA_DIR/debug.log"

SID=$(printf '%s' "$payload" | python3 -c '
import json, sys
try:
    d = json.load(sys.stdin)
except Exception:
    d = {}
print(d.get("session_id") or d.get("sessionId") or "")' 2>/dev/null)

text=$(printf '%s' "$payload" | \
  READBACK_PLUGIN_ROOT="$PLUGIN_ROOT" READBACK_DATA_DIR="$DATA_DIR" \
  python3 "$PLUGIN_ROOT/scripts/extract.py" 2>/dev/null)
[ -z "${text:-}" ] && exit 0

# Pick a player for this OS. macOS has afplay; Linux usually one of these;
# Windows via Git Bash or WSL falls back to PowerShell.
reproducir() {
  local f="$1"
  if   command -v afplay      >/dev/null 2>&1; then afplay -v "$VOLUME" "$f"
  elif command -v mpg123      >/dev/null 2>&1; then mpg123 -q "$f"
  elif command -v ffplay      >/dev/null 2>&1; then ffplay -nodisp -autoexit -loglevel quiet -volume 100 "$f"
  elif command -v paplay      >/dev/null 2>&1; then paplay "$f"
  elif command -v aplay       >/dev/null 2>&1; then aplay -q "$f"
  elif command -v powershell.exe >/dev/null 2>&1; then
    powershell.exe -NoProfile -c "(New-Object Media.SoundPlayer '$f').PlaySync()"
  else
    return 1
  fi
}

# Tell the next prompt what went wrong (once per error code per session).
notice() {
  [ -n "$SID" ] || return 0
  local f="$DATA_DIR/notices/$SID"
  # remind.sh empties $f when it relays it; $f.sent remembers what was already said.
  [ "$(cat "$f.sent" 2>/dev/null)" = "$1" ] && return 0
  printf '%s\n' "$1" > "$f" 2>/dev/null && printf '%s' "$1" > "$f.sent" 2>/dev/null || true
}

# ElevenLabs. Returns 0 and leaves audio in $1 on success.
# The key goes to curl through stdin (-K -), so it never shows up in `ps`.
engine_elevenlabs() {
  local out="$1" hdr body code attempt
  if [ -z "$EL_KEY" ] || [ -z "$EL_VOICE_ID" ]; then
    log "elevenlabs skipped: $([ -z "$EL_KEY" ] && echo 'no api key')$([ -z "$EL_VOICE_ID" ] && echo ' no voice id')"
    [ "$PROVIDER" = elevenlabs ] && notice "readback: ElevenLabs is selected but the $([ -z "$EL_KEY" ] && echo 'API key')$([ -z "$EL_KEY" ] && [ -z "$EL_VOICE_ID" ] && echo ' and ')$([ -z "$EL_VOICE_ID" ] && echo 'voice id') did not reach the hook. Check /plugin > readback > Configure."
    return 1
  fi
  body=$(EL_MODEL="$EL_MODEL" LANGUAGE="$LANGUAGE" SPEED="$SPEED" STABILITY="$STABILITY" STYLE="$STYLE" python3 -c '
import json, os, re, sys
m = os.environ["EL_MODEL"]
t = sys.argv[1]
newgen = m.startswith(("eleven_v3", "eleven_v4"))
if not newgen:
    # Expression tags are only understood by v3/v4; elsewhere they would be read aloud.
    t = re.sub(r"\s*\[[^\]]{1,40}\]\s*", " ", t).strip()
b = {"text": t, "model_id": m}
if os.environ["LANGUAGE"] and m.endswith("_v2_5"):
    b["language_code"] = os.environ["LANGUAGE"]
vs = {}
def num(name, lo, hi):
    try:
        return max(lo, min(hi, float(os.environ[name])))
    except (KeyError, ValueError):
        return None
st = num("STABILITY", 0, 1)
if st is not None:
    vs["stability"] = st
if not newgen:
    sy = num("STYLE", 0, 1)
    if sy:
        vs["style"] = sy
    sp = num("SPEED", 0.7, 1.2)
    if sp is not None and sp != 1.0:
        vs["speed"] = sp
if vs:
    b["voice_settings"] = vs
print(json.dumps(b))' "$text") || return 1
  hdr="$out.hdr"
  for attempt in 1 2; do
    code=$(printf 'header = "xi-api-key: %s"\n' "$EL_KEY" | \
      curl -sS -m 30 -K - -X POST \
        "https://api.elevenlabs.io/v1/text-to-speech/${EL_VOICE_ID}?output_format=mp3_44100_128" \
        -H 'Content-Type: application/json' -d "$body" \
        -o "$out" -D "$hdr" -w '%{http_code}' 2>/dev/null) || code=000
    [ "$code" = "429" ] && [ "$attempt" = 1 ] && { sleep 1; continue; }
    break
  done
  if [ "$code" = "200" ] && [ -s "$out" ]; then
    local cost
    cost=$(tr -d '\r' < "$hdr" 2>/dev/null | awk -F': ' 'tolower($1)=="character-cost"{print $2}')
    log "elevenlabs ok model=$EL_MODEL persona=$PERSONA chars=${#text} cost=${cost:-?}"
    READBACK_DATA_DIR="$DATA_DIR" python3 "$PLUGIN_ROOT/scripts/usage.py" record "${cost:-${#text}}" 2>/dev/null || true
    rm -f "$hdr"
    return 0
  fi
  # Anything that is not audio is an error body: keep it and say why.
  cp "$out" "$DATA_DIR/elevenlabs-last-error.json" 2>/dev/null || true
  local why
  why=$(python3 -c '
import json, sys
try:
    d = json.load(open(sys.argv[1])).get("detail", {})
    if isinstance(d, dict):
        print(d.get("status") or d.get("code") or "", d.get("message") or "")
    else:
        print("validation_error")
except Exception:
    print("")' "$out" 2>/dev/null)
  log "elevenlabs FAILED http=$code ${why:-no body}"
  notice "readback: ElevenLabs failed on the last reply (http $code ${why:-no details}). A backup voice was used if available. Details: readback.log in the plugin data folder."
  rm -f "$hdr" "$out"
  return 1
}

# Expression tags are for ElevenLabs v3/v4 only; any other engine would read them aloud.
sin_tags() { printf '%s' "$1" | sed -E 's/ ?\[[^]]{1,40}\]//g'; }

engine_kokoro() {
  local out="$1" body code
  local text; text="$(sin_tags "$text")"
  curl -s -m 1 -o /dev/null "$KOKORO_URL/health" 2>/dev/null || { log "kokoro skipped: nothing at $KOKORO_URL"; return 1; }
  body=$(VOICE="$VOICE" SPEED="$SPEED" python3 -c '
import json, os, sys
try:
    sp = float(os.environ["SPEED"])
except ValueError:
    sp = 1.0
print(json.dumps({"model": "kokoro", "input": sys.argv[1], "voice": os.environ["VOICE"],
                  "response_format": "mp3", "speed": sp}))' "$text") || return 1
  code=$(curl -sS -m 30 -X POST "$KOKORO_URL/v1/audio/speech" \
    -H 'Content-Type: application/json' -d "$body" -o "$out" -w '%{http_code}' 2>/dev/null) || code=000
  if [ "$code" = "200" ] && [ -s "$out" ]; then log "kokoro ok chars=${#text}"; return 0; fi
  log "kokoro FAILED http=$code"
  rm -f "$out"
  return 1
}

# Last resort: the system voice. Speaks directly, no file.
engine_say() {
  command -v say >/dev/null 2>&1 || { log "say skipped: not available"; return 1; }
  local v="" text; text="$(sin_tags "$text")"
  case "$LANGUAGE" in
    es*) v="Mónica" ;;
  esac
  [ "$DRY_RUN" = "1" ] && { log "say dry-run voice=${v:-default}"; return 0; }
  take_lock
  if [ -n "$v" ] && say -v "$v" "$text" 2>/dev/null; then :; else say "$text" 2>/dev/null; fi
  log "say ok voice=${v:-default}"
  return 0
}

# Lock by mkdir: macOS ships no flock(1). Keeps two sessions from talking over
# each other. A lock older than 5 minutes is dead; only the session whose mv wins reclaims it.
take_lock() {
  [ -n "${HAVE_LOCK:-}" ] && return 0
  if [ -d "$LOCKDIR" ] && [ -n "$(find "$LOCKDIR" -maxdepth 0 -mmin +5 2>/dev/null)" ]; then
    mv "$LOCKDIR" "$LOCKDIR.stale.$$" 2>/dev/null && rmdir "$LOCKDIR.stale.$$" 2>/dev/null || true
  fi
  local _
  for _ in $(seq 1 600); do
    if mkdir "$LOCKDIR" 2>/dev/null; then
      HAVE_LOCK=1
      trap 'rmdir "$LOCKDIR" 2>/dev/null || true' EXIT
      return 0
    fi
    sleep 0.5
  done
  return 0
}

# Optional loudness leveling, so the voice is not buried under music.
nivelar() {
  local f="$1" g="${1%.mp3}.lvl.mp3"
  [ "$NORMALIZE" = "off" ] && return 0
  command -v ffmpeg >/dev/null 2>&1 || return 0
  if ffmpeg -loglevel error -y -i "$f" -af "loudnorm=I=-14:TP=-1.5:LRA=11" "$g" 2>/dev/null && [ -s "$g" ]; then
    mv "$g" "$f"
  else
    rm -f "$g"
  fi
}

# All the heavy work goes behind: the hook returns control immediately.
(
  mp3="$(mktemp "${TMPDIR:-/tmp}/readback-XXXXXX")" || exit 0
  mv "$mp3" "$mp3.mp3" 2>/dev/null && mp3="$mp3.mp3"

  case "$PROVIDER" in
    kokoro) chain="kokoro elevenlabs say" ;;
    say)    chain="say elevenlabs kokoro" ;;
    *)      chain="elevenlabs kokoro say" ;;
  esac

  played=""
  for eng in $chain; do
    case "$eng" in
      elevenlabs) engine_elevenlabs "$mp3" && played=file ;;
      kokoro)     engine_kokoro "$mp3"     && played=file ;;
      say)        engine_say               && played=said ;;
    esac
    [ -n "$played" ] && break
  done

  if [ -z "$played" ]; then
    log "no engine could speak (chain: $chain)"
    notice "readback: no voice engine worked on the last reply. Run /readback:speak doctor."
    rm -f "$mp3"
    exit 0
  fi
  [ "$played" = "said" ] && { rm -f "$mp3"; exit 0; }

  nivelar "$mp3"

  take_lock
  if [ "$DRY_RUN" = "1" ]; then log "dry-run: would play $(basename "$mp3")"
  else reproducir "$mp3" >/dev/null 2>&1 || log "playback failed (no player or player error)"; fi
  rm -f "$mp3"
  # Refresh the real credit numbers for the next footer (throttled inside).
  [ -n "$EL_KEY" ] && READBACK_DATA_DIR="$DATA_DIR" python3 "$PLUGIN_ROOT/scripts/usage.py" refresh 2>/dev/null
) >/dev/null 2>&1 &

# Footer: a user-only line (Stop hook systemMessage, never seen by the model),
# built from the cache so it costs nothing. One reply behind at most.
if [ "$SHOW_USAGE" != "off" ] && [ -n "$EL_KEY" ] && [ "$PROVIDER" != "kokoro" ] && [ "$PROVIDER" != "say" ]; then
  READBACK_DATA_DIR="$DATA_DIR" python3 "$PLUGIN_ROOT/scripts/usage.py" footer 2>/dev/null
fi

exit 0
