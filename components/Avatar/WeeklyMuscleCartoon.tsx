import React from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Circle, Ellipse, G, Line, Path, Rect } from "react-native-svg";
import { AvatarMuscleGroup } from "@/lib/muscleProgress";

const ACTIVE = "#e04e4e";
const REST = "#d9dbe8";
const SKIN = "#ebeaf4";
const LINE_COLOR = "#ffffff";
const INK = "#0f1020";

interface WeeklyMuscleCartoonProps {
  activeGroups: AvatarMuscleGroup[];
}

function isActive(activeGroups: AvatarMuscleGroup[], group: AvatarMuscleGroup) {
  return activeGroups.includes(group);
}

function muscleFill(activeGroups: AvatarMuscleGroup[], group: AvatarMuscleGroup) {
  return isActive(activeGroups, group) ? ACTIVE : REST;
}

function MuscleShape({ children }: { children: React.ReactNode }) {
  return <G>{children}</G>;
}

function FrontFigure({ activeGroups }: WeeklyMuscleCartoonProps) {
  return (
    <G transform="translate(10 8)">
      <Circle cx={54} cy={23} r={15} fill={SKIN} />
      <Rect x={43} y={6} width={23} height={10} rx={4} fill={SKIN} />
      <Circle cx={42} cy={24} r={4} fill={SKIN} />
      <Circle cx={66} cy={24} r={4} fill={SKIN} />
      <Line x1={54} y1={39} x2={54} y2={48} stroke={SKIN} strokeWidth={9} strokeLinecap="round" />

      <MuscleShape>
        <Path d="M33 48 C40 42 50 43 53 50 L53 70 C42 69 34 62 33 48Z" fill={muscleFill(activeGroups, "chest")} stroke={LINE_COLOR} strokeWidth={1.5} />
        <Path d="M55 50 C58 43 68 42 75 48 C74 62 66 69 55 70Z" fill={muscleFill(activeGroups, "chest")} stroke={LINE_COLOR} strokeWidth={1.5} />
      </MuscleShape>

      <MuscleShape>
        <Ellipse cx={26} cy={54} rx={11} ry={15} fill={muscleFill(activeGroups, "shoulders")} stroke={LINE_COLOR} strokeWidth={1.5} />
        <Ellipse cx={82} cy={54} rx={11} ry={15} fill={muscleFill(activeGroups, "shoulders")} stroke={LINE_COLOR} strokeWidth={1.5} />
      </MuscleShape>

      <MuscleShape>
        <Path d="M18 68 C28 72 30 93 21 109 C13 103 12 80 18 68Z" fill={muscleFill(activeGroups, "biceps")} stroke={LINE_COLOR} strokeWidth={1.5} />
        <Path d="M90 68 C80 72 78 93 87 109 C95 103 96 80 90 68Z" fill={muscleFill(activeGroups, "biceps")} stroke={LINE_COLOR} strokeWidth={1.5} />
      </MuscleShape>

      <Path d="M15 109 C16 121 24 125 28 117 C26 112 23 109 21 106Z" fill={SKIN} />
      <Path d="M93 109 C92 121 84 125 80 117 C82 112 85 109 87 106Z" fill={SKIN} />

      <MuscleShape>
        <Path d="M38 68 L70 68 L73 104 L54 123 L35 104Z" fill={muscleFill(activeGroups, "core")} stroke={LINE_COLOR} strokeWidth={1.5} />
        <Line x1={54} y1={70} x2={54} y2={116} stroke={LINE_COLOR} strokeWidth={1.2} />
        <Line x1={41} y1={82} x2={67} y2={82} stroke={LINE_COLOR} strokeWidth={1.2} />
        <Line x1={40} y1={95} x2={68} y2={95} stroke={LINE_COLOR} strokeWidth={1.2} />
      </MuscleShape>

      <MuscleShape>
        <Path d="M35 108 L53 124 L48 172 C35 161 29 129 35 108Z" fill={muscleFill(activeGroups, "quads")} stroke={LINE_COLOR} strokeWidth={1.5} />
        <Path d="M73 108 L55 124 L60 172 C73 161 79 129 73 108Z" fill={muscleFill(activeGroups, "quads")} stroke={LINE_COLOR} strokeWidth={1.5} />
      </MuscleShape>

      <MuscleShape>
        <Path d="M38 173 C48 176 49 202 38 212 C31 199 31 181 38 173Z" fill={muscleFill(activeGroups, "calves")} stroke={LINE_COLOR} strokeWidth={1.5} />
        <Path d="M70 173 C60 176 59 202 70 212 C77 199 77 181 70 173Z" fill={muscleFill(activeGroups, "calves")} stroke={LINE_COLOR} strokeWidth={1.5} />
      </MuscleShape>

      <Path d="M34 214 L48 214 L50 220 L29 220Z" fill={SKIN} />
      <Path d="M60 214 L74 214 L79 220 L58 220Z" fill={SKIN} />
      <Circle cx={49} cy={24} r={1.5} fill={INK} />
      <Circle cx={59} cy={24} r={1.5} fill={INK} />
    </G>
  );
}

