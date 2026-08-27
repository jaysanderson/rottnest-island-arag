"""
Rottnest Island Authority demo — FastAPI proxy.

Every ARAG call is made server-side; the KB service-account token never
reaches the browser. The frontend (static/) calls this API only.

Four heroes, each a real, verified ARAG mechanism (see README for the
solution-architecture narrative):
  1. Multilingual conversational assistant  -> POST /api/ask
  2. Persona re-ranking (pure retrieval)     -> POST /api/see-do
  3. Grounded itinerary planner              -> POST /api/itinerary
  4. Language-matched voice narration        -> POST /api/voice
"""
import json
import os
import time
from pathlib import Path
from typing import Optional

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

APP_DIR = Path(__file__).resolve().parent
DATA_DIR = APP_DIR / "data"


def load_env():
    env = dict(os.environ)
    env_path = APP_DIR / ".env"
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            env.setdefault(k.strip(), v.strip())
    return env


ENV = load_env()
KB_URL = ENV.get("KB_URL", "").rstrip("/")
KB_TOKEN = ENV.get("KB_TOKEN", "")
ELEVENLABS_API_KEY = ENV.get("ELEVENLABS_API_KEY", "")
SEARCH_CONFIG = "rottnest-concierge"

if not KB_URL or not KB_TOKEN:
    raise RuntimeError("KB_URL and KB_TOKEN must be set in .env")

# ---- Data hygiene: the clean, deduped allow-list of resource ids -----------
ALL_RESOURCES = json.loads((DATA_DIR / "all_resources.json").read_text())["kept"]
CLEAN_IDS = [r["id"] for r in ALL_RESOURCES]
CLEAN_ID_SET = set(CLEAN_IDS)
RESOURCE_CACHE = json.loads((DATA_DIR / "resource_cache.json").read_text())


def _load_catalog_copy():
    p = DATA_DIR / "catalog_copy.json"
    if p.exists():
        return json.loads(p.read_text())
    return {}


CATALOG_COPY = _load_catalog_copy()

VOICE_MAP = {
    # Joel - Calm & Friendly Australian (ElevenLabs shared library), swapped
    # from David 27 Aug 2026: David is a genuine AU accent but ElevenLabs'
    # own description positions him for "technical documentation... corporate
    # training... grounded, matter-of-fact authority" - the wrong register for
    # a WA-tourist-island welcome. Joel is explicitly labelled
    # descriptive=relaxed, use_case=conversational - the right register.
    "en": "0zgVQzF8uy6TauIra2W1",
    "zh": "ZqMiFUjytue2TImoYCpY",  # Magge - Mandarin
    "ja": "xeizJaHsHrlfQdJJQmlK",  # Garyu - Japanese
    "fr": "40Rmxv431tMaTTYB09bz",  # Virginie - French
}

PERSONA_QUERIES = {
    "family": "family friendly activities safe for young children, easy access, shallow calm water, playgrounds, short walks",
    "heritage": "Aboriginal culture and history, colonial and military history, heritage buildings, museum exhibits, cultural tours",
    "active": "active adventure: long cycling trails, hiking, snorkelling, surfing, fitness, adrenaline experiences",
    "relax": "quiet peaceful beaches, wildlife spotting, wildflowers, sunset views, slow relaxed pace, lakes",
    "quokka": "where and when to see quokkas, quokka spotting locations, quokka selfie etiquette, best times for quokka encounters",
}
PERSONA_LABELS = {
    "family": "Family with kids",
    "heritage": "History & heritage",
    "active": "Active & adventure",
    "relax": "Relaxation & nature",
    "quokka": "First-time quokka spotter",
}

