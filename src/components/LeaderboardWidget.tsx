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
import Svg, {
  Circle as SvgCircle,
  Polyline,
  Circle,
  Text as SvgText,
} from "react-native-svg";
import {
  Colors,
  ProgressGradient,
  Radius,
  Spacing,
  Typography,
} from "../constants/design";

const SLIDE_COUNT = 4;
const TOP_LIMIT = 6;
const BAR_LIMIT = 5;
const CARD_HEIGHT = 320;
const DAY_LABELS = ["1", "2", "3", "4", "5", "6", "7"];
const LINE_COLORS = [
  "#39D353",
  "#5DADE2",
  "#FFB800",
  "#BF5AF2",
  "#FF375F",
  "#30D5C8",
  "#FF9F0A",
  "#A8A9AD",
];

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
  // Cumulative weekly points per user per day index 0..6 (Mon..Sun).
  weeklyByUserDay: Record<string, number[]>;
  onExpand?: (slide: number) => void;
};

function medalColor(rank: number): string {
  if (rank === 1) return Colors.accent.gold;
  if (rank === 2) return Colors.accent.silver;
  if (rank === 3) return Colors.accent.bronze;
  return Colors.bg.cardActive;
}

const RING_SIZE = 200;
const RING_STROKE = 10;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const AnimatedCircle = Animated.createAnimatedComponent(SvgCircle);

