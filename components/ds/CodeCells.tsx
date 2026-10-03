import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { Pressable, StyleSheet, TextInput, type TextInputProps } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';

import { T } from '@/components/ds/primitives';
import { haptic } from '@/lib/haptics';
import { spring } from '@/theme/motion';
import { color, radius, type } from '@/theme/tokens';

export type CodeCellsHandle = { shake: () => void; focus: () => void; blur: () => void };

/**
 * Six boxes over a hidden TextInput. Each character pops in with a tick; `shake()` for a wrong code.
 * `sanitize` turns raw keyboard/paste input into the code characters.
 */
export const CodeCells = forwardRef<CodeCellsHandle, {
  value: string;
  onChange: (v: string) => void;
  length?: number;
  sanitize: (raw: string) => string;
  inputProps?: TextInputProps;
}>(function CodeCells({ value, onChange, length = 6, sanitize, inputProps }, ref) {
  const input = useRef<TextInput>(null);
  const shake = useSharedValue(0);
  useImperativeHandle(ref, () => ({
    shake: () => {
      haptic.error();
      shake.value = withSequence(withTiming(-10, { duration: 50 }), withTiming(10, { duration: 50 }), withTiming(-6, { duration: 50 }), withSpring(0, spring.snappy));
    },
    focus: () => input.current?.focus(),
    blur: () => input.current?.blur(),
  }));
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));

  return (
    <>
      <Pressable onPress={() => input.current?.focus()} accessibilityLabel={`Code, ${value.length} of ${length} entered`}>
        <Animated.View style={[styles.cells, shakeStyle]}>
          {Array.from({ length }, (_, i) => (
            <Cell key={i} char={value[i]} active={i === value.length} />
          ))}
        </Animated.View>
      </Pressable>
      <TextInput
        ref={input}
        value={value}
        onChangeText={(t) => {
          const next = sanitize(t).slice(0, length);
          if (next.length > value.length) haptic.tick();
          onChange(next);
        }}
        autoFocus
        style={styles.hidden}
        {...inputProps}
      />
    </>
  );
});

function Cell({ char, active }: { char?: string; active: boolean }) {
  const s = useSharedValue(1);
  useEffect(() => {
    if (char) s.value = withSequence(withTiming(1.12, { duration: 80 }), withSpring(1, spring.snappy));
  }, [char, s]);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <Animated.View style={[styles.cell, active && { borderColor: color.volt }, char ? { backgroundColor: color.raised } : null, anim]}>
      <T style={[type.num, { fontSize: 28 }]}>{char ?? ''}</T>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  cells: { flexDirection: 'row', justifyContent: 'space-between' },
  cell: {
    width: 50,
    height: 64,
    borderRadius: radius.md,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hidden: { position: 'absolute', opacity: 0, height: 1, width: 1 },
});
