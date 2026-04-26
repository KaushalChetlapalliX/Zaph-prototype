import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../src/lib/supabase";
import { Colors, Radius, Spacing, Typography } from "../src/constants/design";
import { TabBar } from "../src/components/TabBar";

const KEY_ACTIVE_CIRCLE_ID = "activeCircleId";
const KEY_ACTIVE_CIRCLE_CODE = "activeCircleCode";
const KEY_ACTIVE_CIRCLE_NAME = "activeCircleName";
const KEY_ACTIVE_DIFFICULTY = "activeDifficulty";
const KEY_PROFILE_FIRST_NAME = "profileFirstName";
const KEY_PREF_NOTIFICATIONS = "prefNotifications";
const KEY_PREF_WEEKLY_DIGEST = "prefWeeklyDigest";

const CLEAR_ON_SIGN_OUT = [
  KEY_ACTIVE_CIRCLE_ID,
  KEY_ACTIVE_CIRCLE_CODE,
  KEY_ACTIVE_CIRCLE_NAME,
  KEY_ACTIVE_DIFFICULTY,
  KEY_PROFILE_FIRST_NAME,
];

type ProfileRow = {
  first_name?: string | null;
};

const initialOf = (value: string) =>
  (value.trim().charAt(0) || "?").toUpperCase();

export default function Settings() {
  const [firstName, setFirstName] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const [notifications, setNotifications] = useState(true);
  const [weeklyDigest, setWeeklyDigest] = useState(true);
  const [signingOut, setSigningOut] = useState(false);

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
    let alive = true;

    const load = async () => {
      const [storedName, notifPref, digestPref] = await Promise.all([
        AsyncStorage.getItem(KEY_PROFILE_FIRST_NAME).catch(() => null),
        AsyncStorage.getItem(KEY_PREF_NOTIFICATIONS).catch(() => null),
        AsyncStorage.getItem(KEY_PREF_WEEKLY_DIGEST).catch(() => null),
      ]);

      if (!alive) return;

      if (storedName && storedName.trim().length > 0) {
        setFirstName(storedName.trim());
      }
      if (notifPref !== null) setNotifications(notifPref === "1");
      if (digestPref !== null) setWeeklyDigest(digestPref === "1");

      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (!alive) return;

      if (userErr || !userData.user) {
        setLoading(false);
        return;
      }

      setEmail(userData.user.email ?? "");

      if (!storedName || storedName.trim().length === 0) {
        const { data: profileRow } = await supabase
          .from("profiles")
          .select("first_name")
          .eq("id", userData.user.id)
          .maybeSingle();

        if (!alive) return;

        const typed = (profileRow ?? null) as ProfileRow | null;
        const fn = (typed?.first_name ?? "").trim();
        if (fn.length > 0) {
          setFirstName(fn);
          try {
            await AsyncStorage.setItem(KEY_PROFILE_FIRST_NAME, fn);
          } catch {}
        }
      }

      setLoading(false);
    };

    load();

    return () => {
      alive = false;
    };
  }, []);

  const persistPref = useCallback(async (key: string, next: boolean) => {
    try {
      await AsyncStorage.setItem(key, next ? "1" : "0");
    } catch {}
  }, []);

  const handleNotifications = useCallback(
    (next: boolean) => {
      setNotifications(next);
      persistPref(KEY_PREF_NOTIFICATIONS, next);
    },
    [persistPref],
  );

  const handleWeeklyDigest = useCallback(
    (next: boolean) => {
      setWeeklyDigest(next);
      persistPref(KEY_PREF_WEEKLY_DIGEST, next);
    },
    [persistPref],
  );

  const performSignOut = useCallback(async () => {
    setSigningOut(true);

    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("[settings] signOut error:", error.message);
    }

    try {
      await AsyncStorage.multiRemove(CLEAR_ON_SIGN_OUT);
    } catch {}

    setSigningOut(false);
    router.replace("/welcome");
  }, []);

  const handleSignOut = useCallback(() => {
    if (Platform.OS === "web") {
      const ok =
        typeof window !== "undefined" &&
        window.confirm(
          "Sign out? You'll need to log back in to see your circles and streaks.",
        );
      if (ok) performSignOut();
      return;
    }
    Alert.alert(
      "Sign out?",
      "You'll need to log back in to see your circles and streaks.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Sign out", style: "destructive", onPress: performSignOut },
      ],
    );
  }, [performSignOut]);

  const displayName = firstName.length > 0 ? firstName : "You";
  const displayEmail = email.length > 0 ? email : "—";
  const avatarSeed = firstName.length > 0 ? firstName : email;

  const translate = mountAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [12, 0],
  });

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <Animated.View
        style={[
          styles.header,
          { opacity: mountAnim, transform: [{ translateY: translate }] },
        ]}
      >
        <Text style={styles.overline}>ACCOUNT</Text>
        <Text style={styles.title}>Settings.</Text>
      </Animated.View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.identityCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initialOf(avatarSeed)}</Text>
          </View>
          <View style={styles.identityBody}>
            {loading ? (
              <ActivityIndicator color={Colors.text.primary} size="small" />
            ) : (
              <>
                <Text style={styles.identityName} numberOfLines={1}>
                  {displayName}
                </Text>
                <Text style={styles.identityEmail} numberOfLines={1}>
                  {displayEmail}
                </Text>
              </>
            )}
          </View>
        </View>

        <Text style={styles.sectionHeader}>Preferences</Text>
        <View style={styles.card}>
          <View style={styles.toggleRow}>
            <View style={styles.rowTextBlock}>
              <Text style={styles.rowLabel}>Push notifications</Text>
              <Text style={styles.rowHelper}>
                Nudges when your circle completes tasks.
              </Text>
            </View>
            <Switch
              value={notifications}
              onValueChange={handleNotifications}
              trackColor={{
                false: Colors.toggleOff,
                true: Colors.brand.greenBright,
              }}
              thumbColor={Colors.text.primary}
              ios_backgroundColor={Colors.toggleOff}
            />
          </View>
          <View style={styles.divider} />
          <View style={styles.toggleRow}>
            <View style={styles.rowTextBlock}>
              <Text style={styles.rowLabel}>Weekly digest</Text>
              <Text style={styles.rowHelper}>
                Monday recap of last week's standings.
              </Text>
            </View>
            <Switch
              value={weeklyDigest}
              onValueChange={handleWeeklyDigest}
              trackColor={{
                false: Colors.toggleOff,
                true: Colors.brand.greenBright,
              }}
              thumbColor={Colors.text.primary}
              ios_backgroundColor={Colors.toggleOff}
            />
          </View>
        </View>

        <Text style={styles.sectionHeader}>About</Text>
        <View style={styles.card}>
          <LinkRow label="Privacy policy" onPress={() => {}} />
          <View style={styles.divider} />
          <LinkRow label="Terms of service" onPress={() => {}} />
          <View style={styles.divider} />
          <View style={styles.infoRow}>
            <Text style={styles.rowLabel}>Version</Text>
            <Text style={styles.infoValue}>0.1.0</Text>
          </View>
        </View>

        <Pressable
          onPress={handleSignOut}
          disabled={signingOut}
          style={({ pressed }) => [
            styles.signOut,
            pressed && styles.signOutPressed,
            signingOut && styles.signOutDisabled,
          ]}
        >
          {signingOut ? (
            <ActivityIndicator color={Colors.accent.pink} size="small" />
          ) : (
            <>
              <Ionicons
                name="log-out-outline"
                size={18}
                color={Colors.accent.pink}
              />
              <Text style={styles.signOutText}>Sign out</Text>
            </>
          )}
        </Pressable>
      </ScrollView>

      <TabBar active="settings" />
    </SafeAreaView>
  );
}

