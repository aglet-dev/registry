#!/usr/bin/env python3
"""
Rebuild aglets/index.json + plugins/index.json from per-package meta.json
files. Pure scan: globs <ns>/*/meta.json under repo root, projects each
into the catalog row shape, sorts by updated_at desc, writes back.

The output shape mirrors what `aglet publish` / `aglet plugin publish`
previously wrote inline. Triggering this workflow on main push means the
publish PRs themselves no longer have to maintain index.json — they
just drop in their meta.json + tarball, and the index lands here.

Idempotent: if the rebuilt JSON byte-equals what's on disk, the workflow
detects "no diff" and skips the commit.
"""

from __future__ import annotations

import datetime as _dt
import glob
import json
import os
import sys
from typing import Any


REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))


def utc_now_iso() -> str:
    return _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _load(path: str) -> dict[str, Any]:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _copy_fields(meta: dict[str, Any], keys: list[str], dst: dict[str, Any]) -> None:
    """Project the listed meta fields onto dst when present (preserve i18n
    objects, arrays, etc — no flattening)."""
    for k in keys:
        if k in meta:
            dst[k] = meta[k]


def _latest_version_obj(meta: dict[str, Any]) -> dict[str, Any] | None:
    versions = meta.get("versions") or []
    latest_tag = meta.get("latest")
    if not latest_tag:
        return versions[-1] if versions else None
    for v in versions:
        if v.get("version") == latest_tag:
            return v
    # Fallback: latest tag doesn't match any version row.
    return versions[-1] if versions else None


# ─── aglets ──────────────────────────────────────────────────────────────

AGLET_STORE_FIELDS = [
    "name", "description", "author", "homepage", "license", "icon",
    "category", "keywords", "screenshots", "repository",
]


def build_aglet_entry(meta_path: str) -> dict[str, Any]:
    meta = _load(meta_path)
    entry: dict[str, Any] = {"id": meta["id"]}
    _copy_fields(meta, AGLET_STORE_FIELDS, entry)
    entry["latest"] = meta.get("latest", "")
    latest_v = _latest_version_obj(meta)
    if latest_v and "published_at" in latest_v:
        entry["updated_at"] = latest_v["published_at"]
    return entry


def build_aglets_index() -> dict[str, Any]:
    metas = sorted(glob.glob(os.path.join(REPO_ROOT, "aglets", "*", "meta.json")))
    entries = [build_aglet_entry(p) for p in metas]
    entries.sort(key=lambda e: e.get("updated_at", ""), reverse=True)
    return {"generated_at": utc_now_iso(), "aglets": entries}


# ─── plugins ─────────────────────────────────────────────────────────────

PLUGIN_STORE_FIELDS = [
    "name", "description", "category", "keywords", "author",
    "homepage", "repository", "license",
]


def build_plugin_entry(meta_path: str) -> dict[str, Any]:
    meta = _load(meta_path)
    entry: dict[str, Any] = {"id": meta["id"]}
    _copy_fields(meta, PLUGIN_STORE_FIELDS, entry)
    # Plugin-specific runtime metadata (mirrors aglet plugin publish output):
    if "namespace" in meta:
        entry["namespace"] = meta["namespace"]
    if "backend_kind" in meta:
        entry["backend_kind"] = meta["backend_kind"]
    if "wasm_features" in meta:
        entry["wasm_features"] = meta["wasm_features"]
    actions = meta.get("actions") or []
    entry["actions_count"] = len(actions)
    entry["latest"] = meta.get("latest", "")
    latest_v = _latest_version_obj(meta)
    if latest_v:
        if "wasm_size" in latest_v:
            entry["wasm_size"] = latest_v["wasm_size"]
        if "published_at" in latest_v:
            entry["updated_at"] = latest_v["published_at"]
    return entry


def build_plugins_index() -> dict[str, Any]:
    metas = sorted(glob.glob(os.path.join(REPO_ROOT, "plugins", "*", "meta.json")))
    entries = [build_plugin_entry(p) for p in metas]
    entries.sort(key=lambda e: e.get("updated_at", ""), reverse=True)
    return {"generated_at": utc_now_iso(), "plugins": entries}


# ─── write back ──────────────────────────────────────────────────────────

def write_json(path: str, obj: dict[str, Any]) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, indent=2, ensure_ascii=False)
        f.write("\n")


def main() -> int:
    aglets_idx = build_aglets_index()
    plugins_idx = build_plugins_index()
    write_json(os.path.join(REPO_ROOT, "aglets", "index.json"), aglets_idx)
    write_json(os.path.join(REPO_ROOT, "plugins", "index.json"), plugins_idx)
    print(f"aglets/index.json:  {len(aglets_idx['aglets'])} entries")
    print(f"plugins/index.json: {len(plugins_idx['plugins'])} entries")
    return 0


if __name__ == "__main__":
    sys.exit(main())
