import { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, Animated, FlatList, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../src/lib/supabase";

type Level = "easy" | "medium" | "hard";

type Member = {
  id: string;
  name: string;
  done: boolean;
};

const POLL_MS = 2000;

export default function LoadingScreen() {
  const params = useLocalSearchParams<{ circleId?: string; level?: string }>();
  const rotateAnim = useRef(new Animated.Value(0)).current;

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
    const rotate = () => {
      rotateAnim.setValue(0);
      Animated.timing(rotateAnim, {
        toValue: 1,
        duration: 2000,
        useNativeDriver: true,
      }).start(() => rotate());
    };
    rotate();
  }, [rotateAnim]);

  useEffect(() => {
    const init = async () => {
      const raw = Array.isArray(params.circleId) ? params.circleId[0] : params.circleId;

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
      if (isInitial && !initialLoadedRef.current && members.length === 0) setLoadingMembers(true);

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

      // Fallback done status from selections table
      const doneSet = new Set<string>();
      try {
        let q = supabase
          .from("circle_task_selections")
          .select("user_id")
          .eq("circle_id", circleId);

        q = q.eq("level", level);

        const { data: selections, error: selErr } = await q;

        if (!selErr && selections) {
          for (const s of selections as any[]) {
            if (s?.user_id) doneSet.add(String(s.user_id));
          }
        }
      } catch {}

      const nextMembers: Member[] = (memberRows as any[]).map((m) => {
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

      // Move ONLY when everyone in circle_members is done
      const allDone = nextMembers.length > 0 && nextMembers.every((m) => m.done);

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

  const renderMember = ({ item }: { item: Member }) => (
    <View style={[styles.memberRow, item.done ? styles.memberRowDone : null]}>
      <Text style={styles.memberName}>{item.name}</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.headline}>
            Wait for others to{"\n"}finish... Grab a coffee
          </Text>

          <View style={styles.ringContainer}>
            <View style={styles.ringBackground} />
            <Animated.View style={[styles.ringForeground, { transform: [{ rotate: rotation }] }]} />
          </View>

          <View style={styles.memberListContainer}>
            {!circleId ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>No circle selected</Text>
              </View>
            ) : loadingMembers && members.length === 0 ? (
              <View style={styles.loadingMembersRow}>
                <ActivityIndicator />
                <Text style={styles.loadingMembersText}>Loading members</Text>
              </View>
            ) : (
              <>
                <Text style={styles.helperText}>Waiting for everyone in this circle to finish selecting.</Text>

                <FlatList
                  data={members}
                  renderItem={renderMember}
                  keyExtractor={(item) => item.id}
                  scrollEnabled={false}
                  contentContainerStyle={styles.memberListContent}
                />
              </>
            )}
          </View>
        </View>

        <View style={styles.tabBar}>
          <View style={styles.tabItem}>
            <View style={styles.tabContent}>
              <Ionicons name="home" size={24} color="#8A2BE2" />
              <Text style={styles.tabTextActive}>Home</Text>
              <View style={styles.tabIndicator} />
            </View>
          </View>

          <View style={styles.tabItem}>
            <Ionicons name="people" size={24} color="#999999" />
            <Text style={styles.tabTextInactive}>Circles</Text>
          </View>

          <View style={styles.tabItem}>
            <Ionicons name="settings" size={24} color="#999999" />
            <Text style={styles.tabTextInactive}>Settings</Text>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#F8EEFF" },
  container: { flex: 1, backgroundColor: "#F8EEFF", paddingBottom: 80 },
  content: {
    flex: 1,
    justifyContent: "flex-start",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 40,
  },
  headline: {
    fontSize: 36,
    fontWeight: "800",
    color: "#000000",
    textAlign: "center",
    lineHeight: 42,
    marginBottom: 40,
  },
  ringContainer: {
    width: 130,
    height: 130,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  ringBackground: {
    width: 130,
    height: 130,
    borderRadius: 65,
    borderWidth: 8,
    borderColor: "rgba(138, 43, 226, 0.15)",
    position: "absolute",
  },
  ringForeground: {
    width: 130,
    height: 130,
    borderRadius: 65,
    borderWidth: 8,
    borderColor: "transparent",
    borderTopColor: "#8A2BE2",
    borderRightColor: "#8A2BE2",
    borderBottomColor: "transparent",
    borderLeftColor: "transparent",
    position: "absolute",
  },
  memberListContainer: { width: "100%", marginTop: 40, maxWidth: 400 },
  memberListContent: { gap: 12 },
  memberRow: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#000000",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    justifyContent: "center",
    minHeight: 48,
  },
  memberRowDone: { backgroundColor: "#87E47B" },
  memberName: { fontSize: 16, fontWeight: "600", color: "#000000" },
  helperText: {
    fontSize: 13,
    fontWeight: "600",
    color: "rgba(0,0,0,0.55)",
    textAlign: "center",
    marginBottom: 12,
  },
  emptyState: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#000000",
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  emptyText: {
    fontSize: 14,
    fontWeight: "600",
    color: "rgba(0,0,0,0.55)",
    textAlign: "center",
  },
  loadingMembersRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    justifyContent: "center",
    paddingVertical: 10,
  },
  loadingMembersText: { fontSize: 14, fontWeight: "600", color: "rgba(0,0,0,0.55)" },
  tabBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    backgroundColor: "#F8EEFF",
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
  tabIndicator: {
    width: 30,
    height: 3,
    backgroundColor: "#8A2BE2",
    marginTop: 4,
    borderRadius: 2,
  },
  tabTextActive: { fontSize: 12, color: "#8A2BE2", fontWeight: "600", marginTop: 4 },
  tabTextInactive: { fontSize: 12, color: "#999999", fontWeight: "500", marginTop: 4 },
});
