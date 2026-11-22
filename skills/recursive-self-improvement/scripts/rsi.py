#!/usr/bin/env python3
"""rsi: helper for the recursive-self-improvement skill.

Python 3 standard library only. Run as `python3 -I rsi.py <cmd>`.
State lives under $RSI_HOME (default ~/.rsi). Nothing is written in the cwd.
"""
import argparse
import datetime
import difflib
import hashlib
import json
import os
import re
import shutil
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
SIGNALS_DOC = HERE.parent / "references" / "n0-signals.md"
STATUSES = ("logged", "proposed", "approved", "applied", "rejected", "reverted")
EDIT_VERDICTS = ("SKILL", "INTENT-UNDERSPECIFIED")
VERDICTS = ("SKILL", "MODEL", "INTENT-UNDERSPECIFIED", "INTENT-MISREAD", "ENV", "NOISE")
SKIP_NAMES = {".git", "__pycache__", ".DS_Store"}


# ---------------------------------------------------------------- helpers

def rsi_home():
    return Path(os.environ.get("RSI_HOME") or (Path.home() / ".rsi"))


def now():
    return datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")


def stamp():
    return datetime.datetime.utcnow().strftime("%Y%m%dT%H%M%S%f")


def out(obj):
    print(json.dumps(obj, ensure_ascii=False, sort_keys=True))


def die(msg, code=1):
    print("rsi: " + msg, file=sys.stderr)
    sys.exit(code)


def iter_files(root):
    root = Path(root)
    for p in sorted(root.rglob("*")):
        rel = p.relative_to(root)
        if any(part in SKIP_NAMES for part in rel.parts):
            continue
        if p.is_file():
            yield rel, p


def tree_sha(root):
    h = hashlib.sha256()
    for rel, p in iter_files(root):
        h.update(str(rel).encode() + b"\0")
        h.update(p.read_bytes() + b"\0")
    return h.hexdigest()[:12]


def real_skill(path):
    p = Path(os.path.expanduser(path)).resolve()
    if not (p / "SKILL.md").is_file():
        die("no SKILL.md in %s" % p)
    return p


def copy_tree(src, dst):
    shutil.copytree(src, dst, ignore=shutil.ignore_patterns(*SKIP_NAMES))


def replace_tree(src, dst):
    """Make dst hold exactly the files of src (dst itself, a symlink target, stays)."""
    for child in list(Path(dst).iterdir()):
        if child.name in SKIP_NAMES:
            continue
        if child.is_dir() and not child.is_symlink():
            shutil.rmtree(child)
        else:
            child.unlink()
    for rel, p in iter_files(src):
        target = Path(dst) / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(p, target)


# ---------------------------------------------------------------- N0 config

def load_config():
    text = SIGNALS_DOC.read_text(encoding="utf-8")
    m = re.search(r"```json rsi-config\n(.*?)\n```", text, re.S)
    if not m:
        raise ValueError("no rsi-config block in n0-signals.md")
    cfg = json.loads(m.group(1))
    for key in ("weights", "limits", "threshold", "correction", "request"):
        if key not in cfg:
            raise ValueError("rsi-config lacks " + key)
    return cfg


# ---------------------------------------------------------------- transcripts

def read_events(path):
    """Yield normalized events. Raises ValueError when nothing parses."""
    good = 0
    bad = 0
    with open(path, "r", encoding="utf-8", errors="replace") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                o = json.loads(line)
            except ValueError:
                bad += 1
                continue
            if not isinstance(o, dict):
                bad += 1
                continue
            good += 1
            if o.get("isSidechain"):
                continue
            msg = o.get("message")
            t = o.get("type")
            if not isinstance(msg, dict) or t not in ("user", "assistant"):
                continue
            content = msg.get("content")
            if t == "assistant":
                for b in content if isinstance(content, list) else []:
                    if isinstance(b, dict) and b.get("type") == "tool_use":
                        inp = b.get("input") if isinstance(b.get("input"), dict) else {}
                        if b.get("name") == "Skill":
                            yield {"k": "skill", "name": str(inp.get("skill") or inp.get("name") or "")}
                        yield {"k": "tool_use", "name": str(b.get("name")), "input": inp}
                continue
            if o.get("isMeta"):
                continue
            if isinstance(content, str):
                parts = [("text", content)]
            elif isinstance(content, list):
                parts = []
                for b in content:
                    if not isinstance(b, dict):
                        continue
                    if b.get("type") == "text":
                        parts.append(("text", str(b.get("text", ""))))
                    elif b.get("type") == "tool_result":
                        parts.append(("result", bool(b.get("is_error"))))
            else:
                parts = []
            for kind, val in parts:
                if kind == "result":
                    yield {"k": "tool_result", "error": val}
                    continue
                s = val.strip()
                m = re.match(r"<command-name>/?([\w:.-]+)</command-name>", s)
                if m:
                    yield {"k": "command", "name": m.group(1)}
                elif s.startswith("[Request interrupted"):
                    yield {"k": "interrupt"}
                elif s.startswith("<") or not s:
                    continue
                else:
                    yield {"k": "user_text", "text": s}
    if good == 0:
        raise ValueError("no parseable lines (%d unreadable)" % bad)


