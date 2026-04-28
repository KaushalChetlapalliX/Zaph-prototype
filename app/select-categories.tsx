import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Easing,
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
import { Colors, Radius, Spacing, Typography } from "../src/constants/design";
import { STORAGE_KEYS } from "../src/constants/storage";
import type { Category } from "../src/types/categories";
import type { SuggestedCategory } from "../src/types/questionnaire";

type Level = "easy" | "medium" | "hard";

type ExistingSelectionRow = {
  category_id: string;
};

const SELECTION_BORDER = 2;
const PRIMARY_HEIGHT = 54;
const TILE_GAP = Spacing.gridGap;

const SCREEN_WIDTH = Dimensions.get("window").width;
const TILE_WIDTH = (SCREEN_WIDTH - Spacing.screenHorizontal * 2 - TILE_GAP) / 2;

function countForLevel(l: Level): number {
  if (l === "medium") return 3;
  if (l === "hard") return 5;
  return 2;
}

export default function SelectCategoriesScreen() {
  const params = useLocalSearchParams<{
    level?: string;
    circleId?: string;
    circleCode?: string;
  }>();

  const levelRaw = Array.isArray(params.level) ? params.level[0] : params.level;
  const circleIdRaw = Array.isArray(params.circleId)
    ? params.circleId[0]
    : params.circleId;

  const level: Level =
    levelRaw === "medium" || levelRaw === "hard" || levelRaw === "easy"
      ? levelRaw
      : "easy";

  const requiredCount = useMemo(() => countForLevel(level), [level]);

  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const headerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(headerAnim, {
      toValue: 1,
      duration: 520,
      easing: Easing.out(Easing.exp),
      useNativeDriver: true,
    }).start();
  }, [headerAnim]);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      const { data: catRows, error: catErr } = await supabase
        .from("categories")
        .select("id, name, description, icon, sort_order, is_active")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });

      if (!alive) return;

      if (catErr || !catRows) {
        setLoading(false);
        return;
      }

      setCategories(catRows as unknown as Category[]);

      let preselected: string[] = [];

      if (circleIdRaw && circleIdRaw.trim().length > 0) {
        const { data: userData } = await supabase.auth.getUser();
        const uid = userData.user?.id;

        if (uid) {
          const { data: existing } = await supabase
            .from("circle_member_category_selections")
            .select("category_id")
            .eq("circle_id", circleIdRaw)
            .eq("user_id", uid);

          if (alive && existing) {
            const rows = existing as unknown as ExistingSelectionRow[];
            preselected = rows.map((r) => String(r.category_id));
          }
        }
      }

      if (alive && preselected.length === 0) {
        try {
          const stored = await AsyncStorage.getItem(
            STORAGE_KEYS.SUGGESTED_CATEGORIES,
          );
          if (stored) {
            const arr = JSON.parse(stored) as SuggestedCategory[];
            const validIds = arr
              .map((s) => s.id)
              .filter((id) =>
                (catRows as unknown as Category[]).some((c) => c.id === id),
              )
              .slice(0, requiredCount);
            preselected = validIds;
          }
        } catch (e) {
          console.error(
            "[select-categories] read suggested categories:",
            (e as Error).message,
          );
        }
      }

      if (alive) setSelectedIds(preselected);

      setLoading(false);
    };

    load();

    return () => {
      alive = false;
    };
  }, [circleIdRaw, requiredCount]);

  const toggle = (id: string) => {
    const isSelected = selectedIds.includes(id);

    if (isSelected) {
      setSelectedIds((prev) => prev.filter((x) => x !== id));
      return;
    }

    if (selectedIds.length >= requiredCount) return;

    setSelectedIds((prev) => [...prev, id]);
  };

  const handleConfirm = async () => {
    if (saving) return;

    if (!circleIdRaw || circleIdRaw.trim().length === 0) {
      Alert.alert("Missing circle", "No circleId was provided to this screen.");
      return;
    }

    if (selectedIds.length !== requiredCount) {
      Alert.alert(
        "Pick more categories",
        `Choose ${requiredCount} categor${requiredCount === 1 ? "y" : "ies"} to continue.`,
      );
      return;
    }

    setSaving(true);

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    const uid = userData?.user?.id;

    if (userErr || !uid) {
      setSaving(false);
      Alert.alert("Not signed in", "Please log in again.");
      return;
    }

    const { error: delErr } = await supabase
      .from("circle_member_category_selections")
      .delete()
      .eq("circle_id", circleIdRaw)
      .eq("user_id", uid);

    if (delErr) {
      setSaving(false);
      console.error(
        "[select-categories] delete prior selections:",
        delErr.message,
      );
      Alert.alert("Save failed", "Could not reset prior picks.");
      return;
    }

    const rows = selectedIds.map((category_id) => ({
      circle_id: circleIdRaw,
      user_id: uid,
      category_id,
    }));

    const { error: insErr } = await supabase
      .from("circle_member_category_selections")
      .insert(rows);

    if (insErr) {
      setSaving(false);
      console.error("[select-categories] insert selections:", insErr.message);
      Alert.alert("Save failed", insErr.message);
      return;
    }

    const { error: flagErr } = await supabase
      .from("circle_members")
      .update({ categories_selected: true })
      .eq("circle_id", circleIdRaw)
      .eq("user_id", uid);

    if (flagErr) {
      setSaving(false);
      console.error(
        "[select-categories] flag categories_selected:",
        flagErr.message,
      );
      Alert.alert("Save failed", flagErr.message);
      return;
    }

    setSaving(false);

    router.replace({
      pathname: "/loading",
      params: { circleId: circleIdRaw, level },
    });
  };

  const canProceed = selectedIds.length === requiredCount && !saving;
  const countLabel = `${selectedIds.length} / ${requiredCount} selected`;
  const levelCopy =
    level === "hard" ? "Hard" : level === "medium" ? "Medium" : "Easy";

  const headerTranslate = headerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [12, 0],
  });

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
      <Animated.View
        style={[
          styles.header,
          { opacity: headerAnim, transform: [{ translateY: headerTranslate }] },
        ]}
      >
        <View style={styles.headerTopRow}>
          <Text style={styles.overline}>{levelCopy.toUpperCase()} TRACK</Text>
          <View style={styles.countPill}>
            <Text style={styles.countText}>{countLabel}</Text>
          </View>
        </View>
        <Text style={styles.title}>Pick your categories.</Text>
        <Text style={styles.helper}>
          We&apos;ve picked these for you — adjust if needed.
        </Text>
      </Animated.View>

      {loading ? (
        <View style={styles.statusBlock}>
          <ActivityIndicator color={Colors.text.primary} size="small" />
          <Text style={styles.statusText}>Loading categories…</Text>
        </View>
      ) : categories.length === 0 ? (
        <View style={styles.statusBlock}>
          <Text style={styles.statusTitle}>No categories yet</Text>
          <Text style={styles.statusText}>
            Categories are still being seeded. Try again in a moment.
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.grid}>
            {categories.map((c) => {
              const isSelected = selectedIds.includes(c.id);
              return (
                <Pressable
                  key={c.id}
                  onPress={() => toggle(c.id)}
                  disabled={saving}
                  style={({ pressed }) => [
                    styles.tile,
                    isSelected && styles.tileSelected,
                    pressed && !isSelected && styles.tilePressed,
                  ]}
                >
                  <View style={styles.tileTop}>
                    <Text style={styles.tileIcon} numberOfLines={1}>
                      {c.icon}
                    </Text>
                    {isSelected ? (
                      <Ionicons
                        name="checkmark-circle"
                        size={20}
                        color={Colors.brand.greenBright}
                      />
                    ) : (
                      <View style={styles.tileDot} />
                    )}
                  </View>
                  <Text style={styles.tileName} numberOfLines={1}>
                    {c.name}
                  </Text>
                  <Text style={styles.tileDesc} numberOfLines={2}>
                    {c.description}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      )}

      <View style={styles.footer}>
        <Pressable
          onPress={handleConfirm}
          disabled={!canProceed}
          style={({ pressed }) => [
            styles.primary,
            !canProceed && styles.primaryDisabled,
            pressed && canProceed && styles.primaryPressed,
          ]}
        >
          {saving ? (
            <ActivityIndicator color={Colors.brand.greenText} size="small" />
          ) : (
            <Text style={styles.primaryText}>
              {selectedIds.length < requiredCount
                ? `Pick ${requiredCount - selectedIds.length} more`
                : "Confirm categories"}
            </Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.bg.base,
  },
  header: {
    paddingHorizontal: Spacing.screenHorizontal,
    paddingTop: Spacing.screenTop,
    paddingBottom: 18,
    gap: 6,
  },
  headerTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  overline: {
    ...Typography.overline,
    letterSpacing: 1.6,
  },
  countPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    backgroundColor: Colors.bg.card,
  },
  countText: {
    ...Typography.caption,
    color: Colors.text.primary,
    fontWeight: "600",
  },
  title: {
    ...Typography.display,
    fontSize: 30,
  },
  helper: {
    ...Typography.label,
    marginTop: 2,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: Spacing.screenHorizontal,
    paddingBottom: 24,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: TILE_GAP,
  },
  tile: {
    width: TILE_WIDTH,
    minHeight: 148,
    padding: Spacing.cardPadding,
    borderRadius: Radius.cardSm,
    backgroundColor: Colors.bg.card,
    borderWidth: SELECTION_BORDER,
    borderColor: "transparent",
    gap: 8,
  },
  tileIcon: {
    fontSize: 32,
    lineHeight: 36,
  },
  tilePressed: {
    backgroundColor: Colors.bg.cardActive,
  },
  tileSelected: {
    backgroundColor: Colors.bg.cardActive,
    borderColor: Colors.brand.greenBright,
  },
  tileTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  tileDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  tileName: {
    ...Typography.section,
  },
  tileDesc: {
    ...Typography.label,
  },
  statusBlock: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.inlineGap,
    paddingHorizontal: Spacing.screenHorizontal,
  },
  statusTitle: {
    ...Typography.body,
    fontWeight: "600",
  },
  statusText: {
    ...Typography.label,
    textAlign: "center",
  },
  footer: {
    paddingHorizontal: Spacing.screenHorizontal,
    paddingTop: 8,
    paddingBottom: 12,
    backgroundColor: Colors.bg.base,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  primary: {
    height: PRIMARY_HEIGHT,
    borderRadius: Radius.pill,
    backgroundColor: Colors.brand.green,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryPressed: {
    opacity: 0.8,
  },
  primaryDisabled: {
    opacity: 0.45,
  },
  primaryText: {
    ...Typography.body,
    color: Colors.brand.greenText,
    fontWeight: "600",
  },
});
