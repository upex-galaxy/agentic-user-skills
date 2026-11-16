#!/usr/bin/env python3
"""content-teardown: take a link apart into layers an agent can read.

Video links (YouTube, Reels, TikTok, Shorts) go through yt-dlp; image links
(carousels, photo posts) go through gallery-dl. The kind is detected per URL.

Levels (comma separated, default "transcript"):
  meta        title, description, uploader, duration, chapters, thumbnail (jpg)
  transcript  captions via yt-dlp, whisper-cli (local) as fallback
  video       the mp4 itself (<=720p)
  frames      frames sampled by the `watch` skill's local engine (needs video)
  audio       earshot listening timeline (sounds, not speech; needs video/audio)

Usage: content_teardown.py URL [URL...] [--levels meta,transcript] [--out DIR]
       [--browser-profile DIR] [--cookies FILE] [--whisper-model small]
       content_teardown.py --self-check
Image links ignore video levels and always run `images`: slides in images/ plus
caption.md (+ meta.json). The agent then reads each slide with its image reader.
Output: <out>/<id>/ with manifest.json; prints one JSON line per URL.
Default out dir: ~/.content-teardown (override with --out).
Instagram login profile: --browser-profile, else env CONTENT_TEARDOWN_PROFILE_DIR,
else ~/.content-teardown/.sessions/instagram (created with mode 700 when needed).
"""
import argparse, html, json, os, re, shutil, subprocess, sys, urllib.request
from pathlib import Path

WATCH = Path(os.environ.get("CONTENT_TEARDOWN_WATCH_SCRIPT") or Path.home() / ".agents/skills/watch/scripts/watch.py")
HOME_DIR = Path.home() / ".content-teardown"
DEFAULT_PROFILE = HOME_DIR / ".sessions" / "instagram"
PROFILE_ENV = "CONTENT_TEARDOWN_PROFILE_DIR"
MODELS = Path.home() / ".cache/whisper-cpp"
LEVELS = ["meta", "transcript", "video", "frames", "audio"]


def run(cmd, check=False, timeout=None, cwd=None):
    return subprocess.run(cmd, capture_output=True, text=True, check=check, timeout=timeout, cwd=cwd)


def ytdlp_base(a):
    base = ["yt-dlp", "--no-warnings", "--no-update"]
    if a.cookies:
        base += ["--cookies", a.cookies]
    elif a.cookies_from_browser:
        base += ["--cookies-from-browser", a.cookies_from_browser]
    return base


def srt_to_md(srt: str) -> str:
    """SRT -> '[mm:ss] text' lines. Auto-captions roll (each cue repeats the tail of the
    previous one), so strip the longest word overlap with the previous cue."""
    out, prev = [], []
    for block in re.split(r"\n\s*\n", srt.strip()):
        lines = [l for l in block.splitlines() if l.strip()]
        if len(lines) < 3:
            continue
        m = re.match(r"(\d+):(\d+):(\d+)", lines[1])
        if not m:
            continue
        h, mi, s = map(int, m.groups())
        words = " ".join(re.sub(r"<[^>]+>", "", l).strip() for l in lines[2:]).split()
        k = 0
        for n in range(min(len(prev), len(words)), 0, -1):
            if prev[-n:] == words[:n]:
                k = n
                break
        fresh = words[k:]
        prev = words
        if fresh:
            out.append(f"[{(h*60+mi):02d}:{s:02d}] " + " ".join(fresh))
    return "\n".join(out)


def do_meta(a, url, d, m):
    r = run(ytdlp_base(a) + ["--skip-download", "--dump-single-json", url])
    if r.returncode:
        return {"ok": False, "error": r.stderr.strip()[-400:]}
    info = json.loads(r.stdout)
    keep = {k: info.get(k) for k in ["id", "title", "description", "uploader", "channel", "upload_date",
            "duration", "view_count", "like_count", "comment_count", "webpage_url", "extractor_key",
            "chapters", "tags", "thumbnail"]}
    (d / "meta.json").write_text(json.dumps(keep, ensure_ascii=False, indent=2))
    run(ytdlp_base(a) + ["--skip-download", "--write-thumbnail", "--convert-thumbnails", "jpg",
                          "-o", str(d / "thumbnail.%(ext)s"), url])
    m["title"], m["duration"] = keep["title"], keep["duration"]
    return {"ok": True, "files": ["meta.json"] + (["thumbnail.jpg"] if (d / "thumbnail.jpg").exists() else [])}


