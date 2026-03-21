// app/create-circle-code.tsx
import { useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Modal,
  Alert,
  ActivityIndicator,
  TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

export default function CreateCircleCode() {
  const [visible, setVisible] = useState(true);
  const [loading, setLoading] = useState(false);
  const [circleName, setCircleName] = useState("");

  const handleCreate = async () => {
    const name = circleName.trim();

    if (!name) {
      Alert.alert("Circle name required", "Please enter a circle name.");
      return;
    }

    if (loading) return;
    setLoading(true);

    // Generate code in background (not shown here, it will be shown on circle-members screen)
    const randomCode = Math.floor(Math.random() * 10000)
      .toString()
      .padStart(4, "0");

    setLoading(false);
    setVisible(false);

    router.push({
  pathname: "/onboarding",
  params: { code: randomCode, name },
});

  };

  const handleGoBack = () => {
    if (loading) return;
    setVisible(false);
    router.back();
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={handleGoBack}
    >
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.overlay}>
          <Pressable style={styles.overlayPressable} onPress={handleGoBack} disabled={loading} />

          <View style={styles.card}>
            <Text style={styles.title}>Create a circle</Text>

            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                placeholder="Circle Name"
                placeholderTextColor="rgba(0,0,0,0.45)"
                value={circleName}
                onChangeText={setCircleName}
                editable={!loading}
                autoFocus
                maxLength={40}
              />
            </View>

            <Pressable
              onPress={handleCreate}
              style={[styles.createButton, loading ? styles.buttonDisabled : null]}
              disabled={loading}
            >
              {loading ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator color="#FFFFFF" />
                  <Text style={styles.createButtonText}>Creating</Text>
                </View>
              ) : (
                <Text style={styles.createButtonText}>Create</Text>
              )}
            </Pressable>

            <Pressable onPress={handleGoBack} style={styles.backButton} disabled={loading}>
              <Text style={styles.backButtonText}>Go back</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#F8EEFF" },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.25)",
    justifyContent: "center",
    alignItems: "center",
  },
  overlayPressable: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },

  card: {
    backgroundColor: "#DECFFF",
    borderRadius: 30,
    paddingHorizontal: 32,
    paddingTop: 36,
    paddingBottom: 28,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
    width: "85%",
    maxWidth: 420,
    alignItems: "center",
  },

  title: {
    fontSize: 28,
    fontWeight: "800",
    color: "#000000",
    marginBottom: 20,
    textAlign: "center",
  },

  inputContainer: { width: "100%", marginBottom: 18 },
  input: {
    backgroundColor: "rgba(0,0,0,0.05)",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 16,
    color: "#000000",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.12)",
    height: 50,
  },

  createButton: {
    backgroundColor: "#C852FF",
    borderRadius: 25,
    paddingVertical: 16,
    paddingHorizontal: 32,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    marginBottom: 10,
  },
  buttonDisabled: { opacity: 0.75 },
  loadingRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  createButtonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },

  backButton: { paddingVertical: 12, alignItems: "center", justifyContent: "center" },
  backButtonText: { color: "#000000", fontSize: 14, fontWeight: "500" },
});
