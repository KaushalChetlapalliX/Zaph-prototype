import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../src/lib/supabase";
import {
  Colors,
  Radius,
  Spacing,
  Typography,
} from "../src/constants/design";

type Level = "easy" | "medium" | "hard";

type Member = {
  id: string;
  name: string;
  done: boolean;
};

type MemberRow = {
  user_id: string;
  first_name?: string | null;
  tasks_done?: boolean | string | number | null;
  joined_at?: string | null;
};

type SelectionRow = {
  user_id?: string | null;
};

const POLL_MS = 2000;

export default function LoadingScreen() {
  const params = useLocalSearchParams<{ circleId?: string; level?: string }>();
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const mountAnim = useRef(new Animated.Value(0)).current;

  const [circleId, setCircleId] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(true);

  const hasNavigatedRef = useRef(false);
  const initialLoadedRef = useRef(false);
  const membersSigRef = useRef<string>("");

  const level: Level = useMemo(() => {
    const raw = Array.isArray(params.level) ? params.level[0] : params.level;
    return raw === "medium" || raw === "hard" || raw === "easy" ? raw : "easy";
  }, [params.level]);

  useEffect(() => {
    Animated.timing(mountAnim, {
      toValue: 1,
      duration: 520,
      easing: Easing.out(Easing.exp),
      useNativeDriver: true,
    }).start();
  }, [mountAnim]);

  useEffect(() => {
    const rotate = () => {
      rotateAnim.setValue(0);
      Animated.timing(rotateAnim, {
        toValue: 1,
        duration: 1800,
        easing: Easing.linear,
        useNativeDriver: true,
      }).start(() => rotate());
    };
    rotate();
  }, [rotateAnim]);

  useEffect(() => {
    const init = async () => {
      const raw = Array.isArray(params.circleId)
        ? params.circleId[0]
        : params.circleId;

      if (raw && raw.length > 0) {
        setCircleId(raw);
        try {
          await AsyncStorage.setItem("activeCircleId", raw);
        } catch {}
        return;
      }

      try {
        const stored = await AsyncStorage.getItem("activeCircleId");
        if (stored) setCircleId(stored);
      } catch {}
    };

    init();
  }, [params.circleId]);

  useEffect(() => {
    if (!circleId) return;

    let alive = true;

    const shortId = (id: string) => `User ${id.slice(0, 6)}`;

    const makeSig = (rows: Member[]) =>
      rows.map((m) => `${m.id}|${m.name}|${m.done ? "1" : "0"}`).join(",");

    const fetchMembers = async (isInitial = false) => {
      if (isInitial && !initialLoadedRef.current && members.length === 0) {
        setLoadingMembers(true);
      }

      const { data: memberRows, error } = await supabase
        .from("circle_members")
        .select("user_id, first_name, tasks_done, joined_at")
        .eq("circle_id", circleId)
        .order("joined_at", { ascending: true });

      if (!alive) return;

      if (error || !memberRows) {
        if (isInitial && !initialLoadedRef.current) {
          initialLoadedRef.current = true;
          setLoadingMembers(false);
        }
        return;
      }

      const doneSet = new Set<string>();
      try {
        const { data: selections, error: selErr } = await supabase
          .from("circle_task_selections")
          .select("user_id")
          .eq("circle_id", circleId)
          .eq("level", level);

        if (!selErr && selections) {
          for (const s of selections as unknown as SelectionRow[]) {
            if (s?.user_id) doneSet.add(String(s.user_id));
          }
        }
      } catch {}

      const typedRows = memberRows as unknown as MemberRow[];

      const nextMembers: Member[] = typedRows.map((m) => {
        const uid = String(m.user_id);
        const fn = (m.first_name ?? "").trim();

        const tasksDoneFromColumn =
          m.tasks_done === true || m.tasks_done === "true" || m.tasks_done === 1;

        return {
          id: uid,
          name: fn.length > 0 ? fn : shortId(uid),
          done: tasksDoneFromColumn || doneSet.has(uid),
        };
      });

      const sig = makeSig(nextMembers);
      if (sig !== membersSigRef.current) {
        membersSigRef.current = sig;
        setMembers(nextMembers);
      }

      if (isInitial && !initialLoadedRef.current) {
        initialLoadedRef.current = true;
        setLoadingMembers(false);
      } else if (isInitial) {
        setLoadingMembers(false);
      }

      const allDone =
        nextMembers.length > 0 && nextMembers.every((m) => m.done);

      if (allDone && !hasNavigatedRef.current) {
        hasNavigatedRef.current = true;
        router.replace({
          pathname: "/tasks-confirmation",
          params: { circleId, level },
        });
      }
    };

    fetchMembers(true);
    const interval = setInterval(() => fetchMembers(false), POLL_MS);

    return () => {
      alive = false;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [circleId, level]);

  const rotation = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  const translate = mountAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [12, 0],
  });

  const doneCount = members.filter((m) => m.done).length;
  const totalCount = members.length;

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
      <Animated.View
        style={[
          styles.header,
          { opacity: mountAnim, transform: [{ translateY: translate }] },
        ]}
      >
        <Text style={styles.overline}>WAITING ROOM</Text>
        <Text style={styles.title}>Hold tight.</Text>
        <Text style={styles.helper}>
          Circle picks tasks together. Grab a coffee while everyone locks in.
        </Text>
      </Animated.View>

      <View style={styles.ringRow}>
        <View style={styles.ringContainer}>
          <View style={styles.ringBackground} />
          <Animated.View
            style={[
              styles.ringForeground,
              { transform: [{ rotate: rotation }] },
            ]}
          />
          <View style={styles.ringLabel}>
            <Text style={styles.ringCount}>
              {totalCount > 0 ? `${doneCount}/${totalCount}` : "—"}
            </Text>
            <Text style={styles.ringCaption}>picked</Text>
          </View>
        </View>
      </View>

      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      >
        {!circleId ? (
          <View style={styles.statusBlock}>
            <Text style={styles.statusTitle}>No circle selected</Text>
            <Text style={styles.statusText}>
              Join or create a circle to continue.
            </Text>
          </View>
        ) : loadingMembers && members.length === 0 ? (
          <View style={styles.statusBlock}>
            <ActivityIndicator color={Colors.text.primary} size="small" />
            <Text style={styles.statusText}>Loading members…</Text>
          </View>
        ) : members.length === 0 ? (
          <View style={styles.statusBlock}>
            <Text style={styles.statusTitle}>No members yet</Text>
            <Text style={styles.statusText}>
              Share your circle code to get your friends in.
            </Text>
          </View>
        ) : (
          members.map((m) => (
            <View key={m.id} style={styles.row}>
              <Text style={styles.rowName} numberOfLines={1}>
                {m.name}
              </Text>
              {m.done ? (
                <View style={styles.readyTag}>
                  <Ionicons
                    name="checkmark"
                    size={14}
                    color={Colors.brand.greenBright}
                  />
                  <Text style={styles.readyText}>Ready</Text>
                </View>
              ) : (
                <Text style={styles.pendingText}>Picking…</Text>
              )}
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const RING_SIZE = 140;
const RING_STROKE = 6;

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
  ringRow: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 28,
  },
  ringContainer: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  ringBackground: {
    position: "absolute",
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    borderWidth: RING_STROKE,
    borderColor: Colors.progressTrack,
  },
  ringForeground: {
    position: "absolute",
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    borderWidth: RING_STROKE,
    borderColor: "transparent",
    borderTopColor: Colors.brand.greenBright,
    borderRightColor: Colors.brand.greenBright,
  },
  ringLabel: {
    alignItems: "center",
    gap: 2,
  },
  ringCount: {
    ...Typography.display,
    fontSize: 30,
  },
  ringCaption: {
    ...Typography.caption,
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
    minHeight: 56,
    paddingHorizontal: Spacing.cardPadding,
    paddingVertical: 12,
    borderRadius: Radius.cardSm,
    backgroundColor: Colors.bg.card,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  rowName: {
    ...Typography.body,
    flex: 1,
  },
  readyTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.pill,
    backgroundColor: Colors.bg.cardActive,
  },
  readyText: {
    ...Typography.caption,
    color: Colors.brand.greenBright,
    fontWeight: "600",
  },
  pendingText: {
    ...Typography.caption,
  },
  statusBlock: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 32,
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
