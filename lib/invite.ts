import * as SecureStore from 'expo-secure-store';

// An invite link opened before sign-in is parked here and resumed once onboarding finishes.
const KEY = 'steppool.pendingInvite';

export const pendingInvite = {
  set: (code: string) => SecureStore.setItemAsync(KEY, code),
  take: async () => {
    const code = await SecureStore.getItemAsync(KEY);
    if (code) await SecureStore.deleteItemAsync(KEY);
    return code;
  },
};

/** Accepts `steppool://join/CODE`, `https://…/j/CODE` and bare paths. */
export function inviteCodeFromPath(path: string): string | null {
  const m = path.match(/(?:^|\/)(?:join|j)\/([A-Za-z0-9]{4,12})(?:[/?#]|$)/);
  return m ? m[1].toUpperCase() : null;
}

export function inviteUrl(code: string) {
  return `https://steppool.onrender.com/j/${code}`;
}
