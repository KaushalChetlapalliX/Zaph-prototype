import { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, FlatList, Pressable, StyleSheet, ActivityIndicator, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../src/lib/supabase";

type MemberRow = {
  user_id: string;
  first_name: string | null;
  role: string | null;
  joined_at?: string | null;
};

type Difficulty = "easy" | "medium" | "hard";

const BG = "#F8EEFF";
const TEXT_PRIMARY = "#000000";
const BORDER = "#000000";
const CARD_BG = "rgba(0,0,0,0.05)";

const MEMBERS_POLL_MS = 2000;
const CIRCLE_POLL_MS = 1500;

export default function CircleMembersScreen() {
  const params = useLocalSearchParams<{ circleId?: string }>();
  const circleIdParam = Array.isArray(params.circleId) ? params.circleId[0] : params.circleId;

  const [circleId, setCircleId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<MemberRow[]>([]);

  const [circleCode, setCircleCode] = useState<string>("");
  const [difficulty, setDifficulty] = useState<Difficulty>("easy");
  const [stage, setStage] = useState<string>("lobby");

  const [isAdmin, setIsAdmin] = useState(false);
  const [starting, setStarting] = useState(false);

  const navigatedRef = useRef(false);

  const membersSigRef = useRef<string>("");
  const circleSigRef = useRef<string>("");
  const initialMembersLoadedRef = useRef(false);

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

  const maybeNavigateToSelect = (nextStage: string, nextDifficulty: Difficulty, nextCode: string) => {
    if (navigatedRef.current) return;
    if (nextStage !== "selecting") return;

    navigatedRef.current = true;

    router.replace({
      pathname: "/select-tasks",
      params: {
        level: nextDifficulty,
        circleId: circleId ?? "",
        circleCode: nextCode ?? "",
      },
    });
  };

  useEffect(() => {
    if (!circleId) return;

    let alive = true;

    const applyCircleIfChanged = (nextCode: string, nextDifficulty: Difficulty, nextStage: string) => {
      const sig = `${nextCode}|${nextDifficulty}|${nextStage}`;
      if (sig === circleSigRef.current) return;

      circleSigRef.current = sig;
      setCircleCode(nextCode);
      setDifficulty(nextDifficulty);
      setStage(nextStage);
    };

    const loadCircle = async () => {
      const { data, error } = await supabase
        .from("circles")
        .select("code, difficulty, stage")
        .eq("id", circleId)
        .single();

      if (!alive) return;
      if (error || !data) return;

      const nextCode = String((data as any).code ?? "");
      const nextDifficulty = ((data as any).difficulty ?? "easy") as Difficulty;
      const nextStage = String((data as any).stage ?? "lobby");

      applyCircleIfChanged(nextCode, nextDifficulty, nextStage);
      maybeNavigateToSelect(nextStage, nextDifficulty, nextCode);
    };

    loadCircle();

    const channel = supabase
      .channel(`circle-stage-${circleId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "circles", filter: `id=eq.${circleId}` },
        (payload) => {
          const nextStage = String((payload.new as any)?.stage ?? "lobby");
          const nextDifficulty = ((payload.new as any)?.difficulty ?? "easy") as Difficulty;
          const nextCode = String((payload.new as any)?.code ?? "");

          applyCircleIfChanged(nextCode || circleCode, nextDifficulty, nextStage);
          maybeNavigateToSelect(nextStage, nextDifficulty, nextCode || circleCode);
        }
      )
      .subscribe();

    const pollId = setInterval(loadCircle, CIRCLE_POLL_MS);

    return () => {
      alive = false;
      clearInterval(pollId);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [circleId]);

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
      setIsAdmin((row as any)?.role === "admin");
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
        .map((m) => `${m.user_id}|${(m.first_name ?? "").trim()}|${m.role ?? ""}`)
        .join(",");

    const fetchMembers = async (isInitial = false) => {
      if (isInitial && !initialMembersLoadedRef.current && members.length === 0) setLoading(true);

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

      const next = data as any as MemberRow[];
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
    if (starting) return;

    setStarting(true);

    const { error } = await supabase.rpc("set_circle_stage", {
      p_circle_id: circleId,
      p_stage: "selecting",
    });

    if (error) {
      setStarting(false);
      Alert.alert("Select tasks failed", error.message);
      return;
    }

    navigatedRef.current = true;
    setStarting(false);

    router.replace({
      pathname: "/select-tasks",
      params: {
        level: difficulty,
        circleId,
        circleCode,
      },
    });
  };

  const renderMember = ({ item }: { item: MemberRow }) => {
    const name = (item.first_name ?? "").trim() || `User ${item.user_id.slice(0, 6)}`;
    const showAdmin = (item.role ?? "") === "admin";

    return (
      <View style={styles.memberRow}>
        <Text style={styles.memberName}>{name}</Text>
        {showAdmin ? <Text style={styles.adminTag}>Admin</Text> : null}
      </View>
    );
  };

  const list = useMemo(() => members, [members]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.codePill}>
          <Text style={styles.codeText}>{circleCode || "----"}</Text>
        </View>

        <Text style={styles.title}>Circle{"\n"}Members</Text>
        <Text style={styles.subtitle}>Get your friends onboard</Text>

        {loading && members.length === 0 ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator />
            <Text style={styles.loadingText}>Loading members</Text>
          </View>
        ) : (
          <FlatList
            data={list}
            renderItem={renderMember}
            keyExtractor={(m) => m.user_id}
            scrollEnabled={false}
            contentContainerStyle={styles.listContent}
          />
        )}

        {isAdmin ? (
          <Pressable
            style={[styles.selectTasksButton, starting ? styles.buttonDisabled : null]}
            onPress={handleSelectTasks}
            disabled={starting}
          >
            {starting ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator />
                <Text style={styles.selectTasksText}>Starting</Text>
              </View>
            ) : (
              <>
                <Text style={styles.selectTasksText}>Select tasks</Text>
                <Ionicons name="arrow-forward" size={20} color="#000000" />
              </>
            )}
          </Pressable>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: BG },
  container: { flex: 1, backgroundColor: BG, paddingHorizontal: 22, paddingTop: 40, paddingBottom: 40 },

  codePill: {
    position: "absolute",
    top: 18,
    right: 22,
    backgroundColor: "#EDE6F7",
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 6,
    paddingVertical: 10,
    paddingHorizontal: 18,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  codeText: { fontSize: 16, fontWeight: "700", color: TEXT_PRIMARY },

  title: { fontSize: 44, fontWeight: "800", color: TEXT_PRIMARY, textAlign: "center", lineHeight: 48, marginTop: 40 },
  subtitle: { marginTop: 10, fontSize: 16, fontWeight: "500", color: "rgba(0,0,0,0.45)", textAlign: "center" },

  loadingBox: { marginTop: 30, alignItems: "center", gap: 10 },
  loadingText: { fontSize: 14, fontWeight: "600", color: "rgba(0,0,0,0.55)" },

  listContent: { marginTop: 28, gap: 14 },

  memberRow: {
    height: 56,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 2,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  memberName: { fontSize: 18, fontWeight: "700", color: TEXT_PRIMARY },
  adminTag: { fontSize: 12, fontWeight: "600", color: "rgba(0,0,0,0.45)" },

  selectTasksButton: {
    position: "absolute",
    bottom: 28,
    right: 22,
    backgroundColor: "#CFA3FF",
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 6,
    paddingVertical: 14,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  buttonDisabled: { opacity: 0.75 },
  selectTasksText: { fontSize: 16, fontWeight: "700", color: TEXT_PRIMARY },
  loadingRow: { flexDirection: "row", alignItems: "center", gap: 10 },
});
