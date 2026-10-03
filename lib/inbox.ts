import { create } from 'zustand';

import type { InboxItem } from '@/shared/contracts';

import { api } from './api';

type InboxState = {
  items: InboxItem[];
  unread: number;
  loaded: boolean;
  refresh: () => Promise<void>;
  markRead: (ids?: string[]) => Promise<void>;
};

/** One shared inbox so the bell badge and the inbox screen never disagree. */
export const useInbox = create<InboxState>((set, get) => ({
  items: [],
  unread: 0,
  loaded: false,
  refresh: async () => {
    try {
      const { items, unread } = await api.notifications();
      set({ items, unread, loaded: true });
    } catch {
      set({ loaded: true });
    }
  },
  markRead: async (ids) => {
    // Optimistic: flip locally first so the badge drops instantly.
    const target = new Set(ids ?? get().items.map((i) => i.id));
    set((s) => ({ items: s.items.map((i) => (target.has(i.id) ? { ...i, read: true } : i)), unread: ids ? Math.max(0, s.unread - s.items.filter((i) => target.has(i.id) && !i.read).length) : 0 }));
    try {
      const { unread } = await api.markRead(ids);
      set({ unread });
    } catch {
      get().refresh();
    }
  },
}));

/** Where a notification should take you when tapped. */
export function hrefFor(item: Pick<InboxItem, 'kind' | 'challengeId'>) {
  if (!item.challengeId) return null;
  return item.kind === 'results' ? `/challenge/${item.challengeId}/results` : `/challenge/${item.challengeId}`;
}
