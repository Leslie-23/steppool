import { inviteCodeFromPath, pendingInvite } from '@/lib/invite';
import { useSession } from '@/lib/session';

// Universal links arrive as /j/CODE; normalise them to the in-app join route.
// If nobody is signed in yet, park the code so it survives onboarding.
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  const code = inviteCodeFromPath(path);
  if (!code) return path;
  if (!useSession.getState().tokens) {
    pendingInvite.set(code);
    return '/';
  }
  return `/join/${code}`;
}
