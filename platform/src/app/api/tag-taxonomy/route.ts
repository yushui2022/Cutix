import { NextRequest } from "next/server";
import fs from "fs/promises";
import path from "path";
import { tagTaxonomy } from "@/lib/tag-taxonomy";
import type { TagCategory } from "@/lib/tag-taxonomy";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const dataDir = path.join(process.cwd(), "data");
const taxonomyFile = path.join(dataDir, "tag-taxonomy.json");

function sanitizeTags(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((tag) => String(tag).trim())
        .filter(Boolean),
    ),
  ).slice(0, 80);
}

function normalizeCategory(value: unknown, fallback?: TagCategory): TagCategory | null {
  if (typeof value !== "object" || value === null) return fallback ?? null;
  const raw = value as Record<string, unknown>;
  const id = typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : fallback?.id;
  const label = typeof raw.label === "string" && raw.label.trim() ? raw.label.trim() : fallback?.label;
  if (!id || !label) return null;

  return {
    id,
    label,
    description:
      typeof raw.description === "string" && raw.description.trim()
        ? raw.description.trim()
        : fallback?.description ?? "",
    tags: sanitizeTags(raw.tags).length > 0 ? sanitizeTags(raw.tags) : fallback?.tags ?? [],
  };
}

function normalizeCategories(value: unknown): TagCategory[] {
  if (!Array.isArray(value)) return tagTaxonomy;

  const byId = new Map<string, TagCategory>();
  for (const fallback of tagTaxonomy) byId.set(fallback.id, fallback);

  for (const raw of value) {
    const id = typeof raw === "object" && raw !== null && "id" in raw ? String((raw as { id: unknown }).id) : "";
    const category = normalizeCategory(raw, byId.get(id));
    if (category) byId.set(category.id, category);
  }

  return tagTaxonomy.map((fallback) => byId.get(fallback.id) ?? fallback);
}

async function readCategories(): Promise<TagCategory[]> {
  try {
    const raw = await fs.readFile(taxonomyFile, "utf8");
    return normalizeCategories(JSON.parse(raw));
  } catch (error: unknown) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      return tagTaxonomy;
    }
    throw error;
  }
}

async function writeCategories(categories: TagCategory[]) {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(taxonomyFile, JSON.stringify(categories, null, 2), "utf8");
}

export async function GET() {
  const categories = await readCategories();
  return Response.json({ categories }, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: NextRequest) {
  const body: unknown = await request.json();
  if (typeof body !== "object" || body === null || !("category" in body)) {
    return Response.json({ error: "Tag category is required" }, { status: 400 });
  }

  const current = await readCategories();
  const rawCategory = (body as { category: unknown }).category;
  const id = typeof rawCategory === "object" && rawCategory !== null && "id" in rawCategory
    ? String((rawCategory as { id: unknown }).id)
    : "";
  const index = current.findIndex((category) => category.id === id);
  if (index === -1) {
    return Response.json({ error: "Tag category not found" }, { status: 404 });
  }

  const nextCategory = normalizeCategory(rawCategory, current[index]);
  if (!nextCategory) {
    return Response.json({ error: "Invalid tag category" }, { status: 400 });
  }

  const next = [...current];
  next[index] = nextCategory;
  await writeCategories(next);

  return Response.json({ categories: next }, { headers: { "Cache-Control": "no-store" } });
}
