# Preset: gh-run. Sourced by wake-on.sh, never run directly.
PRESET_SUMMARY="One GitHub Actions run: every status or conclusion change of the run and of each job (queued, in_progress, success, failure, cancelled)."
PRESET_PARAMS="REPO=owner/name RUN=<run id> [INTERVAL=60]  (run ids: gh run list --repo owner/name)"

preset_init() {
  [ -n "${REPO:-}" ] && [ -n "${RUN:-}" ] || { echo "gh-run needs REPO=owner/name and RUN=<run id>" >&2; return 1; }
  INTERVAL="${INTERVAL:-60}"
}

preset_snapshot() {
  gh run view "$RUN" --repo "$REPO" --json status,conclusion,jobs \
    -q '"run:status=\(.status) conclusion=\(.conclusion // "none")", (.jobs[] | "job:\(.name):status=\(.status):conclusion=\(.conclusion // "none")")'
}

# The old value of a changed line is ignored: the new line already says where the run is now.
preset_describe() {
  local line
  while IFS= read -r line; do
    [ -n "$line" ] || continue
    case "$line" in
      run:*) emit "RUN ${line#run:}" ;;
      job:*) emit "JOB ${line#job:}" ;;
    esac
  done <<< "${WAKE_ADDED:-}"
}