def is_skill_dir(name):
    home = Path.home()
    for base in (home / ".claude" / "skills", home / ".agents" / "skills"):
        if (base / name / "SKILL.md").is_file():
            return True
    return False


def scan_transcript(path, cfg=None):
    cfg = cfg or load_config()
    w, lim, corr, req = cfg["weights"], cfg["limits"], cfg["correction"], cfg["request"]
    corr_res = [re.compile(p, re.I) for p in corr["patterns"]]
    req_res = [re.compile(p, re.I) for p in req["patterns"]]
    skills = []
    loaded = False
    n_corr = n_int = 0
    results = []
    recent_calls = []
    retry_hit = False
    explicit = False
    for ev in read_events(path):
        k = ev["k"]
        if k in ("skill", "command"):
            name = ev["name"]
            if name and (k == "skill" or is_skill_dir(name)):
                loaded = True
                if name not in skills:
                    skills.append(name)
            continue
        if not loaded:
            continue
        if k == "interrupt":
            n_int += 1
        elif k == "user_text":
            text = ev["text"]
            if len(text) <= req["max_chars"] and any(r.search(text) for r in req_res):
                explicit = True
            if len(text) <= corr["max_chars"] and any(r.search(text) for r in corr_res):
                n_corr += 1
        elif k == "tool_result":
            results.append(ev["error"])
        elif k == "tool_use" and ev["name"] != "Skill":
            sig = (ev["name"], json.dumps(ev["input"], sort_keys=True)[:400])
            recent_calls.append(sig)
            if len(recent_calls) >= lim["retry_run"]:
                tail = recent_calls[-lim["retry_run"]:]
                if len({t[0] for t in tail}) == 1 and all(
                    difflib.SequenceMatcher(None, tail[0][1], t[1]).ratio() >= lim["retry_similarity"]
                    for t in tail[1:]
                ):
                    retry_hit = True
    err_burst = False
    win = lim["error_window"]
    for i in range(len(results)):
        if sum(1 for e in results[i:i + win] if e) >= lim["error_count"]:
            err_burst = True
            break
    signals = {
        "corrections": min(n_corr, lim["max_corrections"]),
        "interrupts": n_int,
        "error_burst": err_burst,
        "retry_loop": retry_hit,
        "explicit_request": explicit,
    }
    score = (
        signals["corrections"] * w["correction"]
        + (w["interrupt"] if n_int else 0)
        + (w["error_burst"] if err_burst else 0)
        + (w["retry_loop"] if retry_hit else 0)
    )
    if not loaded:
        verdict = "none"
    elif explicit:
        verdict = "n2"
    elif score >= cfg["threshold"]:
        verdict = "n1"
    else:
        verdict = "none"
    return {"skills": skills, "signals": signals, "score": score, "verdict": verdict}


def cmd_scan(a):
    try:
        res = scan_transcript(a.transcript)
    except Exception as e:  # fail soft: the caller falls back to N1
        res = {"skills": [], "signals": {}, "score": None, "verdict": "n1",
               "note": "scan failed soft: %s" % type(e).__name__}
    out(res)


# ---------------------------------------------------------------- scrub

SECRET_PATH = re.compile(
    r"(^|[\s/\"'`(=])(\.env(\.[\w-]+)?|auth\.json|credentials(\.json)?|id_rsa|id_ed25519|[\w.-]+\.pem|\.npmrc|\.netrc)(?=$|[\s/\"'`):,;])",
    re.I)
SECRET_TOKEN = re.compile(
    r"(sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|xox[abprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}"
    r"|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}|Bearer\s+[A-Za-z0-9._~+/=-]{20,}"
    r"|-----BEGIN [A-Z ]*PRIVATE KEY-----)")
LONG_BLOB = re.compile(r"[A-Za-z0-9_-]{32,}")


def opaque(s):
    return bool(re.search(r"\d", s) and re.search(r"[a-z]", s) and re.search(r"[A-Z]", s))


def secret_issues(text):
    issues = []
    for i, line in enumerate(text.splitlines(), 1):
        if SECRET_PATH.search(line):
            issues.append("line %d: secret-like path" % i)
        if SECRET_TOKEN.search(line):
            issues.append("line %d: token-shaped string" % i)
        if any(opaque(m.group(0)) for m in LONG_BLOB.finditer(line)):
            issues.append("line %d: long opaque string" % i)
    return issues


