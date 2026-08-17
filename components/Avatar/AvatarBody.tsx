import React, { useMemo, useRef } from "react";
import { Dimensions, Image, ImageSourcePropType, PanResponder, StyleSheet, View } from "react-native";
import Svg, { Ellipse, G, Rect } from "react-native-svg";
import { colors } from "@/constants/theme";
import { AvatarMuscleGroup } from "@/lib/muscleProgress";

const { width: SCREEN_W } = Dimensions.get("window");
const ART_ASPECT_RATIO = 852 / 1846;
const ROTATE_DRAG_THRESHOLD = 28;

const FRONT_AVATAR = require("@/assets/images/avatar/fitness-avatar-front.png");
const BACK_AVATAR = require("@/assets/images/avatar/fitness-avatar-back.png");
const CURVED_FRONT_AVATAR = require("@/assets/images/avatar/fitness-avatar-curved-front.png");
const CURVED_BACK_AVATAR = require("@/assets/images/avatar/fitness-avatar-curved-back.png");
// Placeholder until a dedicated side-angle asset exists — swap these two requires
// for real art and the rotation UI needs no other changes.
const SIDE_AVATAR = FRONT_AVATAR;
const CURVED_SIDE_AVATAR = CURVED_FRONT_AVATAR;

const TRAINED_BLUE = "#2167ff";
const LEVEL_OPACITY = [0, 0.22, 0.34, 0.48, 0.62, 0.78];

export type AvatarBodyStyle = "straight" | "curved";
export type AvatarView = "front" | "side" | "back";

const VIEW_ORDER: AvatarView[] = ["front", "back"];

export interface AvatarBodyProps {
  view: AvatarView;
  onChangeView?: (view: AvatarView) => void;
  bodyStyle?: AvatarBodyStyle;
  levels: Record<AvatarMuscleGroup, number>;
  onPressMuscle?: (group: AvatarMuscleGroup) => void;
  size?: number;
}

type RegionShape =
  | { type: "rect"; x: number; y: number; width: number; height: number; rx: number }
  | { type: "ellipse"; cx: number; cy: number; rx: number; ry: number };

interface Region {
  group: AvatarMuscleGroup;
  shapes: RegionShape[];
}

const FRONT_REGIONS: Region[] = [
  { group: "chest", shapes: [{ type: "rect", x: 32, y: 49, width: 36, height: 17, rx: 8 }] },
  {
    group: "shoulders",
    shapes: [
      { type: "ellipse", cx: 28, cy: 59, rx: 7, ry: 9 },
      { type: "ellipse", cx: 72, cy: 59, rx: 7, ry: 9 },
    ],
  },
  {
    group: "biceps",
    shapes: [
      { type: "ellipse", cx: 24, cy: 76, rx: 6, ry: 13 },
      { type: "ellipse", cx: 76, cy: 76, rx: 6, ry: 13 },
    ],
  },
  { group: "core", shapes: [{ type: "rect", x: 38, y: 66, width: 24, height: 29, rx: 9 }] },
  {
    group: "quads",
    shapes: [
      { type: "rect", x: 31, y: 104, width: 17, height: 39, rx: 8 },
      { type: "rect", x: 52, y: 104, width: 17, height: 39, rx: 8 },
    ],
  },
  {
    group: "calves",
    shapes: [
      { type: "ellipse", cx: 38, cy: 155, rx: 7, ry: 18 },
      { type: "ellipse", cx: 62, cy: 155, rx: 7, ry: 18 },
    ],
  },
];

