import { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  Animated,
  Easing,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Svg, { Circle as SvgCircle } from "react-native-svg";
import { supabase } from "../src/lib/supabase";
import { TabBar } from "../src/components/TabBar";
import { Colors, Radius, Spacing, Typography } from "../src/constants/design";

type TodayTaskItem = {
  key: string;
  circleId: string;
  circleName: string;
  title: string;
  done: boolean;
};

const FIRST_NAME_KEY = "profileFirstName";
const POINTS_PER_TASK = 5;

const RING_SIZE = 112;
const RING_STROKE = 9;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const AnimatedCircle = Animated.createAnimatedComponent(SvgCircle);

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

export default function UserHome() {
  const [firstName, setFirstName] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const [todayTasks, setTodayTasks] = useState<TodayTaskItem[]>([]);
  const [weeklyPoints, setWeeklyPoints] = useState<number>(0);
  const [circleCount, setCircleCount] = useState<number>(0);
  const [showAllTasks, setShowAllTasks] = useState<boolean>(false);

  const inFlightRef = useRef(false);
  const mountAnim = useRef(new Animated.Value(0)).current;
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
    let alive = true;

    const loadFirstName = async () => {
      try {
        const cached = await AsyncStorage.getItem(FIRST_NAME_KEY);
        if (alive && cached && cached.trim()) setFirstName(cached.trim());
      } catch {
        // ignore cache read failure
      }

      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) return;

      const uid = user.id;

      let next = "";
      const { data: profile } = await supabase
        .from("profiles")
        .select("first_name")
        .eq("id", uid)
        .maybeSingle();

      const profileRow = (profile ?? {}) as { first_name?: string | null };
      if (profileRow.first_name && profileRow.first_name.trim()) {
        next = profileRow.first_name.trim();
      }

      if (!next) {
        const meta = (user.user_metadata ?? {}) as Record<
          string,
          string | undefined
        >;
        const m = meta.first_name ?? meta.firstName ?? meta.name ?? "";
        if (m.trim()) next = m.trim();
      }

      if (!next || !alive) return;

      setFirstName((prev) => (prev === next ? prev : next));
      try {
        await AsyncStorage.setItem(FIRST_NAME_KEY, next);
      } catch {
        // ignore cache write failure
      }
    };

    loadFirstName();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;

    const fetchDashboard = async () => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;

      try {
        const { data: userData } = await supabase.auth.getUser();
        const uid = userData.user?.id;
        if (!uid) {
          if (!alive) return;
          setTodayTasks([]);
          setWeeklyPoints(0);
          setCircleCount(0);
          setLoading(false);
          return;
        }

        // circle_members join returns one row per membership; circles comes back
        // as an object or array depending on schema version — normalize below.
        const { data: memberRows, error: mErr } = await supabase
          .from("circle_members")
          .select("circle_id, circles ( id, name, code )")
          .eq("user_id", uid);

        if (!alive) return;

        if (mErr || !memberRows || memberRows.length === 0) {
          setTodayTasks([]);
          setWeeklyPoints(0);
          setCircleCount(0);
          setLoading(false);
          return;
        }

        type CircleMini = {
          id: string;
          name: string | null;
          code: string | number | null;
        };
        type MemberRow = {
          circle_id: string;
          circles: CircleMini | CircleMini[] | null;
        };

        const rows = memberRows as unknown as MemberRow[];

        const circles: CircleMini[] = rows
          .map((r) => (Array.isArray(r.circles) ? r.circles[0] : r.circles))
          .filter((c): c is CircleMini => c != null)
          .map((c) => ({
            id: String(c.id),
            name: c.name ?? null,
            code: c.code ?? null,
          }));

        const circleIds = circles.map((c) => c.id);
        const circleNameById: Record<string, string> = {};
        for (const c of circles) {
          const nm = String(c.name ?? "").trim();
          const cd = String(c.code ?? "").trim();
          circleNameById[c.id] = nm || (cd ? `Circle ${cd}` : "Circle");
        }

        const { data: ctRows } = await supabase
          .from("circle_tasks")
          .select("circle_id, position, task_id")
          .in("circle_id", circleIds)
          .order("circle_id", { ascending: true })
          .order("position", { ascending: true });

        if (!alive) return;

        type CircleTaskRow = {
          circle_id: string;
          position: number;
          task_id: string;
        };
        const ctList = (ctRows ?? []) as unknown as CircleTaskRow[];
        const taskIds = Array.from(new Set(ctList.map((r) => r.task_id)));

        const titleById: Record<string, string> = {};
        if (taskIds.length > 0) {
          const { data: tRows } = await supabase
            .from("tasks")
            .select("id, title")
            .in("id", taskIds);
          if (tRows) {
            type TaskRow = { id: string; title: string };
            for (const t of tRows as unknown as TaskRow[]) {
              titleById[t.id] = String(t.title ?? "").trim();
            }
          }
        }

        const dayStart = startOfDayLocal();
        const dayEnd = endOfDayLocal();
        const doneSet = new Set<string>();

        if (taskIds.length > 0) {
          const { data: doneRows } = await supabase
            .from("task_completions")
            .select("circle_id, task_id, completed_at")
            .eq("user_id", uid)
            .gte("completed_at", dayStart.toISOString())
            .lte("completed_at", dayEnd.toISOString());

          if (doneRows) {
            type CompletionRow = { circle_id: string; task_id: string };
            for (const r of doneRows as unknown as CompletionRow[]) {
              doneSet.add(`${r.circle_id}:${r.task_id}`);
            }
          }
        }

        const nextTasks: TodayTaskItem[] = ctList
          .map((r) => {
            const title = titleById[r.task_id];
            if (!title) return null;
            const circleId = String(r.circle_id);
            const key = `${circleId}:${r.task_id}`;
            return {
              key,
              circleId,
              circleName: circleNameById[circleId] ?? "Circle",
              title,
              done: doneSet.has(key),
            };
          })
          .filter((x): x is TodayTaskItem => x !== null);

        // My weekly points across all circles
        const wStart = startOfWeekUTC();
        const wEnd = endOfWeekUTC();

        const { data: weekRows } = await supabase
          .from("task_completions")
          .select("points")
          .in("circle_id", circleIds)
          .eq("user_id", uid)
          .gte("completed_at", wStart.toISOString())
          .lt("completed_at", wEnd.toISOString());

        let myTotal = 0;
        if (weekRows) {
          type WeekRow = { points?: number | null };
          for (const r of weekRows as unknown as WeekRow[]) {
            myTotal += Number(r.points) || POINTS_PER_TASK;
          }
        }

        if (!alive) return;

        setTodayTasks(nextTasks);
        setWeeklyPoints(myTotal);
        setCircleCount(circles.length);
        setLoading(false);
      } finally {
        inFlightRef.current = false;
      }
    };

    fetchDashboard();

    return () => {
      alive = false;
    };
  }, []);

  const greetingName = firstName.trim() || "there";

  const doneCount = useMemo(
    () => todayTasks.filter((t) => t.done).length,
    [todayTasks],
  );
  const totalCount = todayTasks.length;
  const progressPct = totalCount === 0 ? 0 : doneCount / totalCount;

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

  const visibleTasks = showAllTasks ? todayTasks : todayTasks.slice(0, 5);
  const hiddenCount = todayTasks.length - visibleTasks.length;

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
            <Text style={styles.overline}>Good to see you</Text>
            <Text style={styles.greeting}>Hello, {greetingName}.</Text>
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
                  ? "No tasks today"
                  : doneCount === totalCount
                    ? "All done."
                    : `${totalCount - doneCount} to go.`}
              </Text>
              <Text style={styles.todayHelper}>
                across {circleCount} {circleCount === 1 ? "circle" : "circles"}
              </Text>
            </View>
          </View>

          <View style={styles.weekCard}>
            <View style={styles.weekLeft}>
              <Text style={styles.weekOverline}>This week</Text>
              <Text style={styles.weekHelper}>
                {weeklyPoints === 1 ? "point" : "points"} earned
              </Text>
            </View>
            <Text style={styles.weekValue}>{weeklyPoints}</Text>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>Today's tasks</Text>
              {totalCount > 0 ? (
                <Text style={styles.sectionMeta}>
                  {doneCount} / {totalCount}
                </Text>
              ) : null}
            </View>

            {loading ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>Loading your week…</Text>
              </View>
            ) : todayTasks.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>No tasks yet</Text>
                <Text style={styles.emptyHelper}>
                  Join or create a circle to start your week.
                </Text>
              </View>
            ) : (
              <View style={styles.taskList}>
                {visibleTasks.map((t) => (
                  <View key={t.key} style={styles.taskRow}>
                    <View style={styles.taskTextCol}>
                      <Text
                        style={[
                          styles.taskTitle,
                          t.done && styles.taskTitleDone,
                        ]}
                        numberOfLines={1}
                      >
                        {t.title}
                      </Text>
                      <Text style={styles.taskCircle} numberOfLines={1}>
                        {t.circleName}
                      </Text>
                    </View>
                    {t.done ? (
                      <Ionicons
                        name="checkmark-circle"
                        size={22}
                        color={Colors.brand.greenBright}
                      />
                    ) : (
                      <View style={styles.taskPending} />
                    )}
                  </View>
                ))}
                {todayTasks.length > 5 ? (
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

        <TabBar active="home" />
      </Animated.View>
    </SafeAreaView>
  );
}

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
  greeting: {
    ...Typography.title,
    fontSize: 30,
    letterSpacing: -0.4,
  },

  todayCard: {
    backgroundColor: Colors.bg.card,
    borderRadius: Radius.card,
    padding: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
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
    fontSize: 30,
    letterSpacing: -0.6,
    lineHeight: 34,
  },
  ringDenom: {
    ...Typography.label,
    fontSize: 16,
    color: Colors.text.secondary,
  },
  todayBody: {
    flex: 1,
    gap: 6,
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
  todayHelper: {
    ...Typography.label,
  },

  weekCard: {
    backgroundColor: Colors.bg.card,
    borderRadius: Radius.card,
    paddingHorizontal: 20,
    paddingVertical: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  },
  weekLeft: {
    gap: 4,
  },
  weekOverline: {
    ...Typography.overline,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    color: Colors.text.primary,
  },
  weekHelper: {
    ...Typography.label,
  },
  weekValue: {
    ...Typography.display,
    fontSize: 44,
    letterSpacing: -1.2,
    lineHeight: 48,
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
    ...Typography.caption,
  },

  taskList: {
    gap: 4,
  },
  taskRow: {
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  taskTextCol: {
    flex: 1,
    gap: 3,
  },
  taskTitle: {
    ...Typography.body,
  },
  taskTitleDone: {
    color: Colors.text.secondary,
  },
  taskCircle: {
    ...Typography.caption,
  },
  taskPending: {
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

  emptyState: {
    paddingVertical: 28,
    alignItems: "center",
    gap: 6,
  },
  emptyTitle: {
    ...Typography.body,
    fontWeight: "600",
  },
  emptyText: {
    ...Typography.label,
  },
  emptyHelper: {
    ...Typography.label,
    textAlign: "center",
  },
});
