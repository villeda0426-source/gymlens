import React, { createContext, useContext, useState, useEffect } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from "react-native";
import { usePathname } from "expo-router";
import { supabase } from "@/lib/supabase";

// Lazy-load native-only packages so a missing link never crashes the root layout.
let Device: typeof import("expo-device") | null = null;
try { Device = require("expo-device"); } catch {}

let captureScreen: ((opts: { format: string; quality: number }) => Promise<string>) | null = null;
try { captureScreen = require("react-native-view-shot").captureScreen; } catch {}

// react-native-shake uses NativeEventEmitter at module-eval time; guard with try/catch.
type ShakeModule = { addListener: (cb: () => void) => { remove: () => void } };
let RNShake: ShakeModule | null = null;
try { RNShake = require("react-native-shake").default; } catch {}

const MOODS = [
  { emoji: "😡", label: "Broken",     value: "broken" },
  { emoji: "😕", label: "Confusing",  value: "confusing" },
  { emoji: "😐", label: "Meh",        value: "meh" },
  { emoji: "💡", label: "Suggestion", value: "suggestion" },
];

interface FeedbackContextType {
  openFeedback: () => void;
}

const FeedbackContext = createContext<FeedbackContextType>({ openFeedback: () => {} });

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [selectedMood, setSelectedMood] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    if (!RNShake) return;
    let subscription: { remove: () => void } | null = null;
    try {
      subscription = RNShake.addListener(() => setVisible(true));
    } catch (e) {
      console.warn("[FeedbackContext] shake detection unavailable:", e);
    }
    return () => {
      try { subscription?.remove(); } catch {}
    };
  }, []);

  const openFeedback = () => setVisible(true);

  const handleClose = () => {
    setVisible(false);
    setSelectedMood(null);
    setText("");
  };

  const handleSubmit = async () => {
    if (!selectedMood) {
      Alert.alert("Pick a mood", "Please select an emoji before submitting.");
      return;
    }
    if (!text.trim()) {
      Alert.alert("Add a description", "Please describe the issue or suggestion.");
      return;
    }

    setSubmitting(true);

    try {
      const deviceInfo = Device
        ? {
            brand: Device.brand,
            modelName: Device.modelName,
            osVersion: Device.osVersion,
            osName: Device.osName,
            deviceType: Device.deviceType,
          }
        : {};

      let screenshotUri: string | null = null;
      try {
        if (captureScreen) {
          screenshotUri = await captureScreen({ format: "jpg", quality: 0.7 });
        }
      } catch {
        // Screenshot is optional — don't block submission
      }

      const moodLabel = MOODS.find((m) => m.value === selectedMood)?.label ?? selectedMood;

      const { error: dbError } = await supabase.from("feedback").insert({
        mood: selectedMood,
        mood_label: moodLabel,
        description: text.trim(),
        screen: pathname,
        device_info: deviceInfo,
        screenshot_uri: screenshotUri,
        created_at: new Date().toISOString(),
      } as any);

      if (dbError) {
        console.warn("Supabase feedback insert error:", dbError.message);
      }

      await fetch(`${process.env.EXPO_PUBLIC_API_BASE_URL}/api/feedback/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mood: moodLabel,
          moodEmoji: MOODS.find((m) => m.value === selectedMood)?.emoji,
          description: text.trim(),
          screen: pathname,
          deviceInfo,
          screenshotUri,
        }),
      });

      Alert.alert("Thanks! 🙌", "Your feedback was submitted. It helps make GymLens better.");
      handleClose();
    } catch (err) {
      console.error("Feedback submission error:", err);
      Alert.alert("Oops", "Something went wrong submitting feedback. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <FeedbackContext.Provider value={{ openFeedback }}>
      {children}

      <Modal
        visible={visible}
        transparent
        animationType="slide"
        onRequestClose={handleClose}
      >
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.header}>
              <Text style={styles.title}>Beta Feedback</Text>
              <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
                <Text style={styles.closeText}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.subtitle}>
              Screen: <Text style={styles.screenName}>{pathname}</Text>
            </Text>

            <Text style={styles.label}>How would you describe this?</Text>
            <View style={styles.moodRow}>
              {MOODS.map((mood) => (
                <TouchableOpacity
                  key={mood.value}
                  style={[
                    styles.moodBtn,
                    selectedMood === mood.value && styles.moodBtnSelected,
                  ]}
                  onPress={() => setSelectedMood(mood.value)}
                >
                  <Text style={styles.moodEmoji}>{mood.emoji}</Text>
                  <Text
                    style={[
                      styles.moodLabel,
                      selectedMood === mood.value && styles.moodLabelSelected,
                    ]}
                  >
                    {mood.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Tell us more</Text>
            <TextInput
              style={styles.input}
              placeholder="What happened? What were you trying to do?"
              placeholderTextColor="#aaa"
              multiline
              numberOfLines={4}
              value={text}
              onChangeText={setText}
              maxLength={500}
            />
            <Text style={styles.charCount}>{text.length}/500</Text>

            <TouchableOpacity
              style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
              onPress={handleSubmit}
              disabled={submitting}
            >
              <Text style={styles.submitText}>
                {submitting ? "Sending..." : "Send Feedback"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </FeedbackContext.Provider>
  );
}

export const useFeedback = () => useContext(FeedbackContext);

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#FAF7F0",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1a1a1a",
    fontFamily: "PlayfairDisplay_700Bold",
  },
  closeBtn: {
    padding: 6,
  },
  closeText: {
    fontSize: 16,
    color: "#888",
  },
  subtitle: {
    fontSize: 12,
    color: "#888",
    marginBottom: 20,
  },
  screenName: {
    color: "#E04E4E",
    fontWeight: "600",
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    marginBottom: 10,
  },
  moodRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  moodBtn: {
    alignItems: "center",
    padding: 10,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#e0e0e0",
    backgroundColor: "#fff",
    width: "23%",
  },
  moodBtnSelected: {
    borderColor: "#6AAA00",
    backgroundColor: "#f0fde0",
  },
  moodEmoji: {
    fontSize: 26,
    marginBottom: 4,
  },
  moodLabel: {
    fontSize: 10,
    color: "#888",
    fontWeight: "500",
  },
  moodLabelSelected: {
    color: "#6AAA00",
    fontWeight: "700",
  },
  input: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e0e0e0",
    padding: 12,
    fontSize: 14,
    color: "#333",
    minHeight: 100,
    textAlignVertical: "top",
    marginBottom: 4,
  },
  charCount: {
    fontSize: 11,
    color: "#bbb",
    textAlign: "right",
    marginBottom: 16,
  },
  submitBtn: {
    backgroundColor: "#6AAA00",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  submitBtnDisabled: {
    backgroundColor: "#aaa",
  },
  submitText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
});
