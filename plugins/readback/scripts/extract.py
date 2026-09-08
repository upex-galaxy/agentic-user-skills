#!/usr/bin/env python3
"""Extract the spoken line from the assistant's last message.

Reads the hook payload on stdin, prints the text to speak, or nothing.
Exiting silently is always a valid outcome: no failure in here may ever
interrupt the session.

Two sources, in order:
  1. `last_assistant_message` in the payload (Claude Code and Codex both
     provide it, so this path is host-agnostic).
  2. The session transcript on disk (Claude Code only). Fallback for the
     case where the field is absent.
"""
import json
import os
import re
import sys

PLUGIN_ROOT = os.environ.get("READBACK_PLUGIN_ROOT", os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA_DIR = os.environ.get("READBACK_DATA_DIR", os.path.expanduser("~/.claude/readback-data"))
MAX_CHARS = int(os.environ.get("READBACK_MAX_CHARS", "1200"))

# Marker: a markdown quote whose first line starts with the speaker emoji.
MARK = re.compile(r"^>\s*\U0001F50A\s*(.*)$")
QUOTE = re.compile(r"^>\s?(.*)$")


def payload():
    try:
        return json.load(sys.stdin)
    except Exception:
        return {}


def transcript_path(d):
    p = d.get("transcript_path")
    if p and os.path.exists(p):
        return p
    sid = d.get("session_id") or d.get("sessionId")
    if not sid:
        return None
    root = os.path.expanduser("~/.claude/projects")
    for dirpath, _, _ in os.walk(root):
        cand = os.path.join(dirpath, sid + ".jsonl")
        if os.path.exists(cand):
            return cand
    return None


def from_transcript(path):
    """Last message from the main agent, never from a subagent."""
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as fh:
            lines = fh.readlines()
    except OSError:
        return ""
    for raw in reversed(lines[-400:]):
        try:
            d = json.loads(raw)
        except Exception:
            continue
        if d.get("type") != "assistant" or d.get("isSidechain"):
            continue
        blocks = d.get("message", {}).get("content", [])
        chunks = [
            b.get("text", "")
            for b in blocks
            if isinstance(b, dict) and b.get("type") == "text"
        ]
        text = "\n".join(c for c in chunks if c.strip())
        if text.strip():
            return text
    return ""


def assistant_message(d):
    """The payload field first; the transcript only if it is missing."""
    direct = d.get("last_assistant_message")
    if isinstance(direct, str) and direct.strip():
        return direct
    path = transcript_path(d)
    return from_transcript(path) if path else ""


def spoken_line(text):
    """Take the marked quote and flatten it into plain prose."""
    lines = text.splitlines()
    start = None
    for i, line in enumerate(lines):
        if MARK.match(line.strip()):
            start = i  # keep the last occurrence
    if start is None:
        return ""

    out = [MARK.match(lines[start].strip()).group(1)]
    for line in lines[start + 1:]:
        m = QUOTE.match(line.strip())
        if not m:
            break
        out.append(m.group(1))

    said = " ".join(part.strip() for part in out if part.strip())
    said = re.sub(r"`([^`]*)`", r"\1", said)        # backticks
    said = re.sub(r"\*\*([^*]*)\*\*", r"\1", said)  # bold
    said = re.sub(r"\s+", " ", said).strip()
    return said[:MAX_CHARS]


def load_rules():
    """Base map shipped with the plugin, plus the user's own additions.

    The user's file lives in the persistent data directory, so it survives
    plugin updates. Its rules are applied last and win on conflict.
    """
    rules = []
    for path in (
        os.path.join(PLUGIN_ROOT, "config", "pronunciation.txt"),
        os.path.join(DATA_DIR, "pronunciation.txt"),
    ):
        try:
            with open(path, "r", encoding="utf-8") as fh:
                lines = fh.readlines()
        except OSError:
            continue
        for line in lines:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            parts = re.split(r"\s{2,}|\t", line, maxsplit=1)
            if len(parts) != 2:
                continue
            src, dst = parts[0].strip(), parts[1].strip()
            if src and dst:
                rules.append((src, dst))
    return rules


def pronunciation(said):
    """Rewrite terms the speech engine mispronounces.

    A pure text layer: works the same with any TTS provider.
    """
    rules = load_rules()
    # Longest patterns first, so "merge request" beats "merge".
    rules.sort(key=lambda r: len(r[0]), reverse=True)
    for src, dst in rules:
        said = re.sub(
            r"(?<!\w)" + re.escape(src) + r"(?!\w)",
            dst, said, flags=re.IGNORECASE,
        )
    return said


def main():
    d = payload()
    sid = d.get("session_id") or d.get("sessionId")
    if not sid:
        return
    if not os.path.exists(os.path.join(DATA_DIR, "sessions", sid)):
        return  # voice is off for this session
    said = pronunciation(spoken_line(assistant_message(d)))
    if said:
        sys.stdout.write(said)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        pass
