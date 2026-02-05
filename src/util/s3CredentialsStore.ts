import { create } from "zustand";

// Simple obfuscation for localStorage (not cryptographically secure, but prevents casual viewing)
const STORAGE_KEY = "s3_creds_v1";
const SALT = "stat-viewer-s3-salt";

function obfuscate(data: string): string {
  const salted = SALT + data + SALT;
  return btoa(salted);
}

function deobfuscate(data: string): string | null {
  try {
    const decoded = atob(data);
    if (decoded.startsWith(SALT) && decoded.endsWith(SALT)) {
      return decoded.slice(SALT.length, -SALT.length);
    }
    return null;
  } catch {
    return null;
  }
}

export type StoredCredentials = {
  region: string;
  bucketName: string;
  accessKeyId: string;
  secretAccessKey: string;
  autoConnect: boolean;
};

function saveToLocalStorage(creds: StoredCredentials): void {
  try {
    const json = JSON.stringify(creds);
    localStorage.setItem(STORAGE_KEY, obfuscate(json));
  } catch (e) {
    console.error("Failed to save credentials", e);
  }
}

function loadFromLocalStorage(): StoredCredentials | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    const json = deobfuscate(stored);
    if (!json) return null;
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function clearFromLocalStorage(): void {
  localStorage.removeItem(STORAGE_KEY);
}

interface S3CredentialsState {
  credentials: StoredCredentials | null;
  autoConnect: boolean;
  rememberCreds: boolean;

  // Actions
  loadCredentials: () => StoredCredentials | null;
  saveCredentials: (creds: StoredCredentials) => void;
  clearCredentials: () => void;
  setAutoConnect: (value: boolean) => void;
  setRememberCreds: (value: boolean) => void;
}

export const useS3CredentialsStore = create<S3CredentialsState>()((set, get) => {
  // Load initial state from localStorage
  const initial = loadFromLocalStorage();

  return {
    credentials: initial,
    autoConnect: initial?.autoConnect ?? false,
    rememberCreds: initial !== null,

    loadCredentials: () => {
      const creds = loadFromLocalStorage();
      set({ credentials: creds, autoConnect: creds?.autoConnect ?? false, rememberCreds: creds !== null });
      return creds;
    },

    saveCredentials: (creds: StoredCredentials) => {
      saveToLocalStorage(creds);
      set({ credentials: creds, autoConnect: creds.autoConnect });
    },

    clearCredentials: () => {
      clearFromLocalStorage();
      set({ credentials: null, autoConnect: false, rememberCreds: false });
    },

    setAutoConnect: (value: boolean) => {
      const { credentials, rememberCreds } = get();
      set({ autoConnect: value });

      // Update localStorage if we have credentials stored
      if (credentials && rememberCreds) {
        saveToLocalStorage({ ...credentials, autoConnect: value });
      }
    },

    setRememberCreds: (value: boolean) => {
      set({ rememberCreds: value });
    },
  };
});
