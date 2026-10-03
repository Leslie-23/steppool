import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

import type { Me } from '@/shared/contracts';

const KEY = 'steppool.session.v1';

type Tokens = { access: string; refresh: string };

type SessionState = {
  ready: boolean;
  tokens: Tokens | null;
  me: Me | null;
  healthGranted: boolean;
  hydrate: () => Promise<void>;
  signIn: (tokens: Tokens, me: Me) => Promise<void>;
  setTokens: (tokens: Tokens) => Promise<void>;
  setMe: (me: Me) => void;
  setHealthGranted: (v: boolean) => Promise<void>;
  signOut: () => Promise<void>;
};

async function persist(s: Pick<SessionState, 'tokens' | 'healthGranted'>) {
  await SecureStore.setItemAsync(KEY, JSON.stringify({ tokens: s.tokens, healthGranted: s.healthGranted }));
}

export const useSession = create<SessionState>((set, get) => ({
  ready: false,
  tokens: null,
  me: null,
  healthGranted: false,
  hydrate: async () => {
    try {
      const raw = await SecureStore.getItemAsync(KEY);
      if (raw) {
        const saved = JSON.parse(raw) as { tokens: Tokens | null; healthGranted?: boolean };
        set({ tokens: saved.tokens, healthGranted: !!saved.healthGranted });
      }
    } finally {
      set({ ready: true });
    }
  },
  signIn: async (tokens, me) => {
    set({ tokens, me });
    await persist(get());
  },
  setTokens: async (tokens) => {
    set({ tokens });
    await persist(get());
  },
  setMe: (me) => set({ me }),
  setHealthGranted: async (healthGranted) => {
    set({ healthGranted });
    await persist(get());
  },
  signOut: async () => {
    set({ tokens: null, me: null, healthGranted: false });
    await SecureStore.deleteItemAsync(KEY);
  },
}));
