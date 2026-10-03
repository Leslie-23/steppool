import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';

import type { ClientToServer, ServerToClient } from '@/shared/contracts';

import { API_URL } from './api';
import { useSession } from './session';

let socket: Socket<ServerToClient, ClientToServer> | null = null;

function getSocket() {
  const token = useSession.getState().tokens?.access;
  if (!socket) {
    socket = io(API_URL, { transports: ['websocket'], auth: (cb) => cb({ token: useSession.getState().tokens?.access }) });
  } else if (!socket.connected && token) {
    socket.connect();
  }
  return socket;
}

/** Subscribe to a challenge room for the lifetime of the calling screen. */
export function useChallengeRoom<E extends keyof ServerToClient>(challengeId: string | undefined, handlers: Pick<ServerToClient, E>) {
  const ref = useRef(handlers);
  ref.current = handlers;
  useEffect(() => {
    if (!challengeId) return;
    const s = getSocket();
    const entries = Object.keys(ref.current).map((event) => {
      const fn = (...args: unknown[]) => (ref.current as Record<string, (...a: unknown[]) => void>)[event]?.(...args);
      s.on(event as keyof ServerToClient, fn as never);
      return [event, fn] as const;
    });
    const watch = () => s.emit('challenge:watch', challengeId);
    watch();
    s.on('connect', watch);
    return () => {
      s.emit('challenge:unwatch', challengeId);
      s.off('connect', watch);
      for (const [event, fn] of entries) s.off(event as keyof ServerToClient, fn as never);
    };
  }, [challengeId]);
}
