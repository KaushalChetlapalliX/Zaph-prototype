import { useEffect } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import * as Linking from "expo-linking";
import * as QueryParams from "expo-auth-session/build/QueryParams";
import { supabase } from "../../src/lib/supabase";
import { Colors, Spacing, Typography } from "../../src/constants/design";

export default function AuthCallback() {
  useEffect(() => {
    const run = async () => {
      const initialUrl = await Linking.getInitialURL();
      if (!initialUrl) return;

      const { params, errorCode } = QueryParams.getQueryParams(initialUrl);

      if (errorCode) {
        alert(errorCode);
        router.replace("/create-account");
        return;
      }

      const access_token = (params?.access_token as string) ?? "";
      const refresh_token = (params?.refresh_token as string) ?? "";

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
