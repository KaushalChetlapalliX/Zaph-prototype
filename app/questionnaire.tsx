import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Easing,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../src/lib/supabase";
import { Colors, Radius, Spacing, Typography } from "../src/constants/design";
import { STORAGE_KEYS } from "../src/constants/storage";
import {
  computeCategoryScores,
  computeMotivationScoreLocal,
  computeMotivationTierLocal,
  getSuggestedSubtasks,
  getTopCategories,
} from "../src/lib/questionnaire";
import {
  buildQuestionFlow,
  type QuestionDef,
} from "../src/lib/questionnaire-questions";
import type {
  MotivationTier,
  QuestionnaireResponses,
  SuggestedCategory,
} from "../src/types/questionnaire";

const PROGRESS_HEIGHT = 6;
const OPTION_HEIGHT = 58;
const AUTO_ADVANCE_MS = 180;
const SCREEN_WIDTH = Dimensions.get("window").width;
const SLIDER_WIDTH = SCREEN_WIDTH - Spacing.screenHorizontal * 2;
const SLIDER_TRACK = 6;
const SLIDER_THUMB = 28;
const SLIDER_MIN = 1;
const SLIDER_MAX = 10;

type Responses = QuestionnaireResponses &
  Record<string, string | string[] | undefined>;

export default function QuestionnaireScreen() {
  const [step, setStep] = useState(0);
  const [responses, setResponses] = useState<Responses>({});
  const [saving, setSaving] = useState(false);

  const slideAnim = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;

  const flow = useMemo<QuestionDef[]>(
    () => buildQuestionFlow(responses.primary_focus),
    [responses.primary_focus],
  );
  const total = flow.length;
  const current = flow[Math.min(step, total - 1)];
  const progress = (step + 1) / total;

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: progress,
      duration: 320,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start();
  }, [progress, progressAnim]);

  useEffect(() => {
    slideAnim.setValue(24);
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 320,
      easing: Easing.out(Easing.exp),
      useNativeDriver: true,
    }).start();
  }, [step, slideAnim]);

  const goBack = () => {
    if (step === 0) {
      router.back();
      return;
    }
    setStep((s) => Math.max(0, s - 1));
  };

  const advance = () => {
    if (step >= total - 1) {
      void submit();
      return;
    }
    setStep((s) => s + 1);
  };

  const setSinglePick = (questionKey: string, value: string) => {
    setResponses((prev) => ({ ...prev, [questionKey]: value }));
    setTimeout(advance, AUTO_ADVANCE_MS);
  };

  const toggleMulti = (questionKey: string, value: string, max: number) => {
    setResponses((prev) => {
      const existing = (prev[questionKey] as string[] | undefined) ?? [];
      if (existing.includes(value)) {
        return { ...prev, [questionKey]: existing.filter((v) => v !== value) };
      }
      if (existing.length >= max) return prev;
      return { ...prev, [questionKey]: [...existing, value] };
    });
  };

  const setSlider = (value: number) => {
    setResponses((prev) => ({ ...prev, confidence_score: String(value) }));
  };

  const submit = async () => {
    if (saving) return;
    setSaving(true);

    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) {
      setSaving(false);
      Alert.alert("Not signed in", "Please log in again.");
      return;
    }

    const rows: {
      user_id: string;
      question_key: string;
      answer_value: string;
    }[] = [];
    for (const [key, val] of Object.entries(responses)) {
      if (val == null) continue;
      if (Array.isArray(val)) {
        for (const v of val)
          rows.push({ user_id: uid, question_key: key, answer_value: v });
      } else {
        rows.push({
          user_id: uid,
          question_key: key,
          answer_value: String(val),
        });
      }
    }

    const { error: deleteErr } = await supabase
      .from("user_questionnaire_responses")
      .delete()
      .eq("user_id", uid);
    if (deleteErr) {
      setSaving(false);
      Alert.alert("Save failed", deleteErr.message);
      return;
    }

    const { error: insErr } = await supabase
      .from("user_questionnaire_responses")
      .insert(rows);
    if (insErr) {
      setSaving(false);
      Alert.alert("Save failed", insErr.message);
      return;
    }

    const tier: MotivationTier = computeMotivationTierLocal(
      Number(responses.confidence_score ?? "5"),
      responses.blocker as string | undefined,
      responses.competitive_style as string | undefined,
    );
    const motivationScore = computeMotivationScoreLocal(
      Number(responses.confidence_score ?? "5"),
      responses.blocker as string | undefined,
      responses.competitive_style as string | undefined,
    );

    const { error: profileErr } = await supabase
      .from("profiles")
      .update({
        motivation_score: motivationScore,
        motivation_tier: tier,
        questionnaire_completed: true,
        questionnaire_completed_at: new Date().toISOString(),
      })
      .eq("id", uid);

    if (profileErr) {
      setSaving(false);
      Alert.alert("Couldn't save profile", profileErr.message);
      return;
    }

    const responsesAsArrays: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(responses)) {
      if (v == null) continue;
      responsesAsArrays[k] = Array.isArray(v) ? v : [String(v)];
    }
    const scores = computeCategoryScores(responsesAsArrays);
    const topNames = getTopCategories(scores, 3);

    const { data: catRows } = await supabase
      .from("categories")
      .select("id, name, icon, description")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    type CatRow = {
      id: string;
      name: string;
      icon: string;
      description: string;
    };
    const catList = (catRows ?? []) as unknown as CatRow[];
    const categoryByName = new Map(catList.map((row) => [row.name, row]));

    const drill = (responses.drill_down as string | undefined) ?? null;
    const orderedNames = [
      ...topNames,
      ...catList.map((row) => row.name).filter((name) => !topNames.includes(name)),
    ];
    const suggestions: SuggestedCategory[] = orderedNames
      .map((name) => {
        const c = categoryByName.get(name);
        if (!c) return null;
        return {
          id: c.id,
          name: c.name,
          icon: c.icon,
          description: c.description,
          score: scores[name] ?? 0,
          suggestedSubtasks: getSuggestedSubtasks(name, drill, tier),
        };
      })
      .filter((x): x is SuggestedCategory => x !== null)
      .slice(0, 3);

    await AsyncStorage.setItem(STORAGE_KEYS.MOTIVATION_TIER, tier);
    await AsyncStorage.setItem(
      STORAGE_KEYS.SUGGESTED_CATEGORIES,
      JSON.stringify(suggestions),
    );

    setSaving(false);
    router.replace({
      pathname: "/category-suggestion",
      params: {
        suggestions: JSON.stringify(suggestions),
        motivationScore: String(motivationScore),
        motivationTier: tier,
      },
    });
  };

  if (saving) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.savingWrap}>
          <ActivityIndicator color={Colors.text.primary} size="small" />
          <Text style={styles.savingText}>Building your profile…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
      <View style={styles.topBlock}>
        <View style={styles.progressTrack}>
          <Animated.View
            style={[
              styles.progressFill,
              {
                width: progressAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: ["0%", "100%"],
                }),
              },
            ]}
          />
        </View>

        <Pressable
          onPress={goBack}
          style={styles.backBtn}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="chevron-back" size={20} color={Colors.text.primary} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Animated.View style={{ transform: [{ translateX: slideAnim }] }}>
          <Text style={styles.prompt}>{current.prompt}</Text>
          {current.subtitle ? (
            <Text style={styles.subtitle}>{current.subtitle}</Text>
          ) : null}
        </Animated.View>

        <Animated.View
          style={[
            styles.optionsBlock,
            { transform: [{ translateX: slideAnim }] },
          ]}
        >
          {renderQuestion(current, responses, {
            onSinglePick: setSinglePick,
            onToggleMulti: toggleMulti,
            onSlider: setSlider,
          })}
        </Animated.View>
      </ScrollView>

      {needsContinue(current, responses) ? (
        <View style={styles.footer}>
          <Pressable
            onPress={advance}
            disabled={!canContinue(current, responses)}
            style={({ pressed }) => [
              styles.primary,
              !canContinue(current, responses) && styles.primaryDisabled,
              pressed &&
                canContinue(current, responses) &&
                styles.primaryPressed,
            ]}
          >
            <Text style={styles.primaryText}>Continue</Text>
          </Pressable>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

function renderQuestion(
  q: QuestionDef,
  responses: Responses,
  handlers: {
    onSinglePick: (key: string, value: string) => void;
    onToggleMulti: (key: string, value: string, max: number) => void;
    onSlider: (value: number) => void;
  },
) {
  if (q.kind === "single") {
    const selected = responses[q.key] as string | undefined;
    return (
      <View style={styles.optionsList}>
        {(q.options ?? []).map((opt) => {
          const isSelected = selected === opt.value;
          return (
            <Pressable
              key={opt.value}
              onPress={() => handlers.onSinglePick(q.key, opt.value)}
              style={({ pressed }) => [
                styles.option,
                isSelected && styles.optionSelected,
                pressed && !isSelected && styles.optionPressed,
              ]}
            >
              <Text
                style={[
                  styles.optionText,
                  isSelected && styles.optionTextSelected,
                ]}
                numberOfLines={2}
              >
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    );
  }

  if (q.kind === "multi") {
    const max = q.maxPicks ?? 2;
    const selected = (responses[q.key] as string[] | undefined) ?? [];
    return (
      <View style={styles.optionsList}>
        {(q.options ?? []).map((opt) => {
          const isSelected = selected.includes(opt.value);
          return (
            <Pressable
              key={opt.value}
              onPress={() => handlers.onToggleMulti(q.key, opt.value, max)}
              style={({ pressed }) => [
                styles.option,
                isSelected && styles.optionSelected,
                pressed && !isSelected && styles.optionPressed,
              ]}
            >
              <Text
                style={[
                  styles.optionText,
                  isSelected && styles.optionTextSelected,
                ]}
                numberOfLines={2}
              >
                {opt.label}
              </Text>
              {isSelected ? (
                <Ionicons
                  name="checkmark"
                  size={20}
                  color={Colors.brand.greenText}
                />
              ) : null}
            </Pressable>
          );
        })}
      </View>
    );
  }

  const value = Number(responses.confidence_score ?? "5");
  return <ConfidenceSlider value={value} onChange={handlers.onSlider} />;
}

function ConfidenceSlider({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const numberAnim = useRef(new Animated.Value(value)).current;

  useEffect(() => {
    Animated.spring(numberAnim, {
      toValue: value,
      tension: 120,
      friction: 14,
      useNativeDriver: true,
    }).start();
  }, [value, numberAnim]);

  const valueToX = (v: number) =>
    ((v - SLIDER_MIN) / (SLIDER_MAX - SLIDER_MIN)) *
    (SLIDER_WIDTH - SLIDER_THUMB);
  const xToValue = (x: number) => {
    const clamped = Math.max(0, Math.min(SLIDER_WIDTH - SLIDER_THUMB, x));
    const ratio = clamped / (SLIDER_WIDTH - SLIDER_THUMB);
    return Math.round(SLIDER_MIN + ratio * (SLIDER_MAX - SLIDER_MIN));
  };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (_, g) =>
        onChange(xToValue(g.x0 - Spacing.screenHorizontal - SLIDER_THUMB / 2)),
      onPanResponderMove: (_, g) =>
        onChange(
          xToValue(g.moveX - Spacing.screenHorizontal - SLIDER_THUMB / 2),
        ),
    }),
  ).current;

  const thumbX = valueToX(value);
  const fillScale = numberAnim.interpolate({
    inputRange: [SLIDER_MIN, SLIDER_MAX],
    outputRange: [0.95, 1.05],
  });

  return (
    <View style={styles.sliderWrap}>
      <Animated.Text
        style={[styles.sliderNumber, { transform: [{ scale: fillScale }] }]}
      >
        {value}
      </Animated.Text>
      <View style={styles.sliderTrackWrap} {...responder.panHandlers}>
        <View style={styles.sliderTrack} />
        <View
          style={[styles.sliderFill, { width: thumbX + SLIDER_THUMB / 2 }]}
        />
        <View style={[styles.sliderThumb, { left: thumbX }]} />
      </View>
      <View style={styles.sliderLabels}>
        <Text style={styles.sliderLabel}>Not confident</Text>
        <Text style={styles.sliderLabel}>Very confident</Text>
      </View>
    </View>
  );
}

function needsContinue(q: QuestionDef, responses: Responses): boolean {
  return q.kind === "multi" || q.kind === "slider";
}

function canContinue(q: QuestionDef, responses: Responses): boolean {
  if (q.kind === "multi") {
    const arr = (responses[q.key] as string[] | undefined) ?? [];
    return arr.length > 0;
  }
  if (q.kind === "slider") {
    return responses.confidence_score != null;
  }
  return true;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.bg.base },
  topBlock: {
    paddingHorizontal: Spacing.screenHorizontal,
    paddingTop: 8,
    gap: 20,
  },
  progressTrack: {
    height: PROGRESS_HEIGHT,
    backgroundColor: Colors.border,
    borderRadius: PROGRESS_HEIGHT / 2,
    overflow: "hidden",
  },
  progressFill: {
    height: PROGRESS_HEIGHT,
    backgroundColor: Colors.brand.greenBright,
    borderRadius: PROGRESS_HEIGHT / 2,
    shadowColor: Colors.brand.greenBright,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 6,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.cardSm,
    backgroundColor: Colors.bg.card,
    alignItems: "center",
    justifyContent: "center",
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: Spacing.screenHorizontal,
    paddingTop: 24,
    paddingBottom: 24,
    gap: 36,
  },
  prompt: {
    ...Typography.display,
    fontSize: 30,
    lineHeight: 38,
    letterSpacing: -0.5,
  },
  subtitle: {
    ...Typography.body,
    color: Colors.text.secondary,
    marginTop: 12,
    lineHeight: 22,
  },
  optionsBlock: { gap: Spacing.rowGap },
  optionsList: { gap: Spacing.rowGap },
  option: {
    height: OPTION_HEIGHT,
    borderRadius: Radius.cardSm,
    backgroundColor: Colors.bg.card,
    paddingHorizontal: Spacing.cardPadding,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  optionPressed: { backgroundColor: Colors.bg.cardActive },
  optionSelected: { backgroundColor: Colors.brand.green },
  optionText: { ...Typography.body, fontWeight: "500", flex: 1 },
  optionTextSelected: { color: Colors.brand.greenText },

  sliderWrap: {
    alignItems: "center",
    paddingTop: 12,
    gap: 24,
  },
  sliderNumber: {
    ...Typography.hero,
    color: Colors.brand.green,
  },
  sliderTrackWrap: {
    width: SLIDER_WIDTH,
    height: SLIDER_THUMB,
    justifyContent: "center",
  },
  sliderTrack: {
    position: "absolute",
    left: 0,
    right: 0,
    height: SLIDER_TRACK,
    borderRadius: Radius.pill,
    backgroundColor: Colors.progressTrack,
  },
  sliderFill: {
    position: "absolute",
    left: 0,
    height: SLIDER_TRACK,
    borderRadius: Radius.pill,
    backgroundColor: Colors.brand.greenBright,
  },
  sliderThumb: {
    position: "absolute",
    width: SLIDER_THUMB,
    height: SLIDER_THUMB,
    borderRadius: SLIDER_THUMB / 2,
    backgroundColor: Colors.text.primary,
  },
  sliderLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: SLIDER_WIDTH,
  },
  sliderLabel: { ...Typography.caption },

  footer: {
    paddingHorizontal: Spacing.screenHorizontal,
    paddingBottom: 12,
  },
  primary: {
    height: 54,
    borderRadius: Radius.pill,
    backgroundColor: Colors.brand.green,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryDisabled: { opacity: 0.45 },
  primaryPressed: { opacity: 0.8 },
  primaryText: {
    ...Typography.body,
    color: Colors.brand.greenText,
    fontWeight: "600",
  },

  savingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  savingText: { ...Typography.body },
});
