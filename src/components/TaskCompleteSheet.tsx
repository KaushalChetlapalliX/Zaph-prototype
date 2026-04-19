import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Radius, Spacing, Typography } from "../constants/design";

export type SheetTask = {
  key: string;
  title: string;
};

type Props = {
  visible: boolean;
  tasks: SheetTask[];
  loading: boolean;
  completing: boolean;
  onClose: () => void;
  onComplete: (taskKey: string) => void;
};

export function TaskCompleteSheet({
  visible,
  tasks,
  loading,
  completing,
  onClose,
  onComplete,
}: Props) {
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      setSelected(null);
      return;
    }
    if (selected && tasks.some((t) => t.key === selected)) return;
    setSelected(tasks[0]?.key ?? null);
  }, [visible, tasks, selected]);

  const canComplete = selected !== null && !completing && tasks.length > 0;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={() => {
        if (!completing) onClose();
      }}
    >
      <View style={styles.backdrop}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          disabled={completing}
        />
        <SafeAreaView edges={["bottom"]} style={styles.sheetWrap}>
          <View style={styles.sheet}>
            <View style={styles.handle} />

            <View style={styles.header}>
              <Text style={styles.title}>Mark a task done</Text>
              <Pressable
                onPress={onClose}
                disabled={completing}
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

            {loading ? (
              <View style={styles.emptyBlock}>
                <ActivityIndicator color={Colors.text.primary} size="small" />
                <Text style={styles.emptyText}>Loading tasks…</Text>
              </View>
            ) : tasks.length === 0 ? (
              <View style={styles.emptyBlock}>
                <Text style={styles.emptyTitle}>You're done for today</Text>
                <Text style={styles.emptyHelper}>
                  Come back tomorrow for your next set.
                </Text>
              </View>
            ) : (
              <ScrollView
                style={styles.list}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
              >
                {tasks.map((t) => {
                  const isSel = selected === t.key;
                  return (
                    <Pressable
                      key={t.key}
                      onPress={() => setSelected(t.key)}
                      disabled={completing}
                      style={({ pressed }) => [
                        styles.row,
                        isSel && styles.rowSelected,
                        pressed && !isSel && styles.rowPressed,
                      ]}
                    >
                      <Text style={styles.rowText} numberOfLines={2}>
                        {t.title}
                      </Text>
                      {isSel ? (
                        <Ionicons
                          name="checkmark-circle"
                          size={22}
                          color={Colors.brand.greenBright}
                        />
                      ) : (
                        <View style={styles.rowDot} />
                      )}
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}

            <Pressable
              onPress={() => selected && onComplete(selected)}
              disabled={!canComplete}
              style={({ pressed }) => [
                styles.primary,
                !canComplete && styles.primaryDisabled,
                pressed && canComplete && styles.primaryPressed,
              ]}
            >
              {completing ? (
                <ActivityIndicator
                  color={Colors.brand.greenText}
                  size="small"
                />
              ) : (
                <Text style={styles.primaryText}>Mark as completed</Text>
              )}
            </Pressable>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

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
    gap: 18,
  },
  handle: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.bg.cardActive,
    marginBottom: 6,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: {
    ...Typography.section,
  },
  list: {
    maxHeight: 360,
  },
  listContent: {
    gap: 8,
    paddingBottom: 4,
  },
  row: {
    minHeight: 56,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: Radius.cardSm,
    backgroundColor: Colors.bg.base,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  rowPressed: {
    backgroundColor: Colors.bg.cardActive,
  },
  rowSelected: {
    backgroundColor: Colors.bg.cardActive,
  },
  rowText: {
    ...Typography.body,
    flex: 1,
  },
  rowDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  emptyBlock: {
    paddingVertical: 36,
    alignItems: "center",
    gap: 8,
  },
  emptyTitle: {
    ...Typography.body,
    fontWeight: "600",
  },
  emptyHelper: {
    ...Typography.label,
    textAlign: "center",
  },
  emptyText: {
    ...Typography.label,
  },
  primary: {
    height: PRIMARY_HEIGHT,
    borderRadius: Radius.pill,
    backgroundColor: Colors.brand.green,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryPressed: {
    opacity: 0.8,
  },
  primaryDisabled: {
    opacity: 0.45,
  },
  primaryText: {
    ...Typography.body,
    color: Colors.brand.greenText,
    fontWeight: "600",
  },
});
