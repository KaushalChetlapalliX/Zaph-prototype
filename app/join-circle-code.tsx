import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Modal,
  Alert,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../src/lib/supabase";

export default function JoinCircleCode() {
  const [visible, setVisible] = useState(true);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);

  const handleCreate = () => {
    setVisible(false);
    router.push("/create-circle-code");
  };

  const handleJoin = async () => {
    const normalized = code.replace(/\D/g, "").slice(0, 4);

    if (normalized.length !== 4) {
      Alert.alert("Enter a 4 digit code");
      return;
    }

    if (loading) return;
    setLoading(true);

    // join_circle inserts into circle_members and returns circle_id
    const { data: circleId, error } = await supabase.rpc("join_circle", {
      code: normalized,
    });

    if (error) {
      setLoading(false);
      Alert.alert("Join failed", error.message);
      return;
    }

    // Fetch difficulty (and confirm code)
    const { data: circle, error: circleErr } = await supabase
      .from("circles")
      .select("difficulty, code")
      .eq("id", circleId)
      .single();

    setLoading(false);

    if (circleErr || !circle?.difficulty) {
      Alert.alert("Joined, but couldn't load circle", circleErr?.message ?? "Missing difficulty");
      return;
    }

    const level = circle.difficulty as "easy" | "medium" | "hard";
    const circleCode = String(circle.code ?? normalized);

    // Persist latest active circle so new circles work
    try {
      await AsyncStorage.setItem("activeCircleId", String(circleId));
      await AsyncStorage.setItem("activeCircleCode", circleCode);
      await AsyncStorage.setItem("activeDifficulty", level);
    } catch {
      // ignore
    }

    setVisible(false);

    // Joiner goes to Circle Members screen
    router.push({
      pathname: "/circle-members",
      params: {
        circleId: String(circleId),
        circleCode,
        level,
      },
    });
  };

  const handleGoBack = () => {
    if (loading) return;
    setVisible(false);
    router.back();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleGoBack}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.overlay}>
          <Pressable style={styles.overlayPressable} onPress={handleGoBack} disabled={loading} />
          <View style={styles.card}>
            <Text style={styles.title}>Join a circle</Text>

            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                placeholder="Enter Circle Code"
                placeholderTextColor="rgba(0,0,0,0.45)"
                value={code}
                onChangeText={(t) => setCode(t.replace(/\D/g, "").slice(0, 4))}
                keyboardType="number-pad"
                maxLength={4}
                autoFocus
                editable={!loading}
              />
            </View>

            <View style={styles.buttonRow}>
              <Pressable
                onPress={handleCreate}
                style={[styles.button, loading ? styles.buttonDisabled : null]}
                disabled={loading}
              >
                <Text style={styles.buttonText}>Create</Text>
              </Pressable>

              <Pressable
                onPress={handleJoin}
                style={[styles.button, loading ? styles.buttonDisabled : null]}
                disabled={loading}
              >
                {loading ? (
                  <View style={styles.loadingRow}>
                    <ActivityIndicator color="#FFFFFF" />
                    <Text style={styles.buttonText}>Joining</Text>
                  </View>
                ) : (
                  <Text style={styles.buttonText}>Join</Text>
                )}
              </Pressable>
            </View>

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
    paddingTop: 40,
    paddingBottom: 32,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
    width: "85%",
    maxWidth: 400,
    alignItems: "center",
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#000000",
    marginBottom: 24,
    textAlign: "center",
  },
  inputContainer: { width: "100%", marginBottom: 24 },
  input: {
    backgroundColor: "rgba(0,0,0,0.05)",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 16,
    color: "#000000",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
    height: 48,
  },
  buttonRow: { flexDirection: "row", gap: 12, width: "100%", marginBottom: 20 },
  button: {
    flex: 1,
    backgroundColor: "#C852FF",
    borderRadius: 25,
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonDisabled: { opacity: 0.75 },
  loadingRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  buttonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "600" },
  backButton: { paddingVertical: 12, alignItems: "center", justifyContent: "center" },
  backButtonText: { color: "#000000", fontSize: 14, fontWeight: "500" },
});
