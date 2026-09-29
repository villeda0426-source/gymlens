// Coach Forward Phase 3 — the "•••" menu in the compact chat header. Houses
// "View my week", "Rebuild my plan", and "Start fresh" (moved out of their
// old standalone buttons/icons per the redesign).
import React from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { coachColors, coachFonts, radii } from "@/constants/theme";

export interface CoachHeaderMenuItem {
  key: string;
  label: string;
  onPress: () => void;
  destructive?: boolean;
}

interface CoachHeaderMenuProps {
  visible: boolean;
  onClose: () => void;
  items: CoachHeaderMenuItem[];
}

export default function CoachHeaderMenu({ visible, onClose, items }: CoachHeaderMenuProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close menu">
        <View style={styles.menuWrap} pointerEvents="box-none">
          <View style={styles.menu}>
            {items.map((item, index) => (
              <Pressable
                key={item.key}
                onPress={() => {
                  onClose();
                  item.onPress();
                }}
                style={[styles.item, index < items.length - 1 && styles.itemBorder]}
                accessibilityRole="button"
                accessibilityLabel={item.label}
              >
                <Text style={[styles.itemText, item.destructive && styles.itemTextDestructive]}>{item.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(12,35,64,0.15)" },
  menuWrap: { position: "absolute", top: 96, right: 20 },
  menu: {
    minWidth: 200,
    backgroundColor: coachColors.card,
    borderRadius: radii.card,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.14,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  item: { paddingHorizontal: 18, paddingVertical: 14 },
  itemBorder: { borderBottomWidth: 1, borderBottomColor: coachColors.border },
  itemText: { fontFamily: coachFonts.bodySemiBold, fontSize: 15, color: coachColors.text },
  itemTextDestructive: { color: coachColors.coralPressed },
});
