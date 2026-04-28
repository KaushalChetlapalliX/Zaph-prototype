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
import * as QueryParams from "expo-auth-session/build/QueryParams";
import { supabase } from "../../src/lib/supabase";
import { Colors, Spacing, Typography } from "../../src/constants/design";

function readAuthParams(rawUrl: string): Record<string, string> {
  const parsed: Record<string, string> = {};

  const assignFromPart = (part: string | undefined) => {
    if (!part) return;
    const search = new URLSearchParams(part);
    for (const [key, value] of search.entries()) {
      parsed[key] = value;
    }
  };

  const queryIndex = rawUrl.indexOf("?");
  const hashIndex = rawUrl.indexOf("#");

  if (queryIndex >= 0) {
    const queryPart =
      hashIndex > queryIndex
        ? rawUrl.slice(queryIndex + 1, hashIndex)
        : rawUrl.slice(queryIndex + 1);
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

      const { params, errorCode } = QueryParams.getQueryParams(callbackUrl);
      const parsedParams = {
        ...readAuthParams(callbackUrl),
        ...(params as Record<string, string | undefined> | undefined),
      };

      console.log("[google-oauth] parsed callback params:", parsedParams);

      if (errorCode) {
        console.log("[google-oauth] callback errorCode:", errorCode);
        alert(errorCode);
        router.replace("/create-account");
        return;
      }

      const code = parsedParams.code ?? "";
      if (!code) {
        alert("Missing OAuth code from redirect.");
        router.replace("/create-account");
        return;
      }

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

      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession();

      if (sessionError) {
        console.log("[google-oauth] getSession error:", sessionError.message);
        alert(sessionError.message);
        router.replace("/create-account");
        return;
      }

      const userId = sessionData.session?.user?.id;
      if (!userId) {
        alert("Session missing after OAuth exchange.");
        router.replace("/create-account");
        return;
      }

      const { data: profileRow } = await supabase
        .from("profiles")
        .select("questionnaire_completed")
        .eq("id", userId)
        .maybeSingle();

      const completed =
        (profileRow as { questionnaire_completed?: boolean } | null)
          ?.questionnaire_completed === true;

      router.replace(completed ? "/user-home" : "/questionnaire");
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
