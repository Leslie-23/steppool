import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, TouchableOpacity } from "react-native";

export default function CoachChatButton({ onPress }) {
  return (
    <TouchableOpacity style={styles.btn} onPress={onPress}>
      <Ionicons name="chatbubbles-outline" size={20} color="#fff" />
      <Text style={styles.text}>Chat with Coach</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#3B82F6",
    borderRadius: 50,
    paddingVertical: 12,
    marginVertical: 20,
    shadowColor: "#3B82F6",
    shadowOpacity: 0.4,
    shadowOffset: { width: 0, height: 4 },
  },
  text: {
    color: "#fff",
    fontWeight: "600",
    marginLeft: 8,
  },
});