def get_media(a, url, d):
    """Audio-capable file shared by transcript fallback and audio level."""
    for ext in ("mp4", "mkv", "webm", "m4a", "mp3"):
        p = d / f"video.{ext}"
        if p.exists():
            return p
    return None


def do_video(a, url, d, m):
    r = run(ytdlp_base(a) + ["-f", "bv*[height<=720]+ba/b[height<=720]/b", "--merge-output-format", "mp4",
                              "-o", str(d / "video.%(ext)s"), url])
    p = get_media(a, url, d)
    if r.returncode or not p:
        return {"ok": False, "error": r.stderr.strip()[-400:]}
    return {"ok": True, "files": [p.name]}


def do_transcript(a, url, d, m):
    tdir = d / "_subs"
    tdir.mkdir(exist_ok=True)
    run(ytdlp_base(a) + ["--skip-download", "--write-subs", "--write-auto-subs", "--sub-langs", a.sub_langs,
                          "--sleep-subtitles", "2", "--convert-subs", "srt", "-o", str(tdir / "s.%(ext)s"), url])
    for v in sorted(tdir.glob("*.vtt")):  # --skip-download skips yt-dlp's own conversion
        if not v.with_suffix(".srt").exists():
            run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(v), str(v.with_suffix(".srt"))])
    srts = sorted(tdir.glob("*.srt"))
    # prefer manual captions over auto when both exist (auto files carry the same lang code, so keep first)
    if srts:
        txt = srt_to_md(srts[0].read_text(errors="ignore"))
        if txt.strip():
            (d / "transcript.md").write_text(txt)
            shutil.copy(srts[0], d / "transcript.srt")
            shutil.rmtree(tdir, ignore_errors=True)
            return {"ok": True, "source": f"captions:{srts[0].name}", "files": ["transcript.md", "transcript.srt"]}
    shutil.rmtree(tdir, ignore_errors=True)
    if a.no_whisper:
        return {"ok": False, "error": "no captions and --no-whisper"}
    model = MODELS / f"ggml-{a.whisper_model}.bin"
    if not (model.exists() and shutil.which("whisper-cli")):
        return {"ok": False, "error": f"no captions and whisper-cli/model missing ({model})"}
    src = get_media(a, url, d)
    tmp_audio = None
    if not src:
        tmp_audio = d / "_audio.%(ext)s"
        r = run(ytdlp_base(a) + ["-x", "--audio-format", "m4a", "-o", str(tmp_audio), url])
        src = d / "_audio.m4a"
        if not src.exists():
            return {"ok": False, "error": "audio download failed: " + r.stderr.strip()[-300:]}
    wav = d / "_audio16k.wav"
    run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(src), "-ar", "16000", "-ac", "1", str(wav)], check=True)
    r = run(["whisper-cli", "-m", str(model), "-f", str(wav), "-l", a.whisper_lang, "-osrt", "-of", str(d / "transcript")])
    wav.unlink(missing_ok=True)
    if tmp_audio:
        (d / "_audio.m4a").unlink(missing_ok=True)
    srt = d / "transcript.srt"
    if r.returncode or not srt.exists():
        return {"ok": False, "error": r.stderr.strip()[-400:]}
    (d / "transcript.md").write_text(srt_to_md(srt.read_text(errors="ignore")))
    return {"ok": True, "source": f"whisper-cli:{a.whisper_model}", "files": ["transcript.md", "transcript.srt"]}


