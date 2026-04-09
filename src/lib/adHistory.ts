import { readFile, writeFile, mkdir } from "fs/promises";
import path from "path";
import { AnalysisResult, CopyVariation } from "./types";

const HISTORY_DIR = path.join(process.cwd(), "uploads", "history");
const INDEX_FILE = path.join(HISTORY_DIR, "index.json");

export interface HistoryEntry {
  id: string;
  referencePreviewUrl: string; // local URL to the reference image
  uploadedUrl: string;
  analysis: AnalysisResult;
  prompt: string;
  copyVariations: CopyVariation[];
  language: string;
  createdAt: string;
}

async function ensureDir() {
  await mkdir(HISTORY_DIR, { recursive: true });
}

async function readIndex(): Promise<HistoryEntry[]> {
  try {
    const data = await readFile(INDEX_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function writeIndex(entries: HistoryEntry[]) {
  await ensureDir();
  await writeFile(INDEX_FILE, JSON.stringify(entries, null, 2));
}

export async function getHistory(): Promise<HistoryEntry[]> {
  await ensureDir();
  return readIndex();
}

export async function addToHistory(entry: Omit<HistoryEntry, "id" | "createdAt">): Promise<HistoryEntry> {
  await ensureDir();
  const entries = await readIndex();

  const historyEntry: HistoryEntry = {
    ...entry,
    id: `hist-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    createdAt: new Date().toISOString(),
  };

  entries.unshift(historyEntry); // newest first
  // Keep last 100 entries
  if (entries.length > 100) entries.length = 100;
  await writeIndex(entries);

  return historyEntry;
}

export async function deleteHistoryEntry(id: string): Promise<void> {
  const entries = await readIndex();
  await writeIndex(entries.filter((e) => e.id !== id));
}

export async function updateHistoryEntry(id: string, updates: Partial<HistoryEntry>): Promise<void> {
  const entries = await readIndex();
  await writeIndex(
    entries.map((e) => (e.id === id ? { ...e, ...updates } : e))
  );
}
