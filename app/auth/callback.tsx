import { useEffect } from "react";
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";
import * as Linking from "expo-linking";
import { supabase } from "../../src/lib/supabase";
import { ensureProfileFromAuthUser } from "../../src/lib/profile";
import { Colors, Spacing, Typography } from "../../src/constants/design";

function readAuthParams(rawUrl: string): Record<string, string> {
  const parsed: Record<string, string> = {};

  const assignFromPart = (part?: string) => {
    if (!part) return;
    const search = new URLSearchParams(part);
    for (const [key, value] of search.entries()) {
      if (value !== undefined && value !== "") {
        parsed[key] = value;
      }
    }
  };

  const questionIndex = rawUrl.indexOf("?");
  const hashIndex = rawUrl.indexOf("#");

  if (questionIndex >= 0) {
    const queryPart =
      hashIndex >= 0 && hashIndex > questionIndex
        ? rawUrl.slice(questionIndex + 1, hashIndex)
        : rawUrl.slice(questionIndex + 1);
    assignFromPart(queryPart);
  }

  if (hashIndex >= 0) {
    assignFromPart(rawUrl.slice(hashIndex + 1));
  }

  return parsed;
}

export default function AuthCallback() {
  useEffect(() => {
    const run = async () => {
      const routeForSession = async (user: {
        email?: string | null;
        id: string;
        user_metadata?: Record<string, unknown> | null;
      }) => {
        const { profile } = await ensureProfileFromAuthUser(user);

        const completed =
          (profile as { questionnaire_completed?: boolean } | null)
            ?.questionnaire_completed === true;

        router.replace(completed ? "/user-home" : "/questionnaire");
      };

      const callbackUrl =
        Platform.OS === "web" && typeof window !== "undefined"
          ? window.location.href
          : await Linking.getInitialURL();

      console.log("[google-oauth] callback url:", callbackUrl);

      if (!callbackUrl) {
        alert("Missing OAuth redirect URL.");
        router.replace("/create-account");
        return;
      }

      const authParams = readAuthParams(callbackUrl);
      const access_token = authParams.access_token;
      const refresh_token = authParams.refresh_token;
      const code = authParams.code;
      const error = authParams.error;
      const error_description = authParams.error_description;

      console.log("[google-oauth] parsed callback params:", authParams);

      if (error) {
        console.log("[google-oauth] callback error:", error, error_description);
        alert(error_description || error);
        router.replace("/create-account");
        return;
      }

      if (code) {
        const { error: exchangeError } =
          await supabase.auth.exchangeCodeForSession(code);

        if (exchangeError) {
          console.log(
            "[google-oauth] exchangeCodeForSession error:",
            exchangeError.message,
          );
          alert(exchangeError.message);
          router.replace("/create-account");
          return;
        }
      } else if (access_token && refresh_token) {
        const { error: setSessionError } = await supabase.auth.setSession({
          access_token,
          refresh_token,
        });

        if (setSessionError) {
          console.log(
            "[google-oauth] setSession error:",
            setSessionError.message,
          );
          alert(setSessionError.message);
          router.replace("/create-account");
          return;
        }
      } else {
        const { data: existingSession, error: existingSessionError } =
          await supabase.auth.getSession();

        if (existingSessionError) {
          console.log(
            "[google-oauth] existing session check error:",
            existingSessionError.message,
          );
        }

        const existingUser = existingSession.session?.user;
        if (existingUser) {
          console.log(
            "[google-oauth] reusing existing session after callback without params:",
            existingUser.id,
          );
          await routeForSession(existingUser);
          return;
        }

        console.log(
          "[google-oauth] missing OAuth params:",
          callbackUrl,
          authParams,
        );
        alert("Missing OAuth credentials from redirect.");
        router.replace("/create-account");
        return;
      }

      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession();

      if (sessionError) {
        console.log("[google-oauth] getSession error:", sessionError.message);
        alert(sessionError.message);
        router.replace("/create-account");
        return;
      }

      const user = sessionData.session?.user;
      if (!user) {
        console.log(
          "[google-oauth] session missing after callback handling:",
          authParams,
        );
        alert("Session missing after OAuth callback.");
        router.replace("/create-account");
        return;
      }

      await routeForSession(user);
    };

    void run();
  }, []);

  return (
    <View style={styles.container}>
      <ActivityIndicator color={Colors.text.primary} size="small" />
      <Text style={styles.label}>Signing you in…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg.base,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.inlineGap,
  },
  label: {
    ...Typography.label,
  },
});