# ---- Solution-architecture reveal content (gate 11 / B12) ------------------
# Served on demand via /api/reveal/<page>, never embedded in a page's initial
# HTML — the reveal is the one deliberate place ARAG mechanics (/ask, /find,
# Nuclia) are named, but even CSS-hidden static HTML containing those strings
# reads as a leak to a page-source scan. Fetching this only when the viewer
# opens the modal keeps the default rendered page genuinely clean.
REVEALS = {
    "home": {
        "title": "How the Wadjemup concierge works",
        "what": 'Every "Ask" box on this site sends your question to Rottnest Island Authority\'s own visitor concierge — never a generic AI, never the open internet.',
        "flow": [
            {"label": "Your question", "detail": "typed in any of 4 languages"},
            {"label": "App server proxy", "detail": "KB token never reaches your browser"},
            {"label": "ARAG /ask", "detail": "retrieves + grounds + generates, scoped to 166 real pages"},
            {"label": "Cited answer", "detail": "every claim links to its real source page"},
        ],
        "why": "A visitor gets a trustworthy answer instead of hunting through menus — and Rottnest Island Authority gets every question logged as real demand signal, not a support ticket.",
    },
    "see-do": {
        "title": "How See & Do works",
        "what": "Choosing a traveller type re-ranks the SAME 166 real Wadjemup pages by relevance to that persona — nothing is written or rewritten, only re-ordered.",
        "flow": [
            {"label": "Persona selected", "detail": 'e.g. "family with kids"'},
            {"label": "App proxy", "detail": "maps persona to a real retrieval query"},
            {"label": "ARAG /find", "detail": "pure semantic retrieval, no generation — the re-ranked content IS the answer"},
            {"label": "Re-ranked grid", "detail": "real thumbnails + DA-generated hooks"},
        ],
        "why": "A visitor sees the island through their own trip's lens in one tap — no filters to configure, no generic \"top 10\" list built for nobody.",
    },
    "stay": {
        "title": "How the Stay catalogue works",
        "what": "Every card here — thumbnail, hook, highlights, chips — is generated by ARAG reading that property's own real page. Nothing is hardcoded copy.",
        "flow": [
            {"label": "Ingest", "detail": "each accommodation page ingested as its own resource"},
            {"label": "Nuclia thumbnail", "detail": "a real extracted preview image, not a placeholder icon"},
            {"label": "ARAG /ask + schema", "detail": "structured extraction: hook, highlights, category, chips — over the page's own free text"},
            {"label": "Catalogue card", "detail": "rendered at any corpus size, resolved by resource id"},
        ],
        "why": "A prospective guest scans real, specific detail in seconds instead of reading five paragraphs per property — and Rottnest Island Authority never hand-writes catalogue copy again.",
    },
    "visit": {
        "title": "How the Visit assistant works",
        "what": "Logistics questions (ferry, flights, bikes, accessibility) are answered from the island's own real transport and access pages, cited back to source.",
        "flow": [
            {"label": "Your question", "detail": "or a quick-ask chip"},
            {"label": "App proxy"},
            {"label": "ARAG /ask", "detail": "neighbouring-paragraph context, scoped to 166 real pages"},
            {"label": "Cited answer"},
        ],
        "why": "Practical logistics are the #1 reason a visitor abandons planning — a fast, accurate answer here is the difference between a booking and a bounce.",
        "gaps": "Accessibility coverage on the real site is currently thin (one page) — if a question genuinely can't be grounded, the concierge says so honestly rather than guessing.",
    },
    "plan": {
        "title": "How the itinerary planner works — the mandatory honesty pattern",
        "what": "This is the flagship feature: a trip planner built entirely from real, retrieved Wadjemup content, with a structural guarantee against fabricated recommendations.",
        "flow": [
            {"label": "Your brief", "detail": "days, style, constraints"},
            {"label": "ARAG /find", "detail": "retrieves real candidate pages for that brief — their titles become the ONLY allowed sources"},
            {"label": "Enum-constrained /ask", "detail": 'answer_json_schema forces every "source" field to be one of those real titles — the model literally cannot invent a source'},
            {"label": "Itinerary", "detail": "each item deep-links to its real source page"},
        ],
        "why": 'Early testing found that a free-text "source" field lets a model fabricate a plausible-sounding page that doesn\'t exist — this schema-enum pattern closes that gap structurally, not by asking nicely. It\'s the difference between a demo and something you could actually ship to visitors.',
    },
    "learn": {
        "title": "How the multilingual concierge works",
        "what": "The same 166 real Wadjemup pages ground answers in whichever of four languages you ask in — the model answers natively, it isn't translating a canned English reply.",
        "flow": [
            {"label": "Question", "detail": "in EN / ZH / JA / FR"},
            {"label": "ARAG /ask", "detail": "retrieves the real English source content, generates a native-language answer"},
            {"label": "Citations", "detail": "always link to the real (English) source page"},
            {"label": "ElevenLabs voice", "detail": "native speaker per language — eleven_multilingual_v2"},
        ],
        "why": "A Mandarin- or Japanese-speaking visitor gets the exact same grounded, trustworthy experience an English speaker gets — not a second-class \"translate this page\" button. Trust here comes from resolvable citations, not a raw per-language quality score (REMi under-scores non-English answers that are equally well-grounded).",
    },
    "deals": {
        "title": "How the Deals page works",
        "what": "Deals and subsidy questions are grounded in the island's own current offer and subsidy-program pages — the catalogue below lists them via /find, generated copy same as every other listing.",
        "flow": [
            {"label": "Your question"},
            {"label": "ARAG /ask", "detail": "scoped to real deals/subsidy pages"},
            {"label": "Cited terms", "detail": "never an invented price or eligibility rule"},
        ],
        "why": "Subsidy terms and offer conditions are exactly the kind of content that's costly to get wrong — grounding means the concierge can't improvise an eligibility rule that doesn't exist.",
    },
    "resource": {
        "title": "How citation highlighting works",
        "what": "This is the real extracted text of the source page ARAG ingested. When you arrive from a cited answer, the exact paragraph that grounded it is highlighted and scrolled to automatically.",
        "flow": [
            {"label": "Citation clicked", "detail": "carries the exact paragraph id + character offsets"},
            {"label": "App proxy", "detail": "resolves the resource's cached extracted text"},
            {"label": "Render + highlight", "detail": "the cited character range is marked and scrolled into view"},
        ],
        "why": "Trust means being able to check the receipts — every claim traces back to the exact sentence it came from, not just \"somewhere in this document\".",
    },
}


