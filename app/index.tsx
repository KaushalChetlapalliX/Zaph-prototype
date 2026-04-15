import { useState } from "react";
import {
  Image,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

const BG = "#F8EEFF";
const TEXT = "#000000";
const HERO_COPY = "Become the best version of yourself with the help of your friends.";
const PREVIEW_ASPECT_RATIO = 852 / 393;

type IntroStep = "hero" | "create" | "join" | "leaderboard";

export default function Index() {
  const { width, height } = useWindowDimensions();
  const [step, setStep] = useState<IntroStep>("hero");

  const previewWidth = Math.min(width - 48, 320);
  const fullPreviewHeight = previewWidth * PREVIEW_ASPECT_RATIO;
  const previewHeight = Math.min(fullPreviewHeight, height * 0.52);

  const activePage = step === "hero" ? 0 : step === "leaderboard" ? 2 : 1;

  const handleNext = () => {
    if (step === "hero") {
      setStep("create");
      return;
    }

    if (step === "create") {
      setStep("join");
      return;
    }

    if (step === "join") {
      setStep("leaderboard");
      return;
    }

    router.replace("/welcome");
  };

  const isCreateFocus = step === "create";

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.topGlow} />
        <View style={styles.midGlow} />
        <View style={styles.bottomGlow} />

        <View style={styles.content}>
          {step === "hero" ? (
            <View style={styles.heroSection}>
              <Image
                source={require("../assets/icon.png")}
                style={styles.logo}
                resizeMode="contain"
              />

              <Text style={styles.eyebrow}>Complete Goals</Text>

              <Text style={styles.heroTitle}>{HERO_COPY}</Text>

              <Text style={styles.heroSubtitle}>Be productive with friends</Text>
            </View>
          ) : step === "leaderboard" ? (
            <View style={styles.previewSection}>
              <Text style={styles.previewTitle}>Compete and improve with friends.</Text>

              <View style={[styles.previewFrame, { width: previewWidth, height: previewHeight }]}>
                <Image
                  source={require("../assets/figma/circle-home.png")}
                  style={{ width: previewWidth, height: fullPreviewHeight }}
                  resizeMode="cover"
                />
              </View>
            </View>
          ) : (
            <View style={styles.previewSection}>
              <Text style={styles.previewTitle}>Create or join your circle.</Text>
              <Text style={styles.previewSubtitle}>
                {isCreateFocus
                  ? "Create a circle with your friends."
                  : "Join a circle with friends."}
              </Text>

              <View style={[styles.previewFrame, { width: previewWidth, height: previewHeight }]}>
                <Image
                  source={require("../assets/figma/create-circle.png")}
                  style={{ width: previewWidth, height: fullPreviewHeight }}
                  resizeMode="cover"
                />
              </View>
            </View>
          )}
        </View>

        <View style={styles.footer}>
          <View style={styles.dotsRow}>
            {[0, 1, 2].map((dot) => (
              <View
                key={dot}
                style={[styles.dot, dot === activePage ? styles.dotActive : null]}
              />
            ))}
          </View>

          <Pressable onPress={handleNext} style={styles.nextButton}>
            <Text style={styles.nextButtonText}>Next</Text>
            <Ionicons name="arrow-forward" size={18} color={TEXT} />
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: BG,
  },
  container: {
    flex: 1,
    backgroundColor: BG,
    overflow: "hidden",
  },
  topGlow: {
    position: "absolute",
    width: 420,
    height: 420,
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
    opacity: 0.55,
    top: -140,
    right: -100,
  },
  midGlow: {
    position: "absolute",
    width: 360,
    height: 360,
    borderRadius: 999,
    backgroundColor: "#E4D0FF",
    opacity: 0.9,
    top: 100,
    left: -120,
  },
  bottomGlow: {
    position: "absolute",
    width: 420,
    height: 420,
    borderRadius: 999,
    backgroundColor: "#D1B0FF",
    opacity: 0.35,
    bottom: -180,
    right: -140,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 22,
    justifyContent: "center",
    zIndex: 1,
  },
  heroSection: {
    alignItems: "center",
    justifyContent: "center",
  },
  logo: {
    width: 180,
    height: 180,
    marginBottom: 18,
  },
  eyebrow: {
    fontSize: 18,
    fontWeight: "700",
    color: TEXT,
    marginBottom: 16,
    textAlign: "center",
  },
  heroTitle: {
    fontSize: 34,
    lineHeight: 42,
    fontWeight: "800",
    color: TEXT,
    textAlign: "center",
    minHeight: 170,
    maxWidth: 340,
  },
  heroSubtitle: {
    fontSize: 18,
    fontWeight: "500",
    color: TEXT,
    textAlign: "center",
    marginTop: 6,
  },
  previewSection: {
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
  },
  previewTitle: {
    fontSize: 32,
    lineHeight: 38,
    fontWeight: "800",
    color: TEXT,
    textAlign: "center",
    maxWidth: 340,
  },
  previewSubtitle: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "500",
    color: TEXT,
    textAlign: "center",
    maxWidth: 330,
  },
  previewFrame: {
    marginTop: 8,
    borderRadius: 28,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
    backgroundColor: "#FFFFFF",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 5,
  },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    zIndex: 1,
  },
  dotsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.18)",
  },
  dotActive: {
    width: 28,
    backgroundColor: TEXT,
  },
  nextButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FFFFFF",
    borderWidth: 1.5,
    borderColor: TEXT,
    borderRadius: 999,
    paddingVertical: 14,
    paddingHorizontal: 20,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  nextButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: TEXT,
  },
});
