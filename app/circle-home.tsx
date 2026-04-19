import { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Alert,
  ScrollView,
  Animated,
  Easing,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Circle as SvgCircle } from "react-native-svg";
import { supabase } from "../src/lib/supabase";
import { TabBar } from "../src/components/TabBar";
import { TaskCompleteSheet } from "../src/components/TaskCompleteSheet";
import {
  Colors,
  ProgressGradient,
  Radius,
  Spacing,
  Typography,
} from "../src/constants/design";

const POLL_MS = 3000;
const POINTS_PER_TASK = 5;

type TaskItem = { key: string; title: string; done: boolean };
type LeaderRow = { userId: string; name: string; points: number };

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
function startOfWeekUTC(d = new Date()) {
  const x = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
  const day = x.getUTCDay();
  const daysSinceMonday = (day + 6) % 7;
  x.setUTCDate(x.getUTCDate() - daysSinceMonday);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}
function endOfWeekUTC(d = new Date()) {
  const s = startOfWeekUTC(d);
  const e = new Date(s);
  e.setUTCDate(e.getUTCDate() + 7);
  return e;
}

function medalColor(rank: number): string {
  if (rank === 1) return Colors.accent.gold;
  if (rank === 2) return Colors.accent.silver;
  if (rank === 3) return Colors.accent.bronze;
  return Colors.bg.cardActive;
}

const RING_SIZE = 104;
const RING_STROKE = 8;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const AnimatedCircle = Animated.createAnimatedComponent(SvgCircle);

