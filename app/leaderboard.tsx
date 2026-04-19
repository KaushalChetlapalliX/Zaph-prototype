import { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  Animated,
  Easing,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../src/lib/supabase";
import {
  Colors,
  Radius,
  Spacing,
  Typography,
} from "../src/constants/design";

const POLL_MS = 3000;
const POINTS_PER_TASK = 5;

type LeaderRow = {
  userId: string;
  name: string;
  points: number;
};

function startOfWeekUTC(d = new Date()) {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
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

function medalColor(rank: number): string {
  if (rank === 1) return Colors.accent.gold;
  if (rank === 2) return Colors.accent.silver;
  if (rank === 3) return Colors.accent.bronze;
  return Colors.bg.cardActive;
}

function initial(name: string): string {
  const t = name.trim();
  return t.length > 0 ? t[0].toUpperCase() : "?";
}

function weekRangeLabel(start: Date, end: Date): string {
  const fmt = (d: Date) =>
    d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const endInclusive = new Date(end);
  endInclusive.setUTCDate(endInclusive.getUTCDate() - 1);
  return `${fmt(start)} – ${fmt(endInclusive)}`;
}

export default function Leaderboard() {
  const [circleId, setCircleId] = useState<string | null>(null);
  const [circleName, setCircleName] = useState<string>("Circle");
  const [leaderboard, setLeaderboard] = useState<LeaderRow[]>([]);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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
      try {
        const id = await AsyncStorage.getItem("activeCircleId");
        const name = await AsyncStorage.getItem("activeCircleName");
        if (id) setCircleId(id);
        if (name?.trim()) setCircleName(name.trim());
      } catch {
        // ignore
      }
    };
    init();
  }, []);

  useEffect(() => {
    if (!circleId) {
      if (!initialLoadedRef.current) {
        initialLoadedRef.current = true;
        setLoading(false);
      }
      return;
    }
    let alive = true;

    const fetchBoard = async () => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      try {
        const { data: userData } = await supabase.auth.getUser();
        const uid = userData.user?.id ?? null;
        if (alive) setMyUserId(uid);

        const wStart = startOfWeekUTC();
        const wEnd = endOfWeekUTC();

        const { data: rows } = await supabase
          .from("task_completions")
          .select("user_id, points")
          .eq("circle_id", circleId)
          .gte("completed_at", wStart.toISOString())
          .lt("completed_at", wEnd.toISOString());

        if (!alive) return;

        type CompletionPts = { user_id: string; points?: number | null };
        const byUser: Record<string, number> = {};
        if (rows) {
          for (const r of rows as unknown as CompletionPts[]) {
            const id = String(r.user_id);
            byUser[id] = (byUser[id] ?? 0) + (Number(r.points) || POINTS_PER_TASK);
          }
        }

        const ids = Object.keys(byUser);
        const nameById: Record<string, string> = {};
        if (ids.length > 0) {
          const { data: profs } = await supabase
            .from("profiles")
            .select("id, first_name")
            .in("id", ids);
          if (profs) {
            type Prof = { id: string; first_name?: string | null };
            for (const p of profs as unknown as Prof[]) {
              const nm = String(p.first_name ?? "").trim();
              if (nm) nameById[String(p.id)] = nm;
            }
          }
        }

        const list: LeaderRow[] = ids
          .map((id) => ({
            userId: id,
            name: nameById[id] ?? "User",
            points: byUser[id] ?? 0,
          }))
          .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));

        if (!alive) return;
        setLeaderboard(list);
        if (!initialLoadedRef.current) {
          initialLoadedRef.current = true;
          setLoading(false);
        }
      } finally {
        inFlightRef.current = false;
      }
    };

    fetchBoard();
    const interval = setInterval(fetchBoard, POLL_MS);
    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, [circleId]);

  const myRow = useMemo(() => {
    if (!myUserId) return null;
    const idx = leaderboard.findIndex((r) => r.userId === myUserId);
    if (idx < 0) return null;
    return { row: leaderboard[idx], rank: idx + 1 };
  }, [leaderboard, myUserId]);

  const leader = leaderboard[0] ?? null;
  const gapToLeader = myRow && leader ? leader.points - myRow.row.points : 0;

  const weekLabel = useMemo(() => {
    return weekRangeLabel(startOfWeekUTC(), endOfWeekUTC());
  }, []);

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
        <View style={styles.topBar}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityLabel="Back"
          >
            <Ionicons
              name="chevron-back"
              size={24}
              color={Colors.text.primary}
            />
          </Pressable>
          <Text style={styles.topTitle}>Leaderboard</Text>
          <View style={styles.topRight} />
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.heroCard}>
            <View style={styles.heroHead}>
              <Text style={styles.heroOverline}>{circleName}</Text>
              <Text style={styles.heroMeta}>{weekLabel}</Text>
            </View>

            {myRow ? (
              <>
                <View style={styles.heroRow}>
                  <Text style={styles.heroRank}>#{myRow.rank}</Text>
                  <View style={styles.heroRankMeta}>
                    <Text style={styles.heroLabel}>Your spot</Text>
                    <Text style={styles.heroPts}>
                      {myRow.row.points} pts
                    </Text>
                  </View>
                </View>
                {gapToLeader > 0 ? (
                  <Text style={styles.heroHint}>
                    {gapToLeader} pts behind {leader?.name}
                  </Text>
                ) : (
                  <Text style={styles.heroHint}>You're leading the week.</Text>
                )}
              </>
            ) : (
              <>
                <Text style={styles.heroRank}>—</Text>
                <Text style={styles.heroHint}>
                  Mark a task to join the leaderboard.
                </Text>
              </>
            )}
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>Standings</Text>
              <Text style={styles.sectionMeta}>
                {leaderboard.length}{" "}
                {leaderboard.length === 1 ? "player" : "players"}
              </Text>
            </View>

            {loading ? (
              <View style={styles.emptyBlock}>
                <Text style={styles.emptyText}>Loading…</Text>
              </View>
            ) : !circleId ? (
              <View style={styles.emptyBlock}>
                <Text style={styles.emptyTitle}>No circle selected</Text>
                <Text style={styles.emptyHelper}>
                  Open a circle from Home to see its leaderboard.
                </Text>
              </View>
            ) : leaderboard.length === 0 ? (
              <View style={styles.emptyBlock}>
                <Text style={styles.emptyTitle}>Nothing to show yet</Text>
                <Text style={styles.emptyHelper}>
                  The week's leaderboard starts as soon as someone marks a task
                  done.
                </Text>
              </View>
            ) : (
              <View style={styles.list}>
                {leaderboard.map((row, idx) => {
                  const rank = idx + 1;
                  const isTop = rank <= 3;
                  const isMe = row.userId === myUserId;
                  return (
                    <View
                      key={row.userId}
                      style={[styles.row, isMe && styles.rowMe]}
                    >
                      <View
                        style={[
                          styles.medal,
                          { backgroundColor: medalColor(rank) },
                        ]}
                      >
                        <Text
                          style={[
                            styles.medalText,
                            isTop && styles.medalTextTop,
                          ]}
                        >
                          {rank}
                        </Text>
                      </View>

                      <View style={styles.avatar}>
                        <Text style={styles.avatarLetter}>
                          {initial(row.name)}
                        </Text>
                      </View>

                      <View style={styles.rowText}>
                        <Text style={styles.rowName} numberOfLines={1}>
                          {row.name}
                          {isMe ? (
                            <Text style={styles.rowMeTag}> · you</Text>
                          ) : null}
                        </Text>
                        <Text style={styles.rowSub}>
                          {row.points} {row.points === 1 ? "pt" : "pts"}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        </ScrollView>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.bg.base },
  root: { flex: 1 },

  topBar: {
    height: 52,
    paddingHorizontal: Spacing.screenHorizontal,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  topTitle: {
    ...Typography.section,
  },
  topRight: {
    width: 24,
  },

  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: Spacing.screenHorizontal,
    paddingBottom: 32,
    gap: Spacing.sectionGap,
  },

  heroCard: {
    backgroundColor: Colors.bg.card,
    borderRadius: Radius.card,
    paddingHorizontal: 22,
    paddingTop: 18,
    paddingBottom: 22,
    gap: 14,
  },
  heroHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  heroOverline: {
    ...Typography.overline,
    textTransform: "uppercase",
    letterSpacing: 1.4,
    color: Colors.text.primary,
  },
  heroMeta: {
    ...Typography.caption,
  },
  heroRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 16,
  },
  heroRank: {
    ...Typography.hero,
    fontSize: 72,
    letterSpacing: -3,
    lineHeight: 76,
  },
  heroRankMeta: {
    gap: 2,
  },
  heroLabel: {
    ...Typography.overline,
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  heroPts: {
    ...Typography.section,
  },
  heroHint: {
    ...Typography.label,
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

  list: {
    gap: 4,
  },
  row: {
    minHeight: 64,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginHorizontal: -12,
    borderRadius: Radius.cardSm,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  rowMe: {
    backgroundColor: Colors.bg.card,
  },
  medal: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  medalText: {
    ...Typography.body,
    fontWeight: "700",
  },
  medalTextTop: {
    color: Colors.bg.base,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.bg.cardActive,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarLetter: {
    ...Typography.body,
    fontWeight: "600",
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  rowName: {
    ...Typography.body,
    fontWeight: "600",
  },
  rowMeTag: {
    ...Typography.label,
    color: Colors.text.secondary,
    fontWeight: "400",
  },
  rowSub: {
    ...Typography.label,
  },

  emptyBlock: {
    paddingVertical: 32,
    alignItems: "center",
    gap: 6,
  },
  emptyTitle: {
    ...Typography.body,
    fontWeight: "600",
  },
  emptyHelper: {
    ...Typography.label,
    textAlign: "center",
    maxWidth: 300,
  },
  emptyText: {
    ...Typography.label,
  },
});
