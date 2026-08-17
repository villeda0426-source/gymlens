import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors, fonts } from "@/constants/theme";
import { Sentry } from "@/lib/sentry";
import i18n from "@/lib/i18n";

type Props = {
  children: React.ReactNode;
};

type State = {
  hasError: boolean;
};

export default class AppErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[AppErrorBoundary]", error, info.componentStack);
    Sentry.captureException(error, {
      contexts: {
        react: {
          componentStack: info.componentStack,
        },
      },
      tags: {
        boundary: "AppErrorBoundary",
      },
    });
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <View style={styles.wrap}>
        <Text style={styles.title}>{i18n.t("app_status.error_title")}</Text>
        <Text style={styles.body}>
          {i18n.t("app_status.error_message")}
        </Text>
        <TouchableOpacity style={styles.button} onPress={() => this.setState({ hasError: false })}>
          <Text style={styles.buttonText}>{i18n.t("common.retry")}</Text>
        </TouchableOpacity>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: colors.bg,
  },
  title: { color: colors.text, fontFamily: fonts.heading, fontSize: 30, textAlign: "center" },
  body: { color: colors.textSecondary, fontFamily: fonts.body, fontSize: 15, lineHeight: 22, textAlign: "center", marginTop: 10 },
  button: {
    marginTop: 22,
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: colors.coral,
    paddingHorizontal: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: { color: colors.white, fontFamily: fonts.extraBold, fontSize: 15 },
});
