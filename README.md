# Wadjemup / Rottnest Island — Progress Agentic RAG demo

A high-fidelity mirror of rottnestisland.com's own visitor experience, with four real
Progress Agentic RAG (ARAG) features running invisibly underneath the Rottnest Island
Authority's own brand. Built for a live prospect evaluation (Rottnest Island Authority),
GM-approved 27 Aug 2026.

**Target personas (Standard B7):** ICT & Digitalisation Leader (a content-heavy,
personnel-light public authority wanting a defensible first AI use case, something real to
show stakeholders in weeks) and Marketing Professional / Digital Experience Owner (owns the
visitor-facing site, cares about conversion and brand-consistent answers on their own
content). The solution-architecture reveal on every page additionally serves the Solutions
Architect evaluator per gate 11.

## Live

- **Demo:** _fill in after `flyctl deploy`_ — `https://rottnest-island-arag.fly.dev`
- **Repo:** _fill in after `gh repo create`_
- **Knowledge Box:** `0bb3c24c-e8f7-4aca-9543-95b9c6d737f4`, AU zone
  (`aws-ap-southeast-2-1`), sanctioned account `86d1adc8-64ef-499b-86d6-72e9fd684ab0`. 189
  ingested resources, 166 clean after data hygiene (see below).

## The narrative — what to click, what to ask, the wow moment

1. **Home (`/`)** — the hero framing, plus a quick "Ask the island" box (try *"Where's the
   best spot to see quokkas?"*). Language pills switch EN/中文/日本語/FR for every ask box
   on the site.
2. **See & Do (`/see-do`)** — pick a traveller type (Family, Heritage, Active, Relaxation,
   First-time quokka spotter). The SAME 166 real pages re-rank instantly — pure `/find`
   retrieval, zero generation. Switch personas back and forth to show the re-rank is real,
   not a canned list.
3. **Stay (`/stay`)** — the accommodation catalogue. Real Nuclia-extracted thumbnails, and
   every hook/highlight/chip is generated live by ARAG reading that property's own page —
   point out that none of this copy is hand-typed.
4. **Plan Your Trip (`/plan`) — THE HERO.** Pick days + style + a constraint (try "no long
   walks"), hit **Build My Itinerary**. Every activity deep-links to a real Wadjemup page.
   This is the wow moment: **the real rottnestisland.com has no trip planner at all** — just
   a keyword search box — so this is a genuine capability upgrade, not a reskin. Use the
   **How this works** button (top right) to show the `/find`-then-enum-constrained-`/ask`
   pattern — the structural reason the model *cannot* invent a source, which is the whole
   credibility story for this feature.
5. **Learn (`/learn`)** — switch to 中文 or 日本語, ask a culture/history question, hit
   **Listen** on the answer to hear it narrated in a native voice (Magge for Mandarin, Garyu
   for Japanese, Virginie for French), not English reading a translation.
6. **Deals (`/deals`)** — offers and the Overnight Camp Subsidy program, grounded the same
   way. Ask something it genuinely can't answer (e.g. a made-up restaurant name) to show the
   honest, on-brand decline — never a blunt hardcoded refusal.
7. **Any citation** — click through to `/r/<id>`, the source viewer: the exact cited passage
   is highlighted and scrolled to automatically, with a link out to the real
   rottnestisland.com page.
8. **"How this works"** (top right, every route) — the solution-architecture reveal, unique
   per page, showing the real flow, what the page does, and why it matters. This is the one
   place ARAG branding and mechanics are shown deliberately.

## The four heroes — verified live against the real KB, not asserted

1. **Multilingual conversational interface.** EN/中文/日本語/FR, grounded in the same 166
   English-language pages, cited back to source. Trust signal is resolvable citations, not a
   raw REMi score — REMi under-scores non-English answers even when equally grounded
   (ZH/JA scored 0/5 in de-risk despite real citations), so a per-language number would
   falsely imply the Chinese/Japanese answers are less trustworthy.
2. **Persona re-ranking via `/find`.** Zero generation — five personas re-rank the real
   corpus by a persona-scoped semantic query.
3. **Grounded itinerary planner.** `/find` first for real candidate titles, then an
   `answer_json_schema` `/ask` with the source field constrained to an `enum` of exactly
   those titles — the model structurally cannot cite a page that doesn't exist. A bare
   free-text source field was proven to fabricate titles in de-risk; this pattern closes
   that gap.
4. **Language-matched voice.** `eleven_multilingual_v2`, native voice per language: David
   (EN, AU), Magge (ZH), Garyu (JA), Virginie (FR) — see `brand/voices.json` in the factory
   root.

## Data hygiene (do this before trusting the corpus)

The KB has 189 ingested resources. **23 are excluded from every retrieval call:**
- 17 "Just a moment..." Cloudflare-challenge junk pages.
- 6 genuine duplicate pairs (one id excluded per pair): The Lodge Wadjemup, Samphire
  Rottnest, Stay Rottnest Hostel & Dorms, Sitemap, Sustainability, Discovery Resorts — more
  duplicates than the original brief flagged (which named only The Lodge Wadjemup).

The clean 166-id allow-list lives in `data/all_resources.json` and is passed as
`resource_filters` on every `/find` and `/ask` call. `app.py` also cross-checks every
citation's resource id against this allow-list server-side as a backstop, per the
documented platform lesson that `/ask`'s `resource_filters` enforcement is weaker than
`/find`'s. `app.py` also filters a second, narrower allow-list (`CUSTOMER_FACING_IDS`) out
of nav/legal/admin pages (Sitemap, Contact Us, Trade Information, Privacy, Disclaimer,
Copyright, four narrow Overnight-Camp-Subsidy FAQ/T&C sub-pages) that are real, clean,
non-duplicate resources but never belong in a tourist-facing citation, suggestion, or
catalogue listing — used everywhere the KB is queried or a listing is rendered.

### Every ingested page opens with the site's own nav boilerplate — strip it, don't scroll past it

**A recurring ARAG-ingest pattern, not specific to this KB: a scraped page's extracted text
includes the site's own global chrome (skip link, alert banner, search widget, and — the
biggest chunk — the full multi-category mega menu) BEFORE the real article content.**
Confirmed byte-identical across 165 of this KB's 166 clean resources (real defect found live,
27 Aug 2026: a citation click-through opened on raw text like `Skip to main content... View
alerts... Open search... * See & Do`, with the real, correctly-highlighted content sitting
further down the page). An earlier fix relied on a delayed client-side `scrollIntoView` to
get past this, which is fragile — a screen recording or a fast viewer can land on the junk
before the scroll fires.