def scrub(text):
    text = SECRET_TOKEN.sub("[redacted]", text)
    return LONG_BLOB.sub(lambda m: "[redacted]" if opaque(m.group(0)) else m.group(0), text)


# ---------------------------------------------------------------- excerpt

def cmd_excerpt(a):
    turn = 0
    started = False
    lines = []
    try:
        for ev in read_events(a.transcript):
            k = ev["k"]
            if k in ("user_text", "interrupt"):
                turn += 1
            if k in ("skill", "command") and ev["name"] == a.skill:
                started = True
                lines.append("T%d | skill loaded: %s" % (turn, a.skill))
                continue
            if not started:
                continue
            if k == "user_text":
                lines.append("T%d | user: %s" % (turn, scrub(ev["text"][: a.chars]).replace("\n", " ")))
            elif k == "interrupt":
                lines.append("T%d | user interrupted" % turn)
            elif k == "tool_use" and ev["name"] != "Skill":
                lines.append("T%d | tool: %s %s" % (turn, ev["name"], scrub(json.dumps(ev["input"], ensure_ascii=False)[: a.chars // 2])))
            elif k == "tool_result" and ev["error"]:
                lines.append("T%d | tool error" % turn)
    except ValueError as e:
        die("cannot read transcript: %s" % e)
    if not started:
        die("skill %s was not loaded in this transcript" % a.skill)
    for line in lines[: a.limit]:
        print(line)
    if len(lines) > a.limit:
        print("... %d more events cut (raise --limit)" % (len(lines) - a.limit))


# ---------------------------------------------------------------- brief-check

BRIEF_KEYS = ("skill", "skill_path", "skill_sha", "session", "source", "asked_by_user")
BRIEF_SECTIONS = ("## Goal", "## Events", "## Suspected cause", "## What would have helped")


def parse_front(text):
    m = re.match(r"---\n(.*?)\n---\n", text, re.S)
    if not m:
        return None, text
    fm = {}
    for line in m.group(1).splitlines():
        if ":" in line:
            k, v = line.split(":", 1)
            fm[k.strip()] = v.split("#")[0].strip()
    return fm, text[m.end():]


def check_brief(text):
    issues = []
    fm, body = parse_front(text)
    if fm is None:
        return ["no frontmatter"], None
    for k in BRIEF_KEYS:
        if k not in fm or fm[k] == "":
            issues.append("frontmatter lacks " + k)
    if fm.get("source") not in ("author", "reconstructed"):
        issues.append("source must be author or reconstructed")
    if len(text.splitlines()) > 60:
        issues.append("more than 60 lines")
    events = re.findall(r"^E\d+ \|", body, re.M)
    if not events:
        issues.append("no events")
    if len(events) > 8:
        issues.append("more than 8 events")
    for s in BRIEF_SECTIONS:
        if s not in body:
            issues.append("missing section " + s)
    issues += ["secret: " + i for i in secret_issues(text)]
    return issues, fm


def cmd_brief_check(a):
    text = Path(a.file).read_text(encoding="utf-8")
    issues, fm = check_brief(text)
    saved = None
    if not issues and a.save:
        d = rsi_home() / "briefs"
        d.mkdir(parents=True, exist_ok=True)
        saved = d / ("%s-%s-%s.md" % (datetime.date.today().isoformat(), fm["skill"], fm["session"]))
        saved.write_text(text, encoding="utf-8")
    out({"ok": not issues, "issues": issues, "saved": str(saved) if saved else None})
    sys.exit(0 if not issues else 1)


# ---------------------------------------------------------------- ledger

def ledger_path():
    return rsi_home() / "ledger.jsonl"


def read_ledger():
    p = ledger_path()
    if not p.exists():
        return []
    rows = []
    for line in p.read_text(encoding="utf-8").splitlines():
        try:
            rows.append(json.loads(line))
        except ValueError:
            continue
    return rows


def write_ledger(rows):
    p = ledger_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(".tmp")
    tmp.write_text("".join(json.dumps(r, ensure_ascii=False, sort_keys=True) + "\n" for r in rows), encoding="utf-8")
    os.replace(str(tmp), str(p))


def append_ledger(row):
    p = ledger_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    with open(p, "a", encoding="utf-8") as fh:
        fh.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")


def finding_key(r):
    return (r.get("skill"), r.get("subtype"), r.get("anchor"))


def findings(rows):
    return [r for r in rows if "event" not in r]


def gate(rows, new):
    """Return (passed, reason). `rows` already holds `new`."""
    if new["verdict"] not in EDIT_VERDICTS:
        return False, "verdict %s never edits a skill" % new["verdict"]
    if new["severity"] == "high":
        return True, "severity high"
    sessions = {r["session"] for r in findings(rows)
                if finding_key(r) == finding_key(new) and r["verdict"] in EDIT_VERDICTS}
    if len(sessions) >= 2:
        return True, "seen in %d sessions" % len(sessions)
    return False, "seen in %d session" % len(sessions)


def cmd_ledger(a):
    rows = read_ledger()
    if a.action == "add":
        if a.verdict not in VERDICTS:
            die("verdict must be one of " + ", ".join(VERDICTS))
        if a.severity not in ("low", "med", "high"):
            die("severity must be low, med or high")
        fid = hashlib.sha1("|".join([a.skill, a.subtype, a.anchor, a.session]).encode()).hexdigest()[:8]
        existing = [r for r in findings(rows) if r.get("id") == fid]
        if existing:
            out({"id": fid, "duplicate": True, "status": existing[0]["status"], "gate": existing[0]["status"] != "logged"})
            return
        row = {"id": fid, "ts": now(), "skill": a.skill, "skill_sha": a.skill_sha or "", "session": a.session,
               "verdict": a.verdict, "subtype": a.subtype, "anchor": a.anchor, "severity": a.severity,
               "evidence": a.evidence, "status": "logged", "target": "skill"}
        rows.append(row)
        passed, reason = gate(rows, row)
        if passed:
            row["status"] = "proposed"
            # earlier logged rows of the same key join the proposal
            for r in findings(rows):
                if finding_key(r) == finding_key(row) and r["status"] == "logged" and r["verdict"] in EDIT_VERDICTS:
                    r["status"] = "proposed"
        write_ledger(rows)
        out({"id": fid, "duplicate": False, "gate": passed, "reason": reason, "status": row["status"]})
    elif a.action == "load":
        append_ledger({"event": "load", "ts": now(), "skill": a.skill, "session": a.session})
        out({"ok": True})
    elif a.action == "set":
        if a.status not in STATUSES:
            die("status must be one of " + ", ".join(STATUSES))
        hit = [r for r in findings(rows) if r.get("id") == a.id]
        if not hit:
            die("no finding with id " + a.id)
        hit[0]["status"] = a.status
        write_ledger(rows)
        out({"id": a.id, "status": a.status})
    elif a.action == "list":
        for r in rows:
            if a.skill and r.get("skill") != a.skill:
                continue
            print(json.dumps(r, ensure_ascii=False, sort_keys=True))
    elif a.action == "measure":
        applies = [r for r in rows if r.get("event") == "apply" and r["skill"] == a.skill]
        if not applies:
            die("no applied change for " + a.skill)
        ap = applies[-1]
        fixed = [r for r in findings(rows) if r["id"] in ap.get("findings", [])]
        keys = {finding_key(r) for r in fixed}
        later = [r for r in rows if r["skill"] == a.skill and r["ts"] >= ap["ts"] and r.get("event") in (None, "load")
                 and r.get("session") not in {f["session"] for f in fixed}]
        sessions = []
        for r in later:
            if r["session"] not in sessions:
                sessions.append(r["session"])
        window = sessions[:5]
        recur = sorted({r["session"] for r in later if "event" not in r and finding_key(r) in keys and r["session"] in window})
        out({"skill": a.skill, "applied": ap["ts"], "sessions_seen": len(window), "window": 5,
             "recurred_in": recur, "advice": "propose revert or another fix" if recur else
             ("keep" if len(window) >= 5 else "keep watching")})


# ---------------------------------------------------------------- candidate, diff, apply, rollback

def cmd_candidate(a):
    src = real_skill(a.skill_dir)
    name = src.name
    cid = a.id or stamp()
    dst = rsi_home() / "candidates" / name / cid
    if dst.exists():
        die("candidate exists: %s" % dst)
    dst.parent.mkdir(parents=True, exist_ok=True)
    copy_tree(src, dst)
    out({"candidate": str(dst), "base_sha": tree_sha(src)})


def tree_diff(old, new):
    old_files = {str(r): p for r, p in iter_files(old)}
    new_files = {str(r): p for r, p in iter_files(new)}
    chunks = []
    added = removed = 0
    for rel in sorted(set(old_files) | set(new_files)):
        a_txt = old_files[rel].read_text(encoding="utf-8", errors="replace").splitlines(True) if rel in old_files else []
        b_txt = new_files[rel].read_text(encoding="utf-8", errors="replace").splitlines(True) if rel in new_files else []
        if a_txt == b_txt:
            continue
        for ln in difflib.unified_diff(a_txt, b_txt, "a/" + rel, "b/" + rel):
            chunks.append(ln if ln.endswith("\n") else ln + "\n")
            if ln.startswith("+") and not ln.startswith("+++"):
                added += 1
            elif ln.startswith("-") and not ln.startswith("---"):
                removed += 1
    return "".join(chunks), added, removed


def cmd_diff(a):
    old = real_skill(a.skill_dir)
    new = Path(os.path.expanduser(a.candidate_dir)).resolve()
    text, added, removed = tree_diff(old, new)
    sys.stdout.write(text)
    print("NET +%d -%d (net %+d lines)" % (added, removed, added - removed))


def cmd_apply(a):
    if not a.yes:
        die("apply needs --yes after gate 3 (the person approved this exact path)", 2)
    skill = real_skill(a.skill_dir)
    cand = Path(os.path.expanduser(a.candidate_dir)).resolve()
    home = rsi_home().resolve()
    if home / "candidates" not in cand.parents:
        die("candidate must live under %s" % (home / "candidates"))
    if not (cand / "SKILL.md").is_file():
        die("candidate has no SKILL.md")
    if home in skill.parents:
        die("skill path is inside RSI home")
    from_sha = tree_sha(skill)
    backup = home / "backups" / skill.name / stamp()
    backup.parent.mkdir(parents=True, exist_ok=True)
    copy_tree(skill, backup)
    replace_tree(cand, skill)
    new_sha = tree_sha(skill)
    ids = [x for x in (a.findings or "").split(",") if x]
    rows = read_ledger()
    for r in findings(rows):
        if r["id"] in ids:
            r["status"] = "applied"
    write_ledger(rows)
    append_ledger({"event": "apply", "id": "ap" + stamp()[-8:], "ts": now(), "skill": skill.name, "skill_path": str(skill),
                   "skill_sha": new_sha, "from_sha": from_sha, "backup": str(backup), "findings": ids})
    out({"applied": str(skill), "backup": str(backup), "skill_sha": new_sha,
         "note": "if the skill also lives in a repo, port the change there; RSI never commits"})


def cmd_rollback(a):
    skill = real_skill(a.skill_dir)
    rows = read_ledger()
    undone = {r.get("of") for r in rows if r.get("event") == "rollback"}
    applies = [r for r in rows if r.get("event") == "apply" and r.get("skill_path") == str(skill) and r["id"] not in undone]
    if not applies:
        die("no apply record to undo for %s" % skill)
    ap = applies[-1]
    now_sha = tree_sha(skill)
    if now_sha != ap["skill_sha"] and not a.force:
        die("skill changed since apply (now %s, recorded %s); someone edited it. Use --force to restore anyway" %
            (now_sha, ap["skill_sha"]), 3)
    backup = Path(ap["backup"])
    if not backup.is_dir():
        die("backup missing: %s" % backup)
    replace_tree(backup, skill)
    restored = tree_sha(skill)
    if restored != ap["from_sha"]:
        die("restored hash %s differs from the pre-apply hash %s" % (restored, ap["from_sha"]), 4)
    for r in findings(rows):
        if r["id"] in ap.get("findings", []):
            r["status"] = "reverted"
    write_ledger(rows)
    append_ledger({"event": "rollback", "of": ap["id"], "ts": now(), "skill": skill.name, "skill_sha": restored})
    out({"restored": str(skill), "skill_sha": restored, "forced": bool(a.force and now_sha != ap["skill_sha"])})


def cmd_sha(a):
    print(tree_sha(real_skill(a.skill_dir)))


# ---------------------------------------------------------------- guard (polisher PreToolUse hook)

SAFE_RSI = ("scan", "excerpt", "diff", "sha", "candidate")
READ_ONLY_CMDS = ("diff", "grep", "ls", "wc", "cat", "head", "tail")
SKILL_CREATOR_MODULES = ("run_eval", "run_loop", "aggregate_benchmark", "quick_validate", "generate_report")


def guard_decision(call):
    """Return None to allow, or a reason string to block."""
    import shlex
    tool = call.get("tool_name", "")
    inp = call.get("tool_input") or {}
    cand = (rsi_home() / "candidates").resolve()
    if tool in ("Write", "Edit", "NotebookEdit"):
        target = inp.get("file_path") or inp.get("notebook_path") or ""
        if not target:
            return "no file path"
        real = Path(os.path.expanduser(target)).resolve()
        if cand in real.parents:
            return None
        return "write outside %s: %s" % (cand, real)
    if tool == "Bash":
        cmd = str(inp.get("command", "")).strip()
        if re.search(r"[;&|`$<>\n]", cmd):
            return "shell operators are not allowed"
        try:
            argv = shlex.split(cmd)
        except ValueError:
            return "unparseable command"
        if not argv:
            return "empty command"
        if argv[0] in READ_ONLY_CMDS:
            return None
        if argv[0] == "cd" and len(argv) == 2:
            return None
        if argv[0] != "python3":
            return "command not allowed: " + argv[0]
        rest = [x for x in argv[1:] if x != "-I"]
        if rest[:1] == ["-m"] and len(rest) >= 2 and rest[1] in ["scripts." + m for m in SKILL_CREATOR_MODULES]:
            return None
        if rest:
            script = Path(os.path.expanduser(rest[0])).resolve()
            if script == Path(__file__).resolve():
                sub = rest[1] if len(rest) > 1 else ""
                if sub in SAFE_RSI or (sub == "ledger" and rest[2:3] in (["list"], ["measure"])):
                    return None
                return "rsi.py %s is reserved for the main session" % sub
            if script.name in ("quick_validate.py",) and script.parent.name == "scripts" and script.parent.parent.name == "skill-creator":
                return None
        return "python call not allowed"
    return None


def cmd_guard(_a):
    try:
        call = json.load(sys.stdin)
    except ValueError:
        print("rsi guard: unreadable hook input, blocking", file=sys.stderr)
        sys.exit(2)
    reason = guard_decision(call)
    if reason:
        print("rsi guard: " + reason, file=sys.stderr)
        sys.exit(2)


# ---------------------------------------------------------------- self-check

def _jl(rows):
    return "".join(json.dumps(r) + "\n" for r in rows)


def _use(skill):
    return {"type": "assistant", "message": {"content": [{"type": "tool_use", "name": "Skill", "input": {"skill": skill}}]}}


def _say(text):
    return {"type": "user", "message": {"content": text}}


def _call(name, inp):
    return {"type": "assistant", "message": {"content": [{"type": "tool_use", "name": name, "input": inp}]}}


def _res(err=False):
    return {"type": "user", "message": {"content": [{"type": "tool_result", "is_error": err, "content": "x"}]}}


def cmd_self_check(_a=None):
    import contextlib
    import io
    import subprocess
    problems = []

    def check(name, cond):
        if not cond:
            problems.append(name)

    tmp = Path(tempfile.mkdtemp(prefix="rsi-check-"))
    old_home = os.environ.get("RSI_HOME")
    os.environ["RSI_HOME"] = str(tmp / "home")
    try:
        cfg = load_config()
        check("config parses", bool(cfg["weights"]))
        # transcripts
        clean = tmp / "clean.jsonl"
        clean.write_text(_jl([_say("hazme un video"), _use("explain"), _call("Bash", {"command": "ls"}), _res(), _say("gracias")]))
        check("clean -> none", scan_transcript(str(clean), cfg)["verdict"] == "none")
        noskill = tmp / "noskill.jsonl"
        noskill.write_text(_jl([_say("no, eso no"), {"type": "user", "message": {"content": [{"type": "text", "text": "[Request interrupted by user]"}]}}]))
        check("no skill -> none", scan_transcript(str(noskill), cfg)["verdict"] == "none")
        bad = tmp / "bad.jsonl"
        bad.write_text(_jl([_say("hola"), _use("explain"), _say("ya te dije sketch"),
                            {"type": "user", "message": {"content": [{"type": "text", "text": "[Request interrupted by user]"}]}}]))
        r = scan_transcript(str(bad), cfg)
        check("interrupt + correction -> n1", r["verdict"] == "n1" and r["score"] >= 2)
        ask = tmp / "ask.jsonl"
        ask.write_text(_jl([_use("explain"), _say("mejora la skill explain, falló")]))
        check("explicit request -> n2", scan_transcript(str(ask), cfg)["verdict"] == "n2")
        retry = tmp / "retry.jsonl"
        retry.write_text(_jl([_use("x"), _call("Bash", {"command": "make a"}), _call("Bash", {"command": "make a"}),
                              _call("Bash", {"command": "make a"}), _res(True), _res(True)]))
        r = scan_transcript(str(retry), cfg)
        check("retry + errors -> n1", r["verdict"] == "n1" and r["signals"]["retry_loop"] and r["signals"]["error_burst"])
        junk = tmp / "junk.jsonl"
        junk.write_text("not json\n{{{\n")
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            cmd_scan(argparse.Namespace(transcript=str(junk)))
        check("junk fails soft to n1", json.loads(buf.getvalue())["verdict"] == "n1")
        # brief-check
        brief = ("---\nskill: demo\nskill_path: /x/demo\nskill_sha: a1b2c3d4e5f6\nsession: s1\nsource: author\nasked_by_user: false\n---\n"
                 "## Goal\nx\n\n## Events\nE1 | turn 2 | skill said: \"a\"\n   | happened: b\n   | user: \"c\"\n\n"
                 "## Suspected cause (a guess, not a verdict)\nx\n\n## What would have helped\nx\n")
        check("brief ok", check_brief(brief)[0] == [])
        check("brief refuses .env", any("secret" in i for i in check_brief(brief + "see /app/.env\n")[0]))
        check("brief refuses token", any("secret" in i for i in check_brief(brief + "key sk-abcdefghijklmnopqrstuvwx\n")[0]))
        check("brief refuses 9 events", any("8 events" in i for i in check_brief(brief + "".join("E%d | t | x\n" % i for i in range(2, 11)))[0]))
        # ledger gate
        a1 = argparse.Namespace(action="add", skill="demo", skill_sha="", session="s1", verdict="SKILL", subtype="ambiguous",
                                anchor="step 2", severity="med", evidence="E1")
        a2 = argparse.Namespace(**dict(vars(a1), session="s2"))
        with contextlib.redirect_stdout(io.StringIO()) as b1:
            cmd_ledger(a1)
        with contextlib.redirect_stdout(io.StringIO()) as b2:
            cmd_ledger(a2)
        check("first finding stays logged", json.loads(b1.getvalue())["gate"] is False)
        check("second session passes gate", json.loads(b2.getvalue())["gate"] is True)
        # apply / rollback
        skill = tmp / "skills" / "demo"
        (skill / "references").mkdir(parents=True)
        (skill / "SKILL.md").write_text("---\nname: demo\ndescription: d\n---\nold\n")
        (skill / "references" / "a.md").write_text("a\n")
        link = tmp / "link"
        link.symlink_to(skill)
        before = tree_sha(skill)
        with contextlib.redirect_stdout(io.StringIO()) as bc:
            cmd_candidate(argparse.Namespace(skill_dir=str(link), id="c1"))
        cand = Path(json.loads(bc.getvalue())["candidate"])
        (cand / "SKILL.md").write_text("---\nname: demo\ndescription: d\n---\nnew\n")
        (cand / "references" / "a.md").unlink()
        with contextlib.redirect_stdout(io.StringIO()) as bd:
            cmd_diff(argparse.Namespace(skill_dir=str(link), candidate_dir=str(cand)))
        check("diff shows net", "NET +1 -3" in bd.getvalue() or "NET +1 -2" in bd.getvalue())
        with contextlib.redirect_stdout(io.StringIO()) as ba:
            cmd_apply(argparse.Namespace(skill_dir=str(link), candidate_dir=str(cand), yes=True, findings=""))
        rec = json.loads(ba.getvalue())
        check("backup exists", Path(rec["backup"], "SKILL.md").is_file())
        check("apply changed skill", (skill / "SKILL.md").read_text().endswith("new\n") and not (skill / "references" / "a.md").exists())
        check("skill_sha recorded", any(r.get("event") == "apply" and r["skill_sha"] == rec["skill_sha"] for r in read_ledger()))
        (skill / "SKILL.md").write_text("manual edit\n")
        try:
            with contextlib.redirect_stderr(io.StringIO()):
                cmd_rollback(argparse.Namespace(skill_dir=str(link), force=False))
            check("rollback refuses after edit", False)
        except SystemExit as e:
            check("rollback refuses after edit", e.code == 3)
        (skill / "SKILL.md").write_text("---\nname: demo\ndescription: d\n---\nnew\n")
        with contextlib.redirect_stdout(io.StringIO()):
            cmd_rollback(argparse.Namespace(skill_dir=str(link), force=False))
        check("rollback restores bytes", tree_sha(skill) == before and (skill / "references" / "a.md").read_text() == "a\n")
        # polisher guard
        me = str(Path(__file__).resolve())
        cdir = Path(os.environ["RSI_HOME"]) / "candidates"
        w = lambda path: guard_decision({"tool_name": "Write", "tool_input": {"file_path": str(path)}})
        check("guard allows candidate write", w(cdir / "demo" / "c1" / "SKILL.md") is None)
        check("guard blocks outside write", w(tmp / "x.md") is not None)
        check("guard blocks traversal", w(cdir / ".." / "x.md") is not None)
        (tmp / "evil").symlink_to(tmp / "skills")
        (cdir).mkdir(parents=True, exist_ok=True)
        (cdir / "ln").symlink_to(tmp / "skills")
        check("guard blocks symlink escape", w(cdir / "ln" / "demo" / "SKILL.md") is not None)
        b = lambda c: guard_decision({"tool_name": "Bash", "tool_input": {"command": c}})
        check("guard allows rsi diff", b("python3 -I %s diff a b" % me) is None)
        check("guard blocks rsi apply", b("python3 -I %s apply a b --yes" % me) is not None)
        check("guard blocks ledger add", b("python3 -I %s ledger add --skill x" % me) is not None)
        check("guard blocks redirect", b("diff a b > /tmp/x") is not None)
        check("guard blocks rm", b("rm -rf x") is not None)
        # zero footprint in cwd: the script, run in a fresh dir, leaves it empty
        wd = tmp / "cwd"
        wd.mkdir()
        subprocess.run([sys.executable, "-I", str(Path(__file__).resolve()), "scan", str(clean)], cwd=str(wd),
                       env={"RSI_HOME": str(tmp / "h2"), "PATH": os.environ.get("PATH", "")}, stdout=subprocess.DEVNULL, check=False)
        check("cwd stays empty", not list(wd.iterdir()))
    except Exception as e:
        problems.append("exception: %r" % (e,))
    finally:
        if old_home is None:
            os.environ.pop("RSI_HOME", None)
        else:
            os.environ["RSI_HOME"] = old_home
        shutil.rmtree(tmp, ignore_errors=True)
    if problems:
        print("self-check FAILED: " + "; ".join(problems))
        return 1
    print("self-check ok")
    return 0


# ---------------------------------------------------------------- main

def build_parser():
    p = argparse.ArgumentParser(prog="rsi.py", description="Helper for the recursive-self-improvement skill.")
    p.add_argument("--self-check", action="store_true", help="run offline checks, exit 0 on pass")
    sub = p.add_subparsers(dest="cmd")
    s = sub.add_parser("scan", help="N0: score a Claude Code transcript, no model")
    s.add_argument("transcript")
    s.set_defaults(fn=cmd_scan)
    s = sub.add_parser("excerpt", help="print the events after a skill load, scrubbed")
    s.add_argument("transcript")
    s.add_argument("--skill", required=True)
    s.add_argument("--chars", type=int, default=240)
    s.add_argument("--limit", type=int, default=80)
    s.set_defaults(fn=cmd_excerpt)
    s = sub.add_parser("brief-check", help="validate a session brief and refuse secrets")
    s.add_argument("file")
    s.add_argument("--save", action="store_true", help="copy a valid brief to $RSI_HOME/briefs/")
    s.set_defaults(fn=cmd_brief_check)
    s = sub.add_parser("ledger", help="findings ledger and recurrence gate")
    ls = s.add_subparsers(dest="action", required=True)
    x = ls.add_parser("add")
    for f in ("skill", "session", "verdict", "subtype", "anchor", "severity", "evidence"):
        x.add_argument("--" + f, required=True)
    x.add_argument("--skill-sha", default="")
    x = ls.add_parser("load")
    x.add_argument("--skill", required=True)
    x.add_argument("--session", required=True)
    x = ls.add_parser("set")
    x.add_argument("id")
    x.add_argument("status")
    x = ls.add_parser("list")
    x.add_argument("--skill")
    x = ls.add_parser("measure")
    x.add_argument("skill")
    s.set_defaults(fn=cmd_ledger)
    s = sub.add_parser("candidate", help="copy a skill into $RSI_HOME/candidates/<skill>/<id>/")
    s.add_argument("skill_dir")
    s.add_argument("--id")
    s.set_defaults(fn=cmd_candidate)
    s = sub.add_parser("diff", help="unified diff skill vs candidate, with the net line count")
    s.add_argument("skill_dir")
    s.add_argument("candidate_dir")
    s.set_defaults(fn=cmd_diff)
    s = sub.add_parser("apply", help="gate 3: back up, write the candidate, record the hash")
    s.add_argument("skill_dir")
    s.add_argument("candidate_dir")
    s.add_argument("--yes", action="store_true")
    s.add_argument("--findings", help="comma-separated finding ids to mark applied")
    s.set_defaults(fn=cmd_apply)
    s = sub.add_parser("rollback", help="restore the backup of the last apply")
    s.add_argument("skill_dir")
    s.add_argument("--force", action="store_true")
    s.set_defaults(fn=cmd_rollback)
    s = sub.add_parser("guard", help="PreToolUse hook of rsi-polisher: reads the hook JSON on stdin, exit 2 blocks")
    s.set_defaults(fn=cmd_guard)
    s = sub.add_parser("sha", help="print the 12-character hash of a skill folder")
    s.add_argument("skill_dir")
    s.set_defaults(fn=cmd_sha)
    return p


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    p = build_parser()
    a = p.parse_args(argv)
    if a.self_check:
        sys.exit(cmd_self_check())
    if not a.cmd:
        p.print_help()
        sys.exit(2)
    a.fn(a)


if __name__ == "__main__":
    main()
