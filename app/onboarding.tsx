import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Animated,
  Easing,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../src/lib/supabase";
import {
  Colors,
  ProgressGradient,
  Radius,
  Spacing,
  Typography,
} from "../src/constants/design";

type Level = "easy" | "medium" | "hard";

type LevelCopy = {
  id: Level;
  overline: string;
  count: string;
  descriptor: string;
  intensity: number;
  dot: string;
};

const LEVELS: readonly LevelCopy[] = [
  {
    id: "easy",
    overline: "Easy",
    count: "5–6",
    descriptor: "tasks every day",
    intensity: 0.33,
    dot: Colors.brand.greenBright,
  },
  {
    id: "medium",
    overline: "Medium",
    count: "8–10",
    descriptor: "tasks every day",
    intensity: 0.66,
    dot: Colors.accent.gold,
  },
  {
    id: "hard",
    overline: "Hard",
    count: "10–12",
    descriptor: "tasks every day",
    intensity: 1,
    dot: Colors.accent.pink,
  },
];

export default function Onboarding() {
  const [loading, setLoading] = useState<Level | null>(null);

  const mountAnims = useRef(LEVELS.map(() => new Animated.Value(0))).current;

  const params = useLocalSearchParams<{
    code?: string;
    circleName?: string;
    name?: string;
  }>();

  const code = Array.isArray(params.code) ? params.code[0] : params.code;

  const rawName =
    (Array.isArray(params.circleName) ? params.circleName[0] : params.circleName) ??
    (Array.isArray(params.name) ? params.name[0] : params.name) ??
    "";

  const circleName = String(rawName).trim();

  useEffect(() => {
    Animated.stagger(
      90,
      mountAnims.map((v) =>
        Animated.timing(v, {
          toValue: 1,
          duration: 520,
          easing: Easing.out(Easing.exp),
          useNativeDriver: true,
        }),
      ),
    ).start();
  }, [mountAnims]);

  const goNext = async (level: Level) => {
    if (loading) return;

    if (!code || code === "XXXX") {
      Alert.alert("Missing code", "Go back and generate a circle code first.");
      return;
    }

    if (!circleName) {
      Alert.alert("Circle name required", "Go back and enter a circle name.");
      return;
    }

    try {
      setLoading(level);

      const { data, error } = await supabase.rpc("create_circle_with_code", {
        difficulty: level,
        desired_code: code,
        circle_name: circleName,
      });

      if (error) {
        Alert.alert("Error", error.message);
        return;
      }

      const row = Array.isArray(data) ? data[0] : data;

      // Supabase RPC returns unstructured row shape; normalize across old + new
      // return contracts: new = out_circle_id/out_code, old = circle_id/code.
      const rpcRow = (row ?? {}) as Record<string, string | undefined>;
      const circleId = String(
        rpcRow.out_circle_id ?? rpcRow.circle_id ?? rpcRow.id ?? "",
      );
      const circleCode = String(rpcRow.out_code ?? rpcRow.code ?? "");

      if (!circleId || circleId === "undefined") {
        Alert.alert("Error", "Circle was created but circle id was not returned.");
        return;
      }

      try {
        await AsyncStorage.setItem("activeCircleId", circleId);
        if (circleCode) await AsyncStorage.setItem("activeCircleCode", circleCode);
        await AsyncStorage.setItem("activeDifficulty", level);
        await AsyncStorage.setItem("activeCircleName", circleName);
      } catch {
        // ignore
      }

      router.push({
        pathname: "/circle-members",
        params: { circleId, circleCode, level, circleName },
      });
    } finally {
      setLoading(null);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.overline}>Step 3 · Difficulty</Text>
          <Text style={styles.question}>Pick your pace.</Text>
          <Text style={styles.subtitle}>
            Everyone in the circle runs the same level this week. You can change it next Monday.
          </Text>
        </View>

        <View style={styles.stack}>
          {LEVELS.map((lvl, idx) => {
            const isLoading = loading === lvl.id;
            const disabled = loading !== null;

            const opacity = mountAnims[idx];
            const translateY = mountAnims[idx].interpolate({
              inputRange: [0, 1],
              outputRange: [18, 0],
            });

            return (
              <Animated.View
                key={lvl.id}
                style={{ opacity, transform: [{ translateY }] }}
              >
                <Pressable
                  onPress={() => goNext(lvl.id)}
                  disabled={disabled}
                  style={({ pressed }) => [
                    styles.card,
                    (pressed || isLoading) && !disabled && styles.cardPressed,
                    isLoading && styles.cardActive,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`${lvl.overline} difficulty, ${lvl.count} ${lvl.descriptor}`}
                  accessibilityState={{ busy: isLoading, disabled }}
                >
                  <View style={styles.cardHead}>
                    <View style={styles.tierTag}>
                      <View style={[styles.dot, { backgroundColor: lvl.dot }]} />
                      <Text style={styles.tierLabel}>{lvl.overline}</Text>
                    </View>
                    {isLoading ? (
                      <ActivityIndicator color={Colors.text.primary} size="small" />
                    ) : null}
                  </View>

                  <View style={styles.cardBody}>
                    <Text style={styles.count}>{lvl.count}</Text>
                    <Text style={styles.descriptor}>{lvl.descriptor}</Text>
                  </View>

                  <View style={styles.track}>
                    <LinearGradient
                      colors={[...ProgressGradient]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={StyleSheet.absoluteFill}
                    />
                    {lvl.intensity < 1 ? (
                      <View
                        style={[
                          styles.trackMask,
                          { width: `${(1 - lvl.intensity) * 100}%` },
                        ]}
                      />
                    ) : null}
                  </View>
                </Pressable>
              </Animated.View>
            );
          })}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.bg.base },
  container: {
    flex: 1,
    paddingHorizontal: Spacing.screenHorizontal,
    paddingTop: Spacing.screenTop,
    paddingBottom: 40,
    gap: Spacing.sectionGap,
  },
  header: {
    gap: 10,
    paddingTop: 8,
  },
  overline: {
    ...Typography.overline,
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  question: {
    ...Typography.title,
    fontSize: 32,
    letterSpacing: -0.4,
  },
  subtitle: {
    ...Typography.label,
    maxWidth: 320,
    lineHeight: 20,
  },
  stack: {
    gap: Spacing.rowGap,
  },
  card: {
    backgroundColor: Colors.bg.card,
    borderRadius: Radius.card,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 20,
    gap: 18,
  },
  cardPressed: {
    backgroundColor: Colors.bg.cardActive,
  },
  cardActive: {
    backgroundColor: Colors.bg.cardActive,
  },
  cardHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  tierTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  tierLabel: {
    ...Typography.overline,
    textTransform: "uppercase",
    letterSpacing: 1.4,
    color: Colors.text.primary,
  },
  cardBody: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 12,
  },
  count: {
    ...Typography.display,
    fontSize: 44,
    letterSpacing: -1,
  },
  descriptor: {
    ...Typography.body,
    color: Colors.text.secondary,
  },
  track: {
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
    backgroundColor: Colors.progressTrack,
  },
  trackMask: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: Colors.progressTrack,
  },
});