**Fix, in `app.py`:** `_strip_nav_boilerplate()` finds the exact end-of-mega-menu marker
(`"* [Deals](/deals)\n\nNeed to get in touch? [Contact us](/contact-us)\n\n"` — verified
present in 165/166 resources) and trims everything up to and including it before the text
ever reaches the client. `/api/resource/{id}` returns a `trim_offset` alongside the cleaned
text so a citation's paragraph offsets (computed by ARAG against the *original*, untrimmed
page) can be shifted onto the shorter text before slicing/highlighting — and
`_parse_ask_ndjson` (and the itinerary planner's own paragraph selection) drop any citation
whose grounding falls *entirely* inside the stripped junk, rather than offering a source
tile with no real highlight behind it.

**If this KB is ever reseeded, or a new one stood up against the same site:** re-verify the
marker still matches (`grep -c` it across a fresh `data/resource_cache.json` the same way —
see `scripts/build_resource_cache.py`) before assuming citations will render clean. A
different scrape pass, a site redesign, or a different source site entirely will very likely
need a different marker string.

## Content honesty — coverage gaps disclosed, not hidden

- **Dining:** no dedicated restaurant directory in the KB, but several itinerary/guide pages
  *do* name real venues (Pinky's, Sunsets, Geordie's Cafe, Kuld Creamery, HAVZA) in context —
  so the planner can legitimately recommend "dine at Sunsets" when that's what a real guide
  page says, but will honestly decline a direct question about a venue that isn't in the KB
  at all (verified live: asked about a fabricated "Aristos Waterfront Restaurant", got a
  warm, honest "I don't have that information" rather than an invented answer).
- **Tour operators:** no named third-party tour operators in the KB (Laura the Explorer Bike
  Tours is the one Rottnest-run exception that IS covered).
- **Accessibility:** one page in the KB. Thin coverage — the Visit page's honest-limits note
  discloses this.

The `rottnest-concierge` search configuration (registered on the KB, see `dam`/admin console)
carries the warm, on-brand system prompt for this honest-decline behaviour (Standard B22) —
the wording is configured on ARAG's own surface, not hardcoded in app copy, and the
underlying decline-rather-than-invent behaviour never changes.

## Architecture

```
Browser --> app.py (FastAPI proxy, this app's own server)
              |
              +--> ARAG /ask            (multilingual assistant, Deals, Visit, Learn)
              +--> ARAG /find           (See & Do persona re-rank, itinerary candidates)
              +--> ARAG /ask + schema   (itinerary planner, catalogue copy generation)
              +--> ARAG thumbnail proxy (real Nuclia-extracted preview images)
              +--> ElevenLabs TTS       (language-matched voice)
```

The KB service-account token (`KB_TOKEN` in `.env`) never reaches the browser — every ARAG
call is server-side in `app.py`. See the in-app "How this works" reveal on every route for
the page-specific version of this diagram.

## Local development

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env   # then fill in KB_URL / KB_TOKEN / ELEVENLABS_API_KEY
.venv/bin/python -m uvicorn app:app --reload
```

Rebuild the data caches if the KB content changes:

```bash
.venv/bin/python scripts/build_resource_cache.py     # title + real source URL + extracted text
.venv/bin/python scripts/generate_catalog_copy.py --resume   # DA-style catalogue copy (~5 min for 166 resources)
```

## 30-second reset

This demo has no mutable server-side state (no accounts, no saved itineraries — every view
is generated live from the KB per request), so "reset" is a fast integrity check rather than
a data purge:

```bash
.venv/bin/python seed.py            # verify KB, search config, caches (~5s)
.venv/bin/python seed.py --purge    # also rebuilds the resource cache from the live KB
```

If a live demo hiccups, run `seed.py` first — it tells you in five seconds whether the KB,
the search configuration, or a local cache file is the problem.

## Branding note

This demo uses Rottnest Island Authority's real palette and IA (See & Do / Stay / Visit /
Learn / Deals) but **no scraped photography or logo** — imagery is original SVG line-art in
the captured brand palette. If this build is ever repurposed for another prospect, the brand
system in `static/css/rottnest.css` and the copy throughout `static/pages/` must be swapped
first — this build is Rottnest-specific by name and design.