def do_frames(a, url, d, m):
    if not WATCH.exists():
        return {"ok": False, "error": f"the `watch` skill is missing ({WATCH}). Install it, or set CONTENT_TEARDOWN_WATCH_SCRIPT to its watch.py"}
    v = get_media(a, url, d)
    if not v:
        return {"ok": False, "error": "frames needs the video level"}
    fdir = d / "frames"
    r = run(["python3", str(WATCH), str(v), "--engine", "local", "--no-whisper", "--detail", a.detail,
             "--out-dir", str(fdir)], timeout=900)
    (d / "frames_report.md").write_text(r.stdout)
    return {"ok": r.returncode == 0, "files": ["frames_report.md", "frames/"], "error": r.stderr.strip()[-300:] if r.returncode else None}


def do_audio(a, url, d, m):
    if not shutil.which("earshot"):
        return {"ok": False, "error": "earshot not installed (uv tool install \"earshot[mcp] @ git+https://github.com/Leonxlnx/earshot\")"}
    v = get_media(a, url, d)
    if not v:
        return {"ok": False, "error": "audio level needs the video level"}
    r = run(["earshot", "timeline", str(v), "--out", str(d / "audio_timeline.json")], timeout=900)
    (d / "audio_timeline.txt").write_text(r.stdout)
    return {"ok": r.returncode == 0, "files": ["audio_timeline.txt", "audio_timeline.json"], "error": r.stderr.strip()[-300:] if r.returncode else None}


def gdl_auth(a):
    if a.cookies:
        return ["--cookies", a.cookies]
    if a.cookies_from_browser:
        return ["--cookies-from-browser", a.cookies_from_browser]
    return []


