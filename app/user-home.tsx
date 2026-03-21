import { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  SafeAreaView,
  StyleSheet,
  FlatList,
  ScrollView,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../src/lib/supabase";
import Svg, { Circle } from "react-native-svg";

const PRIMARY = "#8359E3";
const BG = "#F8EEFF";
const BORDER = "#000000";

type CircleMini = { id: string; name: string | null; code: string | number | null };

type CircleTaskRow = { circle_id: string; position: number; task_id: string };
type TaskRow = { id: string; title: string };

type TodayTaskItem = {
  key: string; // circleId:taskId
  circleId: string;
  circleName: string;
  title: string;
  done: boolean;
};

const FIRST_NAME_KEY = "profileFirstName";

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

export default function UserHome() {
  const [firstName, setFirstName] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const [todayTasks, setTodayTasks] = useState<TodayTaskItem[]>([]);
  const [progressPct, setProgressPct] = useState<number>(0);

  const [streakDays, setStreakDays] = useState<number>(0);
  const [weeklyPoints, setWeeklyPoints] = useState<number>(0);

  const inFlightRef = useRef(false);

  useEffect(() => {
    let alive = true;

    const loadFirstName = async () => {
      try {
        const cached = await AsyncStorage.getItem(FIRST_NAME_KEY);
        if (alive && cached && cached.trim()) setFirstName(cached.trim());
      } catch {}

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

      const p = (profile as any)?.first_name;
      if (typeof p === "string" && p.trim()) next = p.trim();

      if (!next) {
        const meta = (user.user_metadata as any) || {};
        const m = meta.first_name || meta.firstName || meta.name;
        if (typeof m === "string" && m.trim()) next = m.trim();
      }

      if (!next || !alive) return;

      setFirstName((prev) => (prev === next ? prev : next));
      try {
        await AsyncStorage.setItem(FIRST_NAME_KEY, next);
      } catch {}
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
          setProgressPct(0);
          setStreakDays(0);
          setWeeklyPoints(0);
          setLoading(false);
          return;
        }

        const { data: memberRows, error: mErr } = await supabase
          .from("circle_members")
          .select("circle_id, circles ( id, name, code )")
          .eq("user_id", uid);

        if (!alive) return;

        if (mErr || !memberRows || memberRows.length === 0) {
          setTodayTasks([]);
          setProgressPct(0);
          setStreakDays(0);
          setWeeklyPoints(0);
          setLoading(false);
          return;
        }

        const circles: CircleMini[] = (memberRows as any[])
          .map((r) => (Array.isArray(r.circles) ? r.circles[0] : r.circles))
          .filter(Boolean)
          .map((c: any) => ({ id: String(c.id), name: c.name ?? null, code: c.code ?? null }));

        const circleIds = circles.map((c) => c.id);
        const circleNameById: Record<string, string> = {};
        for (const c of circles) {
          const nm = String(c.name ?? "").trim();
          const cd = String(c.code ?? "").trim();
          circleNameById[c.id] = nm || (cd ? `Circle ${cd}` : "Circle");
        }

        const { data: ctRows, error: ctErr } = await supabase
          .from("circle_tasks")
          .select("circle_id, position, task_id")
          .in("circle_id", circleIds)
          .order("circle_id", { ascending: true })
          .order("position", { ascending: true });

        if (!alive) return;

        if (ctErr || !ctRows || ctRows.length === 0) {
          setTodayTasks([]);
          setProgressPct(0);
          setStreakDays(0);
          setWeeklyPoints(0);
          setLoading(false);
          return;
        }

        const rows = ctRows as any as CircleTaskRow[];
        const taskIds = Array.from(new Set(rows.map((r) => r.task_id)));

        const { data: tRows, error: tErr } = await supabase
          .from("tasks")
          .select("id, title")
          .in("id", taskIds);

        if (!alive) return;

        if (tErr || !tRows) {
          setTodayTasks([]);
          setProgressPct(0);
          setStreakDays(0);
          setWeeklyPoints(0);
          setLoading(false);
          return;
        }

        const titleById: Record<string, string> = {};
        for (const t of tRows as any as TaskRow[]) titleById[t.id] = String(t.title ?? "").trim();

        const dayStart = startOfDayLocal();
        const dayEnd = endOfDayLocal();

        const doneSet = new Set<string>();
        const { data: doneRows, error: doneErr } = await supabase
          .from("task_completions")
          .select("circle_id, task_id, completed_at")
          .eq("user_id", uid)
          .gte("completed_at", dayStart.toISOString())
          .lte("completed_at", dayEnd.toISOString());

        if (!doneErr && doneRows) {
          for (const r of doneRows as any[]) {
            const key = `${String(r.circle_id)}:${String(r.task_id)}`;
            doneSet.add(key);
          }
        }

        const nextTasks: TodayTaskItem[] = rows
          .map((r) => {
            const title = titleById[r.task_id];
            if (!title) return null;
            const circleId = String(r.circle_id);
            const key = `${circleId}:${String(r.task_id)}`;
            return {
              key,
              circleId,
              circleName: circleNameById[circleId] ?? "Circle",
              title,
              done: doneSet.has(key),
            };
          })
          .filter(Boolean) as TodayTaskItem[];

        const total = nextTasks.length;
        const done = nextTasks.filter((x) => x.done).length;
        const pct = total === 0 ? 0 : Math.round((done / total) * 100);

        const nextStreak = 0;
        const nextPoints = 0;

        if (!alive) return;

        setTodayTasks((prev) => {
          const a = JSON.stringify(prev);
          const b = JSON.stringify(nextTasks);
          return a === b ? prev : nextTasks;
        });
        setProgressPct((prev) => (prev === pct ? prev : pct));
        setStreakDays((prev) => (prev === nextStreak ? prev : nextStreak));
        setWeeklyPoints((prev) => (prev === nextPoints ? prev : nextPoints));

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

  const headingName = firstName.trim() ? firstName.trim() : "there";

  const radius = 36;
  const stroke = 10;
  const circumference = 2 * Math.PI * radius;
  const progressOffset = circumference - (progressPct / 100) * circumference;

  const renderTask = ({ item }: { item: TodayTaskItem }) => (
    <View style={styles.taskRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.taskText} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={styles.taskSub} numberOfLines={1}>
          {item.circleName}
        </Text>
      </View>
      {item.done ? <Ionicons name="checkmark-circle" size={22} color={PRIMARY} /> : null}
    </View>
  );

  // show max 3 tasks on home
  const taskList = useMemo(() => todayTasks.slice(0, 3), [todayTasks]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.root}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.heading}>Hello, {headingName}</Text>

          <View style={styles.topCardsRow}>
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
              <Text style={styles.cardTitle}>AVATAR</Text>
              <View style={styles.avatarPlaceholder} />
            </View>
          </View>

          <View style={styles.wideCard}>
            <Text style={styles.wideCardTitle}>Today's tasks</Text>

            {loading ? (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyText}>Loading...</Text>
              </View>
            ) : taskList.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyText}>so empty....</Text>
              </View>
            ) : (
              <FlatList
                data={taskList}
                renderItem={renderTask}
                keyExtractor={(t) => t.key}
                scrollEnabled={false}
                contentContainerStyle={{ gap: 10, marginTop: 14 }}
              />
            )}
          </View>

          <View style={styles.bottomCardsRow}>
            <View style={styles.smallCard}>
              <Ionicons name="flash" size={24} color="#FFD700" />
              <Text style={styles.streakText}>{streakDays} streak</Text>
            </View>

            <View style={styles.smallCard}>
              <Text style={styles.cardTitle}>Total Points this week</Text>
              <View style={styles.pointsContainer}>
                <Ionicons name="star" size={20} color="#FFD700" />
                <Text style={styles.pointsText}>{weeklyPoints}</Text>
              </View>
            </View>
          </View>
        </ScrollView>

        <View style={styles.tabBar}>
          <Pressable style={styles.tabItem}>
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
    paddingTop: 20,
    paddingBottom: 120, // space for tab bar
  },

  heading: { fontSize: 32, fontWeight: "900", color: "#000000", marginBottom: 24 },

  topCardsRow: { flexDirection: "row", gap: 12, marginBottom: 20 },
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
  cardTitle: { fontSize: 14, fontWeight: "600", color: "#000000", marginBottom: 16, textAlign: "center" },

  progressContainer: { width: 100, height: 100, alignItems: "center", justifyContent: "center" },
  progressText: { position: "absolute", fontSize: 20, fontWeight: "800" },

  avatarPlaceholder: { width: 100, height: 100, backgroundColor: "#F5F5F5", borderRadius: 50, marginTop: 8 },

  wideCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 25,
    padding: 20,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    minHeight: 200,
  },
  wideCardTitle: { fontSize: 18, fontWeight: "700", color: "#000000", textAlign: "center" },

  emptyBox: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 18 },
  emptyText: { fontSize: 16, color: "#CCCCCC", opacity: 0.7 },

  taskRow: {
    backgroundColor: "rgba(0,0,0,0.05)",
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  taskText: { fontSize: 16, fontWeight: "800", color: "#000000" },
  taskSub: { fontSize: 12, fontWeight: "600", color: "rgba(0,0,0,0.45)", marginTop: 2 },

  bottomCardsRow: { flexDirection: "row", gap: 12, marginBottom: 10 },
  smallCard: {
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
    justifyContent: "center",
    minHeight: 100,
  },
  streakText: { fontSize: 16, fontWeight: "600", color: "#000000", marginTop: 8 },

  pointsContainer: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 },
  pointsText: { fontSize: 24, fontWeight: "700", color: "#000000" },

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
});