export default function CircleHome() {
  const params = useLocalSearchParams<{
    circleId?: string;
    circleName?: string;
  }>();
  const circleIdParam = Array.isArray(params.circleId)
    ? params.circleId[0]
    : params.circleId;
  const circleNameParam = Array.isArray(params.circleName)
    ? params.circleName[0]
    : params.circleName;

  const [circleId, setCircleId] = useState<string | null>(null);
  const [circleName, setCircleName] = useState<string>("Circle");
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderRow[]>([]);
  const [myWeekPoints, setMyWeekPoints] = useState<number>(0);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [completing, setCompleting] = useState(false);

  const inFlightRef = useRef(false);
  const initialLoadedRef = useRef(false);
  const mountAnim = useRef(new Animated.Value(0)).current;
  const barsAnim = useRef(new Animated.Value(0)).current;
  const ringAnim = useRef(new Animated.Value(0)).current;

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
      if (circleIdParam) {
        setCircleId(circleIdParam);
        try {
          await AsyncStorage.setItem("activeCircleId", circleIdParam);
        } catch {
          // ignore
        }
        return;
      }
      try {
        const stored = await AsyncStorage.getItem("activeCircleId");
        if (stored) setCircleId(stored);
      } catch {
        // ignore
      }
    };
    init();
  }, [circleIdParam]);

  useEffect(() => {
    if (!circleId) return;
    let alive = true;

    const resolveName = async () => {
      let name = circleNameParam?.trim() ?? "";
      if (!name) {
        try {
          const stored = await AsyncStorage.getItem("activeCircleName");
          if (stored?.trim()) name = stored.trim();
        } catch {
          // ignore
        }
      }
      if (!name) {
        const { data } = await supabase
          .from("circles")
          .select("name")
          .eq("id", circleId)
          .maybeSingle();
        if (alive && data) {
          const row = data as { name?: string | null };
          if (row.name && row.name.trim()) {
            name = row.name.trim();
            try {
              await AsyncStorage.setItem("activeCircleName", name);
            } catch {
              // ignore
            }
          }
        }
      }
      if (!alive) return;
      setCircleName(name || "Circle");
    };

    resolveName();
    return () => {
      alive = false;
    };
  }, [circleId, circleNameParam]);

  useEffect(() => {
    if (!circleId) return;
    let alive = true;

    const fetchLeaderboard = async (uid: string) => {
      const wStart = startOfWeekUTC();
      const wEnd = endOfWeekUTC();
      const { data: rows } = await supabase
        .from("task_completions")
        .select("user_id, points")
        .eq("circle_id", circleId)
        .gte("completed_at", wStart.toISOString())
        .lt("completed_at", wEnd.toISOString());

      if (!rows) {
        setLeaderboard([]);
        setMyWeekPoints(0);
        return;
      }

      type CompletionPts = { user_id: string; points?: number | null };
      const pointsByUser: Record<string, number> = {};
      for (const r of rows as unknown as CompletionPts[]) {
        const id = String(r.user_id);
        pointsByUser[id] =
          (pointsByUser[id] ?? 0) + (Number(r.points) || POINTS_PER_TASK);
      }

      const userIds = Object.keys(pointsByUser);
      const nameById: Record<string, string> = {};
      if (userIds.length > 0) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, first_name")
          .in("id", userIds);
        if (profs) {
          type Prof = { id: string; first_name?: string | null };
          for (const p of profs as unknown as Prof[]) {
            const nm = String(p.first_name ?? "").trim();
            if (nm) nameById[String(p.id)] = nm;
          }
        }
      }

      const list: LeaderRow[] = userIds
        .map((id) => ({
          userId: id,
          name: nameById[id] ?? "User",
          points: pointsByUser[id] ?? 0,
        }))
        .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));

      if (!alive) return;
      setLeaderboard(list);
      setMyWeekPoints(pointsByUser[uid] ?? 0);
    };

    const fetchAll = async () => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      try {
        const { data: userData } = await supabase.auth.getUser();
        const uid = userData.user?.id;
        if (!uid) {
          if (!alive) return;
          setTasks([]);
          setLeaderboard([]);
          setMyWeekPoints(0);
          setLoading(false);
          return;
        }

        const { data: ctRows } = await supabase
          .from("circle_tasks")
          .select("position, task_id")
          .eq("circle_id", circleId)
          .order("position", { ascending: true });

        if (!alive) return;

        if (!ctRows || ctRows.length === 0) {
          setTasks([]);
          await fetchLeaderboard(uid);
          if (!initialLoadedRef.current) {
            initialLoadedRef.current = true;
            setLoading(false);
          }
          return;
        }

        type CT = { position: number; task_id: string };
        const taskIds = (ctRows as unknown as CT[]).map((r) =>
          String(r.task_id),
        );
        const uniqueIds = Array.from(new Set(taskIds));

        const { data: tRows } = await supabase
          .from("tasks")
          .select("id, title")
          .in("id", uniqueIds);

        if (!alive || !tRows) {
          await fetchLeaderboard(uid);
          if (!initialLoadedRef.current) {
            initialLoadedRef.current = true;
            setLoading(false);
          }
          return;
        }

        type T = { id: string; title: string };
        const titleById: Record<string, string> = {};
        for (const t of tRows as unknown as T[]) {
          const title = String(t.title ?? "").trim();
          if (title) titleById[String(t.id)] = title;
        }

        const dayStart = startOfDayLocal();
        const dayEnd = endOfDayLocal();
        const { data: compRows } = await supabase
          .from("task_completions")
          .select("task_id")
          .eq("circle_id", circleId)
          .eq("user_id", uid)
          .gte("completed_at", dayStart.toISOString())
          .lte("completed_at", dayEnd.toISOString());

        const completedSet = new Set<string>();
        if (compRows) {
          type C = { task_id: string };
          for (const c of compRows as unknown as C[]) {
            if (c.task_id) completedSet.add(String(c.task_id));
          }
        }

        const next: TaskItem[] = taskIds
          .map((tid) => {
            const title = titleById[tid];
            if (!title) return null;
            return { key: tid, title, done: completedSet.has(tid) };
          })
          .filter((x): x is TaskItem => x !== null);

        if (!alive) return;
        setTasks(next);
        await fetchLeaderboard(uid);
        if (!initialLoadedRef.current) {
          initialLoadedRef.current = true;
          setLoading(false);
        }
      } finally {
        inFlightRef.current = false;
      }
    };

    fetchAll();
    const interval = setInterval(fetchAll, POLL_MS);
    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, [circleId]);

  const remaining = useMemo(() => tasks.filter((t) => !t.done), [tasks]);
  const doneCount = tasks.length - remaining.length;
  const totalCount = tasks.length;
  const progressPct = totalCount === 0 ? 0 : doneCount / totalCount;
  // Max weekly ceiling: every task, every day of the week, at full points.
  const maxWeeklyPoints = totalCount * 7 * POINTS_PER_TASK;
  const [showAllTasks, setShowAllTasks] = useState(false);
  const visibleTasks = showAllTasks ? tasks : tasks.slice(0, 5);
  const hiddenCount = tasks.length - visibleTasks.length;

  useEffect(() => {
    if (loading) return;
    barsAnim.stopAnimation();
    barsAnim.setValue(0);
    Animated.timing(barsAnim, {
      toValue: 1,
      duration: 620,
      delay: 120,
      easing: Easing.out(Easing.exp),
      useNativeDriver: false,
    }).start();
  }, [loading, leaderboard.length, maxWeeklyPoints, barsAnim]);

  useEffect(() => {
    Animated.timing(ringAnim, {
      toValue: progressPct,
      duration: 520,
      easing: Easing.out(Easing.exp),
      useNativeDriver: true,
    }).start();
  }, [progressPct, ringAnim]);

  const ringOffset = ringAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [RING_CIRCUMFERENCE, 0],
  });

  const openSheet = () => {
    if (remaining.length === 0) {
      Alert.alert("No tasks left", "You have completed all tasks for today.");
      return;
    }
    setSheetVisible(true);
  };

  const completeTask = async (taskKey: string) => {
    if (!circleId || completing) return;
    setCompleting(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) {
        Alert.alert("Not logged in", "Please log in again.");
        return;
      }

      const { error } = await supabase.from("task_completions").insert({
        circle_id: circleId,
        user_id: uid,
        task_id: taskKey,
        completed_at: new Date().toISOString(),
        points: POINTS_PER_TASK,
      });

      // 23505 = unique violation — task was already completed today.
      // Skip point increment in that case but still close the sheet.
      const insertErr = error as { code?: string; message?: string } | null;
      if (insertErr && insertErr.code !== "23505") {
        Alert.alert("Error", insertErr.message ?? "Unknown error");
        return;
      }

      setTasks((prev) =>
        prev.map((t) => (t.key === taskKey ? { ...t, done: true } : t)),
      );

      if (!insertErr) {
        setMyWeekPoints((p) => p + POINTS_PER_TASK);
        setLeaderboard((prev) => {
          const idx = prev.findIndex((r) => r.userId === uid);
          const next =
            idx >= 0
              ? prev.map((r, i) =>
                  i === idx ? { ...r, points: r.points + POINTS_PER_TASK } : r,
                )
              : [
                  ...prev,
                  { userId: uid, name: "You", points: POINTS_PER_TASK },
                ];
          return next.sort(
            (a, b) => b.points - a.points || a.name.localeCompare(b.name),
          );
        });
      }
      setSheetVisible(false);
    } finally {
      setCompleting(false);
    }
  };

  const opacity = mountAnim;
  const translateY = mountAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [18, 0],
  });

  return (
    <SafeAreaView style={styles.safeArea}>
      <Animated.View
        style={[styles.root, { opacity, transform: [{ translateY }] }]}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <Text style={styles.overline}>Circle</Text>
            <Text style={styles.circleName}>{circleName}</Text>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>This week</Text>
              <Text style={styles.sectionMeta}>{myWeekPoints} pts</Text>
            </View>
            {loading ? (
              <View style={styles.board}>
                <View style={styles.emptyInline}>
                  <Text style={styles.emptyText}>Loading…</Text>
                </View>
              </View>
            ) : leaderboard.length === 0 ? (
              <View style={styles.board}>
                <View style={styles.emptyInline}>
                  <Text style={styles.emptyTitle}>No points yet</Text>
                  <Text style={styles.emptyHelper}>
                    Complete a task to light up the board.
                  </Text>
                </View>
              </View>
            ) : (
              <View style={styles.board}>
                {leaderboard.map((row, idx) => {
                  const rank = idx + 1;
                  const isTopThree = rank <= 3;
                  const rawFill =
                    maxWeeklyPoints > 0 ? row.points / maxWeeklyPoints : 0;
                  const targetFill = Math.min(1, rawFill);
                  const widthAnim = barsAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: ["0%", `${targetFill * 100}%`],
                  });
                  return (
                    <View key={row.userId} style={styles.boardRow}>
                      <View
                        style={[
                          styles.medal,
                          { backgroundColor: medalColor(rank) },
                        ]}
                      >
                        <Text
                          style={[
                            styles.medalText,
                            isTopThree && styles.medalTextTop,
                          ]}
                        >
                          {rank}
                        </Text>
                      </View>
                      <View style={styles.boardBody}>
                        <View style={styles.boardTop}>
                          <Text style={styles.boardName} numberOfLines={1}>
                            {row.name}
                          </Text>
                          <Text style={styles.boardPts}>{row.points} pts</Text>
                        </View>
                        <View style={styles.barTrack}>
                          <Animated.View
                            style={[styles.barFill, { width: widthAnim }]}
                          >
                            <LinearGradient
                              colors={[...ProgressGradient]}
                              start={{ x: 0, y: 0 }}
                              end={{ x: 1, y: 0 }}
                              style={StyleSheet.absoluteFill}
                            />
                          </Animated.View>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>

          <View style={styles.todayCard}>
            <View style={styles.ringWrap}>
              <Svg width={RING_SIZE} height={RING_SIZE}>
                <SvgCircle
                  cx={RING_SIZE / 2}
                  cy={RING_SIZE / 2}
                  r={RING_RADIUS}
                  stroke={Colors.progressTrack}
                  strokeWidth={RING_STROKE}
                  fill="transparent"
                />
                <AnimatedCircle
                  cx={RING_SIZE / 2}
                  cy={RING_SIZE / 2}
                  r={RING_RADIUS}
                  stroke={Colors.brand.greenBright}
                  strokeWidth={RING_STROKE}
                  strokeDasharray={RING_CIRCUMFERENCE}
                  strokeDashoffset={ringOffset}
                  strokeLinecap="round"
                  fill="transparent"
                  transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
                />
              </Svg>
              <View style={styles.ringLabel} pointerEvents="none">
                <Text style={styles.ringNumber}>
                  {doneCount}
                  <Text style={styles.ringDenom}>/{totalCount}</Text>
                </Text>
              </View>
            </View>
            <View style={styles.todayBody}>
              <Text style={styles.todayOverline}>Today</Text>
              <Text style={styles.todayHeadline}>
                {totalCount === 0
                  ? "No tasks yet"
                  : remaining.length === 0
                    ? "All done."
                    : `${remaining.length} to go.`}
              </Text>
              <Pressable
                onPress={openSheet}
                disabled={remaining.length === 0 || totalCount === 0}
                style={({ pressed }) => [
                  styles.cta,
                  pressed && styles.ctaPressed,
                  (remaining.length === 0 || totalCount === 0) &&
                    styles.ctaDisabled,
                ]}
              >
                <Text
                  style={[
                    styles.ctaText,
                    (remaining.length === 0 || totalCount === 0) &&
                      styles.ctaTextDisabled,
                  ]}
                >
                  {totalCount === 0
                    ? "Pick tasks first"
                    : remaining.length === 0
                      ? "All done today"
                      : "Mark task done"}
                </Text>
                {remaining.length > 0 && totalCount > 0 ? (
                  <Ionicons
                    name="arrow-forward"
                    size={18}
                    color={Colors.brand.greenText}
                  />
                ) : null}
              </Pressable>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Today's list</Text>
            {loading ? (
              <View style={styles.emptyBlock}>
                <Text style={styles.emptyText}>Loading…</Text>
              </View>
            ) : tasks.length === 0 ? (
              <View style={styles.emptyBlock}>
                <Text style={styles.emptyTitle}>No tasks set</Text>
                <Text style={styles.emptyHelper}>
                  Your circle hasn't picked this week's tasks yet.
                </Text>
              </View>
            ) : (
              <View style={styles.taskList}>
                {visibleTasks.map((t) => (
                  <View key={t.key} style={styles.taskRow}>
                    <Text
                      style={[styles.taskTitle, t.done && styles.taskTitleDone]}
                      numberOfLines={1}
                    >
                      {t.title}
                    </Text>
                    {t.done ? (
                      <Ionicons
                        name="checkmark-circle"
                        size={22}
                        color={Colors.brand.greenBright}
                      />
                    ) : (
                      <View style={styles.taskDot} />
                    )}
                  </View>
                ))}
                {tasks.length > 5 ? (
                  <Pressable
                    onPress={() => setShowAllTasks((v) => !v)}
                    style={({ pressed }) => [
                      styles.showMore,
                      pressed && styles.showMorePressed,
                    ]}
                    hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
                  >
                    <Text style={styles.showMoreText}>
                      {showAllTasks ? "Show less" : `Show ${hiddenCount} more`}
                    </Text>
                    <Ionicons
                      name={showAllTasks ? "chevron-up" : "chevron-down"}
                      size={16}
                      color={Colors.text.secondary}
                    />
                  </Pressable>
                ) : null}
              </View>
            )}
          </View>
        </ScrollView>

        <TabBar active="circles" />
      </Animated.View>

      <TaskCompleteSheet
        visible={sheetVisible}
        tasks={remaining.map((r) => ({ key: r.key, title: r.title }))}
        loading={loading}
        completing={completing}
        onClose={() => {
          if (!completing) setSheetVisible(false);
        }}
        onComplete={completeTask}
      />
    </SafeAreaView>
  );
}

const CTA_HEIGHT = 48;

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.bg.base },
  root: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: Spacing.screenHorizontal,
    paddingTop: Spacing.screenTop,
    paddingBottom: 32,
    gap: Spacing.sectionGap,
  },

  header: {
    gap: 6,
    paddingTop: 4,
  },
  overline: {
    ...Typography.overline,
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  circleName: {
    ...Typography.title,
    fontSize: 30,
    letterSpacing: -0.4,
  },

  section: {
    gap: 14,
  },
  sectionHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  sectionTitle: {
    ...Typography.section,
  },
  sectionMeta: {
    ...Typography.overline,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    color: Colors.text.primary,
  },

  board: {
    backgroundColor: Colors.bg.card,
    padding: 20,
    borderRadius: Radius.card,
    gap: 14,
  },
  boardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  medal: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  medalText: {
    ...Typography.section,
    fontSize: 14,
    color: Colors.text.primary,
    fontWeight: "700",
  },
  medalTextTop: {
    color: Colors.bg.base,
  },
  boardBody: {
    flex: 1,
    gap: 6,
  },
  boardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: 10,
  },
  boardName: {
    ...Typography.body,
    fontWeight: "600",
    flex: 1,
  },
  boardPts: {
    ...Typography.label,
  },
  barTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.progressTrack,
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    borderRadius: 2,
    overflow: "hidden",
  },

  todayCard: {
    backgroundColor: Colors.bg.card,
    borderRadius: Radius.card,
    padding: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 18,
  },
  ringWrap: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  ringLabel: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  ringNumber: {
    ...Typography.display,
    fontSize: 28,
    letterSpacing: -0.6,
    lineHeight: 32,
  },
  ringDenom: {
    ...Typography.label,
    fontSize: 16,
    color: Colors.text.secondary,
  },
  todayBody: {
    flex: 1,
    gap: 8,
  },
  todayOverline: {
    ...Typography.overline,
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  todayHeadline: {
    ...Typography.title,
    fontSize: 22,
    letterSpacing: -0.4,
  },
  cta: {
    marginTop: 4,
    height: CTA_HEIGHT,
    backgroundColor: Colors.brand.green,
    borderRadius: Radius.pill,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 16,
  },
  ctaPressed: {
    opacity: 0.8,
  },
  ctaDisabled: {
    backgroundColor: Colors.bg.cardActive,
  },
  ctaText: {
    ...Typography.body,
    fontSize: 15,
    color: Colors.brand.greenText,
    fontWeight: "600",
  },
  ctaTextDisabled: {
    color: Colors.text.secondary,
  },

  taskList: {
    gap: 2,
  },
  taskRow: {
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  taskTitle: {
    ...Typography.body,
    flex: 1,
  },
  taskTitleDone: {
    color: Colors.text.secondary,
  },
  taskDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  showMore: {
    marginTop: 4,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 10,
  },
  showMorePressed: {
    opacity: 0.6,
  },
  showMoreText: {
    ...Typography.label,
    fontWeight: "600",
  },

  emptyBlock: {
    paddingVertical: 24,
    alignItems: "center",
    gap: 6,
  },
  emptyInline: {
    paddingVertical: 8,
    alignItems: "center",
    gap: 4,
  },
  emptyTitle: {
    ...Typography.body,
    fontWeight: "600",
  },
  emptyHelper: {
    ...Typography.label,
    textAlign: "center",
  },
  emptyText: {
    ...Typography.label,
  },
});