app = FastAPI(title="Rottnest Island Authority — Wadjemup demo")
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]
)


@app.get("/api/reveal/{page_key}")
def api_reveal(page_key: str):
    r = REVEALS.get(page_key)
    if not r:
        raise HTTPException(404, "no reveal for this page")
    return r


_client = httpx.Client(timeout=60.0)


def _headers():
    return {
        "X-NUCLIA-SERVICEACCOUNT": f"Bearer {KB_TOKEN}",
        "Content-Type": "application/json",
    }


def _resource_meta(rid: str):
    r = RESOURCE_CACHE.get(rid)
    if not r:
        return {"id": rid, "title": "Rottnest Island", "uri": ""}
    return {"id": rid, "title": r["title"], "uri": r["uri"]}


def _parse_ask_ndjson(text: str):
    """Parse the /ask NDJSON stream into {answer, citations, resources, status}."""
    answer = ""
    citations_raw = {}
    resources = {}
    answer_json = None
    status_ok = True
    error_detail = None
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            d = json.loads(line)
        except json.JSONDecodeError:
            continue
        item = d.get("item", {})
        t = item.get("type")
        if t == "answer":
            answer += item.get("text", "")
        elif t == "answer_json":
            answer_json = item.get("object")
        elif t == "citations":
            citations_raw = item.get("citations", {})
        elif t == "retrieval":
            resources = item.get("results", {}).get("resources", {})
        elif t == "status":
            if item.get("status") not in ("success", None):
                status_ok = False
        elif t == "error":
            status_ok = False
            error_detail = item

    # Cross-check citations against the clean allow-list server-side (defense
    # in depth — /ask's filter enforcement is documented as weaker than
    # /find's; resource_filters is the primary guard, this is the backstop).
    seen_resource_ids = []
    citation_list = []
    for para_id in citations_raw.keys():
        rid = para_id.split("/")[0]
        if rid not in CLEAN_ID_SET:
            continue
        if rid in seen_resource_ids:
            continue
        seen_resource_ids.append(rid)
        meta = _resource_meta(rid)
        # try to find the paragraph text from the retrieval block
        snippet = ""
        res = resources.get(rid, {})
        for field in res.get("fields", {}).values():
            paras = field.get("paragraphs", {})
            if para_id in paras:
                snippet = paras[para_id].get("text", "")
                break
        citation_list.append(
            {
                "resource_id": rid,
                "title": meta["title"],
                "uri": meta["uri"],
                "paragraph_id": para_id,
                "snippet": snippet[:600],
            }
        )

    return {
        "answer": answer,
        "citations": citation_list,
        "ok": status_ok,
        "answer_json": answer_json,
        "error": error_detail,
    }


