// Maps are native-only; the web build (used for previews) shows a placeholder instead.
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { T } from '@/components/ds/primitives';
import { color } from '@/theme/tokens';

export type MapCamera = { kind: 'follow'; zoom?: number; pitch?: number; bearing?: number } | { kind: 'bounds'; bounds: [number, number, number, number]; pitch?: number } | { kind: 'free' };

export function WalkMap({ style }: { style?: StyleProp<ViewStyle>; [key: string]: unknown }) {
  return (
    <View style={[{ backgroundColor: color.surface, alignItems: 'center', justifyContent: 'center' }, style]}>
      <T v="caption">Maps are available in the app.</T>
    </View>
  );
}
