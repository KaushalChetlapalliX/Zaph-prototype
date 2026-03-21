// select-tasks.tsx (full updated file)
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../src/lib/supabase";

type TaskOption = {
  id: string;
  label: string;
};

type Level = "easy" | "medium" | "hard";

const BG = "#F8EEFF";
const TEXT_PRIMARY = "#000000";
const TEXT_SECONDARY = "rgba(0,0,0,0.45)";
const CARD_BG = "rgba(0,0,0,0.05)";
const SELECTED_BG = "rgba(135,87,239,0.61)";
const BORDER = "#000000";

function normalizeLevel(x: any, fallback: Level): Level {
  return x === "easy" || x === "medium" || x === "hard" ? x : fallback;
}

export default function SelectTasksScreen() {
  const params = useLocalSearchParams<{ level?: string; circleId?: string }>();

  const levelRaw = Array.isArray(params.level) ? params.level[0] : params.level;
  const circleIdRaw = Array.isArray(params.circleId) ? params.circleId[0] : params.circleId;

  const level: Level =
    levelRaw === "medium" || levelRaw === "hard" || levelRaw === "easy" ? levelRaw : "easy";

  const { minSelect, maxSelect } = useMemo(() => {
    if (level === "medium") return { minSelect: 8, maxSelect: 10 };
    if (level === "hard") return { minSelect: 10, maxSelect: 12 };
    return { minSelect: 5, maxSelect: 6 };
  }, [level]);

  const tasks: TaskOption[] = useMemo(
    () => [
      { id: "run_3k", label: "3 Km Run" },
      { id: "gym_45", label: "Gym session 45+ min" },
      { id: "sleep_7", label: "Sleep 7+ hours" },
      { id: "classes_all", label: "Attend all classes today" },
      { id: "study_1h", label: "Study deep focus 1 hour" },
      { id: "wake_before_8", label: "Wake up before 8 AM" },
      { id: "water_2l", label: "Drink 2L of water" },
      { id: "screen_3h", label: "Limit screen time to 3hrs" },
      { id: "meals_3", label: "Eat all 3 meals of the day" },
      { id: "steps_10k", label: "Hit 10,000 steps" },
      { id: "stretch_10", label: "Stretch 10 minutes" },
      { id: "read_20", label: "Read 20 pages" },
      { id: "meditate_10", label: "Meditate 10 minutes" },
      { id: "journal_5", label: "Journal 5 minutes" },
      { id: "clean_10", label: "Clean room 10 minutes" },
      { id: "project_45", label: "Work on side project 45 minutes" },
      { id: "plan_tomorrow", label: "Plan tomorrow in 5 minutes" },
    ],
    []
  );

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(true);

  // FIX: remember selection + finalized tasks
  // If circle_tasks already exists -> go /circle-home
  // Else if this user has a row in circle_task_selections -> skip this screen -> go /loading
  useEffect(() => {
    let alive = true;

    const guard = async () => {
      if (!circleIdRaw || circleIdRaw.trim().length === 0) {
        if (alive) setChecking(false);
        return;
      }

      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;

      if (!uid) {
        if (alive) setChecking(false);
        return;
      }

      const { data: finalized, error: fErr } = await supabase
        .from("circle_tasks")
        .select("task_id")
        .eq("circle_id", circleIdRaw)
        .limit(1);

      if (!alive) return;

      if (!fErr && (finalized?.length ?? 0) > 0) {
        router.replace({
          pathname: "/circle-home",
          params: { circleId: circleIdRaw },
        });
        return;
      }

      const { data: selRow, error: selErr } = await supabase
        .from("circle_task_selections")
        .select("level, tasks")
        .eq("circle_id", circleIdRaw)
        .eq("user_id", uid)
        .maybeSingle();

      if (!alive) return;

      const hasSelection =
        !selErr &&
        selRow &&
        Array.isArray((selRow as any).tasks) &&
        ((selRow as any).tasks.length ?? 0) > 0;

      if (hasSelection) {
        const storedLevel = normalizeLevel((selRow as any).level, level);
        router.replace({
          pathname: "/loading",
          params: { circleId: circleIdRaw, level: storedLevel },
        });
        return;
      }

      if (alive) setChecking(false);
    };

    guard();

    return () => {
      alive = false;
    };
  }, [circleIdRaw, level]);

  const toggle = (id: string) => {
    const isSelected = selectedIds.includes(id);

    if (isSelected) {
      setSelectedIds((prev) => prev.filter((x) => x !== id));
      return;
    }

    if (selectedIds.length >= maxSelect) {
      Alert.alert("Limit reached", `Select only up to ${maxSelect} tasks.`);
      return;
    }

    setSelectedIds((prev) => [...prev, id]);
  };

  const handleNext = async () => {
    if (saving) return;

    if (!circleIdRaw || circleIdRaw.trim().length === 0) {
      Alert.alert("Missing circle", "No circleId was provided to this screen.");
      return;
    }

    if (selectedIds.length < minSelect) {
      const remaining = minSelect - selectedIds.length;
      Alert.alert(
        "Select more tasks",
        `Choose ${remaining} more task${remaining === 1 ? "" : "s"} to continue.`
      );
      return;
    }

    setSaving(true);

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    const userId = userData?.user?.id;

    if (userErr || !userId) {
      setSaving(false);
      Alert.alert("Not signed in", "Please log in again.");
      return;
    }

    const selectedLabels = tasks
      .filter((t) => selectedIds.includes(t.id))
      .map((t) => t.label);

    const { error } = await supabase
      .from("circle_task_selections")
      .upsert(
        {
          circle_id: circleIdRaw,
          user_id: userId,
          level,
          tasks: selectedLabels,
        },
        { onConflict: "circle_id,user_id" }
      );

    setSaving(false);

    if (error) {
      Alert.alert("Save failed", error.message);
      return;
    }

    router.replace({
      pathname: "/loading",
      params: { circleId: circleIdRaw, level },
    });
  };

  const renderItem = ({ item }: { item: TaskOption }) => {
    const isSelected = selectedIds.includes(item.id);

    return (
      <Pressable
        onPress={() => toggle(item.id)}
        style={[styles.taskRow, isSelected ? styles.taskSelected : styles.taskUnselected]}
        disabled={saving}
      >
        <Text style={styles.taskText}>{item.label}</Text>
      </Pressable>
    );
  };

  if (checking) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={[styles.container, { justifyContent: "center", alignItems: "center", gap: 10 }]}>
          <ActivityIndicator />
          <Text style={{ color: TEXT_SECONDARY, fontWeight: "600" }}>Checking your circle...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.title}>Select from the{"\n"}below tasks</Text>
        <Text style={styles.subtitle}>Choose them in an order of{"\n"}preference</Text>

        <FlatList
          data={tasks}
          keyExtractor={(t) => t.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />

        <Pressable style={styles.nextButton} onPress={handleNext} disabled={saving}>
          {saving ? (
            <>
              <ActivityIndicator color="#FFFFFF" />
              <Text style={styles.nextButtonText}>Saving</Text>
            </>
          ) : (
            <>
              <Text style={styles.nextButtonText}>Next</Text>
              <Ionicons name="chevron-forward" size={20} color="#666666" />
            </>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: BG },
  container: {
    flex: 1,
    backgroundColor: BG,
    paddingHorizontal: 22,
    paddingTop: 10,
  },
  title: {
    marginTop: 24,
    fontSize: 36,
    fontWeight: "800",
    color: TEXT_PRIMARY,
    textAlign: "center",
    lineHeight: 38,
  },
  subtitle: {
    marginTop: 10,
    marginBottom: 18,
    fontSize: 16,
    fontWeight: "500",
    color: TEXT_SECONDARY,
    textAlign: "center",
    lineHeight: 22,
  },
  listContent: {
    paddingTop: 6,
    paddingBottom: 24,
  },
  taskRow: {
    height: 54,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 6,
    justifyContent: "center",
    paddingHorizontal: 18,
    marginBottom: 14,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  taskUnselected: { backgroundColor: CARD_BG },
  taskSelected: { backgroundColor: SELECTED_BG },
  taskText: {
    fontSize: 18,
    fontWeight: "700",
    color: TEXT_PRIMARY,
  },
  nextButton: {
    backgroundColor: "#000000",
    borderWidth: 1,
    borderColor: "#E0E0E0",
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 20,
    marginBottom: 24,
  },
  nextButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
});
