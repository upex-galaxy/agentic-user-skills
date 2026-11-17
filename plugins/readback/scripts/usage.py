#!/usr/bin/env python3
"""ElevenLabs credit tracking for the readback footer.

Commands (data dir from READBACK_DATA_DIR):
  record <chars>   add the cost of one generation to the local monthly total
  refresh          ask ElevenLabs for the real usage (throttled to once per 5 minutes)
  footer           print the Stop-hook JSON with the one-line footer, or nothing

The footer is a Stop-hook `systemMessage`: it is shown to the user and never
enters the model's context. It is built from the cache, so it costs no request
and is one reply behind at most.

Real numbers come from GET /v1/user/subscription. A restricted key without the
user permission gets 401/403 there; then the footer falls back to what readback
itself spent this month (the `character-cost` header of each generation).
Nothing here ever raises: a failure means no footer.
"""
import json
import os
import sys
import tempfile
import time
import urllib.request
from datetime import datetime, timezone

DATA_DIR = os.environ.get("READBACK_DATA_DIR", os.path.expanduser("~/.claude/readback-data"))
FILE = os.path.join(DATA_DIR, "usage.json")
THROTTLE = 300


def load():
    try:
        with open(FILE, "r", encoding="utf-8") as fh:
            return json.load(fh)
    except Exception:
        return {}


def save(d):
    try:
        os.makedirs(DATA_DIR, exist_ok=True)
        fd, tmp = tempfile.mkstemp(dir=DATA_DIR, prefix="usage-", suffix=".tmp")
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump(d, fh)
        os.replace(tmp, FILE)
    except OSError:
        pass


def month():
    return datetime.now(timezone.utc).strftime("%Y-%m")


def record(chars):
    d = load()
    if d.get("month") != month():
        d["month"] = month()
        d["local_chars"] = 0
    d["local_chars"] = int(d.get("local_chars", 0)) + int(chars)
    save(d)


def refresh():
    key = os.environ.get("ELEVENLABS_API_KEY") or os.environ.get("CLAUDE_PLUGIN_OPTION_ELEVENLABS_API_KEY")
    if not key:
        return
    d = load()
    if time.time() - float(d.get("checked", 0)) < THROTTLE:
        return
    checked = time.time()
    req = urllib.request.Request(
        "https://api.elevenlabs.io/v1/user/subscription",
        headers={"xi-api-key": key, "Accept": "application/json"},
    )
    d = {}
    try:
        with urllib.request.urlopen(req, timeout=8) as r:
            s = json.load(r)
        d["used"] = int(s.get("character_count", 0))
        d["limit"] = int(s.get("character_limit", 0))
        d["reset"] = s.get("next_character_count_reset_unix")
        d["tier"] = s.get("tier")
        d.pop("sub_error", None)
    except urllib.error.HTTPError as e:
        d["sub_error"] = e.code
    except Exception:
        d["sub_error"] = "net"
    # The request can take seconds: re-read, so a record() from another session is not lost.
    cur = load()
    cur.update({k: v for k, v in d.items()})
    if "sub_error" not in d:
        cur.pop("sub_error", None)
    cur["checked"] = checked
    save(cur)


def fmt(n):
    return f"{int(n):,}"


def footer():
    d = load()
    stale = d.get("reset") and int(d["reset"]) < time.time()
    if d.get("used") is not None and d.get("limit") and not stale:
        pct = round(100 * d["used"] / d["limit"])
        msg = f"readback · ElevenLabs {fmt(d['used'])} / {fmt(d['limit'])} chars ({pct}%)"
        if d.get("reset"):
            try:
                when = datetime.fromtimestamp(int(d["reset"]), timezone.utc).strftime("%b %d")
                msg += f" · resets {when}"
            except Exception:
                pass
    elif d.get("local_chars") and d.get("month") == month():
        msg = f"readback · ElevenLabs about {fmt(d['local_chars'])} chars used by readback this month"
        if d.get("sub_error") in (401, 403):
            msg += " (key has no permission to read the account total)"
    else:
        return
    sys.stdout.write(json.dumps({"systemMessage": msg}, ensure_ascii=False))


if __name__ == "__main__":
    try:
        cmd = sys.argv[1] if len(sys.argv) > 1 else ""
        if cmd == "record" and len(sys.argv) > 2 and sys.argv[2].strip().isdigit():
            record(sys.argv[2].strip())
        elif cmd == "refresh":
            refresh()
        elif cmd == "footer":
            footer()
    except Exception:
        pass
