import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { supabase } from "../src/lib/supabase";
import { Colors, Radius, Spacing, Typography } from "../src/constants/design";

import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";

WebBrowser.maybeCompleteAuthSession();

type ProfileUpsert = {
  id: string;
  username?: string | null;
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
};

export default function CreateAccount() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loadingEmail, setLoadingEmail] = useState(false);
  const [loadingGoogle, setLoadingGoogle] = useState(false);

  const upsertProfile = async (payload: ProfileUpsert) => {
    const { error } = await supabase.from("profiles").upsert(payload, { onConflict: "id" });
    if (error) {
      console.log("profiles upsert error:", error.message);
    }
  };

  const handleSignUp = async () => {
    const fn = firstName.trim();
    const ln = lastName.trim();
    const em = email.trim().toLowerCase();

    if (!fn) {
      Alert.alert("Missing first name", "Enter your first name.");
      return;
    }
    if (!em) {
      Alert.alert("Missing email", "Enter your email.");
      return;
    }
    if (!password || password.length < 6) {
      Alert.alert("Weak password", "Password must be at least 6 characters.");
      return;
    }

    if (loadingEmail) return;
    setLoadingEmail(true);

    const full = `${fn} ${ln}`.trim();

    const { data, error } = await supabase.auth.signUp({
      email: em,
      password,
      options: {
        data: {
          first_name: fn,
          last_name: ln,
          full_name: full,
        },
      },
    });

    setLoadingEmail(false);

    if (error) {
      Alert.alert("Signup failed", error.message);
      return;
    }

    const userId = data.user?.id;
    if (!userId) {
      Alert.alert("Signup succeeded but no user returned.");
      return;
    }

    const safe = fn.toLowerCase().replace(/[^a-z0-9]/g, "") || "user";
    const username = `${safe}_${userId.slice(0, 6)}`;

    await upsertProfile({
      id: userId,
      username,
      full_name: full,
      first_name: fn,
      last_name: ln,
    });

    router.replace("/create-circle");
  };

  const handleGoogleSignIn = async () => {
    if (loadingGoogle) return;
    setLoadingGoogle(true);

    const redirectTo = Linking.createURL("auth/callback");

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        skipBrowserRedirect: true,
      },
    });

    if (error) {
      setLoadingGoogle(false);
      Alert.alert("Google sign in failed", error.message);
      return;
    }

    if (!data?.url) {
      setLoadingGoogle(false);
      Alert.alert("Google sign in failed", "No OAuth URL returned.");
      return;
    }

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

    if (result.type !== "success" || !result.url) {
      setLoadingGoogle(false);
      return;
    }

    const parsed = Linking.parse(result.url);
    const code =
      typeof parsed.queryParams?.code === "string" ? parsed.queryParams.code : undefined;

    if (!code) {
      setLoadingGoogle(false);
      Alert.alert("Google sign in failed", "No code returned from Google redirect.");
      return;
    }

    const { data: exchangeData, error: exchangeError } =
      await supabase.auth.exchangeCodeForSession(code);

    if (exchangeError) {
      setLoadingGoogle(false);
      Alert.alert("Google sign in failed", exchangeError.message);
      return;
    }

    const user = exchangeData?.user;
    if (!user?.id) {
      setLoadingGoogle(false);
      Alert.alert("Google sign in failed", "No user returned after session exchange.");
      return;
    }

    // user_metadata from Supabase OAuth is unstructured Record<string, any> —
    // asserting to read optional Google fields off it.
    const meta = (user.user_metadata ?? {}) as Record<string, string | undefined>;
    const fullFromGoogle =
      meta.full_name || meta.name || `${meta.given_name ?? ""} ${meta.family_name ?? ""}`.trim();

    let fn = (meta.first_name || meta.given_name || "").trim();
    let ln = (meta.last_name || meta.family_name || "").trim();

    if (!fn && fullFromGoogle) {
      fn = fullFromGoogle.split(" ")[0]?.trim() ?? "";
      ln = fullFromGoogle.split(" ").slice(1).join(" ").trim();
    }

    const full = `${fn} ${ln}`.trim() || fullFromGoogle || "User";

    const { error: updErr } = await supabase.auth.updateUser({
      data: {
        first_name: fn,
        last_name: ln,
        full_name: full,
      },
    });

    if (updErr) {
      console.log("updateUser metadata error:", updErr.message);
    }

    await upsertProfile({
      id: user.id,
      username: fn || "User",
      full_name: full,
      first_name: fn || null,
      last_name: ln || null,
    });

    setLoadingGoogle(false);
    router.replace("/create-circle");
  };

  const busy = loadingEmail || loadingGoogle;

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.title}>Create account</Text>

          <View style={styles.form}>
            <TextInput
              style={styles.input}
              placeholder="First name"
              placeholderTextColor={Colors.text.secondary}
              value={firstName}
              onChangeText={setFirstName}
              autoCapitalize="words"
            />
            <TextInput
              style={styles.input}
              placeholder="Last name"
              placeholderTextColor={Colors.text.secondary}
              value={lastName}
              onChangeText={setLastName}
              autoCapitalize="words"
            />
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor={Colors.text.secondary}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor={Colors.text.secondary}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
            />

            <Pressable
              onPress={handleSignUp}
              style={({ pressed }) => [
                styles.primaryButton,
                (pressed || busy) && styles.pressed,
              ]}
              disabled={busy}
            >
              {loadingEmail ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator color={Colors.brand.greenText} size="small" />
                  <Text style={styles.primaryButtonText}>Creating</Text>
                </View>
              ) : (
                <Text style={styles.primaryButtonText}>Sign up</Text>
              )}
            </Pressable>

            <Pressable
              onPress={handleGoogleSignIn}
              style={({ pressed }) => [
                styles.secondaryButton,
                (pressed || busy) && styles.pressed,
              ]}
              disabled={busy}
            >
              {loadingGoogle ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator color={Colors.text.primary} size="small" />
                  <Text style={styles.secondaryButtonText}>Signing in</Text>
                </View>
              ) : (
                <Text style={styles.secondaryButtonText}>Continue with Google</Text>
              )}
            </Pressable>

            <Pressable
              onPress={() => Alert.alert("Apple login", "Apple login is not set up right now.")}
              style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
              disabled={busy}
            >
              <Text style={styles.secondaryButtonText}>Continue with Apple</Text>
            </Pressable>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <Pressable onPress={() => router.push("/signup")} hitSlop={12}>
            <Text style={styles.footerLink}>I already have an account</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const BUTTON_HEIGHT = 54;
