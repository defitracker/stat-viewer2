import { create } from "zustand";

const STORAGE_KEY = "s3_prefixes_v1";

// The catch-all row: every key none of the named prefixes match. It exists so a new
// bot-side prefix shows up as a count instead of silently vanishing from the picker.
export const OTHER = "*";

export const DEFAULT_PREFIXES: Record<string, boolean> = {
  wo_: true,
  worker: true,
  evinfo_: true,
  aa_: false,
  [OTHER]: false,
};

// Merged over the defaults — unlike explorerStore's persist-verbatim contract. These
// keys track the bot's own naming, so new built-ins must still reach a user who has
// already saved a selection.
function load(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_PREFIXES, ...JSON.parse(raw) };
  } catch (e) {
    console.error("Failed to read s3 prefixes", e);
  }
  return { ...DEFAULT_PREFIXES };
}

interface S3PrefixState {
  prefixes: Record<string, boolean>;
  togglePrefix: (prefix: string) => void;
}

export const useS3PrefixStore = create<S3PrefixState>()((set, get) => ({
  prefixes: load(),

  togglePrefix: (prefix: string) => {
    const prefixes = { ...get().prefixes, [prefix]: !get().prefixes[prefix] };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefixes));
    set({ prefixes });
  },
}));

/** Which prefix row a key belongs to — OTHER when no named prefix matches. */
export function matchPrefix(key: string | undefined, prefixes: Record<string, boolean>) {
  return Object.keys(prefixes).find((p) => p !== OTHER && key?.startsWith(p)) ?? OTHER;
}
