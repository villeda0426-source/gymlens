import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  PanResponder,
  StyleSheet,
  TouchableOpacity,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { useFeedback } from "@/context/FeedbackContext";

const POSITION_KEY = "coachlift_feedback_button_position_v2";
const BUTTON_SIZE = 46;

const getDefaultPosition = () => {
  const { width, height } = Dimensions.get("window");
  return {
    x: width - BUTTON_SIZE - 16,
    y: Math.round(height / 2 - BUTTON_SIZE / 2),
  };
};

const DEFAULT_POSITION = getDefaultPosition();

export function FeedbackButton() {
  const { openFeedback } = useFeedback();
  const pan = useRef(new Animated.ValueXY(DEFAULT_POSITION)).current;
  const currentPosition = useRef(DEFAULT_POSITION);
  const didDrag = useRef(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(POSITION_KEY).then((stored) => {
      if (!stored) {
        setReady(true);
        return;
      }
      try {
        const parsed = JSON.parse(stored);
        const clamped = clampPosition(parsed.x, parsed.y);
        currentPosition.current = clamped;
        pan.setValue(clamped);
      } catch {}
      setReady(true);
    });
  }, [pan]);

  const clampPosition = (x: number, y: number) => {
    const { width, height } = Dimensions.get("window");
    return {
      x: Math.min(Math.max(8, x), width - BUTTON_SIZE - 8),
      y: Math.min(Math.max(44, y), height - BUTTON_SIZE - 32),
    };
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_evt, gesture) =>
        Math.abs(gesture.dx) > 3 || Math.abs(gesture.dy) > 3,
      onPanResponderGrant: () => {
        didDrag.current = false;
      },
      onPanResponderMove: (_evt, gesture) => {
        didDrag.current = true;
        pan.setValue({
          x: currentPosition.current.x + gesture.dx,
          y: currentPosition.current.y + gesture.dy,
        });
      },
      onPanResponderRelease: async (_evt, gesture) => {
        const next = clampPosition(
          currentPosition.current.x + gesture.dx,
          currentPosition.current.y + gesture.dy
        );
        currentPosition.current = next;
        Animated.spring(pan, {
          toValue: next,
          useNativeDriver: false,
          friction: 7,
          tension: 80,
        }).start();
        await AsyncStorage.setItem(POSITION_KEY, JSON.stringify(next));
      },
    })
  ).current;

  return (
    <Animated.View
      {...panResponder.panHandlers}
      style={[
        styles.wrap,
        {
          opacity: ready ? 1 : 0,
          transform: [{ translateX: pan.x }, { translateY: pan.y }],
        },
      ]}
    >
      <TouchableOpacity
        style={styles.btn}
        onPress={() => {
          if (!didDrag.current) openFeedback();
          didDrag.current = false;
        }}
        activeOpacity={0.82}
      >
        <Ionicons name="chatbubble-ellipses" size={21} color="#fff" />
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    top: 0,
    left: 0,
    zIndex: 9999,
    elevation: 8,
  },
  btn: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BUTTON_SIZE / 2,
    backgroundColor: "#6AAA00",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
});
