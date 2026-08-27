#!/usr/bin/env python3
"""
Rottnest Island demo — 30-second reset / health check.

This demo has no mutable server-side or database state (no accounts, no
saved itineraries) — every view is generated live from the KB on each
request. So "reset" means: verify the KB, the clean allow-list, the search
configuration and the cached build artefacts are all intact and consistent,
fast enough to run live if a demo hiccups.

Usage:
  .venv/bin/python seed.py            # verify everything (read-only, ~5s)
  .venv/bin/python seed.py --purge    # also clears __pycache__ and rebuilds
                                       # the resource cache from the live KB
  .venv/bin/python seed.py --rebuild-copy  # regenerate catalog_copy.json
                                             # (slow — ~5 min, only if the
                                             # KB content changed)
"""
import json
import os
import shutil
import subprocess
import sys
import urllib.request
from pathlib import Path

APP_DIR = Path(__file__).resolve().parent


def load_env():
    env = {}
    for line in (APP_DIR / ".env").read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip()
    return env


def check(label, ok, detail=""):
    mark = "OK" if ok else "FAIL"
    print(f"  [{mark}] {label}" + (f" — {detail}" if detail else ""))
    return ok


def main():
    env = load_env()
    kb_url = env.get("KB_URL", "")
    token = env.get("KB_TOKEN", "")
    all_ok = True

    print("Rottnest Island demo — reset / health check\n")

    all_ok &= check("KB_URL / KB_TOKEN present in .env", bool(kb_url and token))

    try:
        req = urllib.request.Request(
            f"{kb_url}/resources?page_size=1",
            headers={"X-NUCLIA-SERVICEACCOUNT": f"Bearer {token}"},
        )
        with urllib.request.urlopen(req, timeout=15) as r:
            json.load(r)
        all_ok &= check("KB reachable", True)
    except Exception as e:  # noqa: BLE001
        all_ok &= check("KB reachable", False, str(e))

    try:
        req = urllib.request.Request(
            f"{kb_url}/search_configurations",
            headers={"X-NUCLIA-SERVICEACCOUNT": f"Bearer {token}"},
        )
        with urllib.request.urlopen(req, timeout=15) as r:
            configs = json.load(r)
        all_ok &= check(
            "search configuration 'rottnest-concierge' registered",
            "rottnest-concierge" in configs,
        )
    except Exception as e:  # noqa: BLE001
        all_ok &= check("search configuration check", False, str(e))

    all_res_path = APP_DIR / "data" / "all_resources.json"
    excluded_path = APP_DIR / "data" / "excluded_resources.json"
    cache_path = APP_DIR / "data" / "resource_cache.json"
    copy_path = APP_DIR / "data" / "catalog_copy.json"

    all_ok &= check("data/all_resources.json present", all_res_path.exists())
    all_ok &= check("data/excluded_resources.json present", excluded_path.exists())
    all_ok &= check("data/resource_cache.json present", cache_path.exists())

    if all_res_path.exists() and cache_path.exists():
        kept = json.loads(all_res_path.read_text())["kept"]
        cache = json.loads(cache_path.read_text())
        all_ok &= check(
            f"resource cache covers all {len(kept)} clean resources",
            len(cache) == len(kept),
            f"cache has {len(cache)}",
        )

    if copy_path.exists():
        copy = json.loads(copy_path.read_text())
        kept_n = len(json.loads(all_res_path.read_text())["kept"]) if all_res_path.exists() else 0
        complete = len(copy) == kept_n
        check(f"catalogue copy coverage ({len(copy)}/{kept_n})", complete)
        if not complete:
            print("        (partial coverage degrades gracefully — cards without copy still render;")
            print("         run --rebuild-copy to fill the gap, not required for the demo to work)")
    else:
        check("data/catalog_copy.json present", False, "run --rebuild-copy")

    if "--purge" in sys.argv:
        print("\nPurging local caches...")
        for p in APP_DIR.rglob("__pycache__"):
            shutil.rmtree(p, ignore_errors=True)
        subprocess.run(
            [sys.executable, str(APP_DIR / "scripts" / "build_resource_cache.py")],
            check=False,
        )
        print("  resource cache rebuilt from the live KB")

    if "--rebuild-copy" in sys.argv:
        print("\nRegenerating catalogue copy (this takes a few minutes)...")
        subprocess.run(
            [sys.executable, str(APP_DIR / "scripts" / "generate_catalog_copy.py"), "--resume"],
            check=False,
        )

    print()
    if all_ok:
        print("All checks passed. Restart the server to pick up any refreshed data:")
        print("  .venv/bin/python -m uvicorn app:app --reload")
    else:
        print("One or more checks FAILED — see above before the live demo.")
        sys.exit(1)


if __name__ == "__main__":
    main()
