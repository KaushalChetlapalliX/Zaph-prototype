import { View, Text, Pressable, Image, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Colors, Radius, Spacing, Typography } from "../src/constants/design";

export default function Welcome() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <View style={styles.logoContainer}>
          <Image
            source={require("../assets/icon.png")}
            style={styles.logo}
            resizeMode="contain"
          />
        </View>

        <View style={styles.textContainer}>
          <Text style={styles.title}>Complete Goals</Text>
          <Text style={styles.subtitle}>Be productive with friends</Text>
        </View>

        <View style={styles.buttonsContainer}>
          <Pressable
            onPress={() => router.push("/create-account")}
            style={styles.primaryButton}
            android_ripple={{ color: Colors.bg.cardActive }}
          >
            <Text style={styles.primaryButtonText}>Sign up</Text>
          </Pressable>

          <Pressable
            onPress={() => router.push("/signup")}
            style={styles.secondaryButton}
            android_ripple={{ color: Colors.bg.cardActive }}
          >
            <Text style={styles.secondaryButtonText}>Log in</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const BUTTON_HEIGHT = 54;

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.bg.base,
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.screenHorizontal,
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 80,
    paddingBottom: 40,
  },
  logoContainer: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 40,
  },
  logo: {
    width: 140,
    height: 140,
  },
  textContainer: {
    alignItems: "center",
  },
  title: {
    fontSize: 34,
    fontWeight: "800",
    color: Colors.text.primary,
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    ...Typography.body,
    color: Colors.text.secondary,
    textAlign: "center",
  },
  buttonsContainer: {
    width: "100%",
    gap: Spacing.rowGap,
  },
  primaryButton: {
    height: BUTTON_HEIGHT,
    backgroundColor: Colors.brand.green,
    borderRadius: Radius.pill,
    alignItems: "center",
    justifyContent: "center",
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
});
