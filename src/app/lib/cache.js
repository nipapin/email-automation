import { readFile, writeFile, mkdir } from "fs/promises";
import { join } from "path";

const CACHE_DIR = join(process.cwd(), "data");
const CACHE_FILE = join(CACHE_DIR, "emails-cache.json");

export async function loadCache() {
  try {
    const raw = await readFile(CACHE_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export async function saveCache(cache) {
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(CACHE_FILE, JSON.stringify(cache, null, 2), "utf-8");
}
