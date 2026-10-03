import { useEventListener } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { T } from '@/components/ds/primitives';
import { haptic } from '@/lib/haptics';
import { color } from '@/theme/tokens';

const SOURCE = require('@/assets/video/intro.mp4');
/** If playback makes no progress for this long (stuck, or never started), move on to sign-in. */
const STALL_MS = 9000; // generous: dev builds stream the clip from Metro; release builds bundle it

/**
 * First-launch brand intro: the footprints walk in and the wordmark appears, on a full-bleed volt
 * field that matches the square video's background. Plays once, tap to skip, then fades and lifts
 * away to reveal sign-in, which is already rendered underneath.
 */
export function Intro({ onDone }: { onDone: () => void }) {
  const { width, height } = useWindowDimensions();
  const opacity = useSharedValue(0);
  const scale = useSharedValue(1);
  const finished = useRef(false);

  const player = useVideoPlayer(SOURCE, (p) => {
    p.loop = false;
    p.muted = true;
    p.play();
  });

  const finish = (why = 'tap') => {
    if (finished.current) return;
    finished.current = true;
    haptic.tick();
    scale.value = withTiming(1.06, { duration: 520, easing: Easing.out(Easing.cubic) });
    opacity.value = withTiming(0, { duration: 520, easing: Easing.out(Easing.cubic) }, (ok) => {
      if (ok) scheduleOnRN(onDone);
    });
  };

  useEventListener(player, 'playToEnd', () => finish('ended'));

  // Safety net based on real playback progress, not wall-clock time: 'isPlaying' turns true while
  // the clip is still buffering, so a timer from that moment can cut it short. We finish if the
  // position stops advancing for STALL_MS (stuck or never started), or once it reaches the end.
  const lastProgress = useRef(Date.now());
  const lastTime = useRef(0);
  useEventListener(player, 'timeUpdate', ({ currentTime }) => {
    if (currentTime > lastTime.current + 0.01) {
      lastTime.current = currentTime;
      lastProgress.current = Date.now();
    }
    if (player.duration > 0 && currentTime >= player.duration - 0.08) finish('ended');
  });

  useEffect(() => {
    opacity.value = withTiming(1, { duration: 280 }); // soften the cut from the dark splash
    player.timeUpdateEventInterval = 0.25;
    lastProgress.current = Date.now();
    const id = setInterval(() => {
      if (Date.now() - lastProgress.current > STALL_MS) finish('stalled');
    }, 500);
    return () => clearInterval(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const style = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ scale: scale.value }] }));
  const side = Math.min(width, height);

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.root, style]}>
      <Pressable style={styles.fill} onPress={() => finish('tap')} accessibilityRole="button" accessibilityLabel="Skip intro">
        <VideoView
          player={player}
          style={{ width: side, height: side }}
          contentFit="contain"
          nativeControls={false}
          allowsPictureInPicture={false}
          surfaceType="textureView"
          useExoShutter={false}
          pointerEvents="none"
        />
        <T v="label" style={styles.skip}>Tap to skip</T>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: color.volt, zIndex: 100 },
  fill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  skip: { position: 'absolute', bottom: 56, color: 'rgba(7,8,10,0.45)', fontSize: 10 },
});
