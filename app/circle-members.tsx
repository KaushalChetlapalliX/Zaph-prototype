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
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../src/lib/supabase";
import { Colors, Radius, Spacing, Typography } from "../src/constants/design";
import {
  setCircleStage,
  syncCircleSelectionsForCurrentUser,
} from "../src/lib/circle-flow";

type MemberRow = {
  user_id: string;
  first_name: string | null;
  role: string | null;
  joined_at?: string | null;
};

type CirclePayload = {
  code?: string | number | null;
  stage?: string | null;
};

const MEMBERS_POLL_MS = 2000;
const CIRCLE_POLL_MS = 1500;

const initialOf = (name: string) =>
  (name.trim().charAt(0) || "?").toUpperCase();

export default function CircleMembersScreen() {
  const params = useLocalSearchParams<{ circleId?: string }>();
  const circleIdParam = Array.isArray(params.circleId)
    ? params.circleId[0]
    : params.circleId;

  const [circleId, setCircleId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<MemberRow[]>([]);

  const [circleCode, setCircleCode] = useState<string>("");
  const [stage, setStage] = useState<string>("lobby");

  const [isAdmin, setIsAdmin] = useState(false);
  const [starting, setStarting] = useState(false);

  const navigatedRef = useRef(false);
  const membersSigRef = useRef<string>("");
  const circleSigRef = useRef<string>("");
  const initialMembersLoadedRef = useRef(false);
  const openingRef = useRef(false);

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

  const maybeNavigateFromStage = (nextStage: string) => {
    if (navigatedRef.current || !circleId) return;

    if (nextStage === "active") {
      navigatedRef.current = true;
      router.replace({ pathname: "/circle-home", params: { circleId } });
      return;
    }

    if (
      nextStage === "selecting" ||
      nextStage === "loading" ||
      nextStage === "confirm"
    ) {
      navigatedRef.current = true;
      router.replace({ pathname: "/tasks-confirmation", params: { circleId } });
    }
  };

  useEffect(() => {
    if (!circleId) return;

    let alive = true;

    const applyCircleIfChanged = (nextCode: string, nextStage: string) => {
      const sig = `${nextCode}|${nextStage}`;
      if (sig === circleSigRef.current) return;

      circleSigRef.current = sig;
      setCircleCode(nextCode);
      setStage(nextStage);
    };

    const loadCircle = async () => {
      const { data, error } = await supabase
        .from("circles")
        .select("code, stage")
        .eq("id", circleId)
        .single();

      if (!alive) return;
      if (error || !data) return;

      const typed = data as unknown as CirclePayload;
      const nextCode = String(typed.code ?? "");
      const nextStage = String(typed.stage ?? "lobby");

      applyCircleIfChanged(nextCode, nextStage);
      maybeNavigateFromStage(nextStage);
    };

    loadCircle();

    const channel = supabase
      .channel(`circle-stage-${circleId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "circles",
          filter: `id=eq.${circleId}`,
        },
        (payload) => {
          const newRow = (payload.new ?? {}) as CirclePayload;
          const nextStage = String(newRow.stage ?? "lobby");
          const nextCode = String(newRow.code ?? "");

          applyCircleIfChanged(nextCode || circleCode, nextStage);
          maybeNavigateFromStage(nextStage);
        },
      )
      .subscribe();

    const pollId = setInterval(loadCircle, CIRCLE_POLL_MS);

    return () => {
      alive = false;
      clearInterval(pollId);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [circleId, circleCode]);

  useEffect(() => {
    if (!circleId) return;

    let alive = true;

    const resolveAdmin = async () => {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) return;

      const { data: row } = await supabase
        .from("circle_members")
        .select("role")
        .eq("circle_id", circleId)
        .eq("user_id", uid)
        .maybeSingle();

      if (!alive) return;

      const typed = (row ?? null) as { role?: string | null } | null;
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

    const makeMembersSig = (rows: MemberRow[]) =>
      rows
        .map(
          (m) => `${m.user_id}|${(m.first_name ?? "").trim()}|${m.role ?? ""}`,
        )
        .join(",");

    const fetchMembers = async (isInitial = false) => {
      if (
        isInitial &&
        !initialMembersLoadedRef.current &&
        members.length === 0
      ) {
        setLoading(true);
      }

      const { data, error } = await supabase
        .from("circle_members")
        .select("user_id, first_name, role, joined_at")
        .eq("circle_id", circleId)
        .order("joined_at", { ascending: true });

      if (!alive) return;

      if (error || !data) {
        if (isInitial && !initialMembersLoadedRef.current) {
          initialMembersLoadedRef.current = true;
          setLoading(false);
        }
        return;
      }

      const next = data as unknown as MemberRow[];
      const sig = makeMembersSig(next);

      if (sig !== membersSigRef.current) {
        membersSigRef.current = sig;
        setMembers(next);
      }

      if (isInitial && !initialMembersLoadedRef.current) {
        initialMembersLoadedRef.current = true;
        setLoading(false);
      }
    };

    fetchMembers(true);
    const interval = setInterval(() => fetchMembers(false), MEMBERS_POLL_MS);

    return () => {
      alive = false;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [circleId]);

  const handleSelectTasks = async () => {
    if (!circleId) return;
    if (!isAdmin) return;
    if (starting || openingRef.current) return;

    openingRef.current = true;
    setStarting(true);

    // Ensure the admin's picks are written to the DB before flipping stage.
    // Once stage leaves "lobby", syncCircleSelectionsForCurrentUser becomes a no-op.
    try {
      await syncCircleSelectionsForCurrentUser(circleId);
    } catch (error) {
      openingRef.current = false;
      setStarting(false);
      const message =
        error instanceof Error ? error.message : "Could not load your picks.";
      Alert.alert("Open lineup failed", message);
      return;
    }

    try {
      await setCircleStage(circleId, "selecting");
    } catch (error) {
      openingRef.current = false;
      setStarting(false);
      const message =
        error instanceof Error ? error.message : "Could not open the lineup.";
      Alert.alert("Open lineup failed", message);
      return;
    }

    navigatedRef.current = true;
    openingRef.current = false;
    setStarting(false);

    router.replace({
      pathname: "/tasks-confirmation",
      params: { circleId },
    });
  };

  const list = useMemo(() => members, [members]);

  const translate = mountAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [12, 0],
  });

  const disabled = starting || list.length === 0;

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
      <Animated.View
        style={[
          styles.header,
          { opacity: mountAnim, transform: [{ translateY: translate }] },
        ]}
      >
        <View style={styles.headerTopRow}>
          <Text style={styles.overline}>LOBBY</Text>
          <View style={styles.codePill}>
            <Text style={styles.codeLabel}>CODE</Text>
            <Text style={styles.codeValue}>{circleCode || "----"}</Text>
          </View>
        </View>
        <Text style={styles.title}>Circle members.</Text>
        <Text style={styles.helper}>
          {stage === "active"
            ? "Week is live. Opening your circle…"
            : stage === "selecting" ||
                stage === "loading" ||
                stage === "confirm"
              ? "Opening the weekly lineup…"
            : isAdmin
              ? "Open the weekly lineup whenever your circle is ready."
              : "Waiting for the admin to open the lineup."}
        </Text>
      </Animated.View>

      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      >
        {loading && list.length === 0 ? (
          <View style={styles.statusBlock}>
            <ActivityIndicator color={Colors.text.primary} size="small" />
            <Text style={styles.statusText}>Loading members…</Text>
          </View>
        ) : list.length === 0 ? (
          <View style={styles.statusBlock}>
            <Text style={styles.statusTitle}>No one here yet</Text>
            <Text style={styles.statusText}>
              Share code {circleCode || "—"} to get your friends in.
            </Text>
          </View>
        ) : (
          list.map((m) => {
            const name =
              (m.first_name ?? "").trim() || `User ${m.user_id.slice(0, 6)}`;
            const showAdmin = (m.role ?? "") === "admin";
            return (
              <View key={m.user_id} style={styles.row}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{initialOf(name)}</Text>
                </View>
                <Text style={styles.rowName} numberOfLines={1}>
                  {name}
                </Text>
                {showAdmin ? (
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
            );
          })
        )}
      </ScrollView>

      {isAdmin ? (
        <View style={styles.footer}>
          <Pressable
            onPress={handleSelectTasks}
            disabled={disabled}
            style={({ pressed }) => [
              styles.primary,
              disabled && styles.primaryDisabled,
              pressed && !disabled && styles.primaryPressed,
            ]}
          >
            {starting ? (
              <ActivityIndicator color={Colors.brand.greenText} size="small" />
            ) : (
              <Text style={styles.primaryText}>Review weekly lineup</Text>
            )}
          </Pressable>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const PRIMARY_HEIGHT = 54;
const AVATAR = 36;

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
  codePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    backgroundColor: Colors.bg.card,
  },
  codeLabel: {
    ...Typography.caption,
    letterSpacing: 1.2,
    fontWeight: "600",
  },
  codeValue: {
    ...Typography.caption,
    color: Colors.text.primary,
    fontWeight: "700",
    letterSpacing: 2,
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
    minHeight: 60,
    paddingHorizontal: Spacing.cardPadding,
    paddingVertical: 12,
    borderRadius: Radius.cardSm,
    backgroundColor: Colors.bg.card,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    backgroundColor: Colors.bg.cardActive,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    ...Typography.label,
    color: Colors.text.primary,
    fontWeight: "700",
  },
  rowName: {
    ...Typography.body,
    flex: 1,
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
  statusBlock: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 56,
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
