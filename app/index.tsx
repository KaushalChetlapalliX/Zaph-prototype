import { View, Text, Pressable, Image, StyleSheet, SafeAreaView } from "react-native";
import { router } from "expo-router";

export default function Index() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* Ellipse 1 - Top right (solid color with blur effect) */}
        <View style={styles.ellipse1} />

        {/* Ellipse 2 - Top large ellipse with layered solid colors */}
        <View style={styles.ellipse2Container}>
          <View style={[styles.ellipse2Layer, styles.ellipse2Layer1]} />
          <View style={[styles.ellipse2Layer, styles.ellipse2Layer2]} />
          <View style={[styles.ellipse2Layer, styles.ellipse2Layer3]} />
          <View style={[styles.ellipse2Layer, styles.ellipse2Layer4]} />
        </View>

        {/* Ellipse 3 - Bottom ellipse with layered solid colors */}
        <View style={styles.ellipse3Container}>
          <View style={[styles.ellipse3Layer, styles.ellipse3Layer1]} />
          <View style={[styles.ellipse3Layer, styles.ellipse3Layer2]} />
          <View style={[styles.ellipse3Layer, styles.ellipse3Layer3]} />
          <View style={[styles.ellipse3Layer, styles.ellipse3Layer4]} />
        </View>

        {/* Content */}
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
            >
              <Text style={styles.primaryButtonText}>Sign Up</Text>
            </Pressable>

            <Pressable
              onPress={() => router.push("/signup")}
              style={styles.secondaryButton}
            >
              <Text style={styles.secondaryButtonText}>Log in</Text>
            </Pressable>
          </View>
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
    position: "relative",
    overflow: "hidden",
  },
  ellipse1: {
    position: "absolute",
    width: 650,
    height: 650,
    borderRadius: 9999,
    backgroundColor: "#A7AEF9",
    opacity: 0.55,
    top: -250,
    right: -250,
  },
  ellipse2Container: {
    position: "absolute",
    width: 900,
    height: 900,
    borderRadius: 9999,
    top: -450,
    left: -250,
    overflow: "hidden",
  },
  ellipse2Layer: {
    position: "absolute",
    width: "100%",
    height: "100%",
    borderRadius: 9999,
  },
  ellipse2Layer1: {
    backgroundColor: "#8A41FF",
    opacity: 0.40,
    top: 0,
    left: 0,
  },
  ellipse2Layer2: {
    backgroundColor: "#EBA6F5",
    opacity: 0.35,
    top: -50,
    left: -50,
    transform: [{ rotate: "15deg" }],
  },
  ellipse2Layer3: {
    backgroundColor: "#FFFFFF",
    opacity: 0.15,
    top: 200,
    left: 100,
    transform: [{ rotate: "-10deg" }],
  },
  ellipse2Layer4: {
    backgroundColor: "#000000",
    opacity: 0.08,
    top: 300,
    left: 150,
    transform: [{ rotate: "5deg" }],
  },
  ellipse3Container: {
    position: "absolute",
    width: 800,
    height: 600,
    borderRadius: 9999,
    bottom: -250,
    right: -200,
    overflow: "hidden",
  },
  ellipse3Layer: {
    position: "absolute",
    width: "100%",
    height: "100%",
    borderRadius: 9999,
  },
  ellipse3Layer1: {
    backgroundColor: "#9146FF",
    opacity: 0.45,
    top: 0,
    left: 0,
  },
  ellipse3Layer2: {
    backgroundColor: "#FFB3CF",
    opacity: 0.28,
    top: 0,
    right: -100,
    transform: [{ rotate: "-20deg" }],
  },
  ellipse3Layer3: {
    backgroundColor: "#8F8F8F",
    opacity: 0.18,
    top: 50,
    left: 150,
    transform: [{ rotate: "15deg" }],
  },
  ellipse3Layer4: {
    backgroundColor: "#000000",
    opacity: 0.10,
    top: 100,
    right: 0,
    transform: [{ rotate: "-10deg" }],
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    zIndex: 1,
  },
  logoContainer: {
    marginBottom: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  logo: {
    width: 280,
    height: 280,
  },
  textContainer: {
    alignItems: "center",
    marginBottom: 60,
  },
  title: {
    fontSize: 32,
    fontWeight: "700",
    color: "#000000",
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 18,
    fontWeight: "400",
    color: "#666666",
    textAlign: "center",
  },
  buttonsContainer: {
    width: "100%",
    maxWidth: 320,
    gap: 16,
  },
  primaryButton: {
    paddingVertical: 16,
    paddingHorizontal: 32,
    backgroundColor: "#8A2BE2",
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  secondaryButton: {
    paddingVertical: 16,
    paddingHorizontal: 32,
    backgroundColor: "transparent",
    borderWidth: 2,
    borderColor: "#8A2BE2",
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
  },
  secondaryButtonText: {
    color: "#8A2BE2",
    fontSize: 16,
    fontWeight: "600",
  },
});

