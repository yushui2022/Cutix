import { NextRequest } from "next/server";
import fs from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type CleanupScope = "previews" | "covers" | "musetalk-work";

type CleanupCandidate = {
  scope: CleanupScope;
  path: string;
  kind: "file" | "directory";
  bytes: number;
  lastModifiedAt: string;
};

const outputDir = path.join(process.cwd(), "public", "output");

const cleanupRoots: Record<CleanupScope, string[]> = {
  previews: [path.join(outputDir, "previews")],
  covers: [path.join(outputDir, "covers")],
  "musetalk-work": [
    path.join(outputDir, "digital-human", "musetalk-work"),
    path.join(outputDir, "digital-human", "musetalk-service-work"),
  ],
};

const defaultScopes: CleanupScope[] = ["previews", "covers", "musetalk-work"];

function clampNumber(value: unknown, fallback: number, min: number, max: number) {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function normalizeScopes(value: unknown): CleanupScope[] {
  if (!Array.isArray(value)) return defaultScopes;
  const allowed = new Set<CleanupScope>(defaultScopes);
  const scopes = value.filter((item): item is CleanupScope => allowed.has(item as CleanupScope));
  return scopes.length > 0 ? Array.from(new Set(scopes)) : defaultScopes;
}

function isInside(parent: string, child: string) {
  const relative = path.relative(parent, child);
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}

async function entrySizeBytes(targetPath: string): Promise<number> {
  let stat;
  try {
    stat = await fs.stat(targetPath);
  } catch {
    return 0;
  }

  if (stat.isFile()) return stat.size;
  if (!stat.isDirectory()) return 0;

  let entries;
  try {
    entries = await fs.readdir(targetPath, { withFileTypes: true });
  } catch {
    return 0;
  }

  let total = 0;
  for (const entry of entries) {
    total += await entrySizeBytes(path.join(targetPath, entry.name));
  }
  return total;
}

async function collectFileCandidates(
  scope: CleanupScope,
  root: string,
  cutoffMs: number,
): Promise<CleanupCandidate[]> {
  let entries;
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }

  const candidates: CleanupCandidate[] = [];
  for (const entry of entries) {
    const targetPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      candidates.push(...await collectFileCandidates(scope, targetPath, cutoffMs));
      continue;
    }
    if (!entry.isFile()) continue;

    try {
      const stat = await fs.stat(targetPath);
      if (stat.mtimeMs >= cutoffMs) continue;
      candidates.push({
        scope,
        path: targetPath,
        kind: "file",
        bytes: stat.size,
        lastModifiedAt: stat.mtime.toISOString(),
      });
    } catch {
      // Ignore files that disappear while scanning.
    }
  }
  return candidates;
}

async function collectDirectoryCandidates(
  scope: CleanupScope,
  root: string,
  cutoffMs: number,
): Promise<CleanupCandidate[]> {
  let entries;
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }

  const candidates: CleanupCandidate[] = [];
  for (const entry of entries) {
    const targetPath = path.join(root, entry.name);
    try {
      const stat = await fs.stat(targetPath);
      if (stat.mtimeMs >= cutoffMs) continue;
      candidates.push({
        scope,
        path: targetPath,
        kind: entry.isDirectory() ? "directory" : "file",
        bytes: await entrySizeBytes(targetPath),
        lastModifiedAt: stat.mtime.toISOString(),
      });
    } catch {
      // Ignore entries that disappear while scanning.
    }
  }
  return candidates;
}

async function collectCandidates(scopes: CleanupScope[], maxAgeDays: number) {
  const cutoffMs = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  const candidates: CleanupCandidate[] = [];

  for (const scope of scopes) {
    for (const root of cleanupRoots[scope]) {
      if (scope === "musetalk-work") candidates.push(...await collectDirectoryCandidates(scope, root, cutoffMs));
      else candidates.push(...await collectFileCandidates(scope, root, cutoffMs));
    }
  }

  return candidates.sort((a, b) => b.bytes - a.bytes);
}

async function deleteCandidate(candidate: CleanupCandidate) {
  const roots = cleanupRoots[candidate.scope];
  const safe = roots.some((root) => isInside(root, candidate.path));
  if (!safe) throw new Error(`Refusing to delete outside cleanup roots: ${candidate.path}`);

  if (candidate.kind === "directory") await fs.rm(candidate.path, { recursive: true, force: true });
  else await fs.unlink(candidate.path);
}

export async function POST(request: NextRequest) {
  const body: unknown = await request.json().catch(() => ({}));
  const data = typeof body === "object" && body !== null ? body as Record<string, unknown> : {};
  const dryRun = data.dryRun !== false;
  const maxAgeDays = clampNumber(data.maxAgeDays, 7, 0, 365);
  const scopes = normalizeScopes(data.scopes);
  const candidates = await collectCandidates(scopes, maxAgeDays);

  let deletedCount = 0;
  let reclaimedBytes = 0;
  const errors: string[] = [];

  if (!dryRun) {
    for (const candidate of candidates) {
      try {
        await deleteCandidate(candidate);
        deletedCount += 1;
        reclaimedBytes += candidate.bytes;
      } catch (error: unknown) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }
  }

  const totalBytes = candidates.reduce((sum, candidate) => sum + candidate.bytes, 0);
  return Response.json(
    {
      dryRun,
      maxAgeDays,
      scopes,
      candidateCount: candidates.length,
      totalBytes,
      deletedCount,
      reclaimedBytes,
      errors,
      candidates: candidates.slice(0, 100),
      generatedAt: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
