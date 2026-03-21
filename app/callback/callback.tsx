import { useEffect } from "react";
import { View, Text } from "react-native";
import { router } from "expo-router";
import * as Linking from "expo-linking";
import * as QueryParams from "expo-auth-session/build/QueryParams";
import { supabase } from "../../src/lib/supabase";

export default function AuthCallback() {
  useEffect(() => {
    const url = Linking.useURL();

    const run = async () => {
      const initialUrl = url ?? (await Linking.getInitialURL());
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
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <Text>Signing you in...</Text>
    </View>
  );
}