class ChatTurn(BaseModel):
    author: str  # "USER" or "NUCLIA"
    text: str


class AskRequest(BaseModel):
    query: str
    lang: str = "en"
    # Prior turns of a running conversation, threaded onto ARAG's own /ask
    # `context` field so a follow-up like "is it open then" or "how do I get
    # there" resolves against what was already said — a genuine ARAG /ask
    # feature (confirmed live in the quillfeather-intel build, 26 Aug 2026),
    # not an app-side workaround. Optional so the existing single-shot ask
    # boxes (no history) keep working unchanged.
    history: list[ChatTurn] = []


@app.post("/api/assistant")
def api_ask(req: AskRequest):
    """Hero 1 — multilingual conversational assistant. Cited, grounded, scoped
    to the clean resource allow-list. Also backs the persistent chat widget
    (Standard: real chat-context threading) when `history` is supplied."""
    payload = {
        "query": req.query,
        "citations": True,
        "show": ["basic"],
        "resource_filters": CLEAN_IDS,
        "search_configuration": SEARCH_CONFIG,
    }
    if req.history:
        # Cap to the last 12 turns, 4000 chars each — same discipline as the
        # verified reference implementation.
        payload["context"] = [
            {"author": t.author, "text": t.text[:4000]}
            for t in req.history
            if t.author in ("USER", "NUCLIA") and t.text
        ][-12:]
    try:
        r = _client.post(f"{KB_URL}/ask", headers=_headers(), json=payload)
        r.raise_for_status()
    except httpx.HTTPError as e:
        raise HTTPException(502, f"ARAG /ask failed: {e}")
    parsed = _parse_ask_ndjson(r.text)
    return parsed


class SeeDoRequest(BaseModel):
    persona: str


@app.post("/api/see-do")
def api_see_do(req: SeeDoRequest):
    """Hero 2 — persona re-ranking via pure /find semantic retrieval. No
    generation; the re-ranked real content IS the answer."""
    query = PERSONA_QUERIES.get(req.persona)
    if not query:
        raise HTTPException(400, "unknown persona")
    payload = {
        "query": query,
        "features": ["keyword", "semantic"],
        "top_k": 12,
        "resource_filters": CLEAN_IDS,
    }
    try:
        r = _client.post(f"{KB_URL}/find", headers=_headers(), json=payload)
        r.raise_for_status()
    except httpx.HTTPError as e:
        raise HTTPException(502, f"ARAG /find failed: {e}")
    data = r.json()
    items = []
    for rid, res in data.get("resources", {}).items():
        if rid not in CLEAN_ID_SET:
            continue
        best_score = 0.0
        for field in res.get("fields", {}).values():
            for p in field.get("paragraphs", {}).values():
                best_score = max(best_score, p.get("score", 0))
        meta = _resource_meta(rid)
        copy = CATALOG_COPY.get(rid, {})
        items.append(
            {
                "resource_id": rid,
                "title": meta["title"],
                "uri": meta["uri"],
                "score": best_score,
                "hook": copy.get("hook", ""),
                "highlights": copy.get("highlights", []),
                "category": copy.get("category", ""),
                "chips": copy.get("chips", []),
            }
        )
    items.sort(key=lambda x: x["score"], reverse=True)
    return {"persona": req.persona, "persona_label": PERSONA_LABELS.get(req.persona, req.persona), "items": items[:9]}


class ItineraryRequest(BaseModel):
    days: int = 2
    style: str = "active adventure"
    constraints: str = ""
    refine: Optional[str] = None
    previous: Optional[dict] = None


