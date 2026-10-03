import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Tabs } from "expo-router";
import React from "react";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <SafeAreaProvider>
      <SafeAreaView
        style={{
          flex: 1,
          backgroundColor: Colors[colorScheme ?? "light"].background,
        }}
      >
        <Tabs
          screenOptions={{
            headerShown: false,
            tabBarButton: HapticTab,
            tabBarActiveTintColor: Colors[colorScheme ?? "light"].tint,
            tabBarInactiveTintColor: Colors[colorScheme ?? "light"].muted,
            tabBarStyle: {
              backgroundColor: Colors[colorScheme ?? "light"].card,
              borderTopWidth: 0,
              height: 70,
              elevation: 8,
            },
          }}
        >
          <Tabs.Screen
            name="index"
            options={{
              title: "Home",
              tabBarIcon: ({ color }) => (
                <IconSymbol size={26} name="flame.fill" color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="workouts"
            options={{
              title: "Workouts",
              tabBarIcon: ({ color }) => (
                <IconSymbol
                  size={26}
                  name="figure.strengthtraining.traditional"
                  color={color}
                />
              ),
            }}
          />
          <Tabs.Screen
            name="progress"
            options={{
              title: "Progress",
              tabBarIcon: ({ color }) => (
                <IconSymbol size={26} name="chart.bar.fill" color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="nutrition"
            options={{
              title: "Nutrition",
              tabBarIcon: ({ color }) => (
                <IconSymbol size={26} name="fork.knife" color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="profile"
            options={{
              title: "Profile",
              tabBarIcon: ({ color }) => (
                <IconSymbol
                  size={26}
                  name="person.crop.circle.fill"
                  color={color}
                />
              ),
            }}
          />
        </Tabs>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
