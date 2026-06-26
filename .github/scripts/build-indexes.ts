#!/usr/bin/env bun
/**
 * Rebuild aglets/index.json + plugins/index.json from per-package meta.json
 * files. Pure scan: globs <ns>/*​/meta.json under repo root, projects each
 * into the catalog row shape, sorts by updated_at desc, writes back.
 *
 * The output shape mirrors what `aglet publish` / `aglet plugin publish`
 * write into each package's meta.json. Triggering this on main push means
 * publish PRs don't maintain index.json — they drop in meta.json + tarball,
 * and the index lands here.
 *
 * Idempotent: rebuilt JSON byte-matches the prior output (modulo generated_at)
 * → workflow's git-diff check skips the commit when nothing changed.
 *
 * TS (run via bun) —— 仓库禁用 Python。JSON 输出对齐旧 build-indexes.py
 * （indent=2、ensure_ascii=False ≙ JSON.stringify(…,2) + UTF-8、尾随换行）。
 */

import {
  readdirSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

type Json = Record<string, any>;

function utcNowIso(): string {
  // 对齐 Python strftime("%Y-%m-%dT%H:%M:%SZ") —— 去掉毫秒。
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

function load(path: string): Json {
  return JSON.parse(readFileSync(path, "utf-8"));
}

/** Project listed meta fields onto dst when present (preserve i18n objects, arrays). */
function copyFields(meta: Json, keys: string[], dst: Json): void {
  for (const k of keys) if (k in meta) dst[k] = meta[k];
}

function latestVersionObj(meta: Json): Json | null {
  const versions: Json[] = meta.versions ?? [];
  const latestTag = meta.latest;
  if (!latestTag) return versions.length ? versions[versions.length - 1] : null;
  for (const v of versions) if (v.version === latestTag) return v;
  // Fallback: latest tag doesn't match any version row.
  return versions.length ? versions[versions.length - 1] : null;
}

/** Sorted list of <ns>/<id>/meta.json paths under the repo root. */
function metaPaths(ns: string): string[] {
  const base = join(REPO_ROOT, ns);
  if (!existsSync(base)) return [];
  const out: string[] = [];
  for (const dirent of readdirSync(base, { withFileTypes: true })) {
    if (!dirent.isDirectory()) continue;
    const p = join(base, dirent.name, "meta.json");
    if (existsSync(p)) out.push(p);
  }
  return out.sort();
}

// ─── aglets ──────────────────────────────────────────────────────────────

const AGLET_STORE_FIELDS = [
  "name", "description", "author", "homepage", "license", "icon",
  "category", "keywords", "screenshots", "repository",
  // platforms: aglet 支持的原生平台集（["apple","android","windows"]），由
  // `aglet publish` 经 spec.pickRenderer 算入 meta.json。Store(macOS) /
  // catalog(Android) 据此「只列支持本平台的 aglet」（不向后兼容：缺失即不列出，
  // 每个 aglet 都应以含本字段的新 CLI 重新发布）。
  "platforms",
];

function buildAgletEntry(metaPath: string): Json {
  const meta = load(metaPath);
  const entry: Json = { id: meta.id };
  copyFields(meta, AGLET_STORE_FIELDS, entry);
  entry.latest = meta.latest ?? "";
  const latestV = latestVersionObj(meta);
  if (latestV && "published_at" in latestV) entry.updated_at = latestV.published_at;
  return entry;
}

function buildAgletsIndex(): Json {
  const entries = metaPaths("aglets").map(buildAgletEntry);
  entries.sort((a, b) =>
    String(b.updated_at ?? "").localeCompare(String(a.updated_at ?? "")));
  return { generated_at: utcNowIso(), aglets: entries };
}

// ─── plugins ─────────────────────────────────────────────────────────────

const PLUGIN_STORE_FIELDS = [
  "name", "description", "category", "keywords", "author",
  "homepage", "repository", "license",
];

function buildPluginEntry(metaPath: string): Json {
  const meta = load(metaPath);
  const entry: Json = { id: meta.id };
  copyFields(meta, PLUGIN_STORE_FIELDS, entry);
  // Plugin-specific runtime metadata (mirrors aglet plugin publish output):
  if ("namespace" in meta) entry.namespace = meta.namespace;
  if ("backend_kind" in meta) entry.backend_kind = meta.backend_kind;
  if ("wasm_features" in meta) entry.wasm_features = meta.wasm_features;
  const actions = meta.actions ?? [];
  entry.actions_count = actions.length;
  entry.latest = meta.latest ?? "";
  const latestV = latestVersionObj(meta);
  if (latestV) {
    if ("wasm_size" in latestV) entry.wasm_size = latestV.wasm_size;
    if ("published_at" in latestV) entry.updated_at = latestV.published_at;
  }
  return entry;
}

function buildPluginsIndex(): Json {
  const entries = metaPaths("plugins").map(buildPluginEntry);
  entries.sort((a, b) =>
    String(b.updated_at ?? "").localeCompare(String(a.updated_at ?? "")));
  return { generated_at: utcNowIso(), plugins: entries };
}

// ─── write back ──────────────────────────────────────────────────────────

function writeJson(path: string, obj: Json): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(obj, null, 2) + "\n");
}

function main(): void {
  const agletsIdx = buildAgletsIndex();
  const pluginsIdx = buildPluginsIndex();
  writeJson(join(REPO_ROOT, "aglets", "index.json"), agletsIdx);
  writeJson(join(REPO_ROOT, "plugins", "index.json"), pluginsIdx);
  console.log(`aglets/index.json:  ${agletsIdx.aglets.length} entries`);
  console.log(`plugins/index.json: ${pluginsIdx.plugins.length} entries`);
}

main();
