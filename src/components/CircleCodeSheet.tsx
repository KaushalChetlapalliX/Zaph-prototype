import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../lib/supabase";
import { Colors, Radius, Spacing, Typography } from "../constants/design";
import { syncCircleSelectionsForCurrentUser } from "../lib/circle-flow";

const LEGACY_CIRCLE_DIFFICULTY = "medium";

type Mode = "join" | "create";

type CircleCodeSheetProps = {
  initialMode?: Mode;
};

export function CircleCodeSheet({
  initialMode = "join",
}: CircleCodeSheetProps) {
  const [visible, setVisible] = useState(true);
  const [mode, setMode] = useState<Mode>(initialMode);
  const [code, setCode] = useState("");
  const [circleName, setCircleName] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  const handleCreate = async () => {
    const name = circleName.trim();

    if (!name) {
      Alert.alert("Circle name required", "Please enter a circle name.");
      return;
    }

    if (loading) return;
    setLoading(true);

    try {
      const randomCode = Math.floor(Math.random() * 10000)
        .toString()
        .padStart(4, "0");

      const { data, error } = await supabase.rpc("create_circle_with_code", {
        desired_code: randomCode,
        difficulty: LEGACY_CIRCLE_DIFFICULTY,
        circle_name: name,
      });

      if (error) {
        Alert.alert("Create failed", error.message);
        return;
      }

      const row = Array.isArray(data) ? data[0] : data;
      const circleRow = (row ?? {}) as Record<string, string | undefined>;
      const circleId = String(
        circleRow.out_circle_id ?? circleRow.circle_id ?? circleRow.id ?? "",
      );
      const circleCode = String(circleRow.out_code ?? circleRow.code ?? randomCode);

      if (!circleId || circleId === "undefined") {
        Alert.alert("Create failed", "Circle id was not returned.");
        return;
      }

      await syncCircleSelectionsForCurrentUser(circleId);

      try {
        await AsyncStorage.setItem("activeCircleId", circleId);
        await AsyncStorage.setItem("activeCircleCode", circleCode);
        await AsyncStorage.setItem("activeCircleName", name);
      } catch {}

      setVisible(false);

      router.push({
        pathname: "/circle-members",
        params: {
          circleCode,
          circleId,
          circleName: name,
        },
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not create the circle.";
      Alert.alert("Create failed", message);
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    const normalized = code.replace(/\D/g, "").slice(0, 4);

    if (normalized.length !== 4) {
      Alert.alert("Enter a 4 digit code");
      return;
    }

    if (loading) return;
    setLoading(true);

    try {
      const { data: circleId, error } = await supabase.rpc("join_circle", {
        code: normalized,
      });

      if (error) {
        Alert.alert("Join failed", error.message);
        return;
      }

      const { data: circle, error: circleErr } = await supabase
        .from("circles")
        .select("code, name")
        .eq("id", circleId)
        .single();

      if (circleErr || !circle) {
        Alert.alert(
          "Joined, but couldn't load circle",
          circleErr?.message ?? "Circle details were missing.",
        );
        return;
      }

      const circleCode = String(circle.code ?? normalized);
      const nextCircleName = String(circle.name ?? "");

      await syncCircleSelectionsForCurrentUser(String(circleId));

      try {
        await AsyncStorage.setItem("activeCircleId", String(circleId));
        await AsyncStorage.setItem("activeCircleCode", circleCode);
        if (nextCircleName.trim()) {
          await AsyncStorage.setItem("activeCircleName", nextCircleName.trim());
        }
      } catch {}

      setVisible(false);

      router.push({
        pathname: "/circle-members",
        params: {
          circleId: String(circleId),
          circleCode,
          circleName: nextCircleName,
        },
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not join the circle.";
      Alert.alert("Join failed", message);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (loading) return;
    setVisible(false);
    router.back();
  };

  const switchMode = (nextMode: Mode) => {
    if (loading) return;
    setMode(nextMode);
  };

  const primaryLabel = mode === "create" ? "Create circle" : "Join circle";
  const title = mode === "create" ? "New circle" : "Join a circle";
  const helper =
    mode === "create"
      ? "Name it — we'll generate a code to share."
      : "Enter the 4 digit code from your friend.";

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <View style={styles.backdrop}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={handleClose}
          disabled={loading}
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          pointerEvents="box-none"
        >
          <SafeAreaView edges={["bottom"]} style={styles.sheetWrap}>
            <View style={styles.sheet}>
              <View style={styles.handle} />

              <View style={styles.headerRow}>
                <Text style={styles.title}>{title}</Text>
                <Pressable
                  onPress={handleClose}
                  disabled={loading}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  accessibilityLabel="Close"
                >
                  <Ionicons
                    name="close"
                    size={22}
                    color={Colors.text.secondary}
                  />
                </Pressable>
              </View>

              <View style={styles.modeRow}>
                <Pressable
                  onPress={() => switchMode("join")}
                  disabled={loading}
                  style={[
                    styles.modeButton,
                    mode === "join" ? styles.modeButtonActive : null,
                  ]}
                >
                  <Text
                    style={[
                      styles.modeButtonText,
                      mode === "join" ? styles.modeButtonTextActive : null,
                    ]}
                  >
                    Join
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => switchMode("create")}
                  disabled={loading}
                  style={[
                    styles.modeButton,
                    mode === "create" ? styles.modeButtonActive : null,
                  ]}
                >
                  <Text
                    style={[
                      styles.modeButtonText,
                      mode === "create" ? styles.modeButtonTextActive : null,
                    ]}
                  >
                    New
                  </Text>
                </Pressable>
              </View>

              {mode === "join" ? (
                <TextInput
                  style={styles.input}
                  placeholder="0000"
                  placeholderTextColor={Colors.text.secondary}
                  value={code}
                  onChangeText={(text) =>
                    setCode(text.replace(/\D/g, "").slice(0, 4))
                  }
                  keyboardType="number-pad"
                  maxLength={4}
                  autoFocus
                  editable={!loading}
                  returnKeyType="done"
                  onSubmitEditing={handleJoin}
                />
              ) : (
                <TextInput
                  style={styles.input}
                  placeholder="Circle name"
                  placeholderTextColor={Colors.text.secondary}
                  value={circleName}
                  onChangeText={setCircleName}
                  editable={!loading}
                  autoFocus
                  maxLength={40}
                  returnKeyType="done"
                  onSubmitEditing={handleCreate}
                />
              )}

              <Text style={styles.helper}>{helper}</Text>

              <Pressable
                onPress={mode === "create" ? handleCreate : handleJoin}
                style={({ pressed }) => [
                  styles.primary,
                  pressed && !loading ? styles.primaryPressed : null,
                  loading ? styles.primaryDisabled : null,
                ]}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator
                    color={Colors.brand.greenText}
                    size="small"
                  />
                ) : (
                  <Text style={styles.primaryText}>{primaryLabel}</Text>
                )}
              </Pressable>
            </View>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const INPUT_HEIGHT = 54;
const PRIMARY_HEIGHT = 54;

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.72)",
    justifyContent: "flex-end",
  },
  sheetWrap: {
    backgroundColor: Colors.bg.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  sheet: {
    paddingHorizontal: Spacing.screenHorizontal,
    paddingTop: 10,
    paddingBottom: 20,
    gap: 14,
  },
  handle: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.bg.cardActive,
    marginBottom: 6,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: {
    ...Typography.section,
  },
  modeRow: {
    flexDirection: "row",
    gap: 8,
  },
  modeButton: {
    flex: 1,
    height: 40,
    borderRadius: Radius.pill,
    backgroundColor: Colors.bg.base,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  modeButtonActive: {
    backgroundColor: Colors.bg.cardActive,
    borderColor: Colors.bg.cardActive,
  },
  modeButtonText: {
    ...Typography.label,
    color: Colors.text.secondary,
    fontWeight: "600",
  },
  modeButtonTextActive: {
    color: Colors.text.primary,
  },
  input: {
    height: INPUT_HEIGHT,
    borderRadius: Radius.pill,
    backgroundColor: Colors.bg.base,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 20,
    color: Colors.text.primary,
    fontSize: 17,
    fontWeight: "500",
  },
  helper: {
    ...Typography.label,
    lineHeight: 20,
  },
  primary: {
    height: PRIMARY_HEIGHT,
    borderRadius: Radius.pill,
    backgroundColor: Colors.brand.green,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  primaryPressed: {
    opacity: 0.8,
  },
  primaryDisabled: {
    opacity: 0.6,
  },
  primaryText: {
    ...Typography.body,
    color: Colors.brand.greenText,
    fontWeight: "600",
  },
});
