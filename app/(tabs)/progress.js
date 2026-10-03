import CoachChatButton from "@/components/CoachChatButton";
import SectionCard from "@/components/SectionCard";
import { FontAwesome5, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

export default function ProgressScreen() {
  const mockProgress = {
    weight: { start: 80, current: 75, goal: 72 },
    bodyFat: { start: 22, current: 18, goal: 15 },
    muscleMass: { start: 60, current: 65 },
    consistency: 90,
    totalWorkouts: 120,
    streakDays: 14,
  };

  // calculate % progress toward goal
  const calcProgress = (start, current, goal) => {
    if (!goal) return 0;
    return (((start - current) / (start - goal)) * 100).toFixed(1);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Progress Overview 📈</Text>

      {/* --- BODY METRICS SECTION --- */}
      <SectionCard title="Body Metrics">
        <View style={styles.row}>
          <Ionicons name="body-outline" size={20} color="#3B82F6" />
          <Text style={styles.item}>
            Weight: {mockProgress.weight.start}kg → {mockProgress.weight.current}kg (Goal:{" "}
            {mockProgress.weight.goal}kg)
          </Text>
        </View>

        <View style={styles.row}>
          <FontAwesome5 name="percentage" size={16} color="#22C55E" />
          <Text style={styles.item}>
            Body Fat: {mockProgress.bodyFat.start}% → {mockProgress.bodyFat.current}% (Goal:{" "}
            {mockProgress.bodyFat.goal}%)
          </Text>
        </View>

        <View style={styles.row}>
          <MaterialCommunityIcons name="arm-flex" size={20} color="#F59E0B" />
          <Text style={styles.item}>
            Muscle Mass: {mockProgress.muscleMass.start}kg → {mockProgress.muscleMass.current}kg
          </Text>
        </View>

        <View style={styles.progressBox}>
          <Text style={styles.progressText}>
            Weight Progress: {calcProgress(80, 75, 72)}%
          </Text>
          <View style={styles.progressBarBackground}>
            <View
              style={[
                styles.progressBarFill,
                { width: `${calcProgress(80, 75, 72)}%` },
              ]}
            />
          </View>
        </View>
      </SectionCard>

      {/* --- ACTIVITY SECTION --- */}
      <SectionCard title="Training Activity">
        <View style={styles.row}>
          <MaterialCommunityIcons name="dumbbell" size={20} color="#8B5CF6" />
          <Text style={styles.item}>
            Total Workouts Completed: {mockProgress.totalWorkouts}
          </Text>
        </View>

        <View style={styles.row}>
          <Ionicons name="flame-outline" size={20} color="#EF4444" />
          <Text style={styles.item}>Current Streak: {mockProgress.streakDays} days 🔥</Text>
        </View>
      </SectionCard>

      {/* --- CONSISTENCY SECTION --- */}
      <SectionCard title="Consistency">
        <View style={styles.row}>
          <Ionicons name="barbell-outline" size={20} color="#22C55E" />
          <Text style={styles.item}>
            Workout Adherence: {mockProgress.consistency}%
          </Text>
        </View>
      </SectionCard>

      <CoachChatButton onPress={() => alert("Share progress with Coach")} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8F9FA", padding: 16 },
  heading: { fontSize: 22, fontWeight: "800", marginBottom: 16 },
  row: { flexDirection: "row", alignItems: "center", marginVertical: 4 },
  item: { marginLeft: 8, fontSize: 15, color: "#333" },
  progressBox: { marginTop: 10 },
  progressText: { fontSize: 14, fontWeight: "600", color: "#374151" },
  progressBarBackground: {
    height: 8,
    backgroundColor: "#E5E7EB",
    borderRadius: 10,
    marginTop: 6,
  },
  progressBarFill: {
    height: 8,
    backgroundColor: "#3B82F6",
    borderRadius: 10,
  },
});
