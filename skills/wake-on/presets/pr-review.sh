# Preset: pr-review. Sourced by wake-on.sh, never run directly.
PRESET_SUMMARY="One GitHub PR: reviews, inline comments, plain comments (and edits to them), PR state and review decision. Ignores the PR author and [bot] accounts."
PRESET_PARAMS="REPO=owner/name PR=<number> [SELF=<login to ignore, default: the current gh user>] [INTERVAL=120]"

preset_init() {
  [ -n "${REPO:-}" ] && [ -n "${PR:-}" ] || { echo "pr-review needs REPO=owner/name and PR=<number>" >&2; return 1; }
  SELF="${SELF:-$(gh api user --jq .login)}" || return 1
}

# One line per fact. Comments carry updated_at so an edit shows up as a new line.
# pipefail (set by the engine) makes a failing `gh` fail the whole snapshot, so a half-read
# poll can never be mistaken for "the comments were deleted".
preset_snapshot() {
  local head reviews inline plain
  head=$(gh pr view "$PR" --repo "$REPO" --json state,reviewDecision \
    -q '"pr:state=" + .state + " decision=" + (if .reviewDecision == "" then "none" else .reviewDecision end)') || return 1
  reviews=$(gh api "repos/$REPO/pulls/$PR/reviews" --paginate \
    | jq -r --arg self "$SELF" '.[] | select(.user.login != $self and (.user.login | endswith("[bot]") | not))
        | "review:\(.id):\(.state):\(.user.login)"') || return 1
  inline=$(gh api "repos/$REPO/pulls/$PR/comments" --paginate \
    | jq -r --arg self "$SELF" '.[] | select(.user.login != $self and (.user.login | endswith("[bot]") | not))
        | "inline:\(.id):\(.user.login):\(.updated_at)"') || return 1
  plain=$(gh api "repos/$REPO/issues/$PR/comments" --paginate \
    | jq -r --arg self "$SELF" '.[] | select(.user.login != $self and (.user.login | endswith("[bot]") | not))
        | "plain:\(.id):\(.user.login):\(.updated_at)"') || return 1
  printf '%s\n%s\n%s\n%s\n' "$head" "$reviews" "$inline" "$plain"
}

# Removed lines are ignored on purpose: a replaced state line shows up as an added one.
preset_describe() {
  local line kind rest id who body
  while IFS= read -r line; do
    [ -n "$line" ] || continue
    kind="${line%%:*}"; rest="${line#*:}"; id="${rest%%:*}"; who="${rest#*:}"
    case "$kind" in
      pr)     emit "PR now: ${line#pr:}" ;;
      review) body=$(gh api "repos/$REPO/pulls/$PR/reviews/$id" --jq '.body' 2>/dev/null | oneline 600)
              emit "REVIEW ${who} | ${body:-<no text>}" ;;
      inline) body=$(gh api "repos/$REPO/pulls/comments/$id" --jq '"[\(.path):\(.line // "-")] " + .body' 2>/dev/null | oneline 600)
              emit "INLINE COMMENT ${who%%:*} | ${body:-<unreadable>}" ;;
      plain)  body=$(gh api "repos/$REPO/issues/comments/$id" --jq '.body' 2>/dev/null | oneline 600)
              emit "PR COMMENT ${who%%:*} | ${body:-<unreadable>}" ;;
    esac
  done <<< "${WAKE_ADDED:-}"
}
