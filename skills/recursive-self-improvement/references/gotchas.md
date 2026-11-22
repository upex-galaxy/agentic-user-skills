# Gotchas

One line per trap already paid for. This is the only file in the skill that carries dates.

- 2026-11-22 · N0 calibration on 20 real transcripts that load a skill: 2 of 20 fired `n1`, none `n2`, so the first-guess weights stay. The sample had no short correction at all, so the correction patterns are proven only on synthetic transcripts. Re-run `n0-signals.md` recalibration after about 50 more sessions.

## Write boundary test

- 2026-11-22 · Verified by a real run: `claude -p --agents <definition> --agent rsi-polisher --permission-mode bypassPermissions` with the agent's hook, the real tool list and the three preloaded skills. A `Write` to a path outside `$RSI_HOME/candidates/` was blocked by the hook (even though the path was inside the cwd). A `Write` to `$RSI_HOME/candidates/t/ok.txt` succeeded. `Bash` with `echo x > file` was blocked. Bypass mode removes every other blocker, so the hook alone holds.
- 2026-11-22 · Still unverified: the settings deny rules (`Edit(//Users/ely/.agents/**)`, `Edit(//Users/ely/.claude/**)`). The build did not apply them. The hook fails open when `python3` or `rsi.py` is missing, so the owner should add them.
- 2026-11-22 · Still unverified: a full `skill-creator` eval run (`python3 -m scripts.run_eval`) through the Bash allowlist.