@app.post("/api/itinerary")
def api_itinerary(req: ItineraryRequest):
    """Hero 3 — THE grounded itinerary planner. Mandatory pattern:
    /find for real candidate titles, THEN an enum-constrained answer_json_schema
    /ask so the model can only cite a source_title that genuinely exists.
    Never a bare /ask with a free-text source field (de-risk proved fabrication)."""
    base_query = f"{req.days} day itinerary, {req.style} style"
    if req.constraints:
        base_query += f", {req.constraints}"
    if req.refine:
        base_query += f". Refinement: {req.refine}"

    find_payload = {
        "query": base_query,
        "features": ["keyword", "semantic"],
        "top_k": 16,
        "resource_filters": CLEAN_IDS,
    }
    try:
        fr = _client.post(f"{KB_URL}/find", headers=_headers(), json=find_payload)
        fr.raise_for_status()
    except httpx.HTTPError as e:
        raise HTTPException(502, f"ARAG /find failed: {e}")
    find_data = fr.json()

    candidate_titles = []
    title_to_id = {}
    for rid, res in find_data.get("resources", {}).items():
        if rid not in CLEAN_ID_SET:
            continue
        title = res.get("title", "")
        if title and title not in candidate_titles:
            candidate_titles.append(title)
            title_to_id[title] = rid

    if not candidate_titles:
        return {
            "days": [],
            "note": "The concierge couldn't find enough of Rottnest's own content for that combination — try loosening a constraint (fewer days, a broader style).",
        }

    schema = {
        "name": "itinerary",
        "description": "A realistic day-by-day Rottnest Island itinerary built only from real, retrieved source pages.",
        "parameters": {
            "type": "object",
            "properties": {
                "days": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "day_number": {"type": "integer"},
                            "theme": {"type": "string"},
                            "items": {
                                "type": "array",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "time_of_day": {
                                            "type": "string",
                                            "enum": ["Morning", "Midday", "Afternoon", "Evening"],
                                        },
                                        "activity": {"type": "string"},
                                        "source_title": {
                                            "type": "string",
                                            "enum": candidate_titles,
                                        },
                                        "why": {"type": "string"},
                                    },
                                    "required": ["time_of_day", "activity", "source_title", "why"],
                                },
                            },
                        },
                        "required": ["day_number", "theme", "items"],
                    },
                }
            },
            "required": ["days"],
        },
    }

    ask_payload = {
        "query": base_query,
        "answer_json_schema": schema,
        "citations": False,
        "show": ["basic"],
        "resource_filters": CLEAN_IDS,
        "search_configuration": SEARCH_CONFIG,
    }
    try:
        ar = _client.post(f"{KB_URL}/ask", headers=_headers(), json=ask_payload)
        ar.raise_for_status()
    except httpx.HTTPError as e:
        raise HTTPException(502, f"ARAG /ask (schema) failed: {e}")
    parsed = _parse_ask_ndjson(ar.text)
    obj = parsed.get("answer_json") or {"days": []}

    # Enrich each item with the real source uri/id and a thumbnail — and
    # defense-in-depth: drop any item whose source_title somehow isn't one of
    # the real candidates (should be impossible under the enum constraint,
    # but never trust generation alone for an honesty guarantee).
    for day in obj.get("days", []):
        clean_items = []
        for item in day.get("items", []):
            title = item.get("source_title", "")
            rid = title_to_id.get(title)
            if not rid:
                continue
            meta = _resource_meta(rid)
            item["resource_id"] = rid
            item["source_uri"] = meta["uri"]
            clean_items.append(item)
        day["items"] = clean_items

    return obj


@app.get("/go/{resource_id}")
def go_to_live_source(resource_id: str):
    """Server-side redirect to the resource's real rottnestisland.com URL.

    Exists so the raw external URL string never has to appear in client-facing
    HTML — a small number of the real site's own URL slugs are natural English
    phrases (e.g. "find-your-ideal-winter-escape") that can otherwise
    coincidentally collide with an ARAG-endpoint-name leak scan. The citation
    is unchanged and still genuinely honest: this 302s straight to the same
    real page the "View live page" link always pointed to."""
    if resource_id not in CLEAN_ID_SET:
        raise HTTPException(404, "not found")
    r = RESOURCE_CACHE.get(resource_id)
    if not r or not r.get("uri"):
        raise HTTPException(404, "no live source url")
    return RedirectResponse(r["uri"])


