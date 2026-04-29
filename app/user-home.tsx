import { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  Animated,
  Easing,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Svg, { Circle as SvgCircle } from "react-native-svg";
import { supabase } from "../src/lib/supabase";
import { buildAssignedCategoryLookup } from "../src/lib/categories";
import { ensureProfileFromAuthUser } from "../src/lib/profile";
import { TabBar } from "../src/components/TabBar";
import { Colors, Radius, Spacing, Typography } from "../src/constants/design";
import { taskCountForAssignedCategory } from "../src/lib/circle-flow";
import { loadPreferredSubtaskTitlesByCategoryId } from "../src/lib/task-personalization";

const DEFAULT_DAILY_TASK_COUNT = 6;

type TodayTaskItem = {
  key: string;
  circleId: string;
  circleName: string;
  categoryId: string;
  categoryName: string;
  categoryIcon: string;
  subtaskId: string;
  title: string;
  done: boolean;
};

function todayDateString() {
  return new Date().toISOString().slice(0, 10);
}

const FIRST_NAME_KEY = "profileFirstName";
const POINTS_PER_TASK = 5;

const RING_SIZE = 112;
const RING_STROKE = 9;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const AnimatedCircle = Animated.createAnimatedComponent(SvgCircle);

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
  const [loadError, setLoadError] = useState<string | null>(null);

  const [todayTasks, setTodayTasks] = useState<TodayTaskItem[]>([]);
  const [weeklyPoints, setWeeklyPoints] = useState<number>(0);
  const [circleCount, setCircleCount] = useState<number>(0);
  const [myCircles, setMyCircles] = useState<{ id: string; name: string }[]>(
    [],
  );
  const [showAllTasks, setShowAllTasks] = useState<boolean>(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [completing, setCompleting] = useState(false);

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
    if (completing || selected.size === 0) return;
    setCompleting(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) {
        Alert.alert("Not logged in", "Please log in again.");
        return;
      }

      const keys = Array.from(selected);
      const targets = todayTasks.filter((t) => keys.includes(t.key));
      const nowIso = new Date().toISOString();
      const today = todayDateString();
      const rows = targets.map((t) => ({
        circle_id: t.circleId,
        user_id: uid,
        category_id: t.categoryId,
        subtask_id: t.subtaskId,
        completed_at: nowIso,
        completed_on: today,
        points: POINTS_PER_TASK,
      }));

      const { error } = await supabase.from("task_completions").insert(rows);
      const insertErr = error as { code?: string; message?: string } | null;
      if (insertErr && insertErr.code !== "23505") {
        Alert.alert("Error", insertErr.message ?? "Could not save.");
        return;
      }

      setTodayTasks((prev) =>
        prev.map((t) => (selected.has(t.key) ? { ...t, done: true } : t)),
      );
      setWeeklyPoints((p) => p + targets.length * POINTS_PER_TASK);
      setSelected(new Set());
    } finally {
      setCompleting(false);
    }
  };

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
      const { profile } = await ensureProfileFromAuthUser(user);

      const profileRow = (profile ?? {}) as { first_name?: string | null };
      let next = "";
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
          setMyCircles([]);
          setLoading(false);
          return;
        }

        // circle_members join returns one row per membership; circles comes back
        // as an object or array depending on schema version — normalize below.
        const { data: memberRows, error: mErr } = await supabase
          .from("circle_members")
          .select("circle_id, circles ( id, name, code, stage )")
          .eq("user_id", uid);

        if (!alive) return;

        if (mErr || !memberRows || memberRows.length === 0) {
          setTodayTasks([]);
          setWeeklyPoints(0);
          setCircleCount(0);
          setMyCircles([]);
          setLoading(false);
          return;
        }

        type CircleMini = {
          id: string;
          name: string | null;
          code: string | number | null;
          stage?: string | null;
        };
        type MemberRow = {
          circle_id: string;
          circles: CircleMini | CircleMini[] | null;
        };

        const rows = memberRows as unknown as MemberRow[];

        const circles: CircleMini[] = rows
          .map((r) => (Array.isArray(r.circles) ? r.circles[0] : r.circles))
          .filter((c): c is CircleMini => c != null)
          .filter((c) => String(c.stage ?? "lobby") === "active")
          .map((c) => ({
            id: String(c.id),
            name: c.name ?? null,
            code: c.code ?? null,
            stage: c.stage ?? null,
          }));

        const circleIds = circles.map((c) => c.id);
        if (circleIds.length === 0) {
          if (!alive) return;
          setTodayTasks([]);
          setWeeklyPoints(0);
          setCircleCount(0);
          setMyCircles([]);
          setLoadError(null);
          setLoading(false);
          return;
        }

        const circleNameById: Record<string, string> = {};
        for (const c of circles) {
          const nm = String(c.name ?? "").trim();
          const cd = String(c.code ?? "").trim();
          circleNameById[c.id] = nm || (cd ? `Circle ${cd}` : "Circle");
        }

        // Daily task count per circle (defaults to 6 when missing).
        const dailyTaskCountByCircle: Record<string, number> = {};
        if (circleIds.length > 0) {
          const { data: cfgRows } = await supabase
            .from("circles")
            .select("id, daily_task_count")
            .in("id", circleIds);
          if (cfgRows) {
            type CfgRow = { id: string; daily_task_count?: number | null };
            for (const c of cfgRows as unknown as CfgRow[]) {
              dailyTaskCountByCircle[String(c.id)] =
                typeof c.daily_task_count === "number"
                  ? c.daily_task_count
                  : DEFAULT_DAILY_TASK_COUNT;
            }
          }
        }

        const { data: selRows, error: selErr } = await supabase
          .from("circle_member_category_selections")
          .select("circle_id, category_id, is_common")
          .eq("user_id", uid)
          .in("circle_id", circleIds);

        if (!alive) return;
        if (selErr) throw new Error(selErr.message);

        type SelRow = {
          circle_id: string;
          category_id: string;
          is_common?: boolean | null;
        };
        const selList = (selRows ?? []) as unknown as SelRow[];

        const categoryIds = Array.from(
          new Set(selList.map((s) => String(s.category_id))),
        );

        const categoryById: Record<
          string,
          { icon: string; name: string; sourceIds: string[] }
        > = {};
        if (categoryIds.length > 0) {
          const { data: catRows, error: catErr } = await supabase
            .from("categories")
            .select("id, name, icon, description")
            .in("id", categoryIds);
          if (catErr) throw new Error(catErr.message);
          if (catRows) {
            type CatRow = {
              description?: string | null;
              icon?: string | null;
              id: string;
              name: string;
            };
            const assignedCategories = catRows as unknown as CatRow[];
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

            if (dupCatErr) throw new Error(dupCatErr.message);

            const resolved = buildAssignedCategoryLookup(
              assignedCategories,
              (dupCatRows ?? assignedCategories) as CatRow[],
            );
            for (const [assignedId, category] of Object.entries(resolved)) {
              categoryById[assignedId] = {
                icon: category.icon,
                name: category.name,
                sourceIds: category.sourceIds,
              };
            }
          }
        }

        const preferredTitlesByCat =
          await loadPreferredSubtaskTitlesByCategoryId(
            uid,
            categoryIds
              .map((categoryId) => ({
                id: categoryId,
                name: categoryById[categoryId]?.name ?? "",
              }))
              .filter((category) => category.name.length > 0),
          );

        type SubtaskRow = {
          id: string;
          category_id: string;
          title: string;
          sort_order: number;
        };
        let subtasks: SubtaskRow[] = [];
        const subtaskCategoryIds = Array.from(
          new Set(
            Object.values(categoryById).flatMap(
              (category) => category.sourceIds,
            ),
          ),
        );
        if (subtaskCategoryIds.length > 0) {
          const { data: stRows, error: stErr } = await supabase
            .from("category_subtasks")
            .select("id, category_id, title, sort_order")
            .in("category_id", subtaskCategoryIds)
            .order("sort_order", { ascending: true });
          if (stErr) throw new Error(stErr.message);
          if (stRows) subtasks = stRows as unknown as SubtaskRow[];
        }

        const today = todayDateString();
        const doneSet = new Set<string>();

        if (selList.length > 0) {
          const { data: doneRows } = await supabase
            .from("task_completions")
            .select("circle_id, subtask_id")
            .eq("user_id", uid)
            .in("circle_id", circleIds)
            .eq("completed_on", today);

          if (doneRows) {
            type CompletionRow = { circle_id: string; subtask_id: string };
            for (const r of doneRows as unknown as CompletionRow[]) {
              doneSet.add(`${r.circle_id}:${r.subtask_id}`);
            }
          }
        }

        const subtasksByCategory: Record<string, SubtaskRow[]> = {};
        for (const st of subtasks) {
          const k = String(st.category_id);
          if (!subtasksByCategory[k]) subtasksByCategory[k] = [];
          subtasksByCategory[k].push(st);
        }

        const nextTasks: TodayTaskItem[] = [];
        const nextTaskKeys = new Set<string>();
        for (const sel of selList) {
          const circleId = String(sel.circle_id);
          const categoryId = String(sel.category_id);
          const cat = categoryById[categoryId];
          if (!cat) continue;
          const sts: SubtaskRow[] = [];
          const seenTitles = new Set<string>();
          for (const sourceId of cat.sourceIds) {
            for (const st of subtasksByCategory[sourceId] ?? []) {
              const titleKey = String(st.title ?? "")
                .trim()
                .toLowerCase();
              if (!titleKey || seenTitles.has(titleKey)) continue;
              seenTitles.add(titleKey);
              sts.push(st);
            }
          }

          const dailyCount =
            dailyTaskCountByCircle[circleId] ?? DEFAULT_DAILY_TASK_COUNT;
          const perCategory = taskCountForAssignedCategory(
            dailyCount,
            sel.is_common === true,
          );

          const preferred = preferredTitlesByCat[categoryId];
          const sorted = preferred
            ? [...sts].sort((a, b) => {
                const at = String(a.title ?? "")
                  .trim()
                  .toLowerCase();
                const bt = String(b.title ?? "")
                  .trim()
                  .toLowerCase();
                const ap = preferred.has(at) ? 0 : 1;
                const bp = preferred.has(bt) ? 0 : 1;
                if (ap !== bp) return ap - bp;
                return (
                  (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0)
                );
              })
            : sts;

          for (const st of sorted.slice(0, perCategory)) {
            const subtaskId = String(st.id);
            const title = String(st.title ?? "").trim();
            if (!title) continue;
            const key = `${circleId}:${subtaskId}`;
            if (nextTaskKeys.has(key)) continue;
            nextTaskKeys.add(key);
            nextTasks.push({
              key,
              circleId,
              circleName: circleNameById[circleId] ?? "Circle",
              categoryId: String(st.category_id),
              categoryName: cat.name,
              categoryIcon: cat.icon,
              subtaskId,
              title,
              done: doneSet.has(key),
            });
          }
        }

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
        setMyCircles(
          circles.map((c) => ({
            id: c.id,
            name: circleNameById[c.id] ?? "Circle",
          })),
        );
        setLoadError(null);
        setLoading(false);
      } catch (error) {
        if (!alive) return;
        const message =
          error instanceof Error ? error.message : "Could not load your tasks.";
        setTodayTasks([]);
        setWeeklyPoints(0);
        setCircleCount(0);
        setMyCircles([]);
        setLoadError(message);
        setLoading(false);
      } finally {
        inFlightRef.current = false;
      }
    };

    fetchDashboard();
    const interval = setInterval(fetchDashboard, 3000);

    return () => {
      alive = false;
      clearInterval(interval);
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

          {myCircles.length > 0 ? (
            <View style={styles.section}>
              <View style={styles.sectionHead}>
                <Text style={styles.sectionTitle}>Your circles</Text>
                <Text style={styles.sectionMeta}>{myCircles.length}</Text>
              </View>
              <View style={styles.circleList}>
                {myCircles.map((c) => (
                  <Pressable
                    key={c.id}
                    onPress={async () => {
                      await AsyncStorage.setItem("activeCircleId", c.id);
                      await AsyncStorage.setItem("activeCircleName", c.name);
                      router.push("/circle-home");
                    }}
                    style={({ pressed }) => [
                      styles.circleRow,
                      pressed && styles.circleRowPressed,
                    ]}
                  >
                    <View style={styles.circleBadge}>
                      <Text style={styles.circleBadgeText}>
                        {c.name.trim().charAt(0).toUpperCase() || "?"}
                      </Text>
                    </View>
                    <View style={styles.circleRowText}>
                      <Text style={styles.circleRowName} numberOfLines={1}>
                        {c.name}
                      </Text>
                      <Text style={styles.circleRowSub} numberOfLines={1}>
                        Tap to open
                      </Text>
                    </View>
                    <Ionicons
                      name="chevron-forward"
                      size={18}
                      color={Colors.text.secondary}
                    />
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

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
            ) : loadError ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>Couldn't load tasks</Text>
                <Text style={styles.emptyHelper}>{loadError}</Text>
              </View>
            ) : todayTasks.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>No tasks yet</Text>
                <Text style={styles.emptyHelper}>
                  Start a circle week to see tasks here.
                </Text>
              </View>
            ) : (
              <View style={styles.taskList}>
                {visibleTasks.map((t, i) => {
                  const prev = i > 0 ? visibleTasks[i - 1] : null;
                  const showHeader =
                    !prev ||
                    prev.circleId !== t.circleId ||
                    prev.categoryId !== t.categoryId;
                  const isSelected = selected.has(t.key);
                  return (
                    <View key={t.key}>
                      {showHeader ? (
                        <View style={styles.categoryHeader}>
                          <Text style={styles.categoryIcon}>
                            {t.categoryIcon}
                          </Text>
                          <View style={styles.categoryHeaderText}>
                            <Text style={styles.categoryName} numberOfLines={1}>
                              {t.categoryName}
                            </Text>
                            <Text
                              style={styles.categoryCircle}
                              numberOfLines={1}
                            >
                              {t.circleName}
                            </Text>
                          </View>
                        </View>
                      ) : null}
                      <Pressable
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
                          <View style={styles.taskPending} />
                        )}
                      </Pressable>
                    </View>
                  );
                })}
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

        {selected.size > 0 ? (
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
                    Mark {selected.size}{" "}
                    {selected.size === 1 ? "task" : "tasks"} done
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
    paddingHorizontal: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: Radius.cardSm,
  },
  taskRowPressed: {
    backgroundColor: Colors.bg.cardActive,
  },
  taskCheckSelected: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.brand.greenBright,
    alignItems: "center",
    justifyContent: "center",
  },
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
  taskTitle: {
    ...Typography.body,
    flex: 1,
  },
  taskTitleDone: {
    color: Colors.text.secondary,
  },
  categoryHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.inlineGap,
    paddingTop: 14,
    paddingBottom: 4,
  },
  categoryIcon: {
    fontSize: 20,
    lineHeight: 22,
  },
  categoryHeaderText: {
    flex: 1,
    gap: 2,
  },
  categoryName: {
    ...Typography.section,
    fontSize: 15,
  },
  categoryCircle: {
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
  circleList: {
    gap: Spacing.rowGap,
  },
  circleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.inlineGap + 4,
    backgroundColor: Colors.bg.card,
    borderRadius: Radius.card,
    padding: Spacing.cardPadding,
  },
  circleRowPressed: {
    backgroundColor: Colors.bg.cardActive,
  },
  circleBadge: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.brand.green,
  },
  circleBadgeText: {
    fontSize: 20,
    fontWeight: "700",
    color: Colors.bg.base,
  },
  circleRowText: {
    flex: 1,
    gap: 2,
  },
  circleRowName: {
    ...Typography.body,
    fontWeight: "600",
  },
  circleRowSub: {
    ...Typography.label,
  },
});
