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
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../src/lib/supabase";
import { Colors, Radius, Spacing, Typography } from "../src/constants/design";
import { assignCircleCategoriesFromQuestionnaire } from "../src/lib/circle-flow";

type CategoryMini = {
  id: string;
  name: string;
  icon: string;
};

type SelectionRow = {
  user_id: string;
  category_id: string;
  is_common: boolean | null;
  categories: CategoryMini | CategoryMini[] | null;
};

type CircleConfigRow = {
  daily_task_count?: number | null;
  stage?: string | null;
};

type MemberRow = {
  user_id: string;
  first_name: string | null;
  role: string | null;
};

type CircleStageRow = {
  stage?: string | null;
};

type MemberGroup = {
  userId: string;
  name: string;
  isAdmin: boolean;
  isMe: boolean;
  categories: (CategoryMini & { isCommon: boolean })[];
};

const POLL_MS = 2000;
const STAGE_POLL_MS = 1500;

export default function TasksConfirmationScreen() {
  const params = useLocalSearchParams<{ circleId?: string; level?: string }>();
  const circleIdParam = Array.isArray(params.circleId)
    ? params.circleId[0]
    : params.circleId;

  const [circleId, setCircleId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [groups, setGroups] = useState<MemberGroup[]>([]);
  const [sharedCategoryIds, setSharedCategoryIds] = useState<Set<string>>(
    new Set(),
  );
  const [adminName, setAdminName] = useState<string>("");
  const [starting, setStarting] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [assigned, setAssigned] = useState(false);
  const [dailyTaskCount, setDailyTaskCount] = useState<number>(6);

  const initialLoadedRef = useRef(false);
  const groupsSigRef = useRef<string>("");
  const navigatedRef = useRef(false);

  const mountAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(mountAnim, {
      toValue: 1,
      duration: 520,
      easing: Easing.out(Easing.exp),
      useNativeDriver: true,
    }).start();
  }, [mountAnim]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim]);

  useEffect(() => {
    const init = async () => {
      if (circleIdParam && circleIdParam.length > 0) {
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

    const fetchGroups = async () => {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id ?? null;

      const { data: selRows, error: selErr } = await supabase
        .from("circle_member_category_selections")
        .select(
          "user_id, category_id, is_common, categories ( id, name, icon )",
        )
        .eq("circle_id", circleId);

      if (!alive) return;

      if (selErr) {
        setError(selErr.message);
        if (!initialLoadedRef.current) {
          initialLoadedRef.current = true;
          setLoading(false);
        }
        return;
      }

      const { data: memRows, error: memErr } = await supabase
        .from("circle_members")
        .select("user_id, first_name, role")
        .eq("circle_id", circleId)
        .order("joined_at", { ascending: true });

      if (!alive) return;

      if (memErr) {
        setError(memErr.message);
        if (!initialLoadedRef.current) {
          initialLoadedRef.current = true;
          setLoading(false);
        }
        return;
      }

      const members = (memRows ?? []) as unknown as MemberRow[];
      const selections = (selRows ?? []) as unknown as SelectionRow[];

      const { data: circleCfg } = await supabase
        .from("circles")
        .select("daily_task_count")
        .eq("id", circleId)
        .maybeSingle();

      if (!alive) return;

      const cfg = (circleCfg ?? null) as CircleConfigRow | null;
      if (cfg?.daily_task_count && typeof cfg.daily_task_count === "number") {
        setDailyTaskCount(cfg.daily_task_count);
      }

      const memberById: Record<string, MemberRow> = {};
      for (const m of members) memberById[m.user_id] = m;

      let nextAdminName = "";
      let nextIsAdmin = false;
      for (const m of members) {
        if (m.role === "admin") {
          nextAdminName = (m.first_name ?? "").trim() || "the admin";
          if (m.user_id === uid) nextIsAdmin = true;
        }
      }

      const userToCategories: Record<
        string,
        (CategoryMini & { isCommon: boolean })[]
      > = {};
      const categoryUsers: Record<string, Set<string>> = {};
      let anyAssigned = false;

      for (const s of selections) {
        const cat = Array.isArray(s.categories)
          ? s.categories[0]
          : s.categories;
        if (!cat) continue;
        const userKey = String(s.user_id);
        const isCommon = s.is_common === true;
        if (isCommon) anyAssigned = true;
        const catEntry = {
          id: String(cat.id),
          name: String(cat.name ?? "").trim() || "Category",
          icon: "",
          isCommon,
        };

        if (!userToCategories[userKey]) userToCategories[userKey] = [];
        userToCategories[userKey].push(catEntry);

        if (!categoryUsers[catEntry.id]) categoryUsers[catEntry.id] = new Set();
        categoryUsers[catEntry.id].add(userKey);
      }

      const sharedSet = new Set<string>();
      for (const [catId, users] of Object.entries(categoryUsers)) {
        if (users.size > 1) sharedSet.add(catId);
      }

      setAssigned(anyAssigned);

      const nextGroups: MemberGroup[] = members.map((m) => {
        const fn = (m.first_name ?? "").trim();
        const cats = userToCategories[m.user_id] ?? [];
        return {
          userId: m.user_id,
          name: fn.length > 0 ? fn : `User ${m.user_id.slice(0, 6)}`,
          isAdmin: m.role === "admin",
          isMe: m.user_id === uid,
          categories: cats,
        };
      });

      const sig = nextGroups
        .map(
          (g) =>
            `${g.userId}|${g.name}|${g.isAdmin ? "1" : "0"}|${g.categories.map((c) => c.id).join(",")}`,
        )
        .join("\n");

      if (sig !== groupsSigRef.current) {
        groupsSigRef.current = sig;
        setGroups(nextGroups);
        setSharedCategoryIds(sharedSet);
      }

      setIsAdmin(nextIsAdmin);
      setAdminName(nextAdminName);
      setError(null);

      if (!initialLoadedRef.current) {
        initialLoadedRef.current = true;
        setLoading(false);
      }
    };

    fetchGroups();
    const interval = setInterval(fetchGroups, POLL_MS);

    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, [circleId]);

  useEffect(() => {
    if (!circleId) return;
    let alive = true;

    const checkStage = async () => {
      const { data, error: stageErr } = await supabase
        .from("circles")
        .select("stage")
        .eq("id", circleId)
        .maybeSingle();

      if (!alive) return;

      const typed = (data ?? null) as CircleStageRow | null;

      if (!stageErr && typed?.stage === "active" && !navigatedRef.current) {
        navigatedRef.current = true;
        router.replace({ pathname: "/circle-home", params: { circleId } });
      }
    };

    checkStage();
    const interval = setInterval(checkStage, STAGE_POLL_MS);

    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, [circleId]);

  const handleAssign = async () => {
    if (!circleId || assigning) return;

    setAssigning(true);

    try {
      const nextDailyTaskCount =
        await assignCircleCategoriesFromQuestionnaire(circleId);
      setDailyTaskCount(nextDailyTaskCount);
      setAssigned(true);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not assign categories.";
      console.error("[tasks-confirmation] assign categories:", message);
      setAssigning(false);
      Alert.alert("Could not assign categories", message);
      return;
    }

    // Chain straight into starting the week so the admin doesn't get
    // stranded on this screen — once stage stays "selecting", reopening
    // the circle bounces back here.
    const { error: rpcErr } = await supabase.rpc("start_circle_week", {
      p_circle_id: circleId,
    });

    if (rpcErr) {
      console.error("[tasks-confirmation] start_circle_week:", rpcErr.message);
      setAssigning(false);
      Alert.alert("Could not start the week", rpcErr.message);
      return;
    }

    navigatedRef.current = true;
    setAssigning(false);
    router.replace({ pathname: "/circle-home", params: { circleId } });
  };

  const handleStart = async () => {
    if (!circleId || starting) return;

    setStarting(true);

    const { error: rpcErr } = await supabase.rpc("start_circle_week", {
      p_circle_id: circleId,
    });

    if (rpcErr) {
      console.error("[tasks-confirmation] start_circle_week:", rpcErr.message);
      setStarting(false);
      Alert.alert("Could not start the week", rpcErr.message);
      return;
    }

    navigatedRef.current = true;
    router.replace({ pathname: "/circle-home", params: { circleId } });
  };

  const list = useMemo(() => groups, [groups]);
  const startDisabled = list.length === 0 || starting;

  const translate = mountAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [12, 0],
  });

  const pulseOpacity = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.55, 1],
  });

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
      <Animated.View
        style={[
          styles.header,
          { opacity: mountAnim, transform: [{ translateY: translate }] },
        ]}
      >
        <Text style={styles.overline}>WEEKLY LINEUP</Text>
        <Text style={styles.title}>Your circle's picks.</Text>
        <Text style={styles.helper}>
          {list.length === 0
            ? "Waiting for selections to come in."
            : assigned
              ? `Your circle will do ${dailyTaskCount} tasks per day.`
              : "Categories in. Assign to lock the circle's daily set."}
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
            <Text style={styles.statusText}>Loading lineup…</Text>
          </View>
        ) : error ? (
          <View style={styles.statusBlock}>
            <Text style={styles.statusTitle}>Couldn't load picks</Text>
            <Text style={styles.statusText}>{error}</Text>
          </View>
        ) : list.length === 0 ? (
          <View style={styles.statusBlock}>
            <Text style={styles.statusTitle}>No picks yet</Text>
            <Text style={styles.statusText}>
              Members are still choosing categories.
            </Text>
          </View>
        ) : (
          list.map((g) => (
            <View key={g.userId} style={styles.memberCard}>
              <View style={styles.memberHead}>
                <Text style={styles.memberName} numberOfLines={1}>
                  {g.isMe ? `${g.name} (you)` : g.name}
                </Text>
                {g.isAdmin ? (
                  <View style={styles.adminTag}>
                    <Ionicons
                      name="shield-checkmark"
                      size={12}
                      color={Colors.accent.gold}
                    />
                    <Text style={styles.adminTagText}>Admin</Text>
                  </View>
                ) : null}
              </View>
              {g.categories.length === 0 ? (
                <Text style={styles.memberPending}>Still picking…</Text>
              ) : (
                <View style={styles.pillRow}>
                  {g.categories.map((c) => {
                    const isShared = sharedCategoryIds.has(c.id);
                    const showAssignment = assigned;
                    return (
                      <View
                        key={`${g.userId}-${c.id}`}
                        style={[
                          styles.catPill,
                          showAssignment && c.isCommon && styles.catPillCommon,
                          !showAssignment && isShared && styles.catPillShared,
                        ]}
                      >
                        <Text style={styles.catName} numberOfLines={1}>
                          {c.name}
                        </Text>
                        {showAssignment ? (
                          <View
                            style={[
                              styles.assignBadge,
                              c.isCommon && styles.assignBadgeCommon,
                            ]}
                          >
                            <Text
                              style={[
                                styles.assignBadgeText,
                                c.isCommon && styles.assignBadgeTextCommon,
                              ]}
                            >
                              {c.isCommon ? "Circle" : "Yours"}
                            </Text>
                          </View>
                        ) : isShared ? (
                          <View style={styles.sharedBadge}>
                            <Text style={styles.sharedBadgeText}>Shared</Text>
                          </View>
                        ) : null}
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          ))
        )}

        {!loading && !error && list.length > 0 && !isAdmin ? (
          <Animated.View
            style={[styles.waitingBlock, { opacity: pulseOpacity }]}
          >
            <Ionicons
              name="time-outline"
              size={16}
              color={Colors.text.secondary}
            />
            <Text style={styles.waitingText}>
              Waiting for {adminName || "the admin"} to start…
            </Text>
          </Animated.View>
        ) : null}
      </ScrollView>

      {isAdmin ? (
        <View style={styles.footer}>
          {!assigned ? (
            <Pressable
              onPress={handleAssign}
              disabled={startDisabled || assigning}
              style={({ pressed }) => [
                styles.secondary,
                (startDisabled || assigning) && styles.primaryDisabled,
                pressed &&
                  !(startDisabled || assigning) &&
                  styles.primaryPressed,
              ]}
            >
              {assigning ? (
                <ActivityIndicator color={Colors.text.primary} size="small" />
              ) : (
                <Text style={styles.secondaryText}>Assign categories</Text>
              )}
            </Pressable>
          ) : (
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
                <ActivityIndicator
                  color={Colors.brand.greenText}
                  size="small"
                />
              ) : (
                <Text style={styles.primaryText}>Start the week</Text>
              )}
            </Pressable>
          )}
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const PRIMARY_HEIGHT = 54;

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
    gap: 12,
  },
  memberCard: {
    paddingHorizontal: Spacing.cardPadding,
    paddingVertical: 14,
    borderRadius: Radius.card,
    backgroundColor: Colors.bg.card,
    gap: 10,
  },
  memberHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  memberName: {
    ...Typography.body,
    fontWeight: "600",
    flex: 1,
  },
  memberPending: {
    ...Typography.label,
  },
  adminTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.pill,
    backgroundColor: Colors.bg.cardActive,
  },
  adminTagText: {
    ...Typography.caption,
    color: Colors.accent.gold,
    fontWeight: "600",
  },
  pillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  catPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.pill,
    backgroundColor: Colors.bg.cardActive,
    maxWidth: "100%",
  },
  catPillShared: {
    borderWidth: 1,
    borderColor: Colors.brand.greenBright,
  },
  catPillCommon: {
    borderWidth: 1,
    borderColor: Colors.brand.green,
  },
  assignBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.pill,
    backgroundColor: Colors.bg.base,
  },
  assignBadgeCommon: {
    backgroundColor: Colors.brand.green,
  },
  assignBadgeText: {
    ...Typography.caption,
    color: Colors.text.secondary,
    fontWeight: "600",
  },
  assignBadgeTextCommon: {
    color: Colors.brand.greenText,
  },
  catIcon: {
    fontSize: 16,
    lineHeight: 18,
  },
  catName: {
    ...Typography.caption,
    color: Colors.text.primary,
    fontWeight: "600",
  },
  sharedBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.pill,
    backgroundColor: Colors.bg.base,
  },
  sharedBadgeText: {
    ...Typography.caption,
    color: Colors.brand.greenBright,
    fontWeight: "600",
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
  secondary: {
    height: PRIMARY_HEIGHT,
    borderRadius: Radius.pill,
    backgroundColor: Colors.bg.card,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryText: {
    ...Typography.body,
    color: Colors.text.primary,
    fontWeight: "600",
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
