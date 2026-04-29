import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import {
  Colors,
  ProgressGradient,
  Radius,
  Spacing,
  Typography,
} from "../constants/design";

const SLIDE_COUNT = 3;
const TOP_LIMIT = 3;
const CHART_HEIGHT = 140;
const SPARK_DAYS = 7;
const DAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"];

export type LeaderRow = {
  userId: string;
  name: string;
  points: number;
};

type Props = {
  leaderboard: LeaderRow[];
  maxWeeklyPoints: number;
  myPoints: number;
  myUserId: string | null;
  loading: boolean;
  empty: boolean;
  weeklyByUserDay: Record<string, number[]>;
  weeklyCeiling: number;
  daysElapsed: number;
  onExpand?: (slide: number) => void;
};

function medalColor(rank: number): string {
  if (rank === 1) return Colors.accent.gold;
  if (rank === 2) return Colors.accent.silver;
  if (rank === 3) return Colors.accent.bronze;
  return Colors.bg.cardActive;
}

export function LeaderboardWidget({
  leaderboard,
  maxWeeklyPoints,
  myPoints,
  myUserId,
  loading,
  empty,
  weeklyByUserDay,
  daysElapsed,
  onExpand,
}: Props) {
  const { width: winWidth } = useWindowDimensions();
  const slideWidth = Math.max(0, winWidth - Spacing.screenHorizontal * 2);

  const scrollX = useRef(new Animated.Value(0)).current;
  const [page, setPage] = useState(0);

  const sortedLb = [...leaderboard].sort(
    (a, b) => b.points - a.points || a.name.localeCompare(b.name),
  );
  const top3 = sortedLb.slice(0, TOP_LIMIT);
  const myIdx = myUserId
    ? sortedLb.findIndex((r) => r.userId === myUserId)
    : -1;
  const myRank = myIdx >= 0 ? myIdx + 1 : null;
  const leader = sortedLb[0];
  const gap = leader && myIdx >= 0 ? leader.points - sortedLb[myIdx].points : 0;
  const maxBarPts = Math.max(...sortedLb.map((r) => r.points), 1);

  const fillAnim = useRef(new Animated.Value(0)).current;
  const barsAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (loading) return;
    fillAnim.stopAnimation();
    fillAnim.setValue(0);
    Animated.timing(fillAnim, {
      toValue: 1,
      duration: 600,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [loading, leaderboard.length, maxWeeklyPoints, fillAnim]);

  useEffect(() => {
    if (loading) return;
    barsAnim.stopAnimation();
    barsAnim.setValue(0);
    Animated.timing(barsAnim, {
      toValue: 1,
      duration: 700,
      delay: 100,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [loading, page, leaderboard.length, barsAnim]);

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    scrollX.setValue(x);
    if (slideWidth <= 0) return;
    const next = Math.round(x / slideWidth);
    if (next !== page && next >= 0 && next < SLIDE_COUNT) setPage(next);
  };

  const renderTopThreeSlide = () => (
    <Pressable
      onPress={() => onExpand?.(0)}
      style={[styles.slide, { width: slideWidth }]}
    >
      <View style={styles.card}>
        {top3.length === 0 ? (
          <View style={styles.centered}>
            <Text style={styles.emptyText}>No points yet</Text>
          </View>
        ) : (
          <View style={styles.topThreeList}>
            {top3.map((row, idx) => {
              const rank = idx + 1;
              const fill =
                maxWeeklyPoints > 0
                  ? Math.min(1, row.points / maxWeeklyPoints)
                  : 0;
              const w = fillAnim.interpolate({
                inputRange: [0, 1],
                outputRange: ["0%", `${fill * 100}%`],
              });
              const isMe = row.userId === myUserId;
              const rc = medalColor(rank);
              return (
                <View key={row.userId} style={styles.topThreeRow}>
                  <View
                    style={[
                      styles.rankChip,
                      {
                        backgroundColor: rc,
                        shadowColor: rc,
                      },
                    ]}
                  >
                    <Text style={styles.rankChipText}>{rank}</Text>
                  </View>
                  <View style={styles.topThreeBody}>
                    <View style={styles.topThreeHead}>
                      <Text style={styles.topThreeName} numberOfLines={1}>
                        {row.name}
                        {isMe ? (
                          <Text style={styles.youInline}> · you</Text>
                        ) : null}
                      </Text>
                      <Text style={styles.topThreePts}>{row.points} pts</Text>
                    </View>
                    <View style={styles.barTrack}>
                      <Animated.View style={[styles.barFill, { width: w }]}>
                        <LinearGradient
                          colors={
                            ProgressGradient as unknown as readonly [
                              string,
                              string,
                              ...string[],
                            ]
                          }
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 0 }}
                          style={StyleSheet.absoluteFill}
                        />
                      </Animated.View>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </View>
    </Pressable>
  );

  const renderBarChartSlide = () => (
    <Pressable
      onPress={() => onExpand?.(1)}
      style={[styles.slide, { width: slideWidth }]}
    >
      <View style={styles.card}>
        <Text style={styles.cardOverline}>Points by member</Text>
        {sortedLb.length === 0 ? (
          <View style={styles.centered}>
            <Text style={styles.emptyText}>Nothing to chart yet</Text>
          </View>
        ) : (
          <View style={styles.chartRow}>
            {sortedLb.map((row) => {
              const isMe = row.userId === myUserId;
              const targetH = Math.max(
                4,
                (row.points / maxBarPts) * CHART_HEIGHT,
              );
              const h = barsAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [4, targetH],
              });
              const fillColors: readonly [string, string] = isMe
                ? [Colors.brand.green, Colors.brand.green]
                : [Colors.toggleOff, Colors.bg.cardActive];
              return (
                <View key={row.userId} style={styles.chartCol}>
                  <Text
                    style={[
                      styles.chartValue,
                      isMe && { color: Colors.brand.greenBright },
                    ]}
                  >
                    {row.points}
                  </Text>
                  <View style={styles.chartCellWrap}>
                    <Animated.View
                      style={[
                        styles.chartBar,
                        { height: h },
                        isMe && styles.chartBarMe,
                      ]}
                    >
                      <LinearGradient
                        colors={
                          fillColors as unknown as readonly [
                            string,
                            string,
                            ...string[],
                          ]
                        }
                        start={{ x: 0, y: 0 }}
                        end={{ x: 0, y: 1 }}
                        style={StyleSheet.absoluteFill}
                      />
                    </Animated.View>
                  </View>
                  <Text
                    style={[
                      styles.chartLabel,
                      isMe && {
                        color: Colors.text.primary,
                        fontWeight: "600",
                      },
                    ]}
                    numberOfLines={1}
                  >
                    {row.name}
                  </Text>
                </View>
              );
            })}
          </View>
        )}
      </View>
    </Pressable>
  );

  const renderYourWeekSlide = () => {
    const series = (myUserId && weeklyByUserDay[myUserId]) || [];
    const rankChipColor =
      myRank === 1
        ? Colors.accent.gold
        : myRank === 2
          ? Colors.accent.silver
          : myRank === 3
            ? Colors.accent.bronze
            : Colors.text.primary;
    const lastDay = Math.min(SPARK_DAYS, Math.max(1, daysElapsed));
    const dailyPts: number[] = [];
    for (let d = 0; d < SPARK_DAYS; d++) {
      const cum = series[d] ?? 0;
      const prev = d === 0 ? 0 : (series[d - 1] ?? 0);
      dailyPts.push(Math.max(0, cum - prev));
    }
    const sparkMax = Math.max(...dailyPts, 1);

    return (
      <Pressable
        onPress={() => onExpand?.(2)}
        style={[styles.slide, { width: slideWidth }]}
      >
        <View style={styles.card}>
          <Text style={styles.cardOverline}>Your week</Text>
          <View style={styles.weekHeroRow}>
            <Text style={styles.weekHeroNumber}>{myPoints}</Text>
            <Text style={styles.weekHeroLabel}>pts this week</Text>
          </View>
          <View style={styles.weekChipRow}>
            {myRank ? (
              <View
                style={[styles.rankPill, { backgroundColor: rankChipColor }]}
              >
                <Text style={styles.rankPillText}>RANK #{myRank}</Text>
              </View>
            ) : null}
            <Text style={styles.weekHint}>
              {myRank == null
                ? "Mark a task to enter the week"
                : gap > 0
                  ? `${gap} pts behind ${leader?.name}`
                  : "Leading the week"}
            </Text>
          </View>

          <View style={styles.sparkRow}>
            {dailyPts.map((v, i) => {
              const ratio = v / sparkMax;
              const targetH = Math.max(4, ratio * 36);
              const h = barsAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [4, targetH],
              });
              const elapsed = i < lastDay;
              return (
                <View key={i} style={styles.sparkCol}>
                  <View style={styles.sparkCellWrap}>
                    <Animated.View
                      style={[
                        styles.sparkBar,
                        { height: h },
                        elapsed
                          ? { backgroundColor: Colors.brand.greenBright }
                          : { backgroundColor: Colors.bg.cardActive },
                      ]}
                    />
                  </View>
                </View>
              );
            })}
          </View>
          <View style={styles.sparkLabels}>
            {DAY_LETTERS.map((d, i) => (
              <Text key={i} style={styles.sparkLabelText}>
                {d}
              </Text>
            ))}
          </View>
        </View>
      </Pressable>
    );
  };

  if (loading) {
    return (
      <View style={[styles.card, styles.centered]}>
        <Text style={styles.emptyText}>Loading…</Text>
      </View>
    );
  }

  if (empty) {
    return (
      <View style={[styles.card, styles.centered]}>
        <Text style={styles.emptyTitle}>No points yet</Text>
        <Text style={styles.emptyHelper}>
          Complete a task to light up the board.
        </Text>
      </View>
    );
  }

  return (
    <View>
      <Animated.ScrollView
        horizontal
        pagingEnabled
        bounces={false}
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        overScrollMode="never"
      >
        {renderTopThreeSlide()}
        {renderBarChartSlide()}
        {renderYourWeekSlide()}
      </Animated.ScrollView>

      <View style={styles.dotsRow}>
        {Array.from({ length: SLIDE_COUNT }).map((_, idx) => (
          <View
            key={idx}
            style={[styles.dot, idx === page && styles.dotActive]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  slide: {
    paddingRight: 0,
  },
  card: {
    backgroundColor: Colors.bg.card,
    padding: 18,
    borderRadius: Radius.card + 2,
    gap: 14,
    overflow: "hidden",
  },
  centered: {
    paddingVertical: 28,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  cardOverline: {
    ...Typography.overline,
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },

  // Slide 1 — top three
  topThreeList: { gap: 14 },
  topThreeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  rankChip: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    shadowOpacity: 0.55,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  rankChipText: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.bg.base,
  },
  topThreeBody: {
    flex: 1,
    gap: 8,
    minWidth: 0,
  },
  topThreeHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: 8,
  },
  topThreeName: {
    ...Typography.body,
    fontSize: 15,
    fontWeight: "600",
    flexShrink: 1,
  },
  youInline: {
    color: Colors.text.secondary,
    fontWeight: "400",
  },
  topThreePts: {
    ...Typography.caption,
    fontSize: 13,
  },
  barTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.progressTrack,
    overflow: "hidden",
  },
  barFill: { height: "100%", borderRadius: 2, overflow: "hidden" },

  // Slide 2 — bar chart
  chartRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    gap: 10,
    height: CHART_HEIGHT + 36,
  },
  chartCol: {
    flex: 1,
    alignItems: "center",
    gap: 6,
  },
  chartValue: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.text.secondary,
  },
  chartCellWrap: {
    width: "100%",
    height: CHART_HEIGHT,
    justifyContent: "flex-end",
  },
  chartBar: {
    width: "100%",
    borderRadius: 6,
    overflow: "hidden",
  },
  chartBarMe: {
    shadowColor: Colors.brand.green,
    shadowOpacity: 0.6,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  chartLabel: {
    fontSize: 11,
    color: Colors.text.secondary,
    width: "100%",
    textAlign: "center",
  },

  // Slide 3 — your week
  weekHeroRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 10,
  },
  weekHeroNumber: {
    fontSize: 56,
    fontWeight: "800",
    letterSpacing: -2,
    lineHeight: 56,
    color: Colors.text.primary,
  },
  weekHeroLabel: {
    fontSize: 14,
    color: Colors.text.secondary,
  },
  weekChipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  rankPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  rankPillText: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.bg.base,
    letterSpacing: 0.4,
  },
  weekHint: {
    fontSize: 12,
    color: Colors.text.secondary,
  },
  sparkRow: {
    flexDirection: "row",
    gap: 4,
    height: 36,
    alignItems: "flex-end",
    marginTop: 4,
  },
  sparkCol: {
    flex: 1,
    height: "100%",
    justifyContent: "flex-end",
  },
  sparkCellWrap: {
    width: "100%",
    height: "100%",
    justifyContent: "flex-end",
  },
  sparkBar: {
    width: "100%",
    borderRadius: 3,
  },
  sparkLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  sparkLabelText: {
    flex: 1,
    textAlign: "center",
    fontSize: 10,
    color: Colors.text.secondary,
  },

  dotsRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
    marginTop: 14,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: Colors.toggleOff,
  },
  dotActive: {
    width: 18,
    backgroundColor: Colors.text.primary,
  },

  emptyText: { ...Typography.label },
  emptyTitle: { ...Typography.body, fontWeight: "600" },
  emptyHelper: { ...Typography.label, textAlign: "center" },
});
