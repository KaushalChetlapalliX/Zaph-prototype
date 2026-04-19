import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Colors, Spacing } from "../constants/design";

type TabKey = "home" | "circles" | "settings";

type TabConfig = {
  key: TabKey;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
};

type Props = {
  active: TabKey;
};

const TABS: readonly TabConfig[] = [
  { key: "home", icon: "home-outline", label: "Home" },
  { key: "circles", icon: "people-outline", label: "Circles" },
  { key: "settings", icon: "settings-outline", label: "Settings" },
];

export function TabBar({ active }: Props) {
  const handlePress = (key: TabKey) => {
    if (key === active) return;
    switch (key) {
      case "home":
        router.push("/user-home");
        break;
      case "circles":
        router.push("/create-circle");
        break;
      case "settings":
        router.push("/settings");
        break;
    }
  };

  return (
    <View style={styles.bar}>
      {TABS.map((t) => {
        const isActive = t.key === active;
        return (
          <Pressable
            key={t.key}
            onPress={() => handlePress(t.key)}
            hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
            accessibilityRole="tab"
            accessibilityLabel={t.label}
            accessibilityState={{ selected: isActive }}
            style={({ pressed }) => [
              styles.item,
              pressed && !isActive && styles.itemPressed,
            ]}
          >
            <Ionicons
              name={t.icon}
              size={24}
              color={isActive ? Colors.text.primary : Colors.text.secondary}
            />
            <View
              style={[
                styles.indicator,
                isActive ? styles.indicatorActive : null,
              ]}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    backgroundColor: Colors.bg.base,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 10,
    paddingBottom: 24,
    paddingHorizontal: Spacing.screenHorizontal,
  },
  item: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 4,
  },
  itemPressed: {
    opacity: 0.6,
  },
  indicator: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "transparent",
  },
  indicatorActive: {
    backgroundColor: Colors.text.primary,
  },
});
