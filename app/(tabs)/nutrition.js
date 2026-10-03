import CoachChatButton from "@/components/CoachChatButton";
import SectionCard from "@/components/SectionCard";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { FlatList, StyleSheet, Text, View } from "react-native";

const meals = [
  {
    id: "1",
    name: "Breakfast",
    calories: 420,
    details: "Oatmeal with banana, almond butter, and protein shake",
    protein: 25,
    carbs: 55,
    fats: 10,
  },
  {
    id: "2",
    name: "Lunch",
    calories: 650,
    details: "Grilled chicken breast, brown rice, steamed veggies",
    protein: 40,
    carbs: 60,
    fats: 15,
  },
  {
    id: "3",
    name: "Snack",
    calories: 200,
    details: "Greek yogurt with berries and honey",
    protein: 12,
    carbs: 25,
    fats: 4,
  },
  {
    id: "4",
    name: "Dinner",
    calories: 580,
    details: "Baked salmon, sweet potato mash, mixed salad",
    protein: 38,
    carbs: 45,
    fats: 16,
  },
];

export default function NutritionScreen() {
  const totalCalories = meals.reduce((sum, m) => sum + m.calories, 0);
  const macros = {
    protein: meals.reduce((sum, m) => sum + m.protein, 0),
    carbs: meals.reduce((sum, m) => sum + m.carbs, 0),
    fats: meals.reduce((sum, m) => sum + m.fats, 0),
  };
  const calorieGoal = 2200;
  const percent = ((totalCalories / calorieGoal) * 100).toFixed(1);

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Today's Nutrition 🍎</Text>

      {/* --- SUMMARY SECTION --- */}
      <SectionCard title="Daily Summary">
        <View style={styles.row}>
          <Ionicons name="flame-outline" size={20} color="#EF4444" />
          <Text style={styles.item}>
            Total Calories: {totalCalories} / {calorieGoal} kcal
          </Text>
        </View>

        <View style={styles.progressBarBackground}>
          <View style={[styles.progressBarFill, { width: `${percent}%` }]} />
        </View>
        <Text style={styles.percentText}>{percent}% of daily goal</Text>

        <View style={styles.row}>
          <MaterialCommunityIcons name="food-drumstick" size={20} color="#22C55E" />
          <Text style={styles.item}>Protein: {macros.protein}g</Text>
        </View>
        <View style={styles.row}>
          <MaterialCommunityIcons name="food-apple" size={20} color="#3B82F6" />
          <Text style={styles.item}>Carbs: {macros.carbs}g</Text>
        </View>
        <View style={styles.row}>
          <MaterialCommunityIcons name="food-steak" size={20} color="#F59E0B" />
          <Text style={styles.item}>Fats: {macros.fats}g</Text>
        </View>
      </SectionCard>

      {/* --- MEALS LIST --- */}
      <FlatList
        data={meals}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <SectionCard title={item.name}>
            <Text style={styles.details}>{item.details}</Text>
            <Text style={styles.calories}>Calories: {item.calories}</Text>
            <Text style={styles.macros}>
              🥩 P: {item.protein}g | 🍚 C: {item.carbs}g | 🥑 F: {item.fats}g
            </Text>
          </SectionCard>
        )}
        ListHeaderComponent={<Text style={styles.subheading}>Meal Breakdown</Text>}
      />

      {/* --- WEEKLY INSIGHT SECTION --- */}
      <SectionCard title="Weekly Nutrition Insights">
        <Text style={styles.details}>
          Avg Daily Intake: 2100 kcal | Protein: 130g | Carbs: 240g | Fats: 65g
        </Text>
        <Text style={{ color: "#16A34A", marginTop: 6 }}>
          🔥 You stayed within your calorie goal 5 out of 7 days!
        </Text>
      </SectionCard>

      <CoachChatButton onPress={() => alert("Ask Coach about meal plan")} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8F9FA", padding: 16 },
  heading: { fontSize: 22, fontWeight: "800", marginBottom: 16 },
  subheading: { fontSize: 18, fontWeight: "700", marginTop: 10, marginBottom: 6 },
  row: { flexDirection: "row", alignItems: "center", marginVertical: 4 },
  item: { marginLeft: 8, fontSize: 15, color: "#333" },
  details: { fontSize: 14, color: "#555", marginBottom: 4 },
  calories: { color: "#22C55E", fontWeight: "600" },
  macros: { color: "#6B7280", fontSize: 13, marginTop: 2 },
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
  percentText: {
    fontSize: 13,
    color: "#555",
    textAlign: "right",
    marginBottom: 8,
  },
});
