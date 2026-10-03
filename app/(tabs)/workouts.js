// Enhanced Workouts Page for Fitness App
import CoachChatButton from "@/components/CoachChatButton";
import SectionCard from "@/components/SectionCard";
import {
  FontAwesome5,
  Ionicons,
  MaterialCommunityIcons,
} from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

// Mock data generator for dynamic content
const generateWorkouts = () => [
  {
    id: "1",
    name: "Push Day",
    duration: "45 mins",
    focus: "Chest, Shoulders, Triceps",
    equipment: "Dumbbells, Bench",
    calories: Math.floor(Math.random() * 100) + 300,
    difficulty: "Intermediate",
    day: "Monday",
    completed: Math.random() > 0.5,
    favorite: Math.random() > 0.7,
    exercises: [
      { name: "Bench Press", sets: 4, reps: 8 },
      { name: "Overhead Press", sets: 3, reps: 10 },
      { name: "Tricep Extensions", sets: 3, reps: 12 },
      { name: "Chest Flyes", sets: 3, reps: 12 },
    ],
  },
  {
    id: "2",
    name: "Pull Day",
    duration: "50 mins",
    focus: "Back, Biceps",
    equipment: "Pull-up Bar, Cables",
    calories: Math.floor(Math.random() * 100) + 350,
    difficulty: "Intermediate",
    day: "Tuesday",
    completed: Math.random() > 0.5,
    favorite: Math.random() > 0.7,
    exercises: [
      { name: "Pull-ups", sets: 4, reps: 8 },
      { name: "Bent Over Rows", sets: 3, reps: 10 },
      { name: "Bicep Curls", sets: 3, reps: 12 },
      { name: "Face Pulls", sets: 3, reps: 15 },
    ],
  },
  {
    id: "3",
    name: "Leg Day",
    duration: "55 mins",
    focus: "Legs, Glutes",
    equipment: "Barbell, Leg Press",
    calories: Math.floor(Math.random() * 150) + 400,
    difficulty: "Advanced",
    day: "Wednesday",
    completed: Math.random() > 0.5,
    favorite: Math.random() > 0.7,
    exercises: [
      { name: "Barbell Squats", sets: 4, reps: 8 },
      { name: "Romanian Deadlifts", sets: 3, reps: 10 },
      { name: "Leg Press", sets: 3, reps: 12 },
      { name: "Calf Raises", sets: 4, reps: 15 },
    ],
  },
  {
    id: "4",
    name: "Core & Stability",
    duration: "40 mins",
    focus: "Abs, Core, Balance",
    equipment: "Yoga Mat, Medicine Ball",
    calories: Math.floor(Math.random() * 80) + 250,
    difficulty: "Beginner",
    day: "Thursday",
    completed: Math.random() > 0.5,
    favorite: Math.random() > 0.7,
    exercises: [
      { name: "Plank Variations", sets: 3, reps: "60s" },
      { name: "Russian Twists", sets: 3, reps: 20 },
      { name: "Leg Raises", sets: 3, reps: 15 },
      { name: "Bird Dog", sets: 3, reps: 12 },
    ],
  },
  {
    id: "5",
    name: "HIIT Cardio",
    duration: "30 mins",
    focus: "Full Body, Endurance",
    equipment: "Bodyweight Only",
    calories: Math.floor(Math.random() * 150) + 450,
    difficulty: "Advanced",
    day: "Friday",
    completed: Math.random() > 0.5,
    favorite: Math.random() > 0.7,
    exercises: [
      { name: "Burpees", sets: 4, reps: "45s" },
      { name: "Mountain Climbers", sets: 4, reps: "45s" },
      { name: "Jump Squats", sets: 4, reps: "45s" },
      { name: "High Knees", sets: 4, reps: "45s" },
    ],
  },
  {
    id: "6",
    name: "Active Recovery",
    duration: "25 mins",
    focus: "Mobility, Stretching",
    equipment: "Foam Roller, Bands",
    calories: Math.floor(Math.random() * 50) + 150,
    difficulty: "Beginner",
    day: "Sunday",
    completed: Math.random() > 0.5,
    favorite: Math.random() > 0.7,
    exercises: [
      { name: "Dynamic Stretching", sets: 1, reps: "10 mins" },
      { name: "Foam Rolling", sets: 1, reps: "10 mins" },
      { name: "Mobility Drills", sets: 1, reps: "5 mins" },
    ],
  },
];

const difficultyColors = {
  Beginner: "#22C55E",
  Intermediate: "#3B82F6",
  Advanced: "#EF4444",
};

