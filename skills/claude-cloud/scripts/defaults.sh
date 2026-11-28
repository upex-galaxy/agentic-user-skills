# defaults.sh · shared setup for the claude-cloud scripts. Load it with `source`; do not run it.
#
# It does four things:
#   1. Maps the deprecated CF_* variables to their CLAUDE_CLOUD_* names (claude_cloud_compat_env).
#      After this file runs, scripts read only the new names.
#   2. Computes the defaults that depend on the repo you are in:
#        CLAUDE_CLOUD_REPO_ROOT_DEFAULT   main checkout of the current repo (also from inside a worktree)
#        CLAUDE_CLOUD_WORKTREE_DEFAULT    $HOME/.claude-cloud/worktrees/<repo-name>
#        CLAUDE_CLOUD_RETURN_REF_DEFAULT  the remote default branch (origin/HEAD), or origin/main
#        CLAUDE_CLOUD_STATE_DIR_DEFAULT   $HOME/.claude-cloud/state (only wake.sh falls back to it)
#   3. Checks the required Playwright profile (claude_cloud_require_profile).
#   4. Resolves the state file names, new or legacy (claude_cloud_state_files).
# Everything can be overridden with a CLAUDE_CLOUD_* variable.

# 1 · Deprecated CF_* names. One line per old variable that is set; the new name wins when both are set.
# Each mapped value is exported, so child scripts see the new name and do not repeat the line.
# CF_DESPERTAR_PERFIL is not mapped on purpose: the profile has no fallback of any kind.
CLAUDE_CLOUD_RENAMES="
CF_ESTADO CLAUDE_CLOUD_STATE_DIR
CF_RUNBOOK CLAUDE_CLOUD_RUNBOOK
CF_WORKTREE CLAUDE_CLOUD_WORKTREE
CF_ROOT CLAUDE_CLOUD_REPO_ROOT
CF_REPO CLAUDE_CLOUD_REPO
CF_PREFIJO CLAUDE_CLOUD_BRANCH_PREFIX
CF_VOLVER CLAUDE_CLOUD_RETURN_REF
CF_TAREA CLAUDE_CLOUD_TASK
CF_EXTRA CLAUDE_CLOUD_EXTRA
CF_PROMPT CLAUDE_CLOUD_PROMPT_FILE
CF_MODO CLAUDE_CLOUD_PERMISSION_MODE
CF_DESPERTAR CLAUDE_CLOUD_WAKE
CF_DESPERTAR_MSG CLAUDE_CLOUD_WAKE_MESSAGE
CF_DESPERTAR_DESAFIO_SEG CLAUDE_CLOUD_WAKE_CHALLENGE_SEC
CF_DESPERTAR_COMPOSER_SEG CLAUDE_CLOUD_WAKE_COMPOSER_SEC
CF_DESPERTAR_CANDADO_SEG CLAUDE_CLOUD_WAKE_LOCK_SEC
CF_DESPERTAR_COMPOSER CLAUDE_CLOUD_WAKE_COMPOSER
CF_DESPERTAR_TECLA CLAUDE_CLOUD_WAKE_KEY
CF_MAX CLAUDE_CLOUD_MAX_SESSIONS
CF_TRABADA_MIN CLAUDE_CLOUD_STUCK_MIN
CF_GRACIA_MIN CLAUDE_CLOUD_GRACE_MIN
CF_ABANDONO_MIN CLAUDE_CLOUD_ABANDON_MIN
CF_PATRON CLAUDE_CLOUD_DELIVERY_PATTERN
CF_ESPERA CLAUDE_CLOUD_POLL_SEC
CF_VUELTAS CLAUDE_CLOUD_MAX_POLLS
CF_RELANZAR CLAUDE_CLOUD_RELAUNCH
CF_MENSAJE CLAUDE_CLOUD_STUCK_MESSAGE
CF_ESPERA_CONECTOR CLAUDE_CLOUD_CONNECTOR_WAIT_PATTERN
CF_PAUSA_LOGIN_MIN CLAUDE_CLOUD_LOGIN_PAUSE_MIN
"
claude_cloud_compat_env() {
  local old new
  while read -r old new; do
    [ -n "$old" ] || continue
    if [ -z "${!new+x}" ] && [ -n "${!old+x}" ]; then
      export "$new=${!old}"
      echo "deprecated: $old is now $new" >&2
    fi
  done <<< "$CLAUDE_CLOUD_RENAMES"
  if [ -n "${CF_DESPERTAR_PERFIL+x}" ] && [ -z "${CLAUDE_CLOUD_PROFILE_NOTICE_SHOWN:-}" ]; then
    export CLAUDE_CLOUD_PROFILE_NOTICE_SHOWN=1
    echo "deprecated: CF_DESPERTAR_PERFIL is ignored; set CLAUDE_CLOUD_PLAYWRIGHT_PROFILE instead" >&2
  fi
  return 0
}
claude_cloud_compat_env