def do_images(a, url, d, m):
    if not shutil.which("gallery-dl"):
        return {"ok": False, "error": "gallery-dl not installed (brew install gallery-dl)"}
    idir = d / "images"
    cmd = ["gallery-dl", "--write-metadata", "-d", str(idir)] + gdl_auth(a)
    r = run(cmd + [url], timeout=600)
    pics = sorted(p for p in idir.rglob("*") if p.is_file() and p.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp", ".gif", ".mp4"})
    if not pics:
        return {"ok": False, "error": (r.stderr or r.stdout).strip()[-400:] or "no images found"}
    metas = sorted(idir.rglob("*.json"))
    cap = ""
    if metas:
        try:
            j = json.loads(metas[0].read_text())
            cap = next((j[k] for k in ("description", "caption", "content", "title", "text") if isinstance(j.get(k), str) and j.get(k)), "")
            keep = {k: j.get(k) for k in ("username", "fullname", "owner", "date", "likes", "count", "post_url", "shortcode", "category") if k in j}
            (d / "meta.json").write_text(json.dumps(keep, ensure_ascii=False, indent=2, default=str))
        except Exception:
            pass
    (d / "caption.md").write_text(cap or "(no caption found)")
    return {"ok": True, "count": len(pics), "files": ["caption.md", "meta.json"] + [str(p.relative_to(d)) for p in pics]}


IG_JS = """(async()=>{const u=new Map();const g=()=>document.querySelectorAll('article img, main img').forEach(i=>{if(i.naturalWidth>=1000&&/fbcdn|cdninstagram/.test(i.src))u.set(i.src,1)});for(let k=0;k<20;k++){g();const b=[...document.querySelectorAll('button[aria-label]')].find(x=>/^(Next|Siguiente)$/i.test(x.getAttribute('aria-label')));if(!b)break;b.click();await new Promise(r=>setTimeout(r,900))}g();return JSON.stringify([...u.keys()])})()"""


def ig_caption(url):
    """The public embed page gives the caption (and slide 1) with no login."""
    try:
        emb = url.split("?")[0].rstrip("/") + "/embed/captioned/"
        h = urllib.request.urlopen(urllib.request.Request(emb, headers={"User-Agent": "Mozilla/5.0"}), timeout=30).read().decode("utf8", "ignore")
        c = re.search(r'class="Caption">(.*?)<div class="CaptionComments"', h, re.S).group(1)
        return html.unescape(re.sub(r"<[^>]+>", "", re.sub(r"<br\s*/?>", "\n", c))).strip()
    except Exception:
        return ""


def do_ig_browser(a, url, d, m):
    """Instagram carousels need a session. Drive a dedicated, already-logged-in Chrome
    profile with playwright-cli (Chrome decrypts its own cookies: no keychain prompt)."""
    if not shutil.which("playwright-cli"):
        return {"ok": False, "error": "playwright-cli not installed (bun add -g @playwright/cli); carousels need it"}
    sess = "content-teardown-ig"
    pc = lambda *x: run(["playwright-cli", f"-s={sess}", *x], timeout=180, cwd=str(d))
    try:
        # playwright-cli ties a session to its cwd: every call uses cwd=d
        r = pc("open", url, f"--profile={profile_dir(a)}", "--browser=chrome")
        loc = pc("eval", "location.href").stdout
        if "accounts/login" in loc or "challenge" in loc:
            return {"ok": False, "error": f"profile has no Instagram session (login page). Ask the user to log in once: playwright-cli open https://www.instagram.com --headed --browser=chrome --profile={profile_dir(a)}. Never type credentials."}
        out = pc("eval", IG_JS).stdout
        line = out.split("### Result", 1)[1].strip().splitlines()[0]
        urls = json.loads(json.loads(line))
    except Exception as e:
        return {"ok": False, "error": f"browser recipe failed: {e}"}
    finally:
        pc("close")
    if not urls:
        return {"ok": False, "error": "no slides found in the page"}
    idir = d / "images"
    idir.mkdir(exist_ok=True)
    files = []
    for i, u in enumerate(urls, 1):
        f = idir / f"slide-{i:02d}.jpg"
        f.write_bytes(urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0"}), timeout=60).read())
        files.append(f"images/{f.name}")
    (d / "caption.md").write_text(ig_caption(url) or "(no caption found)")
    return {"ok": True, "via": "playwright-cli", "count": len(files), "files": ["caption.md"] + files}


def profile_dir(a) -> Path:
    """Instagram login profile: flag > env > default. Created with mode 700 (it holds cookies)."""
    p = Path(a.browser_profile or os.environ.get(PROFILE_ENV) or DEFAULT_PROFILE).expanduser()
    existed = p.exists()
    p.mkdir(mode=0o700, parents=True, exist_ok=True)
    if not existed:
        p.chmod(0o700)  # umask-proof; a folder that already exists keeps the mode its owner gave it
    return p


def plan_levels(requested, kind):
    """Levels to run for ONE url, plus a note. Works on a copy: one link never changes another's levels.
    Image links run `images`; `meta` stays (images writes meta.json); video-only levels are ignored."""
    lv = set(requested)
    if kind.startswith("images"):
        ignored = sorted(lv - {"meta"})
        note = f"video levels ignored for image links: {ignored}" if ignored else None
        return lv & {"meta"}, note
    return lv, None


STEPS = {"meta": do_meta, "video": do_video, "transcript": do_transcript, "frames": do_frames, "audio": do_audio}
ORDER = ["meta", "video", "transcript", "frames", "audio"]  # video before transcript so whisper reuses it


def self_check() -> int:
    """Offline checks (no network, no external tools). Exit 0 = all pass."""
    import argparse as _ap
    import tempfile
    fails = []

    def check(name, cond):
        print(("ok    " if cond else "FAIL  ") + name)
        if not cond:
            fails.append(name)

    srt = "1\n00:00:01,000 --> 00:00:02,000\nhello brave new\n\n2\n00:00:02,000 --> 00:00:03,000\nbrave new world\n"
    check("srt_to_md strips the rolling-caption overlap", srt_to_md(srt) == "[00:01] hello brave new\n[00:02] world")

    req = {"meta", "transcript"}
    check("image link keeps meta and drops video levels", plan_levels(req, "images")[0] == {"meta"})
    check("image link reports ignored levels", plan_levels(req, "images")[1] == "video levels ignored for image links: ['transcript']")
    batch = [plan_levels(req, k)[0] for k in ("images", "video", "images-browser", "video")]
    check("mixed batch: every video link keeps all requested levels", batch[1] == req and batch[3] == req)
    check("plan_levels does not mutate the requested set", req == {"meta", "transcript"})

    with tempfile.TemporaryDirectory() as t:
        chosen = Path(t) / "mine" / "ig"
        old = os.environ.pop(PROFILE_ENV, None)
        try:
            check("profile: flag wins over env", profile_dir(_ap.Namespace(browser_profile=str(chosen))) == chosen)
            os.environ[PROFILE_ENV] = str(Path(t) / "env-ig")
            check("profile: env used when no flag", profile_dir(_ap.Namespace(browser_profile=None)) == Path(t) / "env-ig")
            check("profile dir is created with mode 700", (chosen.stat().st_mode & 0o777) == 0o700)
        finally:
            os.environ.pop(PROFILE_ENV, None)
            if old is not None:
                os.environ[PROFILE_ENV] = old
    print("RESULT: " + ("all checks passed" if not fails else f"{len(fails)} failed"))
    return 1 if fails else 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("urls", nargs="*")
    ap.add_argument("--self-check", action="store_true", help="run the offline self-check and exit")
    ap.add_argument("--levels", default="transcript")
    ap.add_argument("--out", default=str(HOME_DIR))
    ap.add_argument("--cookies-from-browser")
    ap.add_argument("--cookies")
    ap.add_argument("--browser-profile",
                    help=f"dedicated, logged-in Chrome profile dir for Instagram carousels (env {PROFILE_ENV}; default {DEFAULT_PROFILE})")
    ap.add_argument("--sub-langs", default="en-orig,es-orig,en,es")
    ap.add_argument("--whisper-model", default="small")
    ap.add_argument("--whisper-lang", default="auto")
    ap.add_argument("--no-whisper", action="store_true")
    ap.add_argument("--detail", default="balanced")
    a = ap.parse_args()
    if a.self_check:
        sys.exit(self_check())
    if not a.urls:
        ap.error("give at least one URL (or --self-check)")
    levels = {x.strip() for x in a.levels.split(",") if x.strip()}
    bad = levels - set(LEVELS)
    if bad:
        sys.exit(f"unknown levels: {bad}")
    if {"frames", "audio"} & levels:
        levels.add("video")
    for url in a.urls:
        r = run(ytdlp_base(a) + ["--skip-download", "--print", "%(extractor_key)s-%(id)s|%(duration)s|%(ext)s", url])
        kind = "video"
        first = r.stdout.strip().splitlines()[0].split("|") if r.stdout.strip() else []
        still = len(first) == 3 and first[1] in ("NA", "None") and first[2].lower() in {"jpg", "jpeg", "png", "webp", "gif"}
        if r.returncode or not first or still:
            if shutil.which("gallery-dl") and run(["gallery-dl", "-g"] + gdl_auth(a) + [url], timeout=120).stdout.strip():
                kind = "images"
                slug = re.sub(r"[^A-Za-z0-9]+", "-", re.sub(r"^https?://(www\.)?", "", url)).strip("-")[-70:]
            elif "instagram.com" in url:
                kind = "images-browser"
                slug = re.sub(r"[^A-Za-z0-9]+", "-", re.sub(r"^https?://(www\.)?", "", url)).strip("-")[-70:]
            else:
                print(json.dumps({"url": url, "ok": False, "error": r.stderr.strip()[-400:]}, ensure_ascii=False))
                continue
        else:
            slug = first[0]
        d = Path(a.out) / slug
        d.mkdir(parents=True, exist_ok=True)
        m = {"url": url, "kind": kind, "dir": str(d), "levels": {}}
        todo, note = plan_levels(levels, kind)  # per-URL copy: later links keep every requested level
        if kind.startswith("images"):
            m["levels"]["images"] = (do_ig_browser if kind == "images-browser" else do_images)(a, url, d, m)
            if note:
                m["note"] = note
            if "meta" in todo:
                m["levels"]["meta"] = ({"ok": True, "via": "images", "files": ["meta.json"]} if (d / "meta.json").exists()
                                       else do_meta(a, url, d, m))
            todo = set()
        for lv in ORDER:
            if lv in todo:
                m["levels"][lv] = STEPS[lv](a, url, d, m)
        (d / "manifest.json").write_text(json.dumps(m, ensure_ascii=False, indent=2))
        print(json.dumps(m, ensure_ascii=False))


if __name__ == "__main__":
    main()
