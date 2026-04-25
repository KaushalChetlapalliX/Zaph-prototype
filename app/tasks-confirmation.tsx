import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
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
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../src/lib/supabase";
import {
  Colors,
  Radius,
  Spacing,
  Typography,
} from "../src/constants/design";

type Difficulty = "easy" | "medium" | "hard";

type CircleTaskRow = {
  position: number;
  task_id: string;
};

type TaskRow = {
  id: string;
  title: string;
};

type MemberRoleRow = {
  role?: string | null;
};

type CircleDifficultyRow = {
  difficulty?: Difficulty | null;
};

type CircleStartedRow = {
  started_at?: string | null;
};

const POLL_MS = 2000;
const START_POLL_MS = 1500;

export default function TasksConfirmationScreen() {
  const params = useLocalSearchParams<{ circleId?: string; level?: string }>();
  const circleIdParam = Array.isArray(params.circleId)
    ? params.circleId[0]
    : params.circleId;
  const levelParamRaw = Array.isArray(params.level)
    ? params.level[0]
    : params.level;

  const levelParam: Difficulty | null =
    levelParamRaw === "easy" ||
    levelParamRaw === "medium" ||
    levelParamRaw === "hard"
      ? levelParamRaw
      : null;

  const [circleId, setCircleId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<string[]>([]);
  const [starting, setStarting] = useState(false);

  const finalizedCircleRef = useRef<string | null>(null);
  const initialLoadedRef = useRef(false);
  const tasksSigRef = useRef<string>("");

  const mountAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(mountAnim, {
      toValue: 1,
      duration: 520,
      easing: Easing.out(Easing.exp),
      useNativeDriver: true,
    }).start();
  }, [mountAnim]);

  useEffect(() => {
    const init = async () => {
      if (circleIdParam && circleIdParam.length > 0) {
        setCircleId(circleIdParam);
        try {
          await AsyncStorage.setItem("activeCircleId", circleIdParam);
        } catch {}
        return;
      }
      try {
        const stored = await AsyncStorage.getItem("activeCircleId");
        if (stored) setCircleId(stored);
      } catch {}
    };
    init();
  }, [circleIdParam]);

  const getLimitForDifficulty = (d: Difficulty) => {
    if (d === "medium") return 8;
    if (d === "hard") return 10;
    return 6;
  };

  useEffect(() => {
    if (!circleId) return;

    let alive = true;

    const resolveAdmin = async () => {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) return;

      const { data: row, error } = await supabase
        .from("circle_members")
        .select("role")
        .eq("circle_id", circleId)
        .eq("user_id", uid)
        .maybeSingle();

      if (!alive) return;
      if (error) {
        setIsAdmin(false);
        return;
      }

      const typed = (row ?? null) as MemberRoleRow | null;
      setIsAdmin(typed?.role === "admin");
    };

    resolveAdmin();

    return () => {
      alive = false;
    };
  }, [circleId]);

  useEffect(() => {
    if (!circleId) return;

    let alive = true;

    const setTasksIfChanged = (next: string[]) => {
      const sig = next.join("\n");
      if (sig === tasksSigRef.current) return;
      tasksSigRef.current = sig;
      setTasks(next);
    };

    const finishInitialLoadIfNeeded = () => {
      if (!initialLoadedRef.current) {
        initialLoadedRef.current = true;
        setLoading(false);
      }
    };

    const fetchTasks = async () => {
      if (!initialLoadedRef.current) setLoading(true);

      const { data: ctRows, error: ctErr } = await supabase
        .from("circle_tasks")
        .select("position, task_id")
        .eq("circle_id", circleId)
        .order("position", { ascending: true });

      if (!alive) return;

      if (ctErr) {
        finishInitialLoadIfNeeded();
        return;
      }

      const rows = (ctRows ?? []) as unknown as CircleTaskRow[];
      if (rows.length === 0) {
        setTasksIfChanged([]);
        finishInitialLoadIfNeeded();
        return;
      }

      const ids = rows.map((r) => r.task_id);

      const { data: tRows, error: tErr } = await supabase
        .from("tasks")
        .select("id, title")
        .in("id", ids);

      if (!alive) return;

      if (tErr || !tRows) {
        finishInitialLoadIfNeeded();
        return;
      }

      const titleById: Record<string, string> = {};
      for (const t of tRows as unknown as TaskRow[]) titleById[t.id] = t.title;

      const orderedTitles = rows.map((r) => titleById[r.task_id]).filter(Boolean);

      setTasksIfChanged(orderedTitles);
      finishInitialLoadIfNeeded();
    };

    fetchTasks();
    const interval = setInterval(fetchTasks, POLL_MS);

    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, [circleId]);

  useEffect(() => {
    if (!circleId) return;
    if (!isAdmin) return;

    if (finalizedCircleRef.current === circleId) return;

    const finalize = async () => {
      finalizedCircleRef.current = circleId;

      let difficulty: Difficulty = levelParam ?? "easy";

      if (!levelParam) {
        const { data: circleRow, error: circleErr } = await supabase
          .from("circles")
          .select("difficulty")
          .eq("id", circleId)
          .single();

        const typed = (circleRow ?? null) as CircleDifficultyRow | null;

        if (!circleErr && typed?.difficulty) {
          const d = typed.difficulty;
          if (d === "easy" || d === "medium" || d === "hard") difficulty = d;
        }
      }

      const limit = getLimitForDifficulty(difficulty);

      const { error: rpcErr } = await supabase.rpc("finalize_circle_tasks", {
        p_circle_id: circleId,
        p_limit: limit,
      });

      if (rpcErr) {
        finalizedCircleRef.current = null;
      }
    };

    finalize();
  }, [circleId, isAdmin, levelParam]);

  useEffect(() => {
    if (!circleId) return;

    let alive = true;

    const checkStarted = async () => {
      const { data, error } = await supabase
        .from("circles")
        .select("started_at")
        .eq("id", circleId)
        .maybeSingle();

      if (!alive) return;

      const typed = (data ?? null) as CircleStartedRow | null;

      if (!error && typed?.started_at) {
        router.replace({ pathname: "/circle-home", params: { circleId } });
      }
    };

    checkStarted();
    const interval = setInterval(checkStarted, START_POLL_MS);

    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, [circleId]);

  const handleStart = async () => {
    if (!circleId || starting) return;

    setStarting(true);

    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id ?? null;

    const payload: { started_at: string; started_by?: string } = {
      started_at: new Date().toISOString(),
    };
    if (uid) payload.started_by = uid;

    const { error } = await supabase
      .from("circles")
      .update(payload)
      .eq("id", circleId)
      .is("started_at", null);

    if (error) {
      console.log("[tasks-confirmation] start update error:", error.message);
    }

    router.replace({ pathname: "/circle-home", params: { circleId } });
  };

  const list = useMemo(() => tasks, [tasks]);
  const startDisabled = list.length === 0 || starting;

  const translate = mountAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [12, 0],
  });

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
      <Animated.View
        style={[
          styles.header,
          { opacity: mountAnim, transform: [{ translateY: translate }] },
        ]}
      >
        <Text style={styles.overline}>DAILY LINEUP</Text>
        <Text style={styles.title}>Your circle's tasks.</Text>
        <Text style={styles.helper}>
          {list.length > 0
            ? `${list.length} tasks locked in for the week.`
            : "Waiting for the lineup to finalize."}
        </Text>
      </Animated.View>

      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View style={styles.statusBlock}>
            <ActivityIndicator color={Colors.text.primary} size="small" />
            <Text style={styles.statusText}>Loading tasks…</Text>
          </View>
        ) : list.length === 0 ? (
          <View style={styles.statusBlock}>
            <Text style={styles.statusTitle}>
              {isAdmin ? "Finalizing tasks…" : "Waiting on admin"}
            </Text>
            <Text style={styles.statusText}>
              {isAdmin
                ? "We're picking the top choices now."
                : "The admin is locking in the lineup."}
            </Text>
          </View>
        ) : (
          list.map((label, idx) => (
            <View key={`task-${idx}`} style={styles.row}>
              <View style={styles.orderChip}>
                <Text style={styles.orderChipText}>{idx + 1}</Text>
              </View>
              <Text style={styles.rowLabel} numberOfLines={2}>
                {label}
              </Text>
            </View>
          ))
        )}

        {!loading && list.length > 0 && !isAdmin ? (
          <View style={styles.waitingBlock}>
            <Ionicons
              name="time-outline"
              size={16}
              color={Colors.text.secondary}
            />
            <Text style={styles.waitingText}>
              Waiting for admin to press start…
            </Text>
          </View>
        ) : null}
      </ScrollView>

      {isAdmin ? (
        <View style={styles.footer}>
          <Pressable
            onPress={handleStart}
            disabled={startDisabled}
            style={({ pressed }) => [
              styles.primary,
              startDisabled && styles.primaryDisabled,
              pressed && !startDisabled && styles.primaryPressed,
            ]}
          >
            {starting ? (
              <ActivityIndicator color={Colors.brand.greenText} size="small" />
            ) : (
              <Text style={styles.primaryText}>Start the week</Text>
            )}
          </Pressable>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const PRIMARY_HEIGHT = 54;
const ROW_MIN_HEIGHT = 60;
const ORDER_CHIP = 32;

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.bg.base,
  },
  header: {
    paddingHorizontal: Spacing.screenHorizontal,
    paddingTop: Spacing.screenTop,
    paddingBottom: 16,
    gap: 6,
  },
  overline: {
    ...Typography.overline,
    letterSpacing: 1.6,
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
    paddingBottom: 32,
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
    gap: 14,
  },
  orderChip: {
    width: ORDER_CHIP,
    height: ORDER_CHIP,
    borderRadius: ORDER_CHIP / 2,
    backgroundColor: Colors.bg.cardActive,
    alignItems: "center",
    justifyContent: "center",
  },
  orderChipText: {
    ...Typography.label,
    color: Colors.text.primary,
    fontWeight: "600",
  },
  rowLabel: {
    ...Typography.body,
    flex: 1,
  },
  statusBlock: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
    gap: 8,
  },
  statusTitle: {
    ...Typography.body,
    fontWeight: "600",
  },
  statusText: {
    ...Typography.label,
    textAlign: "center",
  },
  waitingBlock: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingTop: 18,
    paddingBottom: 4,
  },
  waitingText: {
    ...Typography.label,
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