const BACK_REGIONS: Region[] = [
  { group: "back", shapes: [{ type: "rect", x: 32, y: 47, width: 36, height: 43, rx: 13 }] },
  {
    group: "shoulders",
    shapes: [
      { type: "ellipse", cx: 27, cy: 59, rx: 7, ry: 9 },
      { type: "ellipse", cx: 73, cy: 59, rx: 7, ry: 9 },
    ],
  },
  {
    group: "triceps",
    shapes: [
      { type: "ellipse", cx: 23, cy: 76, rx: 6, ry: 14 },
      { type: "ellipse", cx: 77, cy: 76, rx: 6, ry: 14 },
    ],
  },
  { group: "glutes", shapes: [{ type: "rect", x: 32, y: 96, width: 36, height: 21, rx: 10 }] },
  {
    group: "hamstrings",
    shapes: [
      { type: "rect", x: 31, y: 116, width: 17, height: 31, rx: 8 },
      { type: "rect", x: 52, y: 116, width: 17, height: 31, rx: 8 },
    ],
  },
  {
    group: "calves",
    shapes: [
      { type: "ellipse", cx: 38, cy: 155, rx: 7, ry: 18 },
      { type: "ellipse", cx: 62, cy: 155, rx: 7, ry: 18 },
    ],
  },
];

const CURVED_FRONT_REGIONS: Region[] = [
  { group: "chest", shapes: [{ type: "rect", x: 33, y: 50, width: 34, height: 17, rx: 8 }] },
  {
    group: "shoulders",
    shapes: [
      { type: "ellipse", cx: 29, cy: 59, rx: 6, ry: 9 },
      { type: "ellipse", cx: 71, cy: 59, rx: 6, ry: 9 },
    ],
  },
  {
    group: "biceps",
    shapes: [
      { type: "ellipse", cx: 25, cy: 76, rx: 5, ry: 13 },
      { type: "ellipse", cx: 75, cy: 76, rx: 5, ry: 13 },
    ],
  },
  { group: "core", shapes: [{ type: "rect", x: 39, y: 67, width: 22, height: 26, rx: 9 }] },
  {
    group: "quads",
    shapes: [
      { type: "rect", x: 29, y: 104, width: 19, height: 39, rx: 9 },
      { type: "rect", x: 52, y: 104, width: 19, height: 39, rx: 9 },
    ],
  },
  {
    group: "calves",
    shapes: [
      { type: "ellipse", cx: 38, cy: 155, rx: 7, ry: 18 },
      { type: "ellipse", cx: 62, cy: 155, rx: 7, ry: 18 },
    ],
  },
];

const CURVED_BACK_REGIONS: Region[] = [
  { group: "back", shapes: [{ type: "rect", x: 35, y: 48, width: 30, height: 40, rx: 12 }] },
  {
    group: "shoulders",
    shapes: [
      { type: "ellipse", cx: 30, cy: 59, rx: 6, ry: 9 },
      { type: "ellipse", cx: 70, cy: 59, rx: 6, ry: 9 },
    ],
  },
  {
    group: "triceps",
    shapes: [
      { type: "ellipse", cx: 25, cy: 76, rx: 5, ry: 13 },
      { type: "ellipse", cx: 75, cy: 76, rx: 5, ry: 13 },
    ],
  },
  { group: "glutes", shapes: [{ type: "rect", x: 31, y: 94, width: 38, height: 23, rx: 11 }] },
  {
    group: "hamstrings",
    shapes: [
      { type: "rect", x: 29, y: 116, width: 19, height: 31, rx: 9 },
      { type: "rect", x: 52, y: 116, width: 19, height: 31, rx: 9 },
    ],
  },
  {
    group: "calves",
    shapes: [
      { type: "ellipse", cx: 38, cy: 155, rx: 7, ry: 18 },
      { type: "ellipse", cx: 62, cy: 155, rx: 7, ry: 18 },
    ],
  },
];

// Placeholder region maps for the side angle — reuse the front layout until a
// real side-view asset is calibrated with its own coordinates.
const SIDE_REGIONS: Region[] = FRONT_REGIONS;
const CURVED_SIDE_REGIONS: Region[] = CURVED_FRONT_REGIONS;

function clampLevel(level: number) {
  return Math.max(0, Math.min(5, Math.round(level || 0)));
}

