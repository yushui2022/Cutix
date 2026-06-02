import { NextRequest } from "next/server";
import fs from "fs/promises";
import path from "path";
import { defaultConfig } from "@/lib/default-config";
import type { BrandConfig, BrandDigitalHumanProfile, CutixConfig, TemplateConfig } from "@/lib/default-config";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const dataDir = path.join(process.cwd(), "data");
const configFile = path.join(dataDir, "config.json");

function normalizeConfig(config: Partial<CutixConfig>): CutixConfig {
  return {
    brands: Array.isArray(config.brands) && config.brands.length > 0 ? config.brands : defaultConfig.brands,
    templates: Array.isArray(config.templates) && config.templates.length > 0
      ? config.templates
      : defaultConfig.templates,
  };
}

async function readConfig(): Promise<CutixConfig> {
  try {
    const raw = await fs.readFile(configFile, "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return defaultConfig;
    return normalizeConfig(parsed as Partial<CutixConfig>);
  } catch (error: unknown) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      return defaultConfig;
    }
    throw error;
  }
}

async function writeConfig(config: CutixConfig) {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(configFile, JSON.stringify(config, null, 2), "utf8");
}

function isBrandConfig(value: unknown): value is BrandConfig {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return ["id", "name", "industry", "color", "tone", "promise", "defaultBgm"].every(
    (key) => typeof item[key] === "string",
  ) && isBrandDigitalHumanProfile(item.digitalHuman);
}

function isBrandDigitalHumanProfile(value: unknown): value is BrandDigitalHumanProfile | undefined {
  if (value === undefined) return true;
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return ["roleName", "avatarPath", "voiceId", "notes"].every((key) => typeof item[key] === "string");
}

function isTemplateConfig(value: unknown): value is TemplateConfig {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return ["id", "name", "category", "duration", "layout", "bestFor", "accent"].every(
    (key) => typeof item[key] === "string",
  );
}

export async function GET() {
  const config = await readConfig();
  return Response.json(config, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: NextRequest) {
  const body: unknown = await request.json();
  if (typeof body !== "object" || body === null || !("kind" in body) || !("item" in body)) {
    return Response.json({ error: "kind and item are required" }, { status: 400 });
  }

  const kind = String((body as { kind: unknown }).kind);
  const item = (body as { item: unknown }).item;
  const config = await readConfig();

  if (kind === "brand") {
    if (!isBrandConfig(item)) return Response.json({ error: "Invalid brand config" }, { status: 400 });
    const index = config.brands.findIndex((brand) => brand.id === item.id);
    config.brands = index === -1
      ? [...config.brands, item]
      : config.brands.map((brand) => (brand.id === item.id ? item : brand));
  } else if (kind === "template") {
    if (!isTemplateConfig(item)) return Response.json({ error: "Invalid template config" }, { status: 400 });
    const index = config.templates.findIndex((template) => template.id === item.id);
    config.templates = index === -1
      ? [...config.templates, item]
      : config.templates.map((template) => (template.id === item.id ? item : template));
  } else {
    return Response.json({ error: "Unknown config kind" }, { status: 400 });
  }

  await writeConfig(config);
  return Response.json(config);
}
