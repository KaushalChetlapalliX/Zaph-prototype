import { useState } from "react";
import { View, Text, Pressable, SafeAreaView, StyleSheet, Alert } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../src/lib/supabase";

type Level = "easy" | "medium" | "hard";

export default function Onboarding() {
  const [loading, setLoading] = useState(false);

  // Accept either param name: circleName (current) OR name (recommended)
  const params = useLocalSearchParams<{ code?: string; circleName?: string; name?: string }>();

  const code = Array.isArray(params.code) ? params.code[0] : params.code;

  const rawName =
    (Array.isArray(params.circleName) ? params.circleName[0] : params.circleName) ??
    (Array.isArray(params.name) ? params.name[0] : params.name) ??
    "";

  const circleName = String(rawName).trim();

  const goNext = async (level: Level) => {
    if (loading) return;

    if (!code || code === "XXXX") {
      Alert.alert("Missing code", "Go back and generate a circle code first.");
      return;
    }

    if (!circleName) {
      Alert.alert("Circle name required", "Go back and enter a circle name.");
      return;
    }

    try {
      setLoading(true);

      const { data, error } = await supabase.rpc("create_circle_with_code", {
        difficulty: level,
        desired_code: code,
        circle_name: circleName,
      });

      if (error) {
        Alert.alert("Error", error.message);
        return;
      }

      const row = Array.isArray(data) ? data[0] : data;

      // Support both old and new return shapes:
      // new: out_circle_id, out_code
      // old: circle_id, code
      const circleId = String(
        (row as any)?.out_circle_id ?? (row as any)?.circle_id ?? (row as any)?.id ?? ""
      );
      const circleCode = String((row as any)?.out_code ?? (row as any)?.code ?? "");

      if (!circleId || circleId === "undefined") {
        Alert.alert("Error", "Circle was created but circle id was not returned.");
        return;
      }

      // Persist latest active circle so new circles work
      try {
        await AsyncStorage.setItem("activeCircleId", circleId);
        if (circleCode) await AsyncStorage.setItem("activeCircleCode", circleCode);
        await AsyncStorage.setItem("activeDifficulty", level);
        await AsyncStorage.setItem("activeCircleName", circleName);
      } catch {
        // ignore
      }

      router.push({
        pathname: "/circle-members",
        params: {
          circleId,
          circleCode,
          level,
          circleName,
        },
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.question}>What kind of challenge do you want?</Text>

        <View style={styles.cardsContainer}>
          <Pressable disabled={loading} onPress={() => goNext("easy")} style={styles.card}>
            <Text style={styles.cardTitle}>EASY</Text>
            <Text style={styles.cardBody}>5-6</Text>
            <Text style={styles.cardBody}>Tasks</Text>
            <Text style={styles.cardBody}>Everyday</Text>
          </Pressable>

          <Pressable disabled={loading} onPress={() => goNext("medium")} style={styles.card}>
            <Text style={styles.cardTitle}>MEDIUM</Text>
            <Text style={styles.cardBody}>8-10</Text>
            <Text style={styles.cardBody}>Tasks</Text>
            <Text style={styles.cardBody}>Everyday</Text>
          </Pressable>

          <Pressable disabled={loading} onPress={() => goNext("hard")} style={styles.card}>
            <Text style={styles.cardTitle}>HARD</Text>
            <Text style={styles.cardBody}>10-12</Text>
            <Text style={styles.cardBody}>Tasks</Text>
            <Text style={styles.cardBody}>Everyday</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#F8EEFF" },
  container: {
    flex: 1,
    backgroundColor: "#F8EEFF",
    paddingHorizontal: 20,
    paddingTop: 40,
    alignItems: "center",
  },
  question: {
    fontSize: 18,
    fontWeight: "500",
    color: "#000000",
    textAlign: "center",
    marginBottom: 40,
  },
  cardsContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
    flex: 1,
    width: "100%",
  },
  card: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 25,
    paddingVertical: 24,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    maxWidth: 100,
    minHeight: 280,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#000000",
    marginBottom: 16,
  },
  cardBody: {
    fontSize: 14,
    color: "#000000",
    marginBottom: 8,
    textAlign: "center",
  },
});
