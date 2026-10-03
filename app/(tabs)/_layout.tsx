import { Tabs } from 'expo-router';

import { TabBar } from '@/components/ds/TabBar';
import { color } from '@/theme/tokens';

export default function TabLayout() {
  return (
    <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: color.bg }, animation: 'shift' }}>
      <Tabs.Screen name="index" options={{ title: 'Today' }} />
      <Tabs.Screen name="challenges" options={{ title: 'Challenges' }} />
      <Tabs.Screen name="wallet" options={{ title: 'Wallet' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}
