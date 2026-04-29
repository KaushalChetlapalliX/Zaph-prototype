import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Alert,
  ScrollView,
  Animated,
  Easing,
  ActivityIndicator,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../src/lib/supabase";
import { buildAssignedCategoryLookup } from "../src/lib/categories";
import { TabBar } from "../src/components/TabBar";
import {
  LeaderboardWidget,
  LeaderRow,
} from "../src/components/LeaderboardWidget";
import { Colors, Radius, Spacing, Typography } from "../src/constants/design";
import { taskCountForAssignedCategory } from "../src/lib/circle-flow";
import { loadPreferredSubtaskTitlesByCategoryId } from "../src/lib/task-personalization";

const POLL_MS = 3000;
const POINTS_PER_TASK = 5;
const DEFAULT_DAILY_TASK_COUNT = 6;

type TaskItem = {
  key: string;
  subtaskId: string;
  categoryId: string;
  categoryName: string;
  categoryIcon: string;
  title: string;
  done: boolean;
};
type ActivityRow = {
  id: string;
  userId: string;
  name: string;
  subtaskTitle: string;
  categoryName: string;
  at: number;
};

function todayDateString() {
  return new Date().toISOString().slice(0, 10);
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
function relativeTime(ms: number) {
  const diff = Math.max(0, Date.now() - ms);
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderRow[]>([]);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [myWeekPoints, setMyWeekPoints] = useState<number>(0);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [weeklyByUserDay, setWeeklyByUserDay] = useState<
    Record<string, number[]>
  >({});
  const [completing, setCompleting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showAllTasks, setShowAllTasks] = useState(false);
  const [expandedSlide, setExpandedSlide] = useState<number | null>(null);
  const [activityOpen, setActivityOpen] = useState(false);
  const [anchorMsState, setAnchorMsState] = useState<number | null>(null);

  const inFlightRef = useRef(false);
  const initialLoadedRef = useRef(false);
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

    const fetchAll = async () => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      try {
        const { data: userData } = await supabase.auth.getUser();
        const uid = userData.user?.id ?? null;
        if (alive) setMyUserId(uid);
        if (!uid) {
          if (!alive) return;
          setTasks([]);
          setLeaderboard([]);
          setMyWeekPoints(0);
          setActivity([]);
          setLoadError(null);
          setLoading(false);
          return;
        }

        const { data: circleRow, error: circleErr } = await supabase
          .from("circles")
          .select("started_at, daily_task_count")
          .eq("id", circleId)
          .maybeSingle();

        if (!alive) return;
        if (circleErr) throw new Error(circleErr.message);

        type CircleRow = {
          started_at?: string | null;
          daily_task_count?: number | null;
        };
        const startedAt = (circleRow as CircleRow | null)?.started_at ?? null;
        const dailyTaskCount =
          typeof (circleRow as CircleRow | null)?.daily_task_count === "number"
            ? ((circleRow as CircleRow).daily_task_count as number)
            : DEFAULT_DAILY_TASK_COUNT;
        const anchorDate = startedAt ? new Date(startedAt) : startOfWeekUTC();
        anchorDate.setUTCHours(0, 0, 0, 0);
        const anchorMs = anchorDate.getTime();

        // Categories this user picked for this circle.
        const { data: selRows, error: selErr } = await supabase
          .from("circle_member_category_selections")
          .select("category_id, is_common")
          .eq("circle_id", circleId)
          .eq("user_id", uid);

        if (!alive) return;
        if (selErr) throw new Error(selErr.message);

        type CategoryMini = {
          icon: string;
          id: string;
          name: string;
          sourceIds: string[];
        };
        type SelRow = {
          category_id: string;
          is_common?: boolean | null;
        };
        const selList = (selRows ?? []) as unknown as SelRow[];
        const myCategoryIds = Array.from(
          new Set(selList.map((r) => String(r.category_id)).filter(Boolean)),
        );
        const categoryById: Record<string, CategoryMini> = {};

        if (myCategoryIds.length > 0) {
          const { data: catRows, error: catErr } = await supabase
            .from("categories")
            .select("id, name, icon, description")
            .in("id", myCategoryIds);

          if (!alive) return;
          if (catErr) throw new Error(catErr.message);

          type CategoryRow = {
            description?: string | null;
            icon?: string | null;
            id: string;
            name: string;
          };
          const assignedCategories = (catRows ?? []) as CategoryRow[];
          const categoryNames = Array.from(
            new Set(
              assignedCategories
                .map((category) => String(category.name ?? "").trim())
                .filter((name) => name.length > 0),
            ),
          );

          const { data: dupCatRows, error: dupCatErr } = await supabase
            .from("categories")
            .select("id, name, icon, description")
            .in("name", categoryNames);

          if (!alive) return;
          if (dupCatErr) throw new Error(dupCatErr.message);

          const resolved = buildAssignedCategoryLookup(
            assignedCategories,
            (dupCatRows ?? assignedCategories) as CategoryRow[],
          );
          for (const [assignedId, category] of Object.entries(resolved)) {
            categoryById[assignedId] = {
              icon: category.icon,
              id: category.id,
              name: category.name,
              sourceIds: category.sourceIds,
            };
          }
        }

        const preferredTitlesByCat = await loadPreferredSubtaskTitlesByCategoryId(
          uid,
          myCategoryIds
            .map((categoryId) => ({
              id: categoryId,
              name: categoryById[categoryId]?.name ?? "",
            }))
            .filter((category) => category.name.length > 0),
        );

        // All subtasks for the user's selected categories, sliced to circle's daily_task_count.
        const subtaskById: Record<
          string,
          { id: string; categoryId: string; title: string; sortOrder: number }
        > = {};
        const assignedCategoryIdBySubtaskId: Record<string, string> = {};
        const orderedSubtaskIdSet = new Set<string>();
        const orderedSubtaskIds: string[] = [];
        const subtaskCategoryIds = Array.from(
          new Set(
            Object.values(categoryById).flatMap((category) => category.sourceIds),
          ),
        );
        if (subtaskCategoryIds.length > 0) {
          const { data: stRows, error: stErr } = await supabase
            .from("category_subtasks")
            .select("id, category_id, title, sort_order")
            .in("category_id", subtaskCategoryIds)
            .order("category_id", { ascending: true })
            .order("sort_order", { ascending: true });

          if (!alive) return;
          if (stErr) throw new Error(stErr.message);

          type ST = {
            id: string;
            category_id: string;
            title: string;
            sort_order: number;
          };

          const byCat: Record<
            string,
            { id: string; title: string; sortOrder: number }[]
          > = {};
          for (const s of (stRows ?? []) as unknown as ST[]) {
            const sid = String(s.id);
            const title = String(s.title ?? "").trim();
            if (!title) continue;
            const catId = String(s.category_id);
            subtaskById[sid] = {
              id: sid,
              categoryId: catId,
              title,
              sortOrder: Number(s.sort_order) || 0,
            };
            if (!byCat[catId]) byCat[catId] = [];
            byCat[catId].push({
              id: sid,
              title,
              sortOrder: Number(s.sort_order) || 0,
            });
          }

          for (const selection of selList) {
            const catId = String(selection.category_id);
            const sourceIds = categoryById[catId]?.sourceIds ?? [catId];
            const list: { id: string; title: string; sortOrder: number }[] = [];
            const seenTitles = new Set<string>();
            for (const sourceId of sourceIds) {
              for (const item of byCat[sourceId] ?? []) {
                const titleKey = item.title.toLowerCase();
                if (seenTitles.has(titleKey)) continue;
                seenTitles.add(titleKey);
                list.push(item);
              }
            }
            const preferred = preferredTitlesByCat[catId];
            const perCategory = taskCountForAssignedCategory(
              dailyTaskCount,
              selection.is_common === true,
            );
            const sorted = preferred
              ? [...list].sort((a, b) => {
                  const ap = preferred.has(a.title.toLowerCase()) ? 0 : 1;
                  const bp = preferred.has(b.title.toLowerCase()) ? 0 : 1;
                  if (ap !== bp) return ap - bp;
                  return a.sortOrder - b.sortOrder;
                })
              : list;
            for (const item of sorted.slice(0, perCategory)) {
              if (orderedSubtaskIdSet.has(item.id)) continue;
              orderedSubtaskIdSet.add(item.id);
              assignedCategoryIdBySubtaskId[item.id] = catId;
              orderedSubtaskIds.push(item.id);
            }
          }
        }

        // Today's completions for this user (used to mark Today's list rows).
        const today = todayDateString();
        const { data: myDoneRows } = await supabase
          .from("task_completions")
          .select("subtask_id")
          .eq("circle_id", circleId)
          .eq("user_id", uid)
          .eq("completed_on", today);

        const completedSet = new Set<string>();
        if (myDoneRows) {
          type C = { subtask_id: string };
          for (const c of myDoneRows as unknown as C[]) {
            if (c.subtask_id) completedSet.add(String(c.subtask_id));
          }
        }

        const next: TaskItem[] = orderedSubtaskIds
          .map((sid) => {
            const st = subtaskById[sid];
            if (!st) return null;
            const assignedCategoryId =
              assignedCategoryIdBySubtaskId[sid] ?? st.categoryId;
            const cat = categoryById[assignedCategoryId];
            if (!cat) return null;
            const item: TaskItem = {
              key: sid,
              subtaskId: sid,
              categoryId: st.categoryId,
              categoryName: cat.name,
              categoryIcon: cat.icon,
              title: st.title,
              done: completedSet.has(sid),
            };
            return item;
          })
          .filter((x): x is TaskItem => x !== null);

        if (!alive) return;
        setTasks(next);
        setLoadError(null);

        // Weekly leaderboard window starts at the day-1 anchor.
        const wStart = anchorDate;
        const wEnd = new Date(anchorMs + 7 * 86400000);
        const { data: weekRows } = await supabase
          .from("task_completions")
          .select("user_id, points, completed_at")
          .eq("circle_id", circleId)
          .gte("completed_at", wStart.toISOString())
          .lt("completed_at", wEnd.toISOString());

        type CompletionPts = {
          user_id: string;
          points?: number | null;
          completed_at: string;
        };
        const pointsByUser: Record<string, number> = {};
        const byUserDay: Record<string, number[]> = {};
        if (weekRows) {
          for (const r of weekRows as unknown as CompletionPts[]) {
            const id = String(r.user_id);
            const pts = Number(r.points) || POINTS_PER_TASK;
            pointsByUser[id] = (pointsByUser[id] ?? 0) + pts;

            const dayIdx = Math.min(
              6,
              Math.max(
                0,
                Math.floor(
                  (new Date(r.completed_at).getTime() - anchorMs) / 86400000,
                ),
              ),
            );
            const arr = byUserDay[id] ?? new Array(7).fill(0);
            arr[dayIdx] = (arr[dayIdx] ?? 0) + pts;
            byUserDay[id] = arr;
          }
        }
        for (const id of Object.keys(byUserDay)) {
          const arr = byUserDay[id];
          for (let i = 1; i < arr.length; i++) arr[i] += arr[i - 1];
        }

        const userIds = Object.keys(pointsByUser);

        // Today's circle-wide activity feed.
        const { data: feedRows } = await supabase
          .from("task_completions")
          .select("id, user_id, category_id, subtask_id, completed_at")
          .eq("circle_id", circleId)
          .eq("completed_on", today)
          .order("completed_at", { ascending: false })
          .limit(20);

        type FeedRow = {
          id: string | number;
          user_id: string;
          category_id: string;
          subtask_id: string;
          completed_at: string;
        };
        const feedList = (feedRows ?? []) as unknown as FeedRow[];
        const feedUserIds = feedList.map((r) => String(r.user_id));
        const feedCategoryIds = feedList.map((r) => String(r.category_id));
        const feedSubtaskIds = feedList.map((r) => String(r.subtask_id));

        const allUserIds = Array.from(new Set([...userIds, ...feedUserIds]));

        const nameById: Record<string, string> = {};
        if (allUserIds.length > 0) {
          const { data: profs } = await supabase
            .from("profiles")
            .select("id, first_name")
            .in("id", allUserIds);
          if (profs) {
            type Prof = { id: string; first_name?: string | null };
            for (const p of profs as unknown as Prof[]) {
              const nm = String(p.first_name ?? "").trim();
              if (nm) nameById[String(p.id)] = nm;
            }
          }
        }

        // Resolve any feed subtask/category not already in our maps.
        const missingSubtasks = Array.from(
          new Set(feedSubtaskIds.filter((id) => id && !subtaskById[id])),
        );
        if (missingSubtasks.length > 0) {
          const { data: extraSt } = await supabase
            .from("category_subtasks")
            .select("id, category_id, title, sort_order")
            .in("id", missingSubtasks);
          if (extraSt) {
            type ST = {
              id: string;
              category_id: string;
              title: string;
              sort_order: number;
            };
            for (const s of extraSt as unknown as ST[]) {
              const sid = String(s.id);
              subtaskById[sid] = {
                id: sid,
                categoryId: String(s.category_id),
                title: String(s.title ?? "").trim(),
                sortOrder: Number(s.sort_order) || 0,
              };
            }
          }
        }
        const missingCategories = Array.from(
          new Set(feedCategoryIds.filter((id) => id && !categoryById[id])),
        );
        if (missingCategories.length > 0) {
          const { data: extraCat } = await supabase
            .from("categories")
            .select("id, name, icon")
            .in("id", missingCategories);
          if (extraCat) {
            type Cat = { id: string; name: string; icon: string };
            for (const c of extraCat as unknown as Cat[]) {
              categoryById[String(c.id)] = {
                id: String(c.id),
                name: String(c.name ?? ""),
                icon: String(c.icon ?? ""),
                sourceIds: [String(c.id)],
              };
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

        const activityList: ActivityRow[] = feedList.map((r) => {
          const st = subtaskById[String(r.subtask_id)];
          const cat = categoryById[String(r.category_id)];
          return {
            id: String(r.id),
            userId: String(r.user_id),
            name:
              String(r.user_id) === uid
                ? "You"
                : (nameById[String(r.user_id)] ?? "Someone"),
            subtaskTitle: st?.title ?? "a task",
            categoryName: cat?.name ?? "",
            at: new Date(r.completed_at).getTime(),
          };
        });

        if (!alive) return;
        setLeaderboard(list);
        setMyWeekPoints(pointsByUser[uid] ?? 0);
        setActivity(activityList);
        setWeeklyByUserDay(byUserDay);
        setAnchorMsState(anchorMs);
        setLoadError(null);

        if (!initialLoadedRef.current) {
          initialLoadedRef.current = true;
          setLoading(false);
        }
      } catch (error) {
        if (!alive) return;
        const message =
          error instanceof Error ? error.message : "Could not load this circle.";
        setTasks([]);
        setLeaderboard([]);
        setMyWeekPoints(0);
        setActivity([]);
        setWeeklyByUserDay({});
        setLoadError(message);
        if (!initialLoadedRef.current) {
          initialLoadedRef.current = true;
        }
        setLoading(false);
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

  const totalCount = tasks.length;
  const maxWeeklyPoints = totalCount * 7 * POINTS_PER_TASK;
  const daysElapsed = anchorMsState
    ? Math.min(
        7,
        Math.max(1, Math.floor((Date.now() - anchorMsState) / 86400000) + 1),
      )
    : 1;

  const visibleTasks = showAllTasks ? tasks : tasks.slice(0, 5);
  const hiddenCount = tasks.length - visibleTasks.length;

  const toggleSelect = (key: string, done: boolean) => {
    if (done) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const completeSelected = async () => {
    if (!circleId || completing || selected.size === 0) return;
    setCompleting(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) {
        Alert.alert("Not logged in", "Please log in again.");
        return;
      }

      const keys = Array.from(selected);
      const today = todayDateString();
      const nowIso = new Date().toISOString();
      const rowsBySubtask = new Map<string, TaskItem>();
      for (const t of tasks) rowsBySubtask.set(t.key, t);
      const rows = keys
        .map((subtaskId) => {
          const t = rowsBySubtask.get(subtaskId);
          if (!t) return null;
          return {
            circle_id: circleId,
            user_id: uid,
            category_id: t.categoryId,
            subtask_id: subtaskId,
            completed_at: nowIso,
            completed_on: today,
            points: POINTS_PER_TASK,
          };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null);

      const { error } = await supabase.from("task_completions").insert(rows);
      const insertErr = error as { code?: string; message?: string } | null;
      if (insertErr && insertErr.code !== "23505") {
        Alert.alert("Error", insertErr.message ?? "Could not save.");
        return;
      }

      setTasks((prev) =>
        prev.map((t) => (selected.has(t.key) ? { ...t, done: true } : t)),
      );
      const earned = keys.length * POINTS_PER_TASK;
      setMyWeekPoints((p) => p + earned);
      setLeaderboard((prev) => {
        const idx = prev.findIndex((r) => r.userId === uid);
        const next =
          idx >= 0
            ? prev.map((r, i) =>
                i === idx ? { ...r, points: r.points + earned } : r,
              )
            : [...prev, { userId: uid, name: "You", points: earned }];
        return next.sort(
          (a, b) => b.points - a.points || a.name.localeCompare(b.name),
        );
      });
      setSelected(new Set());
    } finally {
      setCompleting(false);
    }
  };

  const opacity = mountAnim;
  const translateY = mountAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [18, 0],
  });

  const selectedCount = selected.size;

  return (
    <SafeAreaView style={styles.safeArea}>
      <Animated.View
        style={[styles.root, { opacity, transform: [{ translateY }] }]}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            selectedCount > 0 ? styles.scrollContentWithBar : null,
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <Text style={styles.overline}>Circle</Text>
            <Text style={styles.circleName}>{circleName}</Text>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>Weekly leaderboard</Text>
              <Text style={styles.sectionMeta}>{myWeekPoints} pts</Text>
            </View>
            <LeaderboardWidget
              leaderboard={leaderboard}
              maxWeeklyPoints={maxWeeklyPoints}
              myPoints={myWeekPoints}
              myUserId={myUserId}
              weeklyByUserDay={weeklyByUserDay}
              loading={loading}
              empty={!loading && leaderboard.length === 0}
              weeklyCeiling={maxWeeklyPoints}
              daysElapsed={daysElapsed}
              onExpand={(s) => setExpandedSlide(s)}
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Today's activity</Text>
            {loading ? (
              <View style={styles.emptyBlock}>
                <Text style={styles.emptyText}>Loading…</Text>
              </View>
            ) : activity.length === 0 ? (
              <View style={styles.emptyBlock}>
                <Text style={styles.emptyTitle}>Quiet so far</Text>
                <Text style={styles.emptyHelper}>
                  Completions in this circle will show up here.
                </Text>
              </View>
            ) : (
              <Pressable
                onPress={() => setActivityOpen(true)}
                style={styles.chatCard}
              >
                {activity.slice(0, 4).map((a) => (
                  <View key={a.id} style={styles.chatBubble}>
                    <Text style={styles.chatLine} numberOfLines={2}>
                      <Text style={styles.chatName}>{a.name}</Text>
                      {" completed "}
                      <Text style={styles.chatTask}>{a.subtaskTitle}</Text>
                      {a.categoryName ? (
                        <>
                          {" in "}
                          <Text style={styles.chatTask}>{a.categoryName}</Text>
                        </>
                      ) : null}
                    </Text>
                    <Text style={styles.chatTime}>{relativeTime(a.at)}</Text>
                  </View>
                ))}
                {activity.length > 4 && (
                  <Text style={styles.chatMore}>
                    +{activity.length - 4} more — tap to view
                  </Text>
                )}
              </Pressable>
            )}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Today's list</Text>
            {loading ? (
              <View style={styles.emptyBlock}>
                <Text style={styles.emptyText}>Loading…</Text>
              </View>
            ) : loadError ? (
              <View style={styles.emptyBlock}>
                <Text style={styles.emptyTitle}>Couldn't load tasks</Text>
                <Text style={styles.emptyHelper}>{loadError}</Text>
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
                {visibleTasks.map((t) => {
                  const isSelected = selected.has(t.key);
                  return (
                    <Pressable
                      key={t.key}
                      onPress={() => toggleSelect(t.key, t.done)}
                      disabled={t.done}
                      style={({ pressed }) => [
                        styles.taskRow,
                        pressed && !t.done && styles.taskRowPressed,
                      ]}
                    >
                      <Text
                        style={[
                          styles.taskTitle,
                          t.done && styles.taskTitleDone,
                        ]}
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
                      ) : isSelected ? (
                        <View style={styles.taskCheckSelected}>
                          <Ionicons
                            name="checkmark"
                            size={14}
                            color={Colors.bg.base}
                          />
                        </View>
                      ) : (
                        <View style={styles.taskCheck} />
                      )}
                    </Pressable>
                  );
                })}
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

        {selectedCount > 0 ? (
          <View style={styles.actionBar}>
            <Pressable
              onPress={completeSelected}
              disabled={completing}
              style={({ pressed }) => [
                styles.actionCta,
                pressed && !completing && styles.actionCtaPressed,
                completing && styles.actionCtaDisabled,
              ]}
            >
              {completing ? (
                <ActivityIndicator
                  color={Colors.brand.greenText}
                  size="small"
                />
              ) : (
                <>
                  <Text style={styles.actionCtaText}>
                    Mark {selectedCount}{" "}
                    {selectedCount === 1 ? "task" : "tasks"} done
                  </Text>
                  <Ionicons
                    name="arrow-forward"
                    size={18}
                    color={Colors.brand.greenText}
                  />
                </>
              )}
            </Pressable>
          </View>
        ) : null}

        <TabBar active="circles" />
      </Animated.View>

      <Modal
        visible={expandedSlide !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setExpandedSlide(null)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setExpandedSlide(null)}
        >
          <Pressable
            style={styles.modalCard}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={styles.modalTitle}>
              {expandedSlide === 0
                ? "Full leaderboard"
                : expandedSlide === 1
                  ? "Points by member"
                  : expandedSlide === 2
                    ? "Daily progress"
                    : "Your week"}
            </Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {expandedSlide === 0 &&
                leaderboard.map((row, idx) => (
                  <View key={row.userId} style={styles.activityRow}>
                    <Text style={styles.activityText}>
                      <Text style={styles.activityName}>
                        {idx + 1}. {row.name}
                      </Text>
                      {"  "}
                      <Text style={styles.activityTask}>{row.points} pts</Text>
                    </Text>
                  </View>
                ))}
              {expandedSlide !== 0 && (
                <LeaderboardWidget
                  leaderboard={leaderboard}
                  maxWeeklyPoints={maxWeeklyPoints}
                  myPoints={myWeekPoints}
                  myUserId={myUserId}
                  weeklyByUserDay={weeklyByUserDay}
                  weeklyCeiling={maxWeeklyPoints}
                  daysElapsed={daysElapsed}
                  loading={false}
                  empty={false}
                />
              )}
            </ScrollView>
            <Pressable
              style={styles.modalClose}
              onPress={() => setExpandedSlide(null)}
            >
              <Text style={styles.modalCloseText}>Close</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={activityOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setActivityOpen(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setActivityOpen(false)}
        >
          <Pressable
            style={styles.modalCard}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={styles.modalTitle}>Today's activity</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {activity.map((a) => (
                <View key={a.id} style={styles.chatBubble}>
                  <Text style={styles.chatLine}>
                    <Text style={styles.chatName}>{a.name}</Text>
                    {" completed "}
                    <Text style={styles.chatTask}>{a.subtaskTitle}</Text>
                    {a.categoryName ? (
                      <>
                        {" in "}
                        <Text style={styles.chatTask}>{a.categoryName}</Text>
                      </>
                    ) : null}
                  </Text>
                  <Text style={styles.chatTime}>{relativeTime(a.at)}</Text>
                </View>
              ))}
            </ScrollView>
            <Pressable
              style={styles.modalClose}
              onPress={() => setActivityOpen(false)}
            >
              <Text style={styles.modalCloseText}>Close</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
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
  scrollContentWithBar: {
    paddingBottom: 120,
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

  section: { gap: 14 },
  sectionHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  sectionTitle: { ...Typography.section },
  sectionMeta: {
    ...Typography.overline,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    color: Colors.text.primary,
  },

  activityCard: {
    backgroundColor: Colors.bg.card,
    borderRadius: Radius.card,
    paddingHorizontal: 18,
    paddingVertical: 6,
  },
  activityRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingVertical: 12,
  },
  activityRowDivider: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  activityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.brand.greenBright,
    marginTop: 7,
  },
  activityBody: { flex: 1, gap: 2 },
  activityText: { ...Typography.body, fontSize: 15, lineHeight: 20 },
  activityName: { fontWeight: "600" },
  activityTask: { color: Colors.text.secondary },
  activityTime: { ...Typography.caption },
  chatCard: {
    backgroundColor: Colors.bg.card,
    borderRadius: Radius.card,
    padding: Spacing.cardPadding,
    gap: 8,
  },
  chatBubble: {
    backgroundColor: Colors.bg.cardActive,
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignSelf: "flex-start",
    maxWidth: "92%",
  },
  chatLine: { ...Typography.body, fontSize: 14, lineHeight: 19 },
  chatName: { fontWeight: "700" },
  chatTask: { color: Colors.text.secondary },
  chatTime: { ...Typography.caption, marginTop: 2 },
  chatMore: { ...Typography.caption, textAlign: "center", marginTop: 4 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.85)",
    justifyContent: "center",
    paddingHorizontal: Spacing.screenHorizontal,
  },
  modalCard: {
    backgroundColor: Colors.bg.card,
    borderRadius: Radius.card,
    padding: Spacing.cardPadding,
    maxHeight: "85%",
  },
  modalTitle: {
    ...Typography.section,
    color: Colors.text.primary,
    marginBottom: 12,
  },
  modalClose: {
    alignSelf: "flex-end",
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginTop: 12,
  },
  modalCloseText: {
    ...Typography.body,
    color: Colors.text.primary,
    fontWeight: "600",
  },

  taskList: { gap: 2 },
  taskRow: {
    paddingVertical: 14,
    paddingHorizontal: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: Radius.cardSm,
  },
  taskRowPressed: {
    backgroundColor: Colors.bg.cardActive,
  },
  taskTitle: {
    ...Typography.body,
    flex: 1,
  },
  taskTitleDone: {
    color: Colors.text.secondary,
  },
  taskCheck: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  taskCheckSelected: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.brand.greenBright,
    alignItems: "center",
    justifyContent: "center",
  },
  showMore: {
    marginTop: 4,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  showMorePressed: { opacity: 0.6 },
  showMoreText: { ...Typography.label, fontWeight: "600" },

  actionBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 88,
    paddingHorizontal: Spacing.screenHorizontal,
  },
  actionCta: {
    height: 54,
    borderRadius: Radius.pill,
    backgroundColor: Colors.brand.green,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 20,
  },
  actionCtaPressed: { opacity: 0.85 },
  actionCtaDisabled: { opacity: 0.6 },
  actionCtaText: {
    ...Typography.body,
    color: Colors.brand.greenText,
    fontWeight: "600",
  },

  emptyBlock: {
    paddingVertical: 24,
    alignItems: "center",
    gap: 6,
  },
  emptyTitle: { ...Typography.body, fontWeight: "600" },
  emptyHelper: { ...Typography.label, textAlign: "center" },
  emptyText: { ...Typography.label },
});
