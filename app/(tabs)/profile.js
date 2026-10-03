import CoachChatButton from "@/components/CoachChatButton";
import SectionCard from "@/components/SectionCard";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { Image, StyleSheet, Text, View } from "react-native";

export default function ProfileScreen() {
  const user = {
    name: "Leslie Paul",
    age: 26,
    goal: "Lean Muscle Gain",
    coach: "Coach Ama",
    height: 193,
    weight: 80,
    bmi: 21.3,
    level: "Intermediate",
    streak: 18,
    totalWorkouts: 120,
    joined: "Jan 2024",
    avatar: "https://randomuser.me/api/portraits/men/75.jpg",
  };

  return (
    <View style={styles.container}>
      {/* --- PROFILE HEADER --- */}
      <View style={styles.profileHeader}>
        <Image source={{ uri: user.avatar }} style={styles.avatar} />
        <View>
          <Text style={styles.name}>{user.name}</Text>
          <Text style={styles.sub}>{user.goal}</Text>
          <Text style={styles.subSmall}>Member since {user.joined}</Text>
        </View>
      </View>

      {/* --- PERSONAL DETAILS --- */}
      <SectionCard title="Personal Details">
        <Text>Age: {user.age}</Text>
        <Text>Height: {user.height} cm</Text>
        <Text>Weight: {user.weight} kg</Text>
        <Text>BMI: {user.bmi}</Text>
      </SectionCard>

      {/* --- FITNESS STATS --- */}
      <SectionCard title="Fitness Stats">
        <View style={styles.row}>
          <Ionicons name="barbell-outline" size={22} color="#22C55E" />
          <Text style={styles.item}>Total Workouts: {user.totalWorkouts}</Text>
        </View>
        <View style={styles.row}>
          <MaterialCommunityIcons
            name="fire"
            size={22}
            color="#EF4444"
          />
          <Text style={styles.item}>Workout Streak: {user.streak} days 🔥</Text>
        </View>
        <View style={styles.row}>
          <Ionicons name="speedometer-outline" size={22} color="#3B82F6" />
          <Text style={styles.item}>Fitness Level: {user.level}</Text>
        </View>
      </SectionCard>

      {/* --- GOAL PROGRESS --- */}
      <SectionCard title="Goal Progress">
        <View style={styles.progressBarBackground}>
          <View style={[styles.progressBarFill, { width: "70%" }]} />
        </View>
        <Text style={styles.progressText}>70% to Goal Completion</Text>
        <Text style={{ fontSize: 13, color: "#6B7280" }}>
          Keep it up, {user.name.split(" ")[0]}! 💪🏽
        </Text>
      </SectionCard>

      {/* --- ASSIGNED COACH --- */}
      <SectionCard title="Assigned Coach">
        <View style={styles.row}>
          <Ionicons name="person-outline" size={22} color="#3B82F6" />
          <Text style={styles.item}>{user.coach}</Text>
        </View>
        <Text style={{ color: "#6B7280", marginTop: 4 }}>
          Available weekdays 8 AM – 6 PM
        </Text>
      </SectionCard>

      {/* --- CHAT BUTTON --- */}
      <CoachChatButton onPress={() => alert(`Messaging ${user.coach}...`)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8F9FA", padding: 16 },
  profileHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  avatar: { width: 72, height: 72, borderRadius: 36, marginRight: 14 },
  name: { fontSize: 21, fontWeight: "800" },
  sub: { color: "#6B7280", fontSize: 14 },
  subSmall: { color: "#9CA3AF", fontSize: 12 },
  row: { flexDirection: "row", alignItems: "center", marginVertical: 4 },
  item: { marginLeft: 8, fontSize: 15, color: "#333" },
  progressBarBackground: {
    height: 8,
    backgroundColor: "#E5E7EB",
    borderRadius: 10,
    marginTop: 4,
  },
  progressBarFill: {
    height: 8,
    backgroundColor: "#3B82F6",
    borderRadius: 10,
  },
  progressText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#22C55E",
    marginTop: 6,
  },
});