type LinkRowProps = {
  label: string;
  onPress: () => void;
};

function LinkRow({ label, onPress }: LinkRowProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.linkRow,
        pressed && styles.linkRowPressed,
      ]}
    >
      <Text style={styles.rowLabel}>{label}</Text>
      <Ionicons
        name="chevron-forward"
        size={18}
        color={Colors.text.secondary}
      />
    </Pressable>
  );
}

const AVATAR = 56;
const ROW_HEIGHT = 60;

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
  overline: {
    ...Typography.overline,
    letterSpacing: 1.6,
  },
  title: {
    ...Typography.display,
    fontSize: 30,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.screenHorizontal,
    paddingBottom: 40,
    gap: 14,
  },
  identityCard: {
    padding: Spacing.cardPadding,
    borderRadius: Radius.card,
    backgroundColor: Colors.bg.card,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    backgroundColor: Colors.bg.cardActive,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    ...Typography.section,
    fontSize: 22,
    fontWeight: "700",
  },
  identityBody: {
    flex: 1,
    gap: 2,
  },
  identityName: {
    ...Typography.body,
    fontWeight: "600",
  },
  identityEmail: {
    ...Typography.label,
  },
  sectionHeader: {
    ...Typography.overline,
    letterSpacing: 1.4,
    marginTop: 10,
    marginBottom: 2,
    paddingLeft: 4,
  },
  card: {
    borderRadius: Radius.card,
    backgroundColor: Colors.bg.card,
    overflow: "hidden",
  },
  toggleRow: {
    minHeight: ROW_HEIGHT,
    paddingHorizontal: Spacing.cardPadding,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  linkRow: {
    minHeight: ROW_HEIGHT,
    paddingHorizontal: Spacing.cardPadding,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  linkRowPressed: {
    backgroundColor: Colors.bg.cardActive,
  },
  infoRow: {
    minHeight: ROW_HEIGHT,
    paddingHorizontal: Spacing.cardPadding,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  rowTextBlock: {
    flex: 1,
    gap: 2,
  },
  rowLabel: {
    ...Typography.body,
  },
  rowHelper: {
    ...Typography.caption,
  },
  infoValue: {
    ...Typography.label,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginHorizontal: Spacing.cardPadding,
  },
  signOut: {
    marginTop: 18,
    height: 54,
    borderRadius: Radius.pill,
    backgroundColor: Colors.bg.card,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  signOutPressed: {
    backgroundColor: Colors.bg.cardActive,
  },
  signOutDisabled: {
    opacity: 0.6,
  },
  signOutText: {
    ...Typography.body,
    color: Colors.accent.pink,
    fontWeight: "600",
  },
});
