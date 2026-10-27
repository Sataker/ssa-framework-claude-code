# Validate App (QA like a human)

Validates a web application by running it in a controlled browser and analysing the result the way a human QA would. Use it when the user asks to test or validate an app, page or flow ("validate my app", "check that the buttons work", "run QA on this site").

Two-layer architecture: a **deterministic crawler** (`tools/qa-crawl.js`) collects the facts, and **you** make the visual judgement.

## Setup (once per project)
- Requires **Chromium/Chrome**. Point to it with `CHROMIUM_PATH=/usr/bin/chromium` if it is not in the default location.
- Requires `playwright-core`: `npm install playwright-core` (or already in the project's dependencies).

## Steps
1. **Confirm the app URL** with the user (e.g. `https://my-app.com`).
2. **Run the crawler:**
   ```bash
   node tools/qa-crawl.js --url <URL> --max 25
   ```
   Options: `--max N` (how many buttons to click), `--no-mobile` (skip the mobile viewport).
3. **Read the report** at `reports/<host>_<timestamp>/report.md` — console errors, failed requests (4xx/5xx), broken links, problematic buttons, mobile overflow.
4. **Look at the screenshots** (`desktop-home.png`, `mobile-home.png`) with the Read tool (vision). Look for blank or unloaded sections, broken layout, cut-off or overlapping text, broken images, mobile overflow.
5. **Give the verdict**, classifying each finding.

## Output Format
- 🔴 **Broken** (fix): JS error, dead button, 404 link, 5xx request, section that doesn't load
- 🟡 **Suspicious** (check): empty block that may be video/lazy-load, odd layout
- 🟢 **OK:** what worked
End with an overall verdict: approved for deploy, or needs fixes.

## Rules
- Be honest about limits — you can miss things like a tired human. Point out what deserves a human look; don't claim 100%.
- A black/empty block in a screenshot can be: (a) a video that doesn't render headless (normal); (b) a scroll animation (the crawler already scrolls the page); (c) a real loading bug. Say which you suspect.
- Prioritise concrete bugs (console, failed request, broken link) over visual suspicions.
- For critical flows (login, payment, checkout), also recommend a fixed deterministic test — this QA complements it, it doesn't replace it.
- Record in memory (`MEMORY.md`) the recurring bugs this app tends to have, to speed up future validations.
