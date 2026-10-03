import * as Sharing from 'expo-sharing';
import type { RefObject } from 'react';
import { Share, type View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import { CARD_H, CARD_W } from '@/components/share/ShareCards';

import { haptic } from './haptics';

/**
 * Captures an off-screen card at story resolution and opens the share sheet.
 * Falls back to a text share (with the link) if image sharing is unavailable.
 */
export async function shareCard(ref: RefObject<View | null>, text: string) {
  haptic.commit();
  try {
    if (ref.current && (await Sharing.isAvailableAsync())) {
      const uri = await captureRef(ref, { format: 'png', quality: 1, width: CARD_W * 3, height: CARD_H * 3, result: 'tmpfile' });
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: text, UTI: 'public.png' });
      return;
    }
  } catch {
    // fall through to text share
  }
  await Share.share({ message: text });
}