const INPUT_HEIGHT = 54;

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.bg.base },
  container: { flex: 1 },
  scrollContent: {
    paddingHorizontal: Spacing.screenHorizontal,
    paddingTop: 40,
    paddingBottom: 40,
    gap: Spacing.sectionGap,
  },
  title: {
    ...Typography.title,
    fontSize: 28,
  },
  form: {
    gap: Spacing.rowGap,
  },
  input: {
    height: INPUT_HEIGHT,
    backgroundColor: Colors.bg.input,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.pill,
    paddingHorizontal: 20,
    ...Typography.body,
  },
  primaryButton: {
    height: BUTTON_HEIGHT,
    backgroundColor: Colors.brand.green,
    borderRadius: Radius.pill,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  primaryButtonText: {
    ...Typography.body,
    color: Colors.brand.greenText,
    fontWeight: "600",
  },
  secondaryButton: {
    height: BUTTON_HEIGHT,
    backgroundColor: Colors.bg.card,
    borderRadius: Radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: {
    ...Typography.body,
    fontWeight: "500",
  },
  pressed: {
    opacity: 0.75,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.inlineGap,
  },
  footer: {
    paddingBottom: 24,
    alignItems: "center",
  },
  footerLink: {
    ...Typography.body,
    textDecorationLine: "underline",
  },
});
