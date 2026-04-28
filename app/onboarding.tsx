import { useEffect } from "react";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Colors, Spacing, Typography } from "../src/constants/design";

export default function OnboardingRedirect() {
  useEffect(() => {
    router.replace("/create-circle");
  }, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <ActivityIndicator color={Colors.text.primary} size="small" />
        <Text style={styles.text}>Opening your circles…</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.bg.base,
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.inlineGap,
  },
  text: {
    ...Typography.label,
  },
});
