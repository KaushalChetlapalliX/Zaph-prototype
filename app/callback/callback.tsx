import { useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Platform,
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
      const initialUrl =
        Platform.OS === "web" && typeof window !== "undefined"
          ? window.location.href
          : await Linking.getInitialURL();
      if (!initialUrl) {
        alert("Missing OAuth redirect URL.");
        router.replace("/create-account");
        return;
      }

      const { params, errorCode } = QueryParams.getQueryParams(initialUrl);
      const mergedParams = {
        ...readAuthParams(initialUrl),
        ...(params as Record<string, string | undefined> | undefined),
      };

      if (errorCode) {
        alert(errorCode);
        router.replace("/create-account");
        return;
      }

      const access_token = mergedParams.access_token ?? "";
      const refresh_token = mergedParams.refresh_token ?? "";
      const code = mergedParams.code ?? "";

      if (code) {
        const { data: exchangeData, error: exchangeError } =
          await supabase.auth.exchangeCodeForSession(code);

        if (exchangeError) {
          alert(exchangeError.message);
          router.replace("/create-account");
          return;
        }

        const userId = exchangeData?.user?.id;
        if (!userId) {
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
        return;
      }

      if (!access_token) {
        alert("Missing access token from OAuth redirect.");
        router.replace("/create-account");
        return;
      }

      const { error } = await supabase.auth.setSession({
        access_token,
        refresh_token,
      });

      if (error) {
        alert(error.message);
        router.replace("/create-account");
        return;
      }

      router.replace("/create-circle");
    };

    run();
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
