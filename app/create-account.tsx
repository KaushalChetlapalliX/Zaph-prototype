import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  SafeAreaView,
  Alert,
  ActivityIndicator,
} from "react-native";
import { router } from "expo-router";
import { supabase } from "../src/lib/supabase";

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
    // This assumes you have a `public.profiles` table with at least:
    // id (uuid PK), username (text), full_name (text), first_name (text), last_name (text)
    const { error } = await supabase.from("profiles").upsert(payload, { onConflict: "id" });
    if (error) {
      // If this fails due to RLS, fix policies on `profiles` (see note below).
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

    // Store names in profiles table too (so LoadingScreen can read it)
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

    // Ensure first_name exists in metadata for Google users
    const meta: any = user.user_metadata ?? {};
    const fullFromGoogle: string =
      meta.full_name || meta.name || `${meta.given_name ?? ""} ${meta.family_name ?? ""}`.trim();

    let fn = (meta.first_name || meta.given_name || "").trim();
    let ln = (meta.last_name || meta.family_name || "").trim();

    if (!fn && fullFromGoogle) {
      fn = fullFromGoogle.split(" ")[0]?.trim() ?? "";
      ln = fullFromGoogle.split(" ").slice(1).join(" ").trim();
    }

    const full = `${fn} ${ln}`.trim() || fullFromGoogle || "User";

    // Write back to auth metadata (so RPC/view can read raw_user_meta_data)
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

    // Also store in profiles table
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

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.card}>
          <Text style={styles.title}>Create Account</Text>

          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder="First Name"
              placeholderTextColor="#666666"
              value={firstName}
              onChangeText={setFirstName}
              autoCapitalize="words"
            />
          </View>

          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder="Last Name"
              placeholderTextColor="#666666"
              value={lastName}
              onChangeText={setLastName}
              autoCapitalize="words"
            />
          </View>

          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder="Email Address"
              placeholderTextColor="#666666"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>

          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor="#666666"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
            />
          </View>

          <Pressable
            onPress={handleSignUp}
            style={[styles.primaryButton, loadingEmail ? styles.disabled : null]}
            disabled={loadingEmail || loadingGoogle}
          >
            {loadingEmail ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color="#FFFFFF" />
                <Text style={styles.primaryButtonText}>Creating</Text>
              </View>
            ) : (
              <Text style={styles.primaryButtonText}>Sign up</Text>
            )}
          </Pressable>

          <Pressable
            onPress={handleGoogleSignIn}
            style={[styles.socialButton, loadingGoogle ? styles.disabled : null]}
            disabled={loadingEmail || loadingGoogle}
          >
            {loadingGoogle ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color="#000000" />
                <Text style={styles.socialButtonText}>Signing in</Text>
              </View>
            ) : (
              <>
                <Text style={styles.socialIcon}>G</Text>
                <Text style={styles.socialButtonText}>Sign up with Google</Text>
              </>
            )}
          </Pressable>

          <Pressable
            onPress={() => Alert.alert("Apple login", "Apple login is not set up right now.")}
            style={styles.socialButton}
            disabled={loadingEmail || loadingGoogle}
          >
            <Text style={styles.socialIcon}></Text>
            <Text style={styles.socialButtonText}>Sign up with Apple</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F8EEFF",
  },
  container: {
    flex: 1,
    backgroundColor: "#F8EEFF",
    paddingHorizontal: 20,
    paddingTop: 40,
    paddingBottom: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 30,
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 32,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    width: "100%",
    maxWidth: 400,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#000000",
    marginBottom: 32,
    textAlign: "center",
  },
  inputContainer: {
    marginBottom: 20,
  },
  input: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#000000",
    borderRadius: 25,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 16,
    color: "#000000",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  primaryButton: {
    backgroundColor: "#8A2BE2",
    borderRadius: 25,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  socialButton: {
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#000000",
    borderRadius: 999,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  socialIcon: {
    position: "absolute",
    left: 18,
    fontSize: 18,
    fontWeight: "700",
    color: "#000000",
  },
  socialButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#000000",
  },
  disabled: {
    opacity: 0.75,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
});
