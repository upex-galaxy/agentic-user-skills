#!/usr/bin/env bash
# Checks a content source document before it is handed to the content agent.
# Usage: bash check-content-doc.sh <doc.md>
# Exit 0 = clean. Exit 1 = at least one FAIL (privacy leak, missing section, dash in prose).
# WARN lines are judgment calls: read them, fix what is real.
# Portable: bash 3.2 + BSD/GNU grep/awk (macOS and Linux).

set -u
doc="${1:-}"
if [ -z "$doc" ] || [ ! -f "$doc" ]; then
  echo "usage: bash check-content-doc.sh <doc.md>" >&2
  exit 2
fi

fails=0
fail() { echo "FAIL  $1"; fails=$((fails + 1)); }
warn() { echo "WARN  $1"; }
ok()   { echo "ok    $1"; }

# Prose = everything outside ``` fences. Code blocks may hold real identifiers.
prose="$(mktemp)"
trap 'rm -f "$prose"' EXIT
awk '/^```/{inblock=!inblock; print ""; next} {print inblock ? "" : $0}' "$doc" > "$prose"

# hits <label> <ERE> <file> <fail|warn> [redact]: prints matching lines with numbers.
# With "redact", prints line numbers only, so a leaked secret is never echoed.
hits() {
  local label="$1" re="$2" file="$3" level="$4" mode="${5:-}" out
  out="$(grep -nE -- "$re" "$file" | head -5)"
  if [ -n "$out" ]; then
    if [ "$level" = fail ]; then fail "$label"; else warn "$label"; fi
    if [ "$mode" = redact ]; then
      echo "        lines: $(echo "$out" | cut -d: -f1 | tr '\n' ' ')(content not shown)"
    else
      echo "$out" | sed 's/^/        /' | cut -c1-160
    fi
  else
    ok "$label: none"
  fi
}

echo "== privacy (whole file, code blocks included) =="
hits "absolute local path" '/Users/|/home/[a-z]|[A-Za-z]:\\Users\\|/private/(tmp|var)/|/var/folders/' "$doc" fail
hits "secret-looking value" 'sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_|xox[abposr]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}|-----BEGIN [A-Z ]*PRIVATE KEY|(password|passwd|secret|api[_-]?key|token)[[:space:]]*[:=][[:space:]]*["'"'"']?[A-Za-z0-9/+_-]{12,}' "$doc" fail redact
hits "session id" 'session_[A-Za-z0-9]{12,}|claude\.ai/code/session' "$doc" fail
hits "email address" '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}' "$doc" fail
hits "home-relative path (check it is generic, not personal)" '(^|[[:space:]`(])~/' "$doc" warn
hits "UUID (could be a session or run id)" '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' "$doc" warn

echo "== required sections =="
check_section() {
  if grep -qiE "^##[[:space:]]+($1)" "$doc"; then ok "section: $1"; else fail "missing section: $1"; fi
}
check_section 'Resumen en 5|Summary in 5'
check_section 'El problema|The problem'
check_section 'La idea|The idea'
check_section 'El diseño|El diseno|The design'
check_section 'Cómo se construyó|Como se construyo|How it was built'
check_section 'Las mediciones|The measurements'
check_section 'El resultado|The result'
check_section 'Límites honestos|Limites honestos|Honest limits'
check_section 'Material para contenido|Content material'
check_section 'Fuentes|Sources'

echo "== writing =="
hits "em/en dash in prose" '—|–' "$prose" fail
hits "'no es X, sino Y' contrast" '[Nn]o es [^.]{1,60}, sino |[Nn]ot [^.]{1,40}, but ' "$prose" warn
hits "inflated word" '\b([Cc]rucial|[Ff]undamental|[Rr]obust[oa]?|[Pp]otenciar|[Aa]provechar|[Ii]ntegral|[Ss]eamless|[Ll]everage|[Dd]elve|[Pp]anorama|[Aa]bordar)\b' "$prose" warn

echo "== evidence =="
labels="$(grep -oiE '(medido|calculado|según|segun|interpretado|measured|calculated|according to|interpreted)' "$doc" | wc -l | tr -d ' ')"
pcts="$(grep -oE '[0-9]+([.,][0-9]+)?[[:space:]]?%' "$prose" | wc -l | tr -d ' ')"
calc="$(grep -oiE '(calculado|calculated)' "$doc" | wc -l | tr -d ' ')"
echo "info  source labels: $labels   percentages in prose: $pcts   'calculado' labels: $calc"
if [ "$labels" -eq 0 ]; then warn "no source labels at all: every number needs (medido, X) or (calculado: ...)"; fi
if [ "$pcts" -gt 0 ] && [ "$calc" -eq 0 ]; then warn "percentages present but none marked calculado"; fi
if ! grep -qiE 'sin verificar|sin dato|no se midió|no se midio|not measured|unverified|no data' "$doc"; then
  warn "no explicit unverified / not-measured items: confirm there really are none"
fi

echo "== size =="
words="$(wc -w < "$doc" | tr -d ' ')"
hooks="$(awk '/^###.*(Frases citables|hooks|Quotable)/{f=1; next} /^##/{f=0} f && /^[0-9]+\./' "$doc" | wc -l | tr -d ' ')"
angles="$(grep -ciE '^###[[:space:]]+(Ángulo|Angulo|Angle)' "$doc")"
echo "info  words: $words   hooks: $hooks   angles: $angles"
[ "$hooks" -lt 8 ] && warn "fewer than 8 hooks (fine only for a very small source)"
[ "$angles" -lt 3 ] && warn "fewer than 3 angles"

echo
if [ "$fails" -gt 0 ]; then
  echo "RESULT: $fails FAIL(s). Fix and re-run."
  exit 1
fi
echo "RESULT: clean (read the WARN lines, if any)."
exit 0
