#!/usr/bin/env python3
"""Fetch title + real source URL + extracted text for every clean (non-junk, non-duplicate)
resource in the Rottnest Island KB, and cache it to data/resource_cache.json.

This is a build-time cache, not a live dependency - /find and /ask still run live against
the KB on every request. The cache exists so the /r/<id> source viewer can render the full
extracted text (for citation highlighting, gate B23) without an extra live call per view, and
so listing pages have a real title + source URL without re-querying on every page load.

Run: .venv/bin/python scripts/build_resource_cache.py
"""
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

APP_DIR = Path(__file__).resolve().parent.parent


def load_env():
    env = {}
    env_path = APP_DIR / ".env"
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip()
    return env


def fetch(url, token):
    req = urllib.request.Request(
        url, headers={"X-NUCLIA-SERVICEACCOUNT": f"Bearer {token}"}
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def main():
    env = load_env()
    kb_url = env["KB_URL"]
    token = env["KB_TOKEN"]

    kept = json.loads((APP_DIR / "data" / "all_resources.json").read_text())["kept"]

    cache = {}
    errors = []
    for i, r in enumerate(kept):
        rid = r["id"]
        try:
            basic = fetch(f"{kb_url}/resource/{rid}?show=basic&show=values", token)
            uri = (
                basic.get("data", {})
                .get("links", {})
                .get("link", {})
                .get("value", {})
                .get("uri", "")
            )
            extracted = fetch(
                f"{kb_url}/resource/{rid}?show=extracted&extracted=text", token
            )
            text = (
                extracted.get("data", {})
                .get("links", {})
                .get("link", {})
                .get("extracted", {})
                .get("text", {})
                .get("text", "")
            )
            cache[rid] = {
                "id": rid,
                "title": r["title"],
                "uri": uri,
                "text": text,
            }
        except urllib.error.HTTPError as e:
            errors.append((rid, r["title"], e.code))
        except Exception as e:  # noqa: BLE001
            errors.append((rid, r["title"], str(e)))

        if (i + 1) % 20 == 0:
            print(f"  ...{i + 1}/{len(kept)}", file=sys.stderr)
        time.sleep(0.02)

    out_path = APP_DIR / "data" / "resource_cache.json"
    out_path.write_text(json.dumps(cache, indent=2))
    print(f"Wrote {len(cache)} resources to {out_path}")
    if errors:
        print(f"{len(errors)} errors:")
        for rid, title, err in errors:
            print(f"  {rid} ({title}): {err}")


if __name__ == "__main__":
    main()
