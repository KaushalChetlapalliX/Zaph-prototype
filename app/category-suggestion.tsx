import { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../src/lib/supabase";
import { buildCanonicalCategoryMap } from "../src/lib/categories";
import { Colors, Radius, Spacing, Typography } from "../src/constants/design";
import { STORAGE_KEYS } from "../src/constants/storage";
import { tierLabel } from "../src/lib/questionnaire";
import type {
  MotivationTier,
  SuggestedCategory,
} from "../src/types/questionnaire";

const ICON_CIRCLE = 48;
const CARD_BORDER = 1;

type Category = {
  description: string;
  id: string;
  name: string;
  icon: string;
};

export default function CategorySuggestionScreen() {
  const params = useLocalSearchParams<{
    suggestions?: string;
    motivationScore?: string;
    motivationTier?: string;
  }>();

  const initialSuggestions = useMemo<SuggestedCategory[]>(() => {
    const raw = Array.isArray(params.suggestions)
      ? params.suggestions[0]
      : params.suggestions;
    if (!raw) return [];
    try {
      return JSON.parse(raw) as SuggestedCategory[];
    } catch {
      return [];
    }
  }, [params.suggestions]);

  const tier: MotivationTier = useMemo(() => {
    const raw = Array.isArray(params.motivationTier)
      ? params.motivationTier[0]
      : params.motivationTier;
    return raw === "high" || raw === "low" ? raw : "medium";
  }, [params.motivationTier]);

  const [suggestions, setSuggestions] =
    useState<SuggestedCategory[]>(initialSuggestions);
  const [allCategories, setAllCategories] = useState<Category[]>([]);
  const [swapOpen, setSwapOpen] = useState(false);

  const mountAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(mountAnim, {
      toValue: 1,
      duration: 480,
      easing: Easing.out(Easing.exp),
      useNativeDriver: true,
    }).start();
  }, [mountAnim]);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const { data } = await supabase
        .from("categories")
        .select("id, name, icon, description")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (alive && data) {
        setAllCategories(
          Array.from(
            buildCanonicalCategoryMap(data as unknown as Category[]).values(),
          ),
        );
      }
    };
    load();
    return () => {
      alive = false;
    };
  }, []);

  const persistAndContinue = async () => {
    await AsyncStorage.setItem(STORAGE_KEYS.MOTIVATION_TIER, tier);
    await AsyncStorage.setItem(
      STORAGE_KEYS.SUGGESTED_CATEGORIES,
      JSON.stringify(suggestions),
    );
    router.replace("/create-circle");
  };

  const replaceLowestWith = (cat: Category) => {
    setSuggestions((prev) => {
      if (prev.some((s) => s.id === cat.id)) return prev;
      if (prev.length === 0) return prev;
      const sorted = [...prev].sort((a, b) => a.score - b.score);
      const drop = sorted[0];
      const next = prev.map((s) =>
        s.id === drop.id
          ? {
              id: cat.id,
              name: cat.name,
              icon: String(cat.icon ?? ""),
              description: String(cat.description ?? ""),
              score: drop.score,
              suggestedSubtasks: [],
            }
          : s,
      );
      return next;
    });
    setSwapOpen(false);
  };

  const headerOpacity = mountAnim;
  const headerTranslate = mountAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [16, 0],
  });

  const swapPool = allCategories.filter(
    (c) => !suggestions.some((s) => s.id === c.id),
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
      <Animated.View
        style={[
          styles.header,
          {
            opacity: headerOpacity,
            transform: [{ translateY: headerTranslate }],
          },
        ]}
      >
        <Text style={styles.overline}>YOUR PROFILE</Text>
        <Text style={styles.title}>Your categories.</Text>
        <View style={styles.tierPill}>
          <Text style={styles.tierText}>{tierLabel(tier)}</Text>
        </View>
      </Animated.View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {suggestions.length === 0 ? (
          <View style={styles.emptyBlock}>
            <Text style={styles.emptyTitle}>No suggestions yet</Text>
            <Text style={styles.emptyText}>
              Finish the questionnaire to see your matches.
            </Text>
          </View>
        ) : (
          suggestions.map((s) => (
            <View key={s.id} style={styles.card}>
              <View style={styles.cardTop}>
                <View style={styles.iconCircle}>
                  <Text style={styles.iconText}>{s.icon}</Text>
                </View>
                <View style={styles.cardBody}>
                  <Text style={styles.cardName} numberOfLines={1}>
                    {s.name}
                  </Text>
                  <Text style={styles.cardDesc} numberOfLines={2}>
                    {s.description}
                  </Text>
                </View>
              </View>
              {s.suggestedSubtasks.length > 0 ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.pillsRow}
                >
                  {s.suggestedSubtasks.map((title) => (
                    <View key={title} style={styles.pill}>
                      <Text style={styles.pillText} numberOfLines={1}>
                        {title}
                      </Text>
                    </View>
                  ))}
                </ScrollView>
              ) : null}
            </View>
          ))
        )}

        <Pressable
          onPress={() => setSwapOpen(true)}
          style={({ pressed }) => [
            styles.swapLink,
            pressed && styles.swapLinkPressed,
          ]}
          hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
        >
          <Text style={styles.swapText}>Not feeling one of these? Swap →</Text>
        </Pressable>
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          onPress={persistAndContinue}
          style={({ pressed }) => [
            styles.primary,
            pressed && styles.primaryPressed,
          ]}
        >
          <Text style={styles.primaryText}>Let&apos;s go</Text>
        </Pressable>
      </View>

      <Modal
        visible={swapOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setSwapOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setSwapOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Swap a category</Text>
            <Text style={styles.sheetHelper}>
              Tap one. We&apos;ll replace your lowest-scored pick.
            </Text>
            <ScrollView
              style={styles.sheetList}
              showsVerticalScrollIndicator={false}
            >
              {swapPool.map((c) => (
                <Pressable
                  key={c.id}
                  onPress={() => replaceLowestWith(c)}
                  style={({ pressed }) => [
                    styles.swapRow,
                    pressed && styles.swapRowPressed,
                  ]}
                >
                  <View style={styles.iconCircleSm}>
                    <Text style={styles.iconText}>{c.icon}</Text>
                  </View>
                  <View style={styles.swapRowBody}>
                    <Text style={styles.swapRowName}>{c.name}</Text>
                    <Text style={styles.swapRowDesc} numberOfLines={1}>
                      {c.description}
                    </Text>
                  </View>
                  <Ionicons
                    name="swap-horizontal"
                    size={18}
                    color={Colors.text.secondary}
                  />
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.bg.base },
  header: {
    paddingHorizontal: Spacing.screenHorizontal,
    paddingTop: Spacing.screenTop,
    paddingBottom: 12,
    gap: 8,
  },
  overline: { ...Typography.overline, letterSpacing: 1.6 },
  title: { ...Typography.display, fontSize: 30 },
  tierPill: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    backgroundColor: Colors.bg.card,
    marginTop: 4,
  },
  tierText: {
    ...Typography.caption,
    color: Colors.text.primary,
    fontWeight: "600",
  },

  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: Spacing.screenHorizontal,
    paddingBottom: 24,
    gap: Spacing.rowGap,
  },
  card: {
    backgroundColor: Colors.bg.card,
    borderRadius: Radius.card,
    padding: Spacing.cardPadding,
    gap: 12,
    borderWidth: CARD_BORDER,
    borderColor: Colors.brand.green,
  },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 14 },
  iconCircle: {
    width: ICON_CIRCLE,
    height: ICON_CIRCLE,
    borderRadius: ICON_CIRCLE / 2,
    backgroundColor: Colors.bg.cardActive,
    alignItems: "center",
    justifyContent: "center",
  },
  iconCircleSm: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.bg.cardActive,
    alignItems: "center",
    justifyContent: "center",
  },
  iconText: { fontSize: 24, lineHeight: 28 },
  cardBody: { flex: 1, gap: 2 },
  cardName: { ...Typography.section },
  cardDesc: { ...Typography.label },
  pillsRow: { gap: 8, paddingRight: 8 },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    backgroundColor: Colors.bg.cardActive,
  },
  pillText: { ...Typography.caption, color: Colors.text.primary },

  swapLink: { paddingVertical: 8, alignSelf: "flex-start" },
  swapLinkPressed: { opacity: 0.6 },
  swapText: { ...Typography.label, color: Colors.text.primary },

  emptyBlock: { alignItems: "center", paddingVertical: 32, gap: 6 },
  emptyTitle: { ...Typography.body, fontWeight: "600" },
  emptyText: { ...Typography.label, textAlign: "center" },

  footer: {
    paddingHorizontal: Spacing.screenHorizontal,
    paddingTop: 8,
    paddingBottom: 12,
    backgroundColor: Colors.bg.base,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  primary: {
    height: 54,
    borderRadius: Radius.pill,
    backgroundColor: Colors.brand.green,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryPressed: { opacity: 0.8 },
  primaryText: {
    ...Typography.body,
    color: Colors.brand.greenText,
    fontWeight: "600",
  },

  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: Colors.bg.card,
    borderTopLeftRadius: Radius.card,
    borderTopRightRadius: Radius.card,
    padding: Spacing.cardPadding,
    paddingBottom: 24,
    maxHeight: "75%",
    gap: 8,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: "center",
    marginBottom: 8,
  },
  sheetTitle: { ...Typography.section },
  sheetHelper: { ...Typography.label, marginBottom: 8 },
  sheetList: { maxHeight: 480 },
  swapRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: Radius.cardSm,
  },
  swapRowPressed: { backgroundColor: Colors.bg.cardActive },
  swapRowBody: { flex: 1, gap: 2 },
  swapRowName: { ...Typography.body, fontWeight: "500" },
  swapRowDesc: { ...Typography.caption },
});
