import { create } from "zustand";

const STORAGE_KEY = "explorer_urls_v1";

export const FALLBACK_EXPLORER = "https://blockscan.com";

export const DEFAULT_EXPLORERS: Record<string, string> = {
  Ethereum: "https://etherscan.io",
  Binance: "https://bscscan.com",
  Arbitrum: "https://arbiscan.io",
  Polygon: "https://polygonscan.com",
  Base: "https://basescan.org",
  Solana: "https://solscan.io",
  Snowtrace: "https://snowtrace.io",
  Optimism: "https://optimistic.etherscan.io",
  Gnosis: "https://gnosisscan.io",
  Unichain: "https://uniscan.xyz",
  Berachain: "https://berascan.com",
  Sonic: "https://sonicscan.org",
  Hyperevm: "https://hyperevmscan.io",
  Robinhood: "https://rh-scan.com",
};

// Stored verbatim: absence of the key means "never customised", not "all removed",
// so a user can delete a default network and have it stay deleted.
function load(): Record<string, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error("Failed to read explorer urls", e);
  }
  return { ...DEFAULT_EXPLORERS };
}

interface ExplorerState {
  explorers: Record<string, string>;
  setExplorers: (explorers: Record<string, string>) => void;
  resetExplorers: () => void;
}

export const useExplorerStore = create<ExplorerState>()((set) => ({
  explorers: load(),

  setExplorers: (explorers) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(explorers));
    set({ explorers });
  },

  resetExplorers: () => {
    localStorage.removeItem(STORAGE_KEY);
    set({ explorers: { ...DEFAULT_EXPLORERS } });
  },
}));

export function getExplorerUrl(network: string) {
  return useExplorerStore.getState().explorers[network] || FALLBACK_EXPLORER;
}
