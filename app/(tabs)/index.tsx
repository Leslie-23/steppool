import { FontAwesome5, Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import {
  Alert,
  ProgressBarAndroid,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

// Mock Data Generators
const generateDailyStats = () => ({
  steps: Math.floor(Math.random() * 5000) + 7000,
  calories: Math.floor(Math.random() * 300) + 400,
  activeMinutes: Math.floor(Math.random() * 40) + 30,
  distance: (Math.random() * 3 + 4).toFixed(1),
});

const generateWeeklyProgress = () => {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return days.map((day) => ({
    day,
    steps: Math.floor(Math.random() * 6000) + 6000,
  }));
};

const generateNutrition = () => ({
  protein: Math.floor(Math.random() * 50) + 60,
  carbs: Math.floor(Math.random() * 100) + 150,
  fats: Math.floor(Math.random() * 30) + 30,
  caloriesGoal: 2200,
  caloriesConsumed: Math.floor(Math.random() * 800) + 1500,
});

const generateWorkouts = () => [
  {
    id: 1,
    name: "Upper Body Strength",
    time: "4:00 PM",
    duration: "45 mins",
    completed: false,
    exercises: [
      { name: "Push-ups", sets: 3, reps: 15 },
      { name: "Dumbbell Rows", sets: 3, reps: 12 },
      { name: "Plank Hold", sets: 3, reps: "60s" },
    ],
  },
  {
    id: 2,
    name: "Cardio Blast",
    time: "Tomorrow 7:00 AM",
    duration: "30 mins",
    completed: false,
    exercises: [
      { name: "Jumping Jacks", sets: 4, reps: 30 },
      { name: "High Knees", sets: 4, reps: "45s" },
      { name: "Mountain Climbers", sets: 3, reps: 20 },
    ],
  },
];

const generateSleepData = () => ({
  lastNight: (Math.random() * 2 + 6).toFixed(1),
  avg: (Math.random() * 1 + 6.5).toFixed(1),
});

const generateGoals = () => [
  { id: 1, label: "Run 30 km this week", progress: Math.random() * 0.7 },
  { id: 2, label: "Lose 1.5 kg this month", progress: Math.random() * 0.6 },
  { id: 3, label: "Workout 5 days this week", progress: Math.random() },
];

// Reusable Components
const SectionCard = ({ title, children, style }) => (
  <View style={[styles.sectionCard, style]}>
    <Text style={styles.sectionTitle}>{title}</Text>
    {children}
  </View>
);

const StatItem = ({ icon, value, label, color = "#333" }) => (
  <View style={styles.statItem}>
    <View style={[styles.iconContainer, { backgroundColor: color + "20" }]}>
      {icon}
    </View>
    <View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  </View>
);

// Main Home Screen Component
export default function HomeScreen() {
  const [todayStats, setTodayStats] = useState(generateDailyStats());
  const [weeklyProgress, setWeeklyProgress] = useState(
    generateWeeklyProgress()
  );
  const [nutrition, setNutrition] = useState(generateNutrition());
  const [workouts, setWorkouts] = useState(generateWorkouts());
  const [sleep, setSleep] = useState(generateSleepData());
  const [hydration, setHydration] = useState({ goal: 3000, consumed: 2100 });
  const [goals, setGoals] = useState(generateGoals());

  useEffect(() => {
    // Simulate data updates every 30 seconds
    const interval = setInterval(() => {
      setTodayStats(generateDailyStats());
      setNutrition(generateNutrition());
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  const refreshData = () => {
    setTodayStats(generateDailyStats());
    setWeeklyProgress(generateWeeklyProgress());
    setNutrition(generateNutrition());
    setWorkouts(generateWorkouts());
    setSleep(generateSleepData());
    setGoals(generateGoals());
    setHydration((prev) => ({
      ...prev,
      consumed: Math.floor(Math.random() * 1500) + 1500,
    }));
    Alert.alert("Data Refreshed", "Your fitness data has been updated!");
  };

  const addWater = () => {
    setHydration((prev) => ({
      ...prev,
      consumed: Math.min(prev.consumed + 250, prev.goal),
    }));
    Alert.alert("Water Added", "250ml added to your daily intake!");
  };

  const toggleWorkoutCompletion = (workoutId) => {
    setWorkouts(
      workouts.map((workout) =>
        workout.id === workoutId
          ? { ...workout, completed: !workout.completed }
          : workout
      )
    );
  };

  const nextWorkout = workouts.find((w) => !w.completed) || workouts[0];

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.heading}>Welcome back, Leslie 👋</Text>
        <TouchableOpacity onPress={refreshData} style={styles.refreshButton}>
          <Ionicons name="refresh" size={20} color="#3B82F6" />
        </TouchableOpacity>
      </View>

      {/* Today's Stats Grid */}
      <SectionCard title="Today's Activity">
        <View style={styles.statsGrid}>
          <StatItem
            icon={<Ionicons name="walk-outline" size={20} color="#3B82F6" />}
            value={todayStats.steps.toLocaleString()}
            label="Steps"
            color="#3B82F6"
          />
          <StatItem
            icon={<Ionicons name="flame-outline" size={20} color="#EF4444" />}
            value={todayStats.calories}
            label="Calories"
            color="#EF4444"
          />
          <StatItem
            icon={<Ionicons name="time-outline" size={20} color="#22C55E" />}
            value={todayStats.activeMinutes}
            label="Active Min"
            color="#22C55E"
          />
          <StatItem
            icon={<Ionicons name="map-outline" size={20} color="#8B5CF6" />}
            value={todayStats.distance}
            label="Distance (km)"
            color="#8B5CF6"
          />
        </View>
      </SectionCard>

      {/* Quick Stats Row */}
      <View style={styles.row}>
        <SectionCard title="Nutrition" style={styles.halfCard}>
          <Text style={styles.calories}>
            {nutrition.caloriesConsumed}/{nutrition.caloriesGoal} kcal
          </Text>
          <View style={styles.macroRow}>
            <Text style={styles.macroItem}>Protein: {nutrition.protein}g</Text>
            <Text style={styles.macroItem}>Carbs: {nutrition.carbs}g</Text>
            <Text style={styles.macroItem}>Fats: {nutrition.fats}g</Text>
          </View>
        </SectionCard>

        <SectionCard title="Sleep" style={styles.halfCard}>
          <Text style={styles.sleepHours}>{sleep.lastNight} hrs</Text>
          <Text style={styles.sleepAvg}>Avg: {sleep.avg} hrs</Text>
        </SectionCard>
      </View>

      {/* Next Workout */}
      <SectionCard title="Next Workout">
        <View style={styles.workoutHeader}>
          <View>
            <Text style={styles.workoutName}>{nextWorkout.name}</Text>
            <Text style={styles.workoutTime}>{nextWorkout.time}</Text>
            <Text style={styles.workoutDuration}>{nextWorkout.duration}</Text>
          </View>
          <TouchableOpacity
            onPress={() => toggleWorkoutCompletion(nextWorkout.id)}
            style={styles.completionButton}
          >
            <Ionicons
              name={
                nextWorkout.completed ? "checkmark-circle" : "ellipse-outline"
              }
              size={24}
              color={nextWorkout.completed ? "#22C55E" : "#666"}
            />
          </TouchableOpacity>
        </View>

        {nextWorkout.exercises.map((ex, i) => (
          <Text key={i} style={styles.exerciseItem}>
            • {ex.name} — {ex.sets} sets × {ex.reps} reps
          </Text>
        ))}

        <TouchableOpacity
          style={[
            styles.startButton,
            nextWorkout.completed && styles.completedWorkoutButton,
          ]}
          onPress={() =>
            Alert.alert(
              "Workout",
              nextWorkout.completed
                ? "Starting this workout again!"
                : "Starting your workout!"
            )
          }
        >
          <Text style={styles.startButtonText}>
            {nextWorkout.completed ? "Repeat Workout" : "Start Workout"}
          </Text>
        </TouchableOpacity>
      </SectionCard>

      {/* Hydration */}
      <SectionCard title="Hydration">
        <View style={styles.hydrationSection}>
          <View style={styles.waterProgress}>
            <FontAwesome5 name="tint" size={24} color="#0EA5E9" />
            <View style={styles.waterText}>
              <Text style={styles.waterAmount}>
                {hydration.consumed} / {hydration.goal} ml
              </Text>
              <ProgressBarAndroid
                styleAttr="Horizontal"
                progress={hydration.consumed / hydration.goal}
                color="#0EA5E9"
                style={styles.waterProgressBar}
              />
            </View>
          </View>
          <TouchableOpacity style={styles.addWaterButton} onPress={addWater}>
            <Text style={styles.addWaterText}>+ 250ml</Text>
          </TouchableOpacity>
        </View>
      </SectionCard>

      {/* Weekly Progress */}
      <SectionCard title="Weekly Steps Progress">
        {weeklyProgress.map((day, i) => (
          <View key={i} style={styles.progressRow}>
            <Text style={styles.dayLabel}>{day.day}</Text>
            <ProgressBarAndroid
              styleAttr="Horizontal"
              progress={day.steps / 12000}
              color="#3B82F6"
              style={styles.progressBar}
            />
            <Text style={styles.stepsCount}>{day.steps.toLocaleString()}</Text>
          </View>
        ))}
      </SectionCard>

      {/* Goals Progress */}
      <SectionCard title="Your Goals">
        {goals.map((goal) => (
          <View key={goal.id} style={styles.goalItem}>
            <View style={styles.goalHeader}>
              <Text style={styles.goalLabel}>{goal.label}</Text>
              <Text style={styles.goalProgress}>
                {Math.round(goal.progress * 100)}%
              </Text>
            </View>
            <ProgressBarAndroid
              styleAttr="Horizontal"
              progress={goal.progress}
              color="#22C55E"
              style={styles.goalProgressBar}
            />
          </View>
        ))}
      </SectionCard>

      {/* Upcoming Workouts */}
      <SectionCard title="Upcoming Workouts">
        {workouts
          .filter((w) => w.id !== nextWorkout.id)
          .map((workout) => (
            <TouchableOpacity key={workout.id} style={styles.upcomingWorkout}>
              <View style={styles.workoutInfo}>
                <Text style={styles.upcomingWorkoutName}>{workout.name}</Text>
                <Text style={styles.upcomingWorkoutTime}>{workout.time}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#999" />
            </TouchableOpacity>
          ))}
      </SectionCard>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8F9FA",
    padding: 16,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  heading: {
    fontSize: 22,
    fontWeight: "800",
    color: "#1F2937",
  },
  refreshButton: {
    padding: 8,
  },

  // Section Cards
  sectionCard: {
    backgroundColor: "white",
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 12,
    color: "#1F2937",
  },

  // Stats Grid
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  statItem: {
    flexDirection: "row",
    alignItems: "center",
    width: "48%",
    marginBottom: 12,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  statValue: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1F2937",
  },
  statLabel: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 2,
  },

  // Layout
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  halfCard: {
    width: "48%",
  },

  // Nutrition
  calories: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1F2937",
    marginBottom: 8,
  },
  macroRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  macroItem: {
    fontSize: 12,
    color: "#6B7280",
  },

  // Sleep
  sleepHours: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1F2937",
    marginBottom: 4,
  },
  sleepAvg: {
    fontSize: 12,
    color: "#6B7280",
  },

  // Workout Styles
  workoutHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  workoutName: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1F2937",
  },
  workoutTime: {
    fontSize: 14,
    color: "#3B82F6",
    fontWeight: "600",
    marginTop: 2,
  },
  workoutDuration: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 2,
  },
  completionButton: {
    padding: 4,
  },
  exerciseItem: {
    fontSize: 14,
    color: "#555",
    marginBottom: 4,
    marginLeft: 8,
  },
  startButton: {
    backgroundColor: "#3B82F6",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 12,
  },
  completedWorkoutButton: {
    backgroundColor: "#22C55E",
  },
  startButtonText: {
    color: "white",
    fontWeight: "600",
  },

  // Hydration
  hydrationSection: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  waterProgress: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  waterText: {
    marginLeft: 12,
    flex: 1,
  },
  waterAmount: {
    fontSize: 16,
    color: "#1F2937",
    marginBottom: 4,
  },
  waterProgressBar: {
    height: 6,
  },
  addWaterButton: {
    backgroundColor: "#0EA5E9",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
  },
  addWaterText: {
    color: "white",
    fontWeight: "600",
    fontSize: 12,
  },

  // Progress Styles
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 6,
  },
  dayLabel: {
    width: 40,
    fontSize: 14,
    color: "#555",
  },
  progressBar: {
    flex: 1,
    marginHorizontal: 10,
    height: 6,
  },
  stepsCount: {
    width: 60,
    textAlign: "right",
    fontSize: 13,
    color: "#666",
  },

  // Goal Styles
  goalItem: {
    marginBottom: 12,
  },
  goalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  goalLabel: {
    fontSize: 14,
    color: "#374151",
    flex: 1,
  },
  goalProgress: {
    fontSize: 14,
    color: "#22C55E",
    fontWeight: "600",
  },
  goalProgressBar: {
    marginTop: 4,
    height: 6,
  },

  // Upcoming Workouts
  upcomingWorkout: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  workoutInfo: {
    flex: 1,
  },
  upcomingWorkoutName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1F2937",
    marginBottom: 2,
  },
  upcomingWorkoutTime: {
    fontSize: 12,
    color: "#6B7280",
  },
});