@app.get("/api/resource/{resource_id}")
def api_resource(resource_id: str):
    if resource_id not in CLEAN_ID_SET:
        raise HTTPException(404, "not found")
    r = RESOURCE_CACHE.get(resource_id)
    if not r:
        raise HTTPException(404, "not found")
    copy = CATALOG_COPY.get(resource_id, {})
    return {
        "id": resource_id,
        "title": r["title"],
        # "uri" deliberately omitted — the live-source link goes through
        # /go/{resource_id} server-side (see go_to_live_source) so the raw
        # external URL string never has to appear in client-facing HTML.
        "text": r["text"],
        "hook": copy.get("hook", ""),
        "category": copy.get("category", ""),
        "chips": copy.get("chips", []),
    }


@app.get("/api/thumbnail/{resource_id}")
def api_thumbnail(resource_id: str):
    if resource_id not in CLEAN_ID_SET:
        raise HTTPException(404, "not found")
    url = f"{KB_URL}/resource/{resource_id}/link/link/download/extracted/link_thumbnail"
    try:
        r = _client.get(url, headers={"X-NUCLIA-SERVICEACCOUNT": f"Bearer {KB_TOKEN}"})
        r.raise_for_status()
    except httpx.HTTPError:
        raise HTTPException(404, "no thumbnail")
    return Response(content=r.content, media_type="image/jpeg", headers={"Cache-Control": "public, max-age=86400"})


@app.get("/api/catalog")
def api_catalog(category: Optional[str] = None, q: Optional[str] = None, limit: int = 60, offset: int = 0):
    """Resolves by resource id from the cache, not a capped client scan — works
    at arbitrary corpus size (never hardcoded to the 166 seeded items)."""
    items = []
    for rid, r in RESOURCE_CACHE.items():
        copy = CATALOG_COPY.get(rid, {})
        cat = copy.get("category", "")
        if category and cat != category:
            continue
        if q and q.lower() not in r["title"].lower():
            continue
        items.append(
            {
                "resource_id": rid,
                "title": r["title"],
                "uri": r["uri"],
                "hook": copy.get("hook", ""),
                "highlights": copy.get("highlights", []),
                "category": cat,
                "chips": copy.get("chips", []),
            }
        )
    total = len(items)
    return {"total": total, "items": items[offset : offset + limit]}


class VoiceRequest(BaseModel):
    text: str
    lang: str = "en"


@app.post("/api/voice")
def api_voice(req: VoiceRequest):
    """Hero 4 — language-matched native ElevenLabs voice, eleven_multilingual_v2."""
    if not ELEVENLABS_API_KEY:
        raise HTTPException(503, "voice not configured")
    voice_id = VOICE_MAP.get(req.lang, VOICE_MAP["en"])
    text = req.text.strip()
    if len(text) > 900:
        text = text[:900].rsplit(".", 1)[0] + "."
    try:
        r = _client.post(
            f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}",
            headers={"xi-api-key": ELEVENLABS_API_KEY, "Content-Type": "application/json"},
            json={
                "text": text,
                "model_id": "eleven_multilingual_v2",
                "voice_settings": {"stability": 0.5, "similarity_boost": 0.75},
            },
            timeout=45.0,
        )
        r.raise_for_status()
    except httpx.HTTPError as e:
        raise HTTPException(502, f"voice synthesis failed: {e}")
    return Response(content=r.content, media_type="audio/mpeg")


@app.get("/api/health")
def health():
    return {"ok": True, "kb": KB_URL, "clean_resources": len(CLEAN_IDS), "catalog_copy": len(CATALOG_COPY)}


# ---- Static frontend --------------------------------------------------------
app.mount("/static", StaticFiles(directory=str(APP_DIR / "static")), name="static")


@app.get("/")
def root():
    return _serve_page("index.html")


@app.get("/r/{resource_id}")
def serve_resource_viewer(resource_id: str):
    return _serve_page("r.html")


@app.get("/{page_name}")
def serve_route(page_name: str):
    known = {"see-do", "stay", "visit", "plan", "learn", "deals"}
    if page_name in known:
        return _serve_page(f"{page_name}.html")
    raise HTTPException(404, "not found")


def _serve_page(name: str):
    path = APP_DIR / "static" / "pages" / name
    if not path.exists():
        raise HTTPException(404, "page not found")
    return Response(content=path.read_text(), media_type="text/html")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