export function LeaderboardWidget({
  leaderboard,
  maxWeeklyPoints,
  myPoints,
  myUserId,
  loading,
  empty,
  weeklyByUserDay,
  onExpand,
}: Props) {
  const { width: winWidth } = useWindowDimensions();
  const slideWidth = Math.max(0, winWidth - Spacing.screenHorizontal * 2);

  const scrollX = useRef(new Animated.Value(0)).current;
  const [page, setPage] = useState(0);

  const top = leaderboard.slice(0, TOP_LIMIT);

  const barsAnim = useRef(new Animated.Value(0)).current;
  const ringAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (loading) return;
    barsAnim.stopAnimation();
    barsAnim.setValue(0);
    Animated.timing(barsAnim, {
      toValue: 1,
      duration: 620,
      delay: 120,
      easing: Easing.out(Easing.exp),
      useNativeDriver: false,
    }).start();
  }, [loading, leaderboard.length, maxWeeklyPoints, barsAnim]);

  useEffect(() => {
    const target =
      maxWeeklyPoints > 0 ? Math.min(1, myPoints / maxWeeklyPoints) : 0;
    Animated.timing(ringAnim, {
      toValue: target,
      duration: 620,
      easing: Easing.out(Easing.exp),
      useNativeDriver: true,
    }).start();
  }, [myPoints, maxWeeklyPoints, ringAnim]);

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    scrollX.setValue(x);
    if (slideWidth <= 0) return;
    const next = Math.round(x / slideWidth);
    if (next !== page && next >= 0 && next < SLIDE_COUNT) setPage(next);
  };

  const slideStyle = (index: number) => {
    if (slideWidth <= 0) return {};
    const inputRange = [
      (index - 1) * slideWidth,
      index * slideWidth,
      (index + 1) * slideWidth,
    ];
    return {
      opacity: scrollX.interpolate({
        inputRange,
        outputRange: [0.45, 1, 0.45],
        extrapolate: "clamp" as const,
      }),
      transform: [
        { perspective: 900 },
        {
          rotateY: scrollX.interpolate({
            inputRange,
            outputRange: ["28deg", "0deg", "-28deg"],
            extrapolate: "clamp" as const,
          }),
        },
        {
          scale: scrollX.interpolate({
            inputRange,
            outputRange: [0.93, 1, 0.93],
            extrapolate: "clamp" as const,
          }),
        },
      ],
    };
  };

  const ringOffset = ringAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [RING_CIRCUMFERENCE, 0],
  });

  const renderListSlide = () => (
    <Animated.View
      key="list"
      style={[styles.slide, { width: slideWidth }, slideStyle(0)]}
    >
      <Pressable onPress={() => onExpand?.(0)} style={styles.card}>
        <Text style={styles.cardOverline}>Standings</Text>
        {top.length === 0 ? (
          <View style={styles.emptyInline}>
            <Text style={styles.emptyText}>No points yet</Text>
          </View>
        ) : (
          <View style={styles.listGap}>
            {top.map((row, idx) => {
              const rank = idx + 1;
              const fill =
                maxWeeklyPoints > 0
                  ? Math.min(1, row.points / maxWeeklyPoints)
                  : 0;
              const w = barsAnim.interpolate({
                inputRange: [0, 1],
                outputRange: ["0%", `${fill * 100}%`],
              });
              return (
                <View key={row.userId} style={styles.listRow}>
                  <View
                    style={[
                      styles.medal,
                      { backgroundColor: medalColor(rank) },
                    ]}
                  >
                    <Text
                      style={[
                        styles.medalText,
                        rank <= 3 && styles.medalTextTop,
                      ]}
                    >
                      {rank}
                    </Text>
                  </View>
                  <View style={styles.listBody}>
                    <View style={styles.listTopRow}>
                      <Text style={styles.listName} numberOfLines={1}>
                        {row.name}
                      </Text>
                      <Text style={styles.listPts}>{row.points} pts</Text>
                    </View>
                    <View style={styles.barTrack}>
                      <Animated.View style={[styles.barFill, { width: w }]}>
                        <LinearGradient
                          colors={[...ProgressGradient]}
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
      </Pressable>
    </Animated.View>
  );

  const renderBarsSlide = () => {
    // Top 5, sorted ascending so the largest pillar is on the right.
    const ranked = leaderboard.slice(0, BAR_LIMIT);
    const sorted = [...ranked].sort((a, b) => a.points - b.points);
    const max = sorted.length > 0 ? sorted[sorted.length - 1].points : 0;
    return (
      <Animated.View
        key="bars"
        style={[styles.slide, { width: slideWidth }, slideStyle(1)]}
      >
        <Pressable onPress={() => onExpand?.(1)} style={styles.card}>
          <Text style={styles.cardOverline}>Points by member</Text>
          {sorted.length === 0 ? (
            <View style={styles.emptyInline}>
              <Text style={styles.emptyText}>Nothing to chart yet</Text>
            </View>
          ) : (
            <View style={styles.barsRow}>
              {sorted.map((row) => {
                const ratio = max > 0 ? row.points / max : 0;
                const h = barsAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: ["6%", `${Math.max(6, ratio * 100)}%`],
                });
                return (
                  <View key={row.userId} style={styles.barCol}>
                    <Text style={styles.barValue}>{row.points}</Text>
                    <View style={styles.barWell}>
                      <Animated.View style={[styles.barPillar, { height: h }]}>
                        <LinearGradient
                          colors={[...ProgressGradient]}
                          start={{ x: 0, y: 1 }}
                          end={{ x: 0, y: 0 }}
                          style={StyleSheet.absoluteFill}
                        />
                      </Animated.View>
                    </View>
                    <Text style={styles.barLabel} numberOfLines={1}>
                      {row.name}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}
        </Pressable>
      </Animated.View>
    );
  };

  const renderLineSlide = () => {
    // X axis: 7 days of the week. Y axis: cumulative weekly points.
    // One polyline per user; each line ends with the user's name.
    const padL = 28;
    const padR = 64; // room for names at the right edge
    const padT = 16;
    const padB = 28;
    const chartW = Math.max(0, slideWidth - 40); // card padding
    const innerW = Math.max(0, chartW - padL - padR);
    const innerH = 180;
    const totalH = innerH + padT + padB;

    const users = leaderboard.slice(0, TOP_LIMIT);
    let yMax = 0;
    for (const u of users) {
      const series = weeklyByUserDay[u.userId] ?? [];
      for (const v of series) if (v > yMax) yMax = v;
    }
    if (yMax <= 0) yMax = 1;

    const xFor = (dayIdx: number) => padL + (dayIdx / 6) * innerW;
    const yFor = (val: number) => padT + innerH - (val / yMax) * innerH;

    return (
      <Animated.View
        key="line"
        style={[styles.slide, { width: slideWidth }, slideStyle(2)]}
      >
        <Pressable onPress={() => onExpand?.(2)} style={styles.card}>
          <Text style={styles.cardOverline}>Daily progress</Text>
          {users.length === 0 ? (
            <View style={styles.emptyInline}>
              <Text style={styles.emptyText}>Not enough data</Text>
            </View>
          ) : (
            <View style={styles.lineWrap}>
              <Svg
                width={chartW}
                height={totalH}
                viewBox={`0 0 ${chartW} ${totalH}`}
              >
                {[0, 0.5, 1].map((g, i) => (
                  <Polyline
                    key={`grid-${i}`}
                    points={`${padL},${padT + innerH * g} ${padL + innerW},${padT + innerH * g}`}
                    fill="none"
                    stroke={Colors.progressTrack}
                    strokeWidth={1}
                  />
                ))}

                {DAY_LABELS.map((d, i) => (
                  <SvgText
                    key={`day-${i}`}
                    x={xFor(i)}
                    y={padT + innerH + 18}
                    fontSize={10}
                    fill={Colors.text.secondary}
                    textAnchor="middle"
                  >
                    {d}
                  </SvgText>
                ))}

                {users.map((u, idx) => {
                  const series = weeklyByUserDay[u.userId] ?? [];
                  if (series.length === 0) return null;
                  const isMe = u.userId === myUserId;
                  const color = isMe
                    ? Colors.brand.greenBright
                    : LINE_COLORS[idx % LINE_COLORS.length];
                  const pts = series
                    .map((v, i) => `${xFor(i)},${yFor(v)}`)
                    .join(" ");
                  const lastIdx = series.length - 1;
                  const lastX = xFor(lastIdx);
                  const lastY = yFor(series[lastIdx]);
                  return (
                    <React.Fragment key={u.userId}>
                      <Polyline
                        points={pts}
                        fill="none"
                        stroke={color}
                        strokeWidth={isMe ? 2.5 : 2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        opacity={isMe ? 1 : 0.85}
                      />
                      <Circle
                        cx={lastX}
                        cy={lastY}
                        r={isMe ? 4 : 3}
                        fill={color}
                      />
                      <SvgText
                        x={lastX + 6}
                        y={lastY + 3}
                        fontSize={10}
                        fontWeight={isMe ? "700" : "500"}
                        fill={color}
                      >
                        {u.name}
                      </SvgText>
                    </React.Fragment>
                  );
                })}
              </Svg>
              <Text style={styles.axisLabel}>Day</Text>
            </View>
          )}
        </Pressable>
      </Animated.View>
    );
  };

  const renderRingSlide = () => {
    const pct =
      maxWeeklyPoints > 0 ? Math.min(1, myPoints / maxWeeklyPoints) : 0;
    return (
      <Animated.View
        key="ring"
        style={[styles.slide, { width: slideWidth }, slideStyle(3)]}
      >
        <Pressable
          onPress={() => onExpand?.(3)}
          style={[styles.card, styles.ringCard]}
        >
          <Text style={styles.cardOverline}>Your week</Text>
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
              <Text style={styles.ringNumber}>{myPoints}</Text>
              <Text style={styles.ringDenom}>
                of {maxWeeklyPoints || "—"} pts
              </Text>
            </View>
          </View>
          <Text style={styles.ringHelper}>
            {Math.round(pct * 100)}% of weekly ceiling
          </Text>
        </Pressable>
      </Animated.View>
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
        {renderListSlide()}
        {renderBarsSlide()}
        {renderLineSlide()}
        {renderRingSlide()}
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
    padding: 20,
    borderRadius: Radius.card,
    gap: 14,
    height: CARD_HEIGHT,
    overflow: "hidden",
  },
  centered: {
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  cardOverline: {
    ...Typography.overline,
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },

  listGap: {
    gap: 14,
  },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  medal: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  medalText: {
    ...Typography.section,
    fontSize: 14,
    color: Colors.text.primary,
    fontWeight: "700",
  },
  medalTextTop: {
    color: Colors.bg.base,
  },
  listBody: { flex: 1, gap: 6 },
  listTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: 10,
  },
  listName: { ...Typography.body, fontWeight: "600", flex: 1 },
  listPts: { ...Typography.label },
  barTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.progressTrack,
    overflow: "hidden",
  },
  barFill: { height: "100%", borderRadius: 2, overflow: "hidden" },

  barsRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 10,
    height: 200,
  },
  barCol: {
    flex: 1,
    alignItems: "center",
    gap: 6,
    height: "100%",
  },
  barValue: {
    ...Typography.caption,
    fontWeight: "600",
    color: Colors.text.primary,
  },
  barWell: {
    flex: 1,
    width: "100%",
    backgroundColor: Colors.progressTrack,
    borderRadius: 8,
    overflow: "hidden",
    justifyContent: "flex-end",
  },
  barPillar: {
    width: "100%",
    borderRadius: 8,
    overflow: "hidden",
  },
  barLabel: {
    ...Typography.caption,
    width: "100%",
    textAlign: "center",
  },

  lineWrap: {
    alignItems: "center",
    gap: 6,
  },
  lineLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  lineLabel: {
    ...Typography.caption,
    flex: 1,
    textAlign: "center",
  },
  lineLabelMe: {
    color: Colors.brand.greenBright,
    fontWeight: "600",
  },
  lineHelper: {
    ...Typography.caption,
  },

  ringCard: {
    alignItems: "center",
    justifyContent: "center",
  },
  ringWrap: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  axisLabel: {
    ...Typography.caption,
    textAlign: "center",
    marginTop: 2,
  },
  ringLabel: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  ringNumber: {
    ...Typography.display,
    fontSize: 48,
    letterSpacing: -0.8,
    lineHeight: 52,
  },
  ringDenom: {
    ...Typography.caption,
  },
  ringHelper: {
    ...Typography.label,
  },

  dotsRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
    marginTop: 12,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.toggleOff,
  },
  dotActive: {
    width: 22,
    backgroundColor: Colors.text.primary,
  },

  emptyInline: {
    paddingVertical: 8,
    alignItems: "center",
    gap: 4,
  },
  emptyText: { ...Typography.label },
  emptyTitle: { ...Typography.body, fontWeight: "600" },
  emptyHelper: { ...Typography.label, textAlign: "center" },
});