function BackFigure({ activeGroups }: WeeklyMuscleCartoonProps) {
  return (
    <G transform="translate(158 8)">
      <Circle cx={54} cy={23} r={15} fill={SKIN} />
      <Path d="M40 14 C46 4 63 4 69 15 L68 34 C60 40 48 40 40 34Z" fill={SKIN} />
      <Line x1={54} y1={39} x2={54} y2={48} stroke={SKIN} strokeWidth={9} strokeLinecap="round" />

      <MuscleShape>
        <Path d="M34 47 C43 43 50 48 54 60 L54 101 C42 95 34 74 34 47Z" fill={muscleFill(activeGroups, "back")} stroke={LINE_COLOR} strokeWidth={1.5} />
        <Path d="M74 47 C65 43 58 48 54 60 L54 101 C66 95 74 74 74 47Z" fill={muscleFill(activeGroups, "back")} stroke={LINE_COLOR} strokeWidth={1.5} />
        <Line x1={54} y1={49} x2={54} y2={103} stroke={LINE_COLOR} strokeWidth={1.2} />
      </MuscleShape>

      <MuscleShape>
        <Ellipse cx={27} cy={55} rx={11} ry={15} fill={muscleFill(activeGroups, "shoulders")} stroke={LINE_COLOR} strokeWidth={1.5} />
        <Ellipse cx={81} cy={55} rx={11} ry={15} fill={muscleFill(activeGroups, "shoulders")} stroke={LINE_COLOR} strokeWidth={1.5} />
      </MuscleShape>

      <MuscleShape>
        <Path d="M18 69 C28 72 30 94 21 110 C13 104 12 81 18 69Z" fill={muscleFill(activeGroups, "triceps")} stroke={LINE_COLOR} strokeWidth={1.5} />
        <Path d="M90 69 C80 72 78 94 87 110 C95 104 96 81 90 69Z" fill={muscleFill(activeGroups, "triceps")} stroke={LINE_COLOR} strokeWidth={1.5} />
      </MuscleShape>

      <Path d="M15 110 C16 122 24 126 28 118 C26 113 23 110 21 107Z" fill={SKIN} />
      <Path d="M93 110 C92 122 84 126 80 118 C82 113 85 110 87 107Z" fill={SKIN} />

      <MuscleShape>
        <Path d="M35 101 C45 97 53 103 53 119 C43 123 35 118 35 101Z" fill={muscleFill(activeGroups, "glutes")} stroke={LINE_COLOR} strokeWidth={1.5} />
        <Path d="M73 101 C63 97 55 103 55 119 C65 123 73 118 73 101Z" fill={muscleFill(activeGroups, "glutes")} stroke={LINE_COLOR} strokeWidth={1.5} />
      </MuscleShape>

      <MuscleShape>
        <Path d="M35 118 L53 122 L48 172 C36 164 31 137 35 118Z" fill={muscleFill(activeGroups, "hamstrings")} stroke={LINE_COLOR} strokeWidth={1.5} />
        <Path d="M73 118 L55 122 L60 172 C72 164 77 137 73 118Z" fill={muscleFill(activeGroups, "hamstrings")} stroke={LINE_COLOR} strokeWidth={1.5} />
      </MuscleShape>

      <MuscleShape>
        <Path d="M38 173 C48 176 49 202 38 212 C31 199 31 181 38 173Z" fill={muscleFill(activeGroups, "calves")} stroke={LINE_COLOR} strokeWidth={1.5} />
        <Path d="M70 173 C60 176 59 202 70 212 C77 199 77 181 70 173Z" fill={muscleFill(activeGroups, "calves")} stroke={LINE_COLOR} strokeWidth={1.5} />
      </MuscleShape>

      <Path d="M34 214 L48 214 L50 220 L29 220Z" fill={SKIN} />
      <Path d="M60 214 L74 214 L79 220 L58 220Z" fill={SKIN} />
    </G>
  );
}

export default function WeeklyMuscleCartoon({ activeGroups }: WeeklyMuscleCartoonProps) {
  return (
    <View style={styles.wrap} pointerEvents="none">
      <Svg viewBox="0 0 286 238" width="100%" height="100%">
        <FrontFigure activeGroups={activeGroups} />
        <BackFigure activeGroups={activeGroups} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    maxWidth: 340,
    height: 282,
    alignSelf: "center",
  },
});