function ProgressRegions({
  regions,
  levels,
  onPressMuscle,
}: {
  regions: Region[];
  levels: Record<AvatarMuscleGroup, number>;
  onPressMuscle?: (group: AvatarMuscleGroup) => void;
}) {
  return (
    <G>
      {regions.map(({ group, shapes }) => {
        const level = clampLevel(levels[group] ?? 0);
        return shapes.map((shape, index) => {
          const shared = {
            fill: TRAINED_BLUE,
            fillOpacity: LEVEL_OPACITY[level],
            stroke: level > 0 ? "#edf2ff" : "transparent",
            strokeOpacity: level > 0 ? 0.9 : 0,
            strokeWidth: level >= 4 ? 1.4 : 1,
            onPress: onPressMuscle ? () => onPressMuscle(group) : undefined,
          };
          const key = `${group}-${index}`;

          if (shape.type === "ellipse") {
            return <Ellipse key={key} {...shared} cx={shape.cx} cy={shape.cy} rx={shape.rx} ry={shape.ry} />;
          }

          return (
            <Rect
              key={key}
              {...shared}
              x={shape.x}
              y={shape.y}
              width={shape.width}
              height={shape.height}
              rx={shape.rx}
            />
          );
        });
      })}
    </G>
  );
}

const STRAIGHT_SOURCES: Record<AvatarView, ImageSourcePropType> = {
  front: FRONT_AVATAR,
  side: SIDE_AVATAR,
  back: BACK_AVATAR,
};
const CURVED_SOURCES: Record<AvatarView, ImageSourcePropType> = {
  front: CURVED_FRONT_AVATAR,
  side: CURVED_SIDE_AVATAR,
  back: CURVED_BACK_AVATAR,
};
const STRAIGHT_REGIONS: Record<AvatarView, Region[]> = {
  front: FRONT_REGIONS,
  side: SIDE_REGIONS,
  back: BACK_REGIONS,
};
const CURVED_REGIONS: Record<AvatarView, Region[]> = {
  front: CURVED_FRONT_REGIONS,
  side: CURVED_SIDE_REGIONS,
  back: CURVED_BACK_REGIONS,
};

export default function AvatarBody({
  view,
  onChangeView,
  bodyStyle = "straight",
  levels,
  onPressMuscle,
  size,
}: AvatarBodyProps) {
  const width = size ?? Math.min(SCREEN_W * 0.7, 270);
  const height = width / ART_ASPECT_RATIO;
  const source = bodyStyle === "curved" ? CURVED_SOURCES[view] : STRAIGHT_SOURCES[view];
  const regions = bodyStyle === "curved" ? CURVED_REGIONS[view] : STRAIGHT_REGIONS[view];

  const dragX = useRef(0);
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          !!onChangeView && Math.abs(gesture.dx) > 6 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
        onMoveShouldSetPanResponderCapture: (_, gesture) =>
          !!onChangeView && Math.abs(gesture.dx) > 6 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
        onPanResponderTerminationRequest: () => false,
        onPanResponderMove: (_, gesture) => {
          dragX.current = gesture.dx;
        },
        onPanResponderRelease: () => {
          if (!onChangeView || Math.abs(dragX.current) < ROTATE_DRAG_THRESHOLD) {
            dragX.current = 0;
            return;
          }
          const currentIndex = VIEW_ORDER.indexOf(view);
          const direction = dragX.current > 0 ? -1 : 1;
          const nextIndex = (currentIndex + direction + VIEW_ORDER.length) % VIEW_ORDER.length;
          onChangeView(VIEW_ORDER[nextIndex]);
          dragX.current = 0;
        },
      }),
    [view, onChangeView]
  );

  return (
    <View style={[styles.container, { width, height }]} {...panResponder.panHandlers}>
      <Image source={source} style={styles.avatar} resizeMode="contain" accessibilityIgnoresInvertColors />
      <Svg style={StyleSheet.absoluteFill} viewBox="0 0 100 217">
        <ProgressRegions regions={regions} levels={levels} onPressMuscle={onPressMuscle} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { position: "relative" },
  avatar: { width: "100%", height: "100%" },
});