export default function WorkoutsScreen() {
  const [workouts, setWorkouts] = useState([]);
  const [filter, setFilter] = useState("all");
  const [selectedWorkout, setSelectedWorkout] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    // Load initial workouts
    setWorkouts(generateWorkouts());

    // Simulate periodic updates
    const interval = setInterval(() => {
      setWorkouts((prev) =>
        prev.map((workout) => ({
          ...workout,
          calories: workout.calories + Math.floor(Math.random() * 20 - 10),
        }))
      );
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  const toggleFavorite = (workoutId) => {
    setWorkouts((prev) =>
      prev.map((workout) =>
        workout.id === workoutId
          ? { ...workout, favorite: !workout.favorite }
          : workout
      )
    );
  };

  const toggleCompletion = (workoutId) => {
    setWorkouts((prev) =>
      prev.map((workout) =>
        workout.id === workoutId
          ? { ...workout, completed: !workout.completed }
          : workout
      )
    );
  };

  const startWorkout = (workout) => {
    Alert.alert("Start Workout", `Ready to start ${workout.name}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Let's Go!",
        onPress: () => {
          toggleCompletion(workout.id);
          Alert.alert("Workout Started", "Time to crush it! 💪");
        },
      },
    ]);
  };

  const viewWorkoutDetails = (workout) => {
    setSelectedWorkout(workout);
    setModalVisible(true);
  };

  const filteredWorkouts = workouts.filter((workout) => {
    const matchesFilter =
      filter === "all" ||
      (filter === "completed" && workout.completed) ||
      (filter === "favorites" && workout.favorite) ||
      (filter === "pending" && !workout.completed);

    const matchesSearch =
      workout.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      workout.focus.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesFilter && matchesSearch;
  });

  const getStats = () => {
    const total = workouts.length;
    const completed = workouts.filter((w) => w.completed).length;
    const favorites = workouts.filter((w) => w.favorite).length;
    return { total, completed, favorites };
  };

  const stats = getStats();

  return (
    <View style={styles.container}>
      {/* Header with Stats */}
      <View style={styles.header}>
        <Text style={styles.heading}>Your Workout Routines 💪</Text>
        <View style={styles.statsContainer}>
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{stats.total}</Text>
            <Text style={styles.statLabel}>Total</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{stats.completed}</Text>
            <Text style={styles.statLabel}>Done</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{stats.favorites}</Text>
            <Text style={styles.statLabel}>Favorites</Text>
          </View>
        </View>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Ionicons
          name="search"
          size={20}
          color="#666"
          style={styles.searchIcon}
        />
        <TextInput
          style={styles.searchInput}
          placeholder="Search workouts..."
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {/* Filter Buttons */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterContainer}
      >
        {["all", "pending", "completed", "favorites"].map((filterType) => (
          <TouchableOpacity
            key={filterType}
            style={[
              styles.filterButton,
              filter === filterType && styles.filterButtonActive,
            ]}
            onPress={() => setFilter(filterType)}
          >
            <Text
              style={[
                styles.filterText,
                filter === filterType && styles.filterTextActive,
              ]}
            >
              {filterType.charAt(0).toUpperCase() + filterType.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Workouts List */}
      <FlatList
        data={filteredWorkouts}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity onPress={() => viewWorkoutDetails(item)}>
            <SectionCard
              style={[
                styles.workoutCard,
                item.completed && styles.completedWorkout,
              ]}
            >
              {/* Workout Header */}
              <View style={styles.workoutHeader}>
                <View style={styles.workoutTitle}>
                  <Text style={styles.workoutName}>{item.name}</Text>
                  <View
                    style={[
                      styles.difficultyBadge,
                      { backgroundColor: difficultyColors[item.difficulty] },
                    ]}
                  >
                    <Text style={styles.difficultyText}>{item.difficulty}</Text>
                  </View>
                </View>
                <View style={styles.workoutActions}>
                  <TouchableOpacity
                    onPress={() => toggleFavorite(item.id)}
                    style={styles.iconButton}
                  >
                    <Ionicons
                      name={item.favorite ? "heart" : "heart-outline"}
                      size={22}
                      color={item.favorite ? "#EF4444" : "#666"}
                    />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => toggleCompletion(item.id)}
                    style={styles.iconButton}
                  >
                    <Ionicons
                      name={
                        item.completed ? "checkmark-circle" : "ellipse-outline"
                      }
                      size={22}
                      color={item.completed ? "#22C55E" : "#666"}
                    />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Workout Details */}
              <View style={styles.workoutDetails}>
                <View style={styles.detailRow}>
                  <Ionicons name="time-outline" size={16} color="#3B82F6" />
                  <Text style={styles.detailText}>{item.duration}</Text>
                  <Text style={styles.dayTag}>{item.day}</Text>
                </View>

                <View style={styles.detailRow}>
                  <MaterialCommunityIcons
                    name="target"
                    size={16}
                    color="#22C55E"
                  />
                  <Text style={styles.detailText}>{item.focus}</Text>
                </View>

                <View style={styles.detailRow}>
                  <FontAwesome5 name="dumbbell" size={14} color="#8B5CF6" />
                  <Text style={styles.detailText}>{item.equipment}</Text>
                </View>

                <View style={styles.detailRow}>
                  <Ionicons name="flame-outline" size={16} color="#EF4444" />
                  <Text style={styles.detailText}>{item.calories} kcal</Text>
                </View>
              </View>

              {/* Action Button */}
              <TouchableOpacity
                style={[
                  styles.startButton,
                  item.completed && styles.completedButton,
                ]}
                onPress={() => startWorkout(item)}
              >
                <Text style={styles.startButtonText}>
                  {item.completed ? "Workout Again" : "Start Workout"}
                </Text>
              </TouchableOpacity>
            </SectionCard>
          </TouchableOpacity>
        )}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 100 }}
      />

      {/* Workout Detail Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            {selectedWorkout && (
              <>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>{selectedWorkout.name}</Text>
                  <TouchableOpacity onPress={() => setModalVisible(false)}>
                    <Ionicons name="close" size={24} color="#666" />
                  </TouchableOpacity>
                </View>

                <ScrollView>
                  <View style={styles.exerciseSection}>
                    <Text style={styles.exerciseTitle}>Exercises:</Text>
                    {selectedWorkout.exercises.map((exercise, index) => (
                      <View key={index} style={styles.exerciseItem}>
                        <Text style={styles.exerciseName}>
                          • {exercise.name}
                        </Text>
                        <Text style={styles.exerciseDetails}>
                          {exercise.sets} sets × {exercise.reps}
                        </Text>
                      </View>
                    ))}
                  </View>

                  <TouchableOpacity
                    style={styles.modalStartButton}
                    onPress={() => {
                      setModalVisible(false);
                      startWorkout(selectedWorkout);
                    }}
                  >
                    <Text style={styles.modalStartButtonText}>
                      Start {selectedWorkout.name}
                    </Text>
                  </TouchableOpacity>
                </ScrollView>
              </>
            )}
          </View>
        </View>
      </Modal>

      <CoachChatButton onPress={() => alert("Ask Coach about workouts")} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8F9FA", padding: 16 },
  header: { marginBottom: 16 },
  heading: { fontSize: 22, fontWeight: "800", marginBottom: 12 },

  // Stats
  statsContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
    backgroundColor: "white",
    padding: 16,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  statItem: { alignItems: "center" },
  statNumber: { fontSize: 20, fontWeight: "700", color: "#3B82F6" },
  statLabel: { fontSize: 12, color: "#666", marginTop: 4 },

  // Search
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "white",
    borderRadius: 12,
    paddingHorizontal: 12,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, paddingVertical: 12, fontSize: 16 },

  // Filters
  filterContainer: { marginBottom: 16 },
  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "white",
    marginRight: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  filterButtonActive: { backgroundColor: "#3B82F6" },
  filterText: { fontSize: 14, color: "#666", fontWeight: "600" },
  filterTextActive: { color: "white" },

  // Workout Cards
  workoutCard: { marginBottom: 12 },
  completedWorkout: { opacity: 0.8 },
  workoutHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  workoutTitle: { flex: 1 },
  workoutName: { fontSize: 18, fontWeight: "700", marginBottom: 6 },
  difficultyBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: "flex-start",
  },
  difficultyText: { color: "white", fontSize: 12, fontWeight: "600" },
  workoutActions: { flexDirection: "row", alignItems: "center" },
  iconButton: { padding: 4, marginLeft: 8 },

  // Workout Details
  workoutDetails: { marginBottom: 12 },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 2,
  },
  detailText: {
    marginLeft: 8,
    fontSize: 14,
    color: "#333",
    flex: 1,
  },
  dayTag: {
    backgroundColor: "#E5E7EB",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    fontSize: 12,
    color: "#666",
    marginLeft: 8,
  },

  // Buttons
  startButton: {
    backgroundColor: "#3B82F6",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  completedButton: {
    backgroundColor: "#22C55E",
  },
  startButtonText: {
    color: "white",
    fontWeight: "600",
    fontSize: 16,
  },

  // Modal
  modalContainer: {
    flex: 1,
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  modalContent: {
    backgroundColor: "white",
    margin: 20,
    borderRadius: 12,
    maxHeight: "80%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    flex: 1,
    marginRight: 16,
  },
  exerciseSection: {
    padding: 16,
  },
  exerciseTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 12,
  },
  exerciseItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  exerciseName: {
    fontSize: 16,
    color: "#333",
    flex: 1,
  },
  exerciseDetails: {
    fontSize: 14,
    color: "#666",
  },
  modalStartButton: {
    backgroundColor: "#3B82F6",
    margin: 16,
    padding: 16,
    borderRadius: 8,
    alignItems: "center",
  },
  modalStartButtonText: {
    color: "white",
    fontWeight: "600",
    fontSize: 16,
  },
});
