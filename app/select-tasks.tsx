import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../src/lib/supabase";
import {
  Colors,
  Radius,
  Spacing,
  Typography,
} from "../src/constants/design";

type TaskOption = {
  id: string;
  label: string;
};

type Level = "easy" | "medium" | "hard";

type StoredSelection = {
  level?: unknown;
  tasks?: unknown;
};

function normalizeLevel(x: unknown, fallback: Level): Level {
  return x === "easy" || x === "medium" || x === "hard" ? x : fallback;
}

const TASKS: readonly TaskOption[] = [
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
];

export default function SelectTasksScreen() {
  const params = useLocalSearchParams<{ level?: string; circleId?: string }>();

  const levelRaw = Array.isArray(params.level) ? params.level[0] : params.level;
  const circleIdRaw = Array.isArray(params.circleId)
    ? params.circleId[0]
    : params.circleId;

  const level: Level =
    levelRaw === "medium" || levelRaw === "hard" || levelRaw === "easy"
      ? levelRaw
      : "easy";

  const { minSelect, maxSelect } = useMemo(() => {
    if (level === "medium") return { minSelect: 8, maxSelect: 10 };
    if (level === "hard") return { minSelect: 10, maxSelect: 12 };
    return { minSelect: 5, maxSelect: 6 };
  }, [level]);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(true);

  const headerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(headerAnim, {
      toValue: 1,
      duration: 520,
      easing: Easing.out(Easing.exp),
      useNativeDriver: true,
    }).start();
  }, [headerAnim]);

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

      const stored = (selRow ?? null) as StoredSelection | null;
      const storedTasks = Array.isArray(stored?.tasks) ? stored?.tasks : [];
      const hasSelection = !selErr && stored && storedTasks.length > 0;

      if (hasSelection) {
        const storedLevel = normalizeLevel(stored?.level, level);
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

    const selectedLabels = TASKS.filter((t) => selectedIds.includes(t.id)).map(
      (t) => t.label
    );

    const { error } = await supabase.from("circle_task_selections").upsert(
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

  if (checking) {
    return (
      <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
        <View style={styles.checkingBox}>
          <ActivityIndicator color={Colors.text.primary} />
          <Text style={styles.checkingText}>Checking your circle…</Text>
        </View>
      </SafeAreaView>
    );
  }

  const canProceed = selectedIds.length >= minSelect && !saving;
  const countLabel = `${selectedIds.length} / ${maxSelect}`;
  const levelCopy = level === "hard" ? "Hard" : level === "medium" ? "Medium" : "Easy";

  const headerTranslate = headerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [12, 0],
  });

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
      <Animated.View
        style={[
          styles.header,
          { opacity: headerAnim, transform: [{ translateY: headerTranslate }] },
        ]}
      >
        <View style={styles.headerTopRow}>
          <Text style={styles.overline}>{levelCopy.toUpperCase()} TRACK</Text>
          <View style={styles.countPill}>
            <Text style={styles.countText}>{countLabel}</Text>
          </View>
        </View>
        <Text style={styles.title}>Pick your tasks.</Text>
        <Text style={styles.helper}>
          Tap {minSelect}
          {minSelect === maxSelect ? "" : `–${maxSelect}`} you'll commit to each day.
        </Text>
      </Animated.View>

      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      >
        {TASKS.map((t) => {
          const orderIndex = selectedIds.indexOf(t.id);
          const isSelected = orderIndex >= 0;
          return (
            <Pressable
              key={t.id}
              onPress={() => toggle(t.id)}
              disabled={saving}
              style={({ pressed }) => [
                styles.row,
                isSelected && styles.rowSelected,
                pressed && !isSelected && styles.rowPressed,
              ]}
            >
              <View style={styles.rowLeading}>
                {isSelected ? (
                  <View style={styles.orderChip}>
                    <Text style={styles.orderChipText}>{orderIndex + 1}</Text>
                  </View>
                ) : (
                  <View style={styles.orderDot} />
                )}
                <Text style={styles.rowLabel} numberOfLines={2}>
                  {t.label}
                </Text>
              </View>
              {isSelected ? (
                <Ionicons
                  name="checkmark-circle"
                  size={22}
                  color={Colors.brand.greenBright}
                />
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          onPress={handleNext}
          disabled={!canProceed}
          style={({ pressed }) => [
            styles.primary,
            !canProceed && styles.primaryDisabled,
            pressed && canProceed && styles.primaryPressed,
          ]}
        >
          {saving ? (
            <ActivityIndicator color={Colors.brand.greenText} size="small" />
          ) : (
            <Text style={styles.primaryText}>
              {selectedIds.length < minSelect
                ? `Pick ${minSelect - selectedIds.length} more`
                : "Lock in tasks"}
            </Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const PRIMARY_HEIGHT = 54;
const ROW_MIN_HEIGHT = 64;
const ORDER_CHIP = 28;

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.bg.base,
  },
  checkingBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.inlineGap,
  },
  checkingText: {
    ...Typography.label,
  },
  header: {
    paddingHorizontal: Spacing.screenHorizontal,
    paddingTop: Spacing.screenTop,
    paddingBottom: 18,
    gap: 6,
  },
  headerTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  overline: {
    ...Typography.overline,
    letterSpacing: 1.6,
  },
  countPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    backgroundColor: Colors.bg.card,
  },
  countText: {
    ...Typography.caption,
    color: Colors.text.primary,
    fontWeight: "600",
  },
  title: {
    ...Typography.display,
    fontSize: 30,
  },
  helper: {
    ...Typography.label,
    marginTop: 2,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: Spacing.screenHorizontal,
    paddingBottom: 24,
    gap: 10,
  },
  row: {
    minHeight: ROW_MIN_HEIGHT,
    paddingHorizontal: Spacing.cardPadding,
    paddingVertical: 12,
    borderRadius: Radius.cardSm,
    backgroundColor: Colors.bg.card,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  rowPressed: {
    backgroundColor: Colors.bg.cardActive,
  },
  rowSelected: {
    backgroundColor: Colors.bg.cardActive,
  },
  rowLeading: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  orderDot: {
    width: ORDER_CHIP,
    height: ORDER_CHIP,
    borderRadius: ORDER_CHIP / 2,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  orderChip: {
    width: ORDER_CHIP,
    height: ORDER_CHIP,
    borderRadius: ORDER_CHIP / 2,
    backgroundColor: Colors.brand.greenBright,
    alignItems: "center",
    justifyContent: "center",
  },
  orderChipText: {
    ...Typography.caption,
    color: Colors.bg.base,
    fontWeight: "700",
  },
  rowLabel: {
    ...Typography.body,
    flex: 1,
  },
  footer: {
    paddingHorizontal: Spacing.screenHorizontal,
    paddingTop: 8,
    paddingBottom: 12,
    backgroundColor: Colors.bg.base,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  primary: {
    height: PRIMARY_HEIGHT,
    borderRadius: Radius.pill,
    backgroundColor: Colors.brand.green,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryPressed: {
    opacity: 0.8,
  },
  primaryDisabled: {
    opacity: 0.45,
  },
  primaryText: {
    ...Typography.body,
    color: Colors.brand.greenText,
    fontWeight: "600",
  },
});
