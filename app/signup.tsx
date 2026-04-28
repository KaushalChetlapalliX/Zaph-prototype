import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { supabase } from "../src/lib/supabase";
import { Colors, Radius, Spacing, Typography } from "../src/constants/design";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSignIn = async () => {
    if (loading) return;
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      setLoading(false);
      Alert.alert("Login failed", error.message);
      return;
    }

    const uid = data.user?.id;
    if (!uid) {
      setLoading(false);
      router.replace("/user-home");
      return;
    }

    const { data: profileRow } = await supabase
      .from("profiles")
      .select("questionnaire_completed")
      .eq("id", uid)
      .maybeSingle();

    const completed =
      (profileRow as { questionnaire_completed?: boolean } | null)
        ?.questionnaire_completed === true;

    setLoading(false);
    router.replace(completed ? "/user-home" : "/questionnaire");
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Log in</Text>
        </View>

        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor={Colors.text.secondary}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor={Colors.text.secondary}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Pressable
            onPress={handleSignIn}
            style={({ pressed }) => [
              styles.primaryButton,
              (pressed || loading) && styles.pressed,
            ]}
            disabled={loading}
          >
            <Text style={styles.primaryButtonText}>
              {loading ? "Signing in…" : "Log in"}
            </Text>
          </Pressable>

          <Pressable
            onPress={() =>
              Alert.alert(
                "Google login",
                "Google login is not set up right now.",
              )
            }
            style={({ pressed }) => [
              styles.secondaryButton,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.secondaryButtonText}>Continue with Google</Text>
          </Pressable>

          <Pressable
            onPress={() =>
              Alert.alert("Apple login", "Apple login is not set up right now.")
            }
            style={({ pressed }) => [
              styles.secondaryButton,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.secondaryButtonText}>Continue with Apple</Text>
          </Pressable>
        </View>

        <View style={styles.footer}>
          <Pressable
            onPress={() => router.push("/create-account")}
            hitSlop={12}
          >
            <Text style={styles.footerLink}>New here? Create an account</Text>
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
  container: {
    flex: 1,
    paddingHorizontal: Spacing.screenHorizontal,
    paddingTop: Spacing.screenTop,
    justifyContent: "space-between",
  },
  header: {
    paddingTop: 40,
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
  footer: {
    paddingBottom: 24,
    alignItems: "center",
  },
  footerLink: {
    ...Typography.body,
    textDecorationLine: "underline",
  },
});
