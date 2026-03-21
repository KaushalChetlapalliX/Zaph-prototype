import { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  SafeAreaView,
  StyleSheet,
  FlatList,
  ActivityIndicator,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../src/lib/supabase";

type Difficulty = "easy" | "medium" | "hard";

type CircleRow = {
  id: string;
  name: string | null;
  code: string | number | null;
  difficulty: Difficulty | null;
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

  const makeCirclesSig = (rows: CircleRow[]) =>
    rows
      .map((c) => `${c.id}|${(c.name ?? "").trim()}|${String(c.code ?? "")}|${c.difficulty ?? ""}|${c.stage ?? ""}`)
      .join(",");

  useEffect(() => {
    let alive = true;

    const fetchCircles = async (isInitial = false) => {
      if (isInitial && !initialLoadedRef.current && circles.length === 0) setLoading(true);

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
        .select("circle_id, circles ( id, name, code, difficulty, stage )")
        .eq("user_id", uid);

      if (!alive) return;

      if (error || !data) {
        if (isInitial && !initialLoadedRef.current) {
          initialLoadedRef.current = true;
          setLoading(false);
        }
        return;
      }

      const rows = data as any as MemberJoinRow[];

      const next: CircleRow[] = rows
        .map((r) => {
          const c = r.circles as any;
          if (!c) return null;
          if (Array.isArray(c)) return c[0] ?? null;
          return c as CircleRow;
        })
        .filter(Boolean) as CircleRow[];

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
    const level = (c.difficulty ?? "easy") as Difficulty;
    const stage = String(c.stage ?? "lobby");

    try {
      await AsyncStorage.setItem("activeCircleId", circleId);
      await AsyncStorage.setItem("activeCircleCode", circleCode);
      await AsyncStorage.setItem("activeDifficulty", level);
      await AsyncStorage.setItem("activeCircleName", String(c.name ?? ""));
    } catch {}

    if (stage === "selecting") {
      router.push({
        pathname: "/select-tasks",
        params: { level, circleId, circleCode },
      });
      return;
    }

    if (stage === "confirmation" || stage === "finalized" || stage === "ready") {
      router.push({ pathname: "/tasks-confirmation", params: { circleId } });
      return;
    }

    router.push({
      pathname: "/circle-members",
      params: { circleId, circleCode, level, circleName: String(c.name ?? "") },
    });
  };

  const renderCircle = ({ item }: { item: CircleRow }) => {
    const name = (item.name ?? "").trim();
    const code = String(item.code ?? "");
    const title = name.length > 0 ? name : code.length > 0 ? `Circle ${code}` : "Circle";

    return (
      <Pressable onPress={() => openCircle(item)} style={styles.circleRow}>
        <Text style={styles.circleName}>{title}</Text>
        <Ionicons name="arrow-forward" size={18} color="#000000" />
      </Pressable>
    );
  };

  const list = useMemo(() => circles, [circles]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.titleLine1}>Your Active</Text>
          <Text style={styles.titleLine2}>Circles</Text>
          <Text style={styles.subtitle}>Track productivity with your friends</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.buttonRow}>
            <Pressable onPress={() => router.push("/join-circle-code")} style={styles.joinButton}>
              <Text style={styles.joinButtonText}>Join</Text>
            </Pressable>

            <Pressable onPress={() => router.push("/create-circle-code")} style={styles.createButton}>
              <Ionicons name="add" size={20} color="#FFFFFF" />
              <Text style={styles.createButtonText}>Create</Text>
            </Pressable>
          </View>

          {loading && list.length === 0 ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator />
              <Text style={styles.loadingText}>Loading circles</Text>
            </View>
          ) : list.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>so empty....</Text>
            </View>
          ) : (
            <FlatList
              data={list}
              renderItem={renderCircle}
              keyExtractor={(c) => c.id}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
            />
          )}
        </View>

        <View style={styles.tabBar}>
          <Pressable onPress={() => router.push("/user-home")} style={styles.tabItem}>
            <View style={styles.tabContent}>
              <Ionicons name="home" size={24} color="#8A2BE2" />
              <Text style={styles.tabTextActive}>Home</Text>
              <View style={styles.tabIndicator} />
            </View>
          </Pressable>

          <Pressable style={styles.tabItem}>
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
  safeArea: { flex: 1, backgroundColor: "#F8EEFF" },
  container: { flex: 1, backgroundColor: "#F8EEFF", paddingHorizontal: 20, paddingTop: 40, paddingBottom: 80 },
  header: { alignItems: "center", marginBottom: 32 },
  titleLine1: { fontSize: 42, fontWeight: "900", color: "#000000", lineHeight: 48 },
  titleLine2: { fontSize: 42, fontWeight: "900", color: "#000000", lineHeight: 48, marginTop: -8 },
  subtitle: { fontSize: 16, color: "#666666", marginTop: 12, textAlign: "center" },

  card: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 30,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    marginBottom: 20,
    minHeight: 400,
  },

  buttonRow: { flexDirection: "row", gap: 12, marginBottom: 24 },

  joinButton: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E0E0E0",
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  joinButtonText: { color: "#000000", fontSize: 16, fontWeight: "600" },

  createButton: {
    flex: 1,
    backgroundColor: "#8A2BE2",
    borderRadius: 8,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  createButtonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "600" },

  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  loadingText: { fontSize: 14, fontWeight: "600", color: "rgba(0,0,0,0.55)" },

  emptyContainer: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyText: { fontSize: 16, color: "#CCCCCC", opacity: 0.5 },

  listContent: { gap: 14, paddingTop: 2, paddingBottom: 8 },

  circleRow: {
    height: 56,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#000000",
    borderRadius: 6,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 3,
  },
  circleName: { fontSize: 16, fontWeight: "700", color: "#000000" },

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
  tabIndicator: { width: 30, height: 3, backgroundColor: "#8A2BE2", marginTop: 4, borderRadius: 2 },
  tabTextActive: { fontSize: 12, color: "#8A2BE2", fontWeight: "600", marginTop: 4 },
  tabTextInactive: { fontSize: 12, color: "#999999", fontWeight: "500", marginTop: 4 },
});
