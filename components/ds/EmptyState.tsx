import { LinearGradient } from 'expo-linear-gradient';
import { View } from 'react-native';

import { Button, Card, Row, T } from '@/components/ds/primitives';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { color, space } from '@/theme/tokens';

type IconName = Parameters<typeof IconSymbol>[0]['name'];
type Action = { label: string; onPress: () => void; tone?: 'volt' | 'gold' | 'ghost' };

/** An icon in a glowing disc: the visual anchor for empty and error states. */
function Glyph({ icon, tint }: { icon: IconName; tint: string }) {
  return (
    <View style={{ width: 72, height: 72, alignItems: 'center', justifyContent: 'center' }}>
      <LinearGradient colors={[`${tint}40`, `${tint}00`]} style={{ position: 'absolute', width: 72, height: 72, borderRadius: 36 }} />
      <View style={{ width: 52, height: 52, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: color.raised, borderWidth: 1, borderColor: `${tint}55` }}>
        <IconSymbol name={icon} size={24} color={tint} />
      </View>
    </View>
  );
}

/**
 * What to show when there's nothing yet: say why it's empty in human terms, then give the one or two
 * things that fill it. `steps` optionally explains the loop for first-timers.
 */
export function EmptyState({
  icon,
  title,
  body,
  primary,
  secondary,
  steps,
  tint = color.volt,
}: {
  icon: IconName;
  title: string;
  body: string;
  primary?: Action;
  secondary?: Action;
  steps?: [IconName, string][];
  tint?: string;
}) {
  return (
    <Card style={{ alignItems: 'center', paddingVertical: space.xl, gap: space.sm }}>
      <Glyph icon={icon} tint={tint} />
      <T v="heading" style={{ textAlign: 'center', marginTop: space.xs }}>{title}</T>
      <T v="caption" style={{ textAlign: 'center', maxWidth: 280 }}>{body}</T>
      {steps ? (
        <View style={{ alignSelf: 'stretch', gap: space.sm, marginTop: space.md }}>
          {steps.map(([i, text], n) => (
            <Row key={text} gap={space.md} style={{ backgroundColor: color.surface, borderRadius: 14, padding: space.md }}>
              <View style={{ width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: `${tint}22` }}>
                <IconSymbol name={i} size={15} color={tint} />
              </View>
              <T v="caption" style={{ flex: 1, color: color.text }}>
                <T v="caption" style={{ color: tint }}>{n + 1}. </T>
                {text}
              </T>
            </Row>
          ))}
        </View>
      ) : null}
      {primary || secondary ? (
        <View style={{ alignSelf: 'stretch', gap: space.sm, marginTop: space.md }}>
          {primary ? <Button label={primary.label} onPress={primary.onPress} tone={primary.tone ?? (tint === color.gold ? 'gold' : 'volt')} /> : null}
          {secondary ? <Button label={secondary.label} onPress={secondary.onPress} tone={secondary.tone ?? 'ghost'} /> : null}
        </View>
      ) : null}
    </Card>
  );
}

/** Couldn't load and there's nothing cached to fall back on. */
export function ErrorState({ onRetry, message }: { onRetry: () => void; message?: string }) {
  return (
    <EmptyState
      icon="wifi.exclamationmark"
      tint={color.muted}
      title="Can't reach StepPool"
      body={message && !/network|fetch|timed? ?out|unavailable/i.test(message) ? message : 'Check your connection. If you just opened the app, the server may be waking up; try again in a few seconds.'}
      primary={{ label: 'Try again', onPress: onRetry, tone: 'ghost' }}
    />
  );
}
