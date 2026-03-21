import { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, FlatList, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../src/lib/supabase";

const BG = "#F8EEFF";
const TEXT_PRIMARY = "#000000";
const BORDER = "#000000";
const CARD_BG = "rgba(0,0,0,0.05)";

type Difficulty = "easy" | "medium" | "hard";

type CircleTaskRow = {
  position: number;
  task_id: string;
};

type TaskRow = {
  id: string;
  title: string;
};

const POLL_MS = 2000;
const START_POLL_MS = 1500;

export default function TasksConfirmationScreen() {
  const params = useLocalSearchParams<{ circleId?: string; level?: string }>();
  const circleIdParam = Array.isArray(params.circleId) ? params.circleId[0] : params.circleId;
  const levelParamRaw = Array.isArray(params.level) ? params.level[0] : params.level;

  const levelParam: Difficulty | null =
    levelParamRaw === "easy" || levelParamRaw === "medium" || levelParamRaw === "hard"
      ? levelParamRaw
      : null;

  const [circleId, setCircleId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<string[]>([]);

  // finalize should be once per circle
  const finalizedCircleRef = useRef<string | null>(null);

  // flicker control
  const initialLoadedRef = useRef(false);
  const tasksSigRef = useRef<string>("");

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

  // 1) Resolve admin role
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

      setIsAdmin((row as any)?.role === "admin");
    };

    resolveAdmin();

    return () => {
      alive = false;
    };
  }, [circleId]);

  // 2) Poll tasks finalized list
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

      const rows = (ctRows ?? []) as any as CircleTaskRow[];
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
      for (const t of tRows as any as TaskRow[]) titleById[t.id] = t.title;

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

  // 3) Admin finalizes once
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

        if (!circleErr && (circleRow as any)?.difficulty) {
          const d = (circleRow as any).difficulty as Difficulty;
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

  // 4) Everyone polls "started_at" and auto-navigates when admin starts
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

      if (!error && (data as any)?.started_at) {
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

  const renderTask = ({ item }: { item: string }) => (
    <View style={styles.taskRow}>
      <Text style={styles.taskText}>{item}</Text>
    </View>
  );

  const handleStart = async () => {
    if (!circleId) return;

    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id ?? null;

    // Set started_at once, shared for all users
    const payload: any = {
      started_at: new Date().toISOString(),
    };
    if (uid) payload.started_by = uid;

    const { error } = await supabase
      .from("circles")
      .update(payload)
      .eq("id", circleId)
      .is("started_at", null);

    if (error) {
      // Even if it fails because it's already started, still navigate
      // But for real errors show nothing here to avoid blocking the admin
      console.log("start update error:", error.message);
    }

    router.replace({ pathname: "/circle-home", params: { circleId } });
  };

  const list = useMemo(() => tasks, [tasks]);
  const startDisabled = list.length === 0;

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.headline}>Your groups tasks</Text>

        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator />
            <Text style={styles.loadingText}>Loading tasks</Text>
          </View>
        ) : list.length === 0 ? (
          <View style={styles.loadingBox}>
            <Text style={styles.loadingText}>
              {isAdmin ? "Finalizing tasks..." : "Waiting for admin to finalize tasks..."}
            </Text>
          </View>
        ) : (
          <>
            <FlatList
              data={list}
              renderItem={renderTask}
              keyExtractor={(item, index) => `task-${index}`}
              scrollEnabled={false}
              contentContainerStyle={styles.listContent}
            />
            {!isAdmin ? (
              <View style={styles.loadingBox}>
                <Text style={styles.loadingText}>Waiting for admin to press start...</Text>
              </View>
            ) : null}
          </>
        )}

        {isAdmin ? (
          <Pressable
            style={[styles.startButton, startDisabled ? styles.startButtonDisabled : null]}
            onPress={handleStart}
            disabled={startDisabled}
          >
            <Text style={styles.startButtonText}>START</Text>
            <Ionicons name="arrow-forward" size={20} color="#000000" />
          </Pressable>
        ) : null}

        <View style={styles.tabBar}>
          <View style={styles.tabItem}>
            <View style={styles.tabContent}>
              <Ionicons name="home" size={24} color="#8A2BE2" />
              <Text style={styles.tabTextActive}>Home</Text>
              <View style={styles.tabIndicator} />
            </View>
          </View>

          <View style={styles.tabItem}>
            <Ionicons name="people" size={24} color="#999999" />
            <Text style={styles.tabTextInactive}>Circles</Text>
          </View>

          <View style={styles.tabItem}>
            <Ionicons name="settings" size={24} color="#999999" />
            <Text style={styles.tabTextInactive}>Settings</Text>
          </View>
        </View>
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
    paddingTop: 40,
    paddingBottom: 90,
  },
  headline: {
    fontSize: 36,
    fontWeight: "800",
    color: TEXT_PRIMARY,
    textAlign: "center",
    marginBottom: 32,
  },
  loadingBox: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 18,
    gap: 10,
  },
  loadingText: {
    fontSize: 14,
    fontWeight: "600",
    color: "rgba(0,0,0,0.55)",
  },
  listContent: { gap: 13 },
  taskRow: {
    height: 54,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 8,
    paddingHorizontal: 18,
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  taskText: { fontSize: 17, fontWeight: "700", color: TEXT_PRIMARY },
  startButton: {
    position: "absolute",
    bottom: 100,
    right: 22,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 11,
    paddingVertical: 13,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 3,
  },
  startButtonDisabled: { opacity: 0.5 },
  startButtonText: { fontSize: 16, fontWeight: "700", color: TEXT_PRIMARY },
  tabBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    backgroundColor: BG,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderTopColor: "#E0E0E0",
    justifyContent: "space-around",
    alignItems: "center",
    paddingBottom: 20,
  },
  tabItem: { alignItems: "center", justifyContent: "center", flex: 1 },
  tabContent: { alignItems: "center", justifyContent: "center" },
  tabIndicator: { width: 30, height: 3, backgroundColor: "#8A2BE2", marginTop: 4, borderRadius: 2 },
  tabTextActive: { fontSize: 12, color: "#8A2BE2", fontWeight: "600", marginTop: 4 },
  tabTextInactive: { fontSize: 12, color: "#999999", fontWeight: "500", marginTop: 4 },
});
