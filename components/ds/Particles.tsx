import { Canvas, Picture, Skia, type SkPicture } from '@shopify/react-native-skia';
import { useEffect, useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { Easing, useDerivedValue, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

type Particle = { a: number; v: number; r: number; spin: number; hue: number; shape: 0 | 1 };

function seed(n: number): Particle[] {
  return Array.from({ length: n }, () => ({
    a: Math.random() * Math.PI * 2,
    v: 0.45 + Math.random() * 0.75,
    r: 2 + Math.random() * 4,
    spin: (Math.random() - 0.5) * 12,
    hue: Math.random(),
    shape: Math.random() > 0.5 ? 1 : 0,
  }));
}

/**
 * Full-screen confetti burst drawn as one Skia picture per frame (one draw call, no per-particle views).
 * Particles fly out from `origin`, fall with gravity and fade.
 */
export function Burst({ width, height, origin, colors, count = 140, duration = 2200, play }: {
  width: number;
  height: number;
  origin: { x: number; y: number };
  colors: string[];
  count?: number;
  duration?: number;
  play: number; // change this value to replay
}) {
  const t = useSharedValue(1);
  const particles = useMemo(() => seed(count), [count, play]); // eslint-disable-line react-hooks/exhaustive-deps
  const paints = useMemo(() => colors.map((c) => Skia.Color(c)), [colors]);
  const reach = Math.max(width, height) * 0.75;

  useEffect(() => {
    if (!play) return;
    t.value = 0;
    t.value = withTiming(1, { duration, easing: Easing.out(Easing.quad) });
  }, [play, duration, t]);

  const picture = useDerivedValue<SkPicture>(() => {
    const rec = Skia.PictureRecorder();
    const canvas = rec.beginRecording(Skia.XYWHRect(0, 0, width, height));
    const k = t.value;
    if (k < 1) {
      const paint = Skia.Paint();
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        const d = p.v * reach * (1 - (1 - k) * (1 - k));
        const x = origin.x + Math.cos(p.a) * d;
        const y = origin.y + Math.sin(p.a) * d + k * k * height * 0.45;
        paint.setColor(paints[Math.floor(p.hue * paints.length)]);
        paint.setAlphaf(Math.max(0, 1 - k * 1.05));
        if (p.shape === 0) {
          canvas.drawCircle(x, y, p.r, paint);
        } else {
          canvas.save();
          canvas.translate(x, y);
          canvas.rotate(p.spin * k * 57.3, 0, 0);
          canvas.drawRect(Skia.XYWHRect(-p.r, -p.r * 0.4, p.r * 2, p.r * 0.8), paint);
          canvas.restore();
        }
      }
    }
    return rec.finishRecordingAsPicture();
  });

  return (
    <Canvas style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}>
      <Picture picture={picture} />
    </Canvas>
  );
}

/** Slow, ambient sparkle field for prize surfaces. */
export function Sparkles({ width, height, color, count = 18 }: { width: number; height: number; color: string; count?: number }) {
  const t = useSharedValue(0);
  const pts = useMemo(
    () => Array.from({ length: count }, () => ({ x: Math.random(), y: Math.random(), ph: Math.random() * Math.PI * 2, r: 0.8 + Math.random() * 1.6 })),
    [count],
  );
  const paintColor = useMemo(() => Skia.Color(color), [color]);
  useEffect(() => {
    t.value = withRepeat(withTiming(Math.PI * 2, { duration: 4000, easing: Easing.linear }), -1, false);
  }, [t]);
  const picture = useDerivedValue<SkPicture>(() => {
    const rec = Skia.PictureRecorder();
    const canvas = rec.beginRecording(Skia.XYWHRect(0, 0, width, height));
    const paint = Skia.Paint();
    paint.setColor(paintColor);
    for (const p of pts) {
      const a = (Math.sin(t.value + p.ph) + 1) / 2;
      paint.setAlphaf(a * a * 0.9);
      canvas.drawCircle(p.x * width, p.y * height - a * 6, p.r * (0.6 + a * 0.6), paint);
    }
    return rec.finishRecordingAsPicture();
  });
  return (
    <Canvas style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}>
      <Picture picture={picture} />
    </Canvas>
  );
}
