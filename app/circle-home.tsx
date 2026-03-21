import { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Alert,
  ScrollView,
  Modal,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../src/lib/supabase";
import Svg, { Circle } from "react-native-svg";
import { LinearGradient } from "expo-linear-gradient";

const BG = "#F8EEFF";
const TEXT_PRIMARY = "#000000";
const BORDER = "#000000";
const PRIMARY = "#8359E3";

const POLL_MS = 3000;
const POINTS_PER_TASK = 5;

type TaskItem = {
  key: string; // task_id
  title: string;
  done: boolean;
};

type LeaderRow = {
  userId: string;
  name: string;
  points: number;
};

function startOfDayLocal(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDayLocal(d = new Date()) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

// Monday 00:00 UTC
function startOfWeekUTC(d = new Date()) {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = x.getUTCDay(); // 0 Sun..6 Sat
  const daysSinceMonday = (day + 6) % 7;
  x.setUTCDate(x.getUTCDate() - daysSinceMonday);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}
function endOfWeekUTC(d = new Date()) {
  const s = startOfWeekUTC(d);
  const e = new Date(s);
  e.setUTCDate(e.getUTCDate() + 7);
  e.setUTCHours(0, 0, 0, 0);
  return e; // exclusive end
}

export default function CircleHome() {
  const params = useLocalSearchParams<{ circleId?: string; circleName?: string }>();
  const circleIdParam = Array.isArray(params.circleId) ? params.circleId[0] : params.circleId;
  const circleNameParam = Array.isArray(params.circleName) ? params.circleName[0] : params.circleName;

  const [circleId, setCircleId] = useState<string | null>(null);
  const [circleName, setCircleName] = useState<string>("Circle");

  const [progressPct, setProgressPct] = useState<number>(0);

  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<TaskItem[]>([]);

  // leaderboard
  const [leaderboard, setLeaderboard] = useState<LeaderRow[]>([]);
  const [myWeekPoints, setMyWeekPoints] = useState<number>(0);

  // modal
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);

  const inFlightRef = useRef(false);
  const initialLoadedRef = useRef(false);

  const circleNameSigRef = useRef<string>("");
  const progressSigRef = useRef<number>(-1);
  const tasksSigRef = useRef<string>("");
  const leaderboardSigRef = useRef<string>("");

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

  useEffect(() => {
    if (!circleId) return;

    let alive = true;

    const resolveCircleName = async () => {
      let name = circleNameParam?.trim() || "";

      if (!name) {
        try {
          const stored = await AsyncStorage.getItem("activeCircleName");
          if (stored && stored.trim()) name = stored.trim();
        } catch {}
      }

      if (!name) {
        const { data: circleRow, error } = await supabase
          .from("circles")
          .select("name")
          .eq("id", circleId)
          .maybeSingle();

        if (!alive) return;

        if (!error && circleRow) {
          const n = (circleRow as any)?.name;
          if (typeof n === "string" && n.trim()) {
            name = n.trim();
            try {
              await AsyncStorage.setItem("activeCircleName", name);
            } catch {}
          }
        }
      }

      if (!name) name = "Circle";
      if (!alive) return;

      if (circleNameSigRef.current !== name) {
        circleNameSigRef.current = name;
        setCircleName(name);
      }
    };

    resolveCircleName();

    return () => {
      alive = false;
    };
  }, [circleId, circleNameParam]);

  const finishInitialLoad = () => {
    if (!initialLoadedRef.current) {
      initialLoadedRef.current = true;
      setLoading(false);
    }
  };

  const setTasksIfChanged = (next: TaskItem[]) => {
    const sig = next.map((t) => `${t.key}:${t.done ? 1 : 0}:${t.title}`).join("|");
    if (sig === tasksSigRef.current) return;
    tasksSigRef.current = sig;
    setTasks(next);
  };

  const setLeaderboardIfChanged = (next: LeaderRow[]) => {
    const sig = next.map((x) => `${x.userId}:${x.points}:${x.name}`).join("|");
    if (sig === leaderboardSigRef.current) return;
    leaderboardSigRef.current = sig;
    setLeaderboard(next);
  };

  const fetchLeaderboard = async (circleId: string, uid: string) => {
    const wStart = startOfWeekUTC();
    const wEnd = endOfWeekUTC();

    const { data: rows, error } = await supabase
      .from("task_completions")
      .select("user_id, points")
      .eq("circle_id", circleId)
      .gte("completed_at", wStart.toISOString())
      .lt("completed_at", wEnd.toISOString());

    if (error || !rows) {
      setLeaderboardIfChanged([]);
      setMyWeekPoints(0);
      return;
    }

    const pointsByUser: Record<string, number> = {};
    for (const r of rows as any[]) {
      const userId = String(r.user_id);
      const pts = Number(r.points ?? POINTS_PER_TASK) || 0;
      pointsByUser[userId] = (pointsByUser[userId] || 0) + pts;
    }

    // fetch names for users present
    const userIds = Object.keys(pointsByUser);
    let nameById: Record<string, string> = {};
    if (userIds.length > 0) {
      const { data: profRows } = await supabase
        .from("profiles")
        .select("id, first_name")
        .in("id", userIds);

      if (profRows) {
        for (const p of profRows as any[]) {
          const id = String(p.id);
          const nm = String(p.first_name ?? "").trim();
          if (nm) nameById[id] = nm;
        }
      }
    }

    const list: LeaderRow[] = userIds
      .map((id) => ({
        userId: id,
        name: nameById[id] || "User",
        points: pointsByUser[id] || 0,
      }))
      .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));

    setLeaderboardIfChanged(list);
    setMyWeekPoints(pointsByUser[uid] || 0);
  };

  useEffect(() => {
    if (!circleId) return;

    let alive = true;

    const fetchCircleDashboard = async () => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;

      try {
        if (!initialLoadedRef.current) setLoading(true);

        const { data: userData } = await supabase.auth.getUser();
        const uid = userData.user?.id;

        if (!uid) {
          if (!alive) return;
          setTasksIfChanged([]);
          setLeaderboardIfChanged([]);
          setMyWeekPoints(0);
          if (progressSigRef.current !== 0) {
            progressSigRef.current = 0;
            setProgressPct(0);
          }
          finishInitialLoad();
          return;
        }

        const { data: ctRows, error: ctErr } = await supabase
          .from("circle_tasks")
          .select("position, task_id")
          .eq("circle_id", circleId)
          .order("position", { ascending: true });

        if (!alive) return;

        if (ctErr || !ctRows || ctRows.length === 0) {
          setTasksIfChanged([]);
          if (progressSigRef.current !== 0) {
            progressSigRef.current = 0;
            setProgressPct(0);
          }
          await fetchLeaderboard(circleId, uid);
          finishInitialLoad();
          return;
        }

        const orderedTaskIds = (ctRows as any[]).map((r) => String(r.task_id));
        const uniqueTaskIds = Array.from(new Set(orderedTaskIds));

        const { data: tRows, error: tErr } = await supabase
          .from("tasks")
          .select("id, title")
          .in("id", uniqueTaskIds);

        if (!alive) return;

        if (tErr || !tRows) {
          await fetchLeaderboard(circleId, uid);
          finishInitialLoad();
          return;
        }

        const titleById: Record<string, string> = {};
        for (const t of tRows as any[]) {
          const id = String(t.id);
          const title = String(t.title ?? "").trim();
          if (title) titleById[id] = title;
        }

        const dayStart = startOfDayLocal();
        const dayEnd = endOfDayLocal();

        const { data: compRows, error: compErr } = await supabase
          .from("task_completions")
          .select("task_id")
          .eq("circle_id", circleId)
          .eq("user_id", uid)
          .gte("completed_at", dayStart.toISOString())
          .lte("completed_at", dayEnd.toISOString());

        if (!alive) return;

        const completedSet = new Set<string>();
        if (!compErr && compRows) {
          for (const c of compRows as any[]) {
            if (c?.task_id) completedSet.add(String(c.task_id));
          }
        }

        const nextTasksAll: TaskItem[] = orderedTaskIds
          .map((tid) => {
            const title = titleById[tid];
            if (!title) return null;
            return {
              key: tid,
              title,
              done: completedSet.has(tid),
            };
          })
          .filter(Boolean) as TaskItem[];

        const total = nextTasksAll.length;
        const done = nextTasksAll.filter((t) => t.done).length;
        const pct = total === 0 ? 0 : Math.round((done / total) * 100);

        if (!alive) return;

        if (progressSigRef.current !== pct) {
          progressSigRef.current = pct;
          setProgressPct(pct);
        }

        setTasksIfChanged(nextTasksAll);

        await fetchLeaderboard(circleId, uid);

        finishInitialLoad();
      } catch {
        finishInitialLoad();
      } finally {
        inFlightRef.current = false;
      }
    };

    fetchCircleDashboard();
    const interval = setInterval(fetchCircleDashboard, POLL_MS);

    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, [circleId]);

  const remainingTasks = useMemo(() => tasks.filter((t) => !t.done), [tasks]);

  const openModal = () => {
    if (remainingTasks.length === 0) {
      Alert.alert("No tasks left", "You have completed all tasks for today.");
      return;
    }
    setSelectedTaskId((prev) => (prev ? prev : remainingTasks[0]?.key ?? null));
    setModalVisible(true);
  };

  const closeModal = () => {
    if (completing) return;
    setModalVisible(false);
    setSelectedTaskId(null);
  };

  const markSelectedCompleted = async () => {
    if (!circleId) return;
    if (!selectedTaskId) return;
    if (completing) return;

    setCompleting(true);

    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;

      if (!uid) {
        Alert.alert("Not logged in", "Please log in again.");
        return;
      }

      const nowIso = new Date().toISOString();

      const { error } = await supabase.from("task_completions").insert({
        circle_id: circleId,
        user_id: uid,
        task_id: selectedTaskId,
        completed_at: nowIso,
        points: POINTS_PER_TASK,
      });

      // Unique constraint -> already completed today, do not add points again
      if (error) {
        const code = (error as any)?.code;
        if (code !== "23505") {
          Alert.alert("Error", error.message);
          return;
        }
      }

      // optimistic task update
      let nextPct = 0;
      setTasks((prev) => {
        const next = prev.map((t) => (t.key === selectedTaskId ? { ...t, done: true } : t));
        tasksSigRef.current = next.map((t) => `${t.key}:${t.done ? 1 : 0}:${t.title}`).join("|");

        const total = next.length;
        const doneNow = next.filter((t) => t.done).length;
        nextPct = total === 0 ? 0 : Math.round((doneNow / total) * 100);

        return next;
      });

      setProgressPct(() => {
        progressSigRef.current = nextPct;
        return nextPct;
      });

      // optimistic points update only if insert was not a duplicate
      if (!error) {
        setMyWeekPoints((p) => p + POINTS_PER_TASK);

        setLeaderboard((prev) => {
          const idx = prev.findIndex((r) => r.userId === uid);
          let next = [...prev];

          if (idx >= 0) {
            next[idx] = { ...next[idx], points: next[idx].points + POINTS_PER_TASK };
          } else {
            next.push({ userId: uid, name: "You", points: POINTS_PER_TASK });
          }

          next.sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
          leaderboardSigRef.current = next.map((x) => `${x.userId}:${x.points}:${x.name}`).join("|");
          return next;
        });
      }

      setModalVisible(false);
      setSelectedTaskId(null);
    } finally {
      setCompleting(false);
    }
  };

  const radius = 36;
  const stroke = 10;
  const circumference = 2 * Math.PI * radius;
  const progressOffset = circumference - (progressPct / 100) * circumference;

  const tasksToShow = tasks.slice(0, 3);

  const rankBadge = (rank: number) => {
    if (rank === 1) return { bg: "#FFD700", text: "1" };
    if (rank === 2) return { bg: "#C0C0C0", text: "2" };
    if (rank === 3) return { bg: "#CD7F32", text: "3" };
    return { bg: "rgba(0,0,0,0.08)", text: String(rank) };
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.root}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.headline}>{circleName}'s Circle</Text>

          <Pressable onPress={openModal} style={styles.addTaskPressable}>
            <LinearGradient
              colors={["#CFA3FF", PRIMARY]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.addTaskGradient}
            >
              <Text style={styles.addTaskText}>Add new task</Text>
              <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
            </LinearGradient>
          </Pressable>

          <View style={styles.leaderboardCard}>
            <View style={styles.leaderboardHeader}>
              <Text style={styles.leaderboardTitle}>Leaderboard</Text>
              <View style={styles.pointsPill}>
                <Ionicons name="star" size={16} color="#FFD700" />
                <Text style={styles.pointsPillText}>{myWeekPoints} pts</Text>
              </View>
            </View>

            {leaderboard.length === 0 ? (
              <View style={styles.leaderboardEmpty}>
                <Text style={styles.leaderboardEmptyText}>No points yet this week</Text>
              </View>
            ) : (
              <View style={{ gap: 10, marginTop: 10 }}>
                {leaderboard.map((row, i) => {
                  const rank = i + 1;
                  const badge = rankBadge(rank);
                  return (
                    <View key={row.userId} style={styles.leaderRow}>
                      <View style={[styles.rankBadge, { backgroundColor: badge.bg }]}>
                        <Text style={styles.rankText}>{badge.text}</Text>
                      </View>

                      <Text style={styles.leaderName} numberOfLines={1}>
                        {row.name}
                      </Text>

                      <Text style={styles.leaderPoints}>{row.points}</Text>
                    </View>
                  );
                })}
              </View>
            )}
          </View>

          <View style={styles.bottomCardsRow}>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Your total Progress today</Text>

              <View style={styles.progressContainer}>
                <Svg width={100} height={100}>
                  <Circle
                    cx="50"
                    cy="50"
                    r={radius}
                    stroke="rgba(0,0,0,0.10)"
                    strokeWidth={stroke}
                    fill="none"
                  />
                  <Circle
                    cx="50"
                    cy="50"
                    r={radius}
                    stroke={PRIMARY}
                    strokeWidth={stroke}
                    fill="none"
                    strokeDasharray={`${circumference} ${circumference}`}
                    strokeDashoffset={progressOffset}
                    strokeLinecap="round"
                    rotation={-90}
                    originX="50"
                    originY="50"
                  />
                </Svg>
                <Text style={[styles.progressText, { color: PRIMARY }]}>{progressPct}%</Text>
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Tasks</Text>

              {loading ? (
                <View style={styles.tasksEmptyBox}>
                  <Text style={styles.tasksEmptyText}>Loading...</Text>
                </View>
              ) : tasksToShow.length === 0 ? (
                <View style={styles.tasksEmptyBox}>
                  <Text style={styles.tasksEmptyText}>so empty....</Text>
                </View>
              ) : (
                <View style={styles.tasksList}>
                  {tasksToShow.map((t) => (
                    <View key={t.key} style={styles.taskRow}>
                      <Text style={styles.taskText} numberOfLines={1}>
                        {t.title}
                      </Text>
                      {t.done ? <Ionicons name="checkmark-circle" size={18} color={PRIMARY} /> : null}
                    </View>
                  ))}
                </View>
              )}
            </View>
          </View>
        </ScrollView>

        <View style={styles.tabBar}>
          <Pressable onPress={() => router.push("/user-home")} style={styles.tabItem}>
            <View style={styles.tabContent}>
              <Ionicons name="home" size={24} color={PRIMARY} />
              <Text style={[styles.tabTextActive, { color: PRIMARY }]}>Home</Text>
              <View style={[styles.tabIndicator, { backgroundColor: PRIMARY }]} />
            </View>
          </Pressable>

          <Pressable onPress={() => router.push("/create-circle")} style={styles.tabItem}>
            <Ionicons name="people" size={24} color="#999999" />
            <Text style={styles.tabTextInactive}>Circles</Text>
          </Pressable>

          <Pressable style={styles.tabItem}>
            <Ionicons name="settings" size={24} color="#999999" />
            <Text style={styles.tabTextInactive}>Settings</Text>
          </Pressable>
        </View>

        <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={closeModal}>
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Tasks left today</Text>
                <Pressable onPress={closeModal} disabled={completing} style={styles.modalClose}>
                  <Ionicons name="close" size={22} color={TEXT_PRIMARY} />
                </Pressable>
              </View>

              {loading ? (
                <View style={styles.modalLoadingRow}>
                  <ActivityIndicator />
                  <Text style={styles.modalLoadingText}>Loading tasks</Text>
                </View>
              ) : remainingTasks.length === 0 ? (
                <View style={styles.modalEmptyBox}>
                  <Text style={styles.modalEmptyText}>No tasks left for today</Text>
                </View>
              ) : (
                <ScrollView
                  style={styles.modalList}
                  contentContainerStyle={{ paddingBottom: 12 }}
                  showsVerticalScrollIndicator={false}
                >
                  {remainingTasks.map((t) => {
                    const selected = selectedTaskId === t.key;
                    return (
                      <Pressable
                        key={t.key}
                        onPress={() => setSelectedTaskId(t.key)}
                        style={[styles.modalTaskRow, selected ? styles.modalTaskRowSelected : null]}
                      >
                        <Text style={[styles.modalTaskText, selected ? styles.modalTaskTextSelected : null]}>
                          {t.title}
                        </Text>
                        {selected ? <Ionicons name="checkmark" size={18} color="#FFFFFF" /> : null}
                      </Pressable>
                    );
                  })}
                </ScrollView>
              )}

              <Pressable
                onPress={markSelectedCompleted}
                disabled={!selectedTaskId || completing || remainingTasks.length === 0}
                style={[
                  styles.modalPrimaryButton,
                  !selectedTaskId || completing || remainingTasks.length === 0
                    ? styles.modalPrimaryButtonDisabled
                    : null,
                ]}
              >
                {completing ? (
                  <View style={styles.modalBtnRow}>
                    <ActivityIndicator color="#FFFFFF" />
                    <Text style={styles.modalPrimaryButtonText}>Marking...</Text>
                  </View>
                ) : (
                  <Text style={styles.modalPrimaryButtonText}>Mark as completed</Text>
                )}
              </Pressable>
            </View>
          </View>
        </Modal>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: BG },

  root: { flex: 1, backgroundColor: BG },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 40,
    paddingBottom: 120,
  },

  headline: {
    fontSize: 32,
    fontWeight: "900",
    color: TEXT_PRIMARY,
    marginBottom: 24,
    textAlign: "center",
  },

  addTaskPressable: {
    marginBottom: 20,
    borderRadius: 14,
    overflow: "hidden",
  },
  addTaskGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 14,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  addTaskText: { fontSize: 16, fontWeight: "800", color: "#FFFFFF" },

  leaderboardCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 25,
    padding: 16,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  leaderboardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  leaderboardTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: TEXT_PRIMARY,
  },
  pointsPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.06)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
  },
  pointsPillText: { fontSize: 13, fontWeight: "900", color: PRIMARY },

  leaderboardEmpty: { paddingVertical: 30, alignItems: "center", justifyContent: "center" },
  leaderboardEmptyText: { fontSize: 14, fontWeight: "700", color: "rgba(0,0,0,0.45)" },

  leaderRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.10)",
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: "rgba(0,0,0,0.03)",
  },
  rankBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.15)",
  },
  rankText: { fontSize: 14, fontWeight: "900", color: "#000000" },
  leaderName: { flex: 1, fontSize: 16, fontWeight: "900", color: TEXT_PRIMARY },
  leaderPoints: { fontSize: 16, fontWeight: "900", color: PRIMARY, minWidth: 44, textAlign: "right" },

  bottomCardsRow: { flexDirection: "row", gap: 12, marginBottom: 10 },

  card: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 25,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    alignItems: "center",
  },

  cardTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: TEXT_PRIMARY,
    marginBottom: 16,
    textAlign: "center",
  },

  progressContainer: {
    width: 100,
    height: 100,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  progressText: { position: "absolute", fontSize: 20, fontWeight: "800" },

  tasksEmptyBox: { alignItems: "center", justifyContent: "center", paddingVertical: 8 },
  tasksEmptyText: { fontSize: 14, fontWeight: "600", color: "rgba(0,0,0,0.35)" },

  tasksList: { width: "100%", gap: 10 },

  taskRow: {
    width: "100%",
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: "rgba(0,0,0,0.05)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  taskText: { flex: 1, fontSize: 14, fontWeight: "800", color: TEXT_PRIMARY },

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
  tabIndicator: { width: 30, height: 3, marginTop: 4, borderRadius: 2 },
  tabTextActive: { fontSize: 12, fontWeight: "600", marginTop: 4 },
  tabTextInactive: { fontSize: 12, color: "#999999", fontWeight: "500", marginTop: 4 },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  modalCard: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 16,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  modalTitle: { fontSize: 18, fontWeight: "900", color: TEXT_PRIMARY },
  modalClose: { padding: 6 },

  modalLoadingRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 14 },
  modalLoadingText: { fontSize: 14, fontWeight: "700", color: "rgba(0,0,0,0.55)" },

  modalEmptyBox: { paddingVertical: 18, alignItems: "center", justifyContent: "center" },
  modalEmptyText: { fontSize: 14, fontWeight: "700", color: "rgba(0,0,0,0.45)" },

  modalList: { maxHeight: 320 },

  modalTaskRow: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 10,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  modalTaskRowSelected: {
    backgroundColor: PRIMARY,
    borderColor: PRIMARY,
  },
  modalTaskText: { flex: 1, fontSize: 15, fontWeight: "900", color: TEXT_PRIMARY },
  modalTaskTextSelected: { color: "#FFFFFF" },

  modalPrimaryButton: {
    marginTop: 8,
    backgroundColor: PRIMARY,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  modalPrimaryButtonDisabled: { opacity: 0.5 },
  modalPrimaryButtonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "900" },

  modalBtnRow: { flexDirection: "row", alignItems: "center", gap: 10 },
});
