import { LinearGradient } from 'expo-linear-gradient';
import { forwardRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { Coin } from '@/components/ds/Coin';
import { inviteUrl } from '@/lib/invite';
import { ghs } from '@/shared/cash';
import type { ChallengeSummary } from '@/shared/contracts';
import { color, font } from '@/theme/tokens';

// Cards are laid out at 360x640 logical points and captured at 3x → 1080x1920 (story size).
export const CARD_W = 360;
export const CARD_H = 640;

function Frame({ children, accent }: { children: React.ReactNode; accent: string }) {
  return (
    <View style={styles.frame}>
      <LinearGradient colors={[`${accent}40`, `${accent}00`]} style={styles.glow} />
      <View style={[styles.orb, { backgroundColor: accent }]} />
      {children}
      <View style={styles.brand}>
        <Text allowFontScaling={false} style={[styles.brandText, { color: accent }]}>STEPPOOL</Text>
        <Text allowFontScaling={false} style={styles.small}>Walk. Hit your goal. Share the pool.</Text>
      </View>
    </View>
  );
}

/** Invite card: the thing that spreads in WhatsApp groups. */
export const InviteCard = forwardRef<View, { c: ChallengeSummary; from: string }>(function InviteCard({ c, from }, ref) {
  const sponsored = c.kind === 'sponsored';
  const isCash = c.kind === 'cash';
  const accent = sponsored ? color.gold : color.volt;
  return (
    <View ref={ref} collapsable={false}>
      <Frame accent={accent}>
        <Text allowFontScaling={false} style={styles.kicker}>{from.toUpperCase()} INVITED YOU</Text>
        <Text allowFontScaling={false} style={styles.title}>{c.name}</Text>
        {sponsored ? <Text allowFontScaling={false} style={[styles.small, { color: accent }]}>Presented by {c.sponsor?.name}</Text> : null}
        <View style={styles.stats}>
          <Stat
            label={sponsored ? 'Prize' : 'Pool'}
            coin={sponsored || isCash ? undefined : 'gold'}
            value={sponsored ? `GH₵${c.sponsor?.prizeValueGhs.toLocaleString()}` : isCash ? ghs(c.poolCredits) : c.poolCredits.toLocaleString()}
            accent={color.gold}
          />
          <Stat label="Entry" coin={!isCash && c.entryCredits ? 'silver' : undefined} value={isCash ? ghs(c.entryPesewas ?? 0) : c.entryCredits ? String(c.entryCredits) : 'Free'} />
          <Stat label="Walking" value={String(c.players)} />
        </View>
        <View style={styles.qrWrap}>
          <View style={styles.qr}>
            <QRCode value={inviteUrl(c.inviteCode)} size={112} backgroundColor="#F4F1EA" color="#07080A" />
          </View>
          <View style={{ flex: 1, gap: 6 }}>
            <Text allowFontScaling={false} style={styles.small}>Join with code</Text>
            <Text allowFontScaling={false} style={[styles.code, { color: accent }]}>{c.inviteCode}</Text>
            <Text allowFontScaling={false} style={styles.small}>Hit your personal goal to share the pool.</Text>
          </View>
        </View>
      </Frame>
    </View>
  );
});

/** Result card: posted after the goal is hit or the challenge settles. */
export const ResultCard = forwardRef<View, { c: ChallengeSummary; name: string; steps: number; rank: number; goalHit: boolean; won?: string }>(
  function ResultCard({ c, name, steps, rank, goalHit, won }, ref) {
    const accent = goalHit ? color.gold : color.volt;
    return (
      <View ref={ref} collapsable={false}>
        <Frame accent={accent}>
          <Text allowFontScaling={false} style={styles.kicker}>{c.name.toUpperCase()}</Text>
          <Text allowFontScaling={false} style={[styles.hero, { color: accent }]}>{steps.toLocaleString()}</Text>
          <Text allowFontScaling={false} style={styles.title}>steps</Text>
          <View style={styles.stats}>
            <Stat label="Rank" value={`#${rank}`} />
            <Stat label="Goal" value={goalHit ? 'Hit ✓' : 'Missed'} accent={goalHit ? color.gold : undefined} />
            {won ? <Stat label="Won" value={won} accent={color.gold} /> : <Stat label="Players" value={String(c.players)} />}
          </View>
          <Text allowFontScaling={false} style={[styles.small, { marginTop: 28 }]}>{name} on StepPool · code {c.inviteCode}</Text>
        </Frame>
      </View>
    );
  },
);

function Stat({ label, value, accent, coin }: { label: string; value: string; accent?: string; coin?: 'gold' | 'silver' }) {
  return (
    <View style={{ flex: 1 }}>
      <Text allowFontScaling={false} style={styles.statLabel}>{label.toUpperCase()}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 }}>
        {coin ? <Coin tone={coin} size={20} /> : null}
        <Text allowFontScaling={false} style={[styles.statValue, { marginTop: 0 }, accent ? { color: accent } : null]}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { width: CARD_W, height: CARD_H, backgroundColor: color.bg, padding: 28, paddingTop: 72, overflow: 'hidden' },
  glow: { position: 'absolute', top: 0, left: 0, right: 0, height: 320 },
  orb: { position: 'absolute', width: 260, height: 260, borderRadius: 130, top: -150, right: -90, opacity: 0.18 },
  kicker: { fontFamily: font.bodySemi, fontSize: 11, letterSpacing: 2, color: color.muted },
  title: { fontFamily: font.display, fontSize: 34, letterSpacing: -1.2, color: color.text, marginTop: 10 },
  hero: { fontFamily: font.display, fontSize: 76, letterSpacing: -3.5, marginTop: 28, fontVariant: ['tabular-nums'] },
  stats: { flexDirection: 'row', marginTop: 36, gap: 12 },
  statLabel: { fontFamily: font.bodySemi, fontSize: 10, letterSpacing: 1.6, color: color.muted },
  statValue: { fontFamily: font.display, fontSize: 22, color: color.text, marginTop: 4 },
  qrWrap: { flexDirection: 'row', alignItems: 'center', gap: 18, marginTop: 40 },
  qr: { padding: 10, backgroundColor: '#F4F1EA', borderRadius: 16 },
  code: { fontFamily: font.display, fontSize: 30, letterSpacing: 4 },
  brand: { position: 'absolute', left: 28, right: 28, bottom: 36, gap: 4 },
  brandText: { fontFamily: font.display, fontSize: 18, letterSpacing: 4 },
  small: { fontFamily: font.bodyMedium, fontSize: 12, color: color.muted },
});
