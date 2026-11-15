---
name: research
description: Investigate a question against primary sources and save cited findings to a repo file. Use when a topic needs researching; docs or API facts need gathering; reading legwork should go to a background agent.
license: MIT
metadata:
  author: UPEX Galaxy
---

# Research

Source: https://github.com/mattpocock/skills (skills/engineering/research), MIT, (c) 2026 Matt Pocock. Adapted by UPEX Galaxy.

Start a **background agent** with a fresh context window to do the research, so you keep working while it reads. If your harness has no background agent, do the research yourself in a separate pass.

The agent's job:

1. Investigate the question against **primary sources** (official docs, source code, specs, first-party APIs). Follow every claim back to the source that owns it, not to a secondary write-up of it.
2. Write the findings to a single Markdown file, citing each claim's source.
3. Save the file where the repo already keeps such notes, matching the existing convention. If there is none, pick a sensible place and say where.

Done when the file exists, every claim carries a source, and the report names the file's path. A claim with no primary source goes in the file marked as unverified.
