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
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../src/lib/supabase";
import { Colors, Radius, Spacing, Typography } from "../src/constants/design";
import { TabBar } from "../src/components/TabBar";
import { syncCircleSelectionsForCurrentUser } from "../src/lib/circle-flow";

type CircleRow = {
  id: string;
  name: string | null;
  code: string | number | null;
  stage: string | null;
};

type MemberJoinRow = {
  circle_id: string;
  circles: CircleRow | CircleRow[] | null;
};

const POLL_MS = 2000;

export default function CreateCircle() {
  const [loading, setLoading] = useState(true);
  const [circles, setCircles] = useState<CircleRow[]>([]);

  const initialLoadedRef = useRef(false);
  const circlesSigRef = useRef<string>("");

  const mountAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(mountAnim, {
      toValue: 1,
      duration: 520,
      easing: Easing.out(Easing.exp),
      useNativeDriver: true,
    }).start();
  }, [mountAnim]);

  const makeCirclesSig = (rows: CircleRow[]) =>
    rows
      .map(
        (c) =>
          `${c.id}|${(c.name ?? "").trim()}|${String(c.code ?? "")}|${
            c.stage ?? ""
          }`
      )
      .join(",");

  useEffect(() => {
    let alive = true;

    const fetchCircles = async (isInitial = false) => {
      if (isInitial && !initialLoadedRef.current && circles.length === 0) {
        setLoading(true);
      }

      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;

      if (!alive) return;

      if (!uid) {
        if (isInitial && !initialLoadedRef.current) {
          initialLoadedRef.current = true;
          setLoading(false);
          setCircles([]);
        }
        return;
      }

      const { data, error } = await supabase
        .from("circle_members")
        .select("circle_id, circles ( id, name, code, stage )")
        .eq("user_id", uid);

      if (!alive) return;

      if (error || !data) {
        if (isInitial && !initialLoadedRef.current) {
          initialLoadedRef.current = true;
          setLoading(false);
        }
        return;
      }

      const rows = data as unknown as MemberJoinRow[];

      const next: CircleRow[] = rows
        .map((r) => {
          const c = r.circles;
          if (!c) return null;
          if (Array.isArray(c)) return c[0] ?? null;
          return c;
        })
        .filter((c): c is CircleRow => c !== null);

      const seen = new Set<string>();
      const unique: CircleRow[] = [];
      for (const c of next) {
        if (!c?.id) continue;
        if (seen.has(c.id)) continue;
        seen.add(c.id);
        unique.push(c);
      }

      const sig = makeCirclesSig(unique);
      if (sig !== circlesSigRef.current) {
        circlesSigRef.current = sig;
        setCircles(unique);
      }

      if (isInitial && !initialLoadedRef.current) {
        initialLoadedRef.current = true;
        setLoading(false);
      } else if (isInitial) {
        setLoading(false);
      }
    };

    fetchCircles(true);
    const t = setInterval(() => fetchCircles(false), POLL_MS);

    return () => {
      alive = false;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openCircle = async (c: CircleRow) => {
    const circleId = c.id;
    const circleCode = String(c.code ?? "");
    const stage = String(c.stage ?? "lobby");

    try {
      await AsyncStorage.setItem("activeCircleId", circleId);
      await AsyncStorage.setItem("activeCircleCode", circleCode);
      await AsyncStorage.setItem("activeCircleName", String(c.name ?? ""));
    } catch {}

    try {
      await syncCircleSelectionsForCurrentUser(circleId);
    } catch (error) {
      if (stage === "lobby") {
        const message =
          error instanceof Error
            ? error.message
            : "Could not load your category picks.";
        Alert.alert("Open circle failed", message);
        return;
      }
    }

    if (stage === "active") {
      router.push({ pathname: "/circle-home", params: { circleId } });
      return;
    }

    if (
      stage === "selecting" ||
      stage === "loading" ||
      stage === "confirm" ||
      stage === "confirmation" ||
      stage === "finalized" ||
      stage === "ready"
    ) {
      router.push({ pathname: "/tasks-confirmation", params: { circleId } });
      return;
    }

    router.push({
      pathname: "/circle-members",
      params: {
        circleId,
        circleCode,
        circleName: String(c.name ?? ""),
      },
    });
  };

  const list = useMemo(() => circles, [circles]);

  const translate = mountAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [12, 0],
  });

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <Animated.View
        style={[
          styles.header,
          { opacity: mountAnim, transform: [{ translateY: translate }] },
        ]}
      >
        <Text style={styles.overline}>YOUR CIRCLES</Text>
        <Text style={styles.title}>Pick a room.</Text>
        <Text style={styles.helper}>
          Jump into an active circle or start a new one.
        </Text>
      </Animated.View>

      <View style={styles.ctaRow}>
        <Pressable
          onPress={() =>
            router.push({ pathname: "/circle-code", params: { mode: "join" } })
          }
          style={({ pressed }) => [
            styles.secondary,
            pressed && styles.secondaryPressed,
          ]}
        >
          <Ionicons
            name="log-in-outline"
            size={18}
            color={Colors.text.primary}
          />
          <Text style={styles.secondaryText}>Join</Text>
        </Pressable>

        <Pressable
          onPress={() =>
            router.push({ pathname: "/circle-code", params: { mode: "create" } })
          }
          style={({ pressed }) => [
            styles.primary,
            pressed && styles.primaryPressed,
          ]}
        >
          <Ionicons name="add" size={20} color={Colors.brand.greenText} />
          <Text style={styles.primaryText}>New circle</Text>
        </Pressable>
      </View>

      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      >
        {loading && list.length === 0 ? (
          <View style={styles.statusBlock}>
            <ActivityIndicator color={Colors.text.primary} size="small" />
            <Text style={styles.statusText}>Loading circles…</Text>
          </View>
        ) : list.length === 0 ? (
          <View style={styles.statusBlock}>
            <Text style={styles.statusTitle}>No circles yet</Text>
            <Text style={styles.statusText}>
              Create one or join with a 4-digit code.
            </Text>
          </View>
        ) : (
          list.map((c) => {
            const name = (c.name ?? "").trim();
            const code = String(c.code ?? "");
            const stage = String(c.stage ?? "lobby");
            const title =
              name.length > 0
                ? name
                : code.length > 0
                  ? `Circle ${code}`
                  : "Circle";
            return (
              <Pressable
                key={c.id}
                onPress={() => openCircle(c)}
                style={({ pressed }) => [
                  styles.row,
                  pressed && styles.rowPressed,
                ]}
              >
                <View style={styles.rowBody}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {title}
                  </Text>
                  <View style={styles.rowMeta}>
                    {code.length > 0 ? (
                      <>
                        <Text style={styles.rowMetaText}>Code {code}</Text>
                      </>
                    ) : null}
                    <Text style={styles.dotSep}>·</Text>
                    <Text style={styles.rowMetaText}>
                      {stage === "active"
                        ? "Week live"
                        : stage === "selecting" ||
                            stage === "loading" ||
                            stage === "confirm"
                          ? "Lineup"
                          : "Lobby"}
                    </Text>
                  </View>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={Colors.text.secondary}
                />
              </Pressable>
            );
          })
        )}
      </ScrollView>

      <TabBar active="circles" />
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
  ctaRow: {
    flexDirection: "row",
    gap: Spacing.gridGap,
    paddingHorizontal: Spacing.screenHorizontal,
    paddingTop: 4,
    paddingBottom: 18,
  },
  secondary: {
    flex: 1,
    height: PRIMARY_HEIGHT,
    borderRadius: Radius.pill,
    backgroundColor: Colors.bg.card,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  secondaryPressed: {
    backgroundColor: Colors.bg.cardActive,
  },
  secondaryText: {
    ...Typography.body,
    fontWeight: "600",
  },
  primary: {
    flex: 1,
    height: PRIMARY_HEIGHT,
    borderRadius: Radius.pill,
    backgroundColor: Colors.brand.green,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  primaryPressed: {
    opacity: 0.8,
  },
  primaryText: {
    ...Typography.body,
    color: Colors.brand.greenText,
    fontWeight: "600",
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
    minHeight: 68,
    paddingHorizontal: Spacing.cardPadding,
    paddingVertical: 14,
    borderRadius: Radius.cardSm,
    backgroundColor: Colors.bg.card,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  rowPressed: {
    backgroundColor: Colors.bg.cardActive,
  },
  rowBody: {
    flex: 1,
    gap: 4,
  },
  rowTitle: {
    ...Typography.body,
    fontWeight: "600",
  },
  rowMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  rowMetaText: {
    ...Typography.label,
  },
  dotSep: {
    ...Typography.label,
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
});
