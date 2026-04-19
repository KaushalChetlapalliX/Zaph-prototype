import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Image,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { supabase } from "../src/lib/supabase";
import {
  Colors,
  ProgressGradient,
  Radius,
  Spacing,
  Typography,
} from "../src/constants/design";

const PAGE_COUNT = 3;
const SAMPLE_CODE = "2847";

type Standing = {
  rank: 1 | 2 | 3;
  name: string;
  pts: number;
  fill: number;
  medal: string;
};

const LEADERBOARD: readonly Standing[] = [
  { rank: 1, name: "Maya", pts: 42, fill: 1.0, medal: Colors.accent.gold },
  { rank: 2, name: "Jag", pts: 37, fill: 0.88, medal: Colors.accent.silver },
  { rank: 3, name: "You", pts: 31, fill: 0.74, medal: Colors.accent.bronze },
];

export default function Index() {
  const { width } = useWindowDimensions();
  const scrollRef = useRef<ScrollView | null>(null);
  const [page, setPage] = useState(0);
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      if (data.session?.user) {
        router.replace("/user-home");
        return;
      }
      setCheckingAuth(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  const mountAnim = useRef(new Animated.Value(0)).current;
  const digitAnims = useRef(
    SAMPLE_CODE.split("").map(() => new Animated.Value(0)),
  ).current;
  const barAnims = useRef(LEADERBOARD.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    Animated.timing(mountAnim, {
      toValue: 1,
      duration: 520,
      easing: Easing.out(Easing.exp),
      useNativeDriver: true,
    }).start();

    Animated.stagger(
      110,
      digitAnims.map((v) =>
        Animated.timing(v, {
          toValue: 1,
          duration: 380,
          easing: Easing.out(Easing.exp),
          useNativeDriver: true,
        }),
      ),
    ).start();

    Animated.stagger(
      120,
      barAnims.map((v) =>
        Animated.timing(v, {
          toValue: 1,
          duration: 620,
          delay: 200,
          easing: Easing.out(Easing.exp),
          useNativeDriver: false,
        }),
      ),
    ).start();
  }, [mountAnim, digitAnims, barAnims]);

  const goToPage = (nextPage: number) => {
    scrollRef.current?.scrollTo({ x: nextPage * width, animated: true });
    setPage(nextPage);
  };

  const handleNext = () => {
    if (page >= PAGE_COUNT - 1) {
      router.replace("/welcome");
      return;
    }
    goToPage(page + 1);
  };

  const handleSkip = () => {
    router.replace("/welcome");
  };

  const handleScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const nextPage = Math.round(event.nativeEvent.contentOffset.x / width);
    if (nextPage !== page) setPage(nextPage);
  };

  const isLast = page === PAGE_COUNT - 1;

  const mountOpacity = mountAnim;
  const mountTranslate = mountAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [18, 0],
  });

  if (checkingAuth) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.splashCenter}>
          <Image
            source={require("../assets/icon.png")}
            style={styles.splashLogo}
            resizeMode="contain"
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.topRow}>
        <Text style={styles.brand}>ZAPH</Text>
        {!isLast ? (
          <Pressable
            onPress={handleSkip}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Text style={styles.skip}>Skip</Text>
          </Pressable>
        ) : (
          <View style={styles.skipPlaceholder} />
        )}
      </View>

      <Animated.View
        style={[
          styles.content,
          {
            opacity: mountOpacity,
            transform: [{ translateY: mountTranslate }],
          },
        ]}
      >
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          bounces={false}
          decelerationRate="fast"
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={handleScrollEnd}
          scrollEventThrottle={16}
          overScrollMode="never"
        >
          <View style={[styles.page, { width }]}>
            <View style={styles.visualArea}>
              <Image
                source={require("../assets/icon.png")}
                style={styles.logo}
                resizeMode="contain"
              />
            </View>
            <View style={styles.copyArea}>
              <Text style={styles.overline}>Welcome</Text>
              <Text style={styles.headline}>
                Show up for your goals. Every week.
              </Text>
              <Text style={styles.body}>
                A social accountability game for small friend groups.
              </Text>
            </View>
          </View>

          <View style={[styles.page, { width }]}>
            <View style={styles.visualArea}>
              <View style={styles.codeRow}>
                {SAMPLE_CODE.split("").map((digit, idx) => {
                  const opacity = digitAnims[idx];
                  const translateY = digitAnims[idx].interpolate({
                    inputRange: [0, 1],
                    outputRange: [10, 0],
                  });
                  return (
                    <Animated.View
                      key={idx}
                      style={[
                        styles.codeBox,
                        { opacity, transform: [{ translateY }] },
                      ]}
                    >
                      <Text style={styles.codeDigit}>{digit}</Text>
                    </Animated.View>
                  );
                })}
              </View>
              <Text style={styles.codeHint}>4-digit circle code</Text>
            </View>
            <View style={styles.copyArea}>
              <Text style={styles.overline}>Step 1</Text>
              <Text style={styles.headline}>Form a circle.</Text>
              <Text style={styles.body}>
                Create one and share the code with your friends, or join theirs.
              </Text>
            </View>
          </View>

          <View style={[styles.page, { width }]}>
            <View style={styles.visualArea}>
              <View style={styles.board}>
                {LEADERBOARD.map((row, idx) => {
                  const widthAnim = barAnims[idx].interpolate({
                    inputRange: [0, 1],
                    outputRange: ["0%", `${row.fill * 100}%`],
                  });
                  return (
                    <View key={row.rank} style={styles.boardRow}>
                      <View
                        style={[styles.medal, { backgroundColor: row.medal }]}
                      >
                        <Text style={styles.medalText}>{row.rank}</Text>
                      </View>
                      <View style={styles.boardBody}>
                        <View style={styles.boardTop}>
                          <Text style={styles.boardName}>{row.name}</Text>
                          <Text style={styles.boardPts}>{row.pts} pts</Text>
                        </View>
                        <View style={styles.barTrack}>
                          <Animated.View
                            style={[styles.barFill, { width: widthAnim }]}
                          >
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
            </View>
            <View style={styles.copyArea}>
              <Text style={styles.overline}>Step 2</Text>
              <Text style={styles.headline}>Finish the week on top.</Text>
              <Text style={styles.body}>
                Everyone picks tasks. Whoever finishes the most wins the week.
              </Text>
            </View>
          </View>
        </ScrollView>
      </Animated.View>

      <View style={styles.footer}>
        <View style={styles.dotsRow}>
          {Array.from({ length: PAGE_COUNT }).map((_, index) => (
            <View
              key={index}
              style={[styles.dot, index === page ? styles.dotActive : null]}
            />
          ))}
        </View>

        <Pressable
          onPress={handleNext}
          style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
        >
          <Text style={styles.ctaText}>{isLast ? "Get started" : "Next"}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const CODE_BOX_SIZE = 64;
const CTA_HEIGHT = 54;

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.bg.base,
  },
  topRow: {
    paddingHorizontal: Spacing.screenHorizontal,
    paddingTop: 4,
    paddingBottom: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  brand: {
    ...Typography.overline,
    color: Colors.text.primary,
    letterSpacing: 3,
  },
  skip: {
    ...Typography.label,
    color: Colors.text.secondary,
  },
  skipPlaceholder: {
    width: 32,
    height: 16,
  },
  content: {
    flex: 1,
  },
  page: {
    paddingHorizontal: Spacing.screenHorizontal,
    paddingTop: 16,
    paddingBottom: 32,
    justifyContent: "space-between",
  },
  visualArea: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 24,
  },
  copyArea: {
    gap: 10,
    paddingBottom: 8,
  },
  overline: {
    ...Typography.overline,
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  headline: {
    ...Typography.title,
    fontSize: 32,
    lineHeight: 38,
    letterSpacing: -0.4,
    maxWidth: 340,
  },
  body: {
    ...Typography.label,
    lineHeight: 20,
    maxWidth: 340,
  },

  logo: {
    width: 260,
    height: 260,
  },
  splashCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  splashLogo: {
    width: 220,
    height: 220,
  },

  codeRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 18,
  },
  codeBox: {
    width: CODE_BOX_SIZE,
    height: CODE_BOX_SIZE,
    borderRadius: Radius.cardSm,
    backgroundColor: Colors.bg.card,
    alignItems: "center",
    justifyContent: "center",
  },
  codeDigit: {
    ...Typography.display,
    fontSize: 36,
    letterSpacing: -1,
  },
  codeHint: {
    ...Typography.overline,
    textTransform: "uppercase",
    letterSpacing: 1.4,
  },

  board: {
    width: "100%",
    maxWidth: 360,
    gap: 14,
    backgroundColor: Colors.bg.card,
    padding: 20,
    borderRadius: Radius.card,
  },
  boardRow: {
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
    color: Colors.bg.base,
    fontWeight: "700",
  },
  boardBody: {
    flex: 1,
    gap: 6,
  },
  boardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  boardName: {
    ...Typography.body,
    fontWeight: "600",
  },
  boardPts: {
    ...Typography.label,
  },
  barTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.progressTrack,
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    borderRadius: 2,
    overflow: "hidden",
  },

  footer: {
    paddingHorizontal: Spacing.screenHorizontal,
    paddingTop: 16,
    paddingBottom: 24,
    gap: 20,
  },
  dotsRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.toggleOff,
  },
  dotActive: {
    width: 24,
    backgroundColor: Colors.text.primary,
  },
  cta: {
    height: CTA_HEIGHT,
    backgroundColor: Colors.brand.green,
    borderRadius: Radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaPressed: {
    opacity: 0.8,
  },
  ctaText: {
    ...Typography.body,
    color: Colors.brand.greenText,
    fontWeight: "600",
  },
});