# 2 · Defaults that depend on the current repo
CLAUDE_CLOUD_REPO_ROOT_DEFAULT=$(d=$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null) && dirname "$d" || true)
CLAUDE_CLOUD_WORKTREE_DEFAULT=
if [ -n "$CLAUDE_CLOUD_REPO_ROOT_DEFAULT" ]; then
  CLAUDE_CLOUD_WORKTREE_DEFAULT=$HOME/.claude-cloud/worktrees/$(basename "$CLAUDE_CLOUD_REPO_ROOT_DEFAULT")
fi
CLAUDE_CLOUD_RETURN_REF_DEFAULT=$(git symbolic-ref -q --short refs/remotes/origin/HEAD 2>/dev/null || echo origin/main)
CLAUDE_CLOUD_STATE_DIR_DEFAULT=$HOME/.claude-cloud/state

# 3 · The Playwright profile logged into the claude.ai account that owns the cloud sessions.
# Required, no default. On success it sets CLAUDE_CLOUD_PROFILE_DIR (no trailing slash),
# CLAUDE_CLOUD_PW_SESSION (the profile's basename, used as the playwright-cli session name) and
# CLAUDE_CLOUD_PROFILE_LOCK (<profile>.lock next to the profile). On failure it prints why and returns 6.
claude_cloud_require_profile() {
  local p=${CLAUDE_CLOUD_PLAYWRIGHT_PROFILE:-}
  local where='the env block of the settings.json of the Claude profile you are using ($CLAUDE_CONFIG_DIR/settings.json, default ~/.claude/settings.json)'
  local target='a Playwright profile logged into the claude.ai account that owns your cloud sessions.'
  if [ -z "$p" ]; then
    echo "CLAUDE_CLOUD_PLAYWRIGHT_PROFILE is not set. Add it to $where, pointing at $target" >&2
    return 6
  fi
  while [ "${#p}" -gt 1 ] && [ "${p%/}" != "$p" ]; do p=${p%/}; done
  if [ ! -d "$p" ]; then
    echo "CLAUDE_CLOUD_PLAYWRIGHT_PROFILE points at $p, which does not exist. Fix it in $where, so it points at $target" >&2
    return 6
  fi
  CLAUDE_CLOUD_PROFILE_DIR=$p
  CLAUDE_CLOUD_PW_SESSION=$(basename "$p")
  CLAUDE_CLOUD_PROFILE_LOCK=$p.lock
  return 0
}

# 4 · State file names inside a state dir ($1). New names by default; a state dir that already holds the
# legacy sesiones.txt (and no sessions.txt) keeps all its legacy names, so a fleet started before the
# rename resumes without relaunching anything. Sets:
#   CC_SESSIONS   sessions.txt  (legacy sesiones.txt)     durable `unit url epoch` record, never deleted
#   CC_QUEUE_LOG  queue.log     (legacy cola.log)
#   CC_MESSAGES   messages.txt  (legacy mensajes.txt)     automatic CLI messages sent by queue.sh
#   CC_WAKES      wakes.txt     (legacy despertares.txt)  web wakes sent by queue.sh
#   CC_LAUNCHES   launches/     (legacy lanzamientos/)    launch logs, one per unit
#   CC_WAKE_LOG   wake.log      (legacy despertar.log)    wake.sh log
#   CC_WAKE_SHOTS wake/         (legacy despertar/)       wake.sh screenshots
claude_cloud_state_files() {
  local d=$1
  if [ -e "$d/sesiones.txt" ] && [ ! -e "$d/sessions.txt" ]; then
    CC_SESSIONS=$d/sesiones.txt; CC_QUEUE_LOG=$d/cola.log; CC_MESSAGES=$d/mensajes.txt
    CC_WAKES=$d/despertares.txt; CC_LAUNCHES=$d/lanzamientos
    CC_WAKE_LOG=$d/despertar.log; CC_WAKE_SHOTS=$d/despertar
  else
    CC_SESSIONS=$d/sessions.txt; CC_QUEUE_LOG=$d/queue.log; CC_MESSAGES=$d/messages.txt
    CC_WAKES=$d/wakes.txt; CC_LAUNCHES=$d/launches
    CC_WAKE_LOG=$d/wake.log; CC_WAKE_SHOTS=$d/wake
  fi
  return 0
}

# Patterns shared by queue.sh and watch.sh. Both marker names, both log file names and both log phrases
# count, so runbooks written before the rename keep working.
CLAUDE_CLOUD_DELIVERY_PATTERN_DEFAULT='(^|/)(delivery|entrega)\.json$'
CLAUDE_CLOUD_CONNECTOR_WAIT_PATTERN_DEFAULT='waiting for connector|esperando conector'
CLAUDE_CLOUD_LOG_FILE_PATTERN='(^|/)(cloud-log|nube-log)\.md$'
