import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import SafeScreen from "@/components/Layout/SafeScreen";
import { useTabBarSpace } from "@/components/Navigation/FloatingTabBar";
import { colors, coachColors, coachFonts, fonts, radii, spacing } from "@/constants/theme";
import CoachComposer from "@/components/Coach/CoachComposer";
import CoachMessageBubble from "@/components/Coach/CoachMessageBubble";
import CoachSuggestionCard from "@/components/Coach/CoachSuggestionCard";
import FeelingCheckIn, { Feeling } from "@/components/Coach/FeelingCheckIn";
import SafetyNote from "@/components/Coach/SafetyNote";
import SuggestedPrompts from "@/components/Coach/SuggestedPrompts";
import { supabase } from "@/lib/supabase";
import {
  callCoachTrainer,
  CoachMessage,
  CoachResponse,
  flagRulesCoachResponse,
  makeFreeformWorkoutLog,
  runCoachTrainerJob,
} from "@/lib/coachTrainer";
import { useCoachTrainerStore } from "@/store/coachTrainerStore";
import { usePlanSetupStore } from "@/store/planSetupStore";
import { useAuthStore } from "@/store/authStore";
import CoachHeaderMenu from "@/components/Coach/CoachHeaderMenu";
import ProfileSummaryChips from "@/components/Coach/ProfileSummaryChips";
import {
  adjustSessionForToday,
  hasCoachMedicalRedFlag,
  ReliableSession,
  SessionChange,
  TodayContext,
} from "@/shared/reliableCoach";

// Phase 3: one row of 3 chips, matching Chat.png exactly (the other quick
// actions this used to expose — adjust today, explain, etc. — are still
// reachable by just typing, or from the adjust-today panel below).
const QUICK_ACTIONS = [
  "trainer.quick_actions.swap_exercise",
  "trainer.quick_actions.something_hurts",
  "trainer.quick_actions.short_on_time",
];

type SpeechRecognitionModule = {
  addListener?: (eventName: string, listener: (event: any) => void) => { remove: () => void };
  abort: () => void;
  stop: () => void;
  start: (options: Record<string, unknown>) => void;
  isRecognitionAvailable: () => boolean;
  requestPermissionsAsync: () => Promise<{ granted: boolean }>;
};

function loadSpeechRecognitionModule(): SpeechRecognitionModule | null {
  if (Constants.appOwnership === "expo") return null;

  try {
    // Expo Go does not include this native module. Keeping it dynamic lets
    // Expo preview render, while custom dev/EAS builds can run real speech.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const speech = require("expo-speech-recognition") as {
      ExpoSpeechRecognitionModule?: SpeechRecognitionModule;
    };
    return speech.ExpoSpeechRecognitionModule ?? null;
  } catch {
    return null;
  }
}

function getCoachResponseText(response: CoachResponse): string {
  if (response.status === "plan_ready") return response.summary;
  // plan_updated's changes are rendered by CoachSuggestionCard, not repeated
  // as chat text (the card is staged alongside this bubble — see
  // handleResponse below).
  if (response.status === "plan_updated") return response.summary;

  return response.message;
}

function formatStoredCoachMessage(content: string): string {
  try {
    const parsed = JSON.parse(content) as CoachResponse;
    return getCoachResponseText(parsed);
  } catch {
    return content;
  }
}

export default function TrainerScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { ask } = useLocalSearchParams<{ ask?: string }>();
  const tabBarSpace = useTabBarSpace();
  const scrollRef = useRef<ScrollView>(null);
  const abortRef = useRef<AbortController | null>(null);
  const voiceDraftSeedRef = useRef("");
  const speechModuleRef = useRef<SpeechRecognitionModule | null>(null);
  const { user, profile, isLoading: authLoading } = useAuthStore();
  const {
    units,
    plan,
    setPlan,
    updatePlan,
    failedPrompt,
    setFailedPrompt,
    conversation,
    addConversationMessage,
    markConversationFeedbackFlagged,
    pendingPlanChange,
    setPendingPlanChange,
    applyPendingPlanChange,
    dismissPendingPlanChange,
    resetChatSession,
    clearTrainer,
    hasLoaded,
    loadTrainer,
  } = useCoachTrainerStore();

  const coachLanguage = i18n.language?.startsWith("es") ? "es" : "en";

  const [draft, setDraft] = useState("");
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustReadiness, setAdjustReadiness] = useState<TodayContext["readiness"]>("good");
  const [adjustPain, setAdjustPain] = useState(false);
  const [adjustMinutes, setAdjustMinutes] = useState<number | null>(null);
  const [adjustUnavailable, setAdjustUnavailable] = useState("");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [listening, setListening] = useState(false);
  const [feeling, setFeeling] = useState<Feeling | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const speechModule = loadSpeechRecognitionModule();
    speechModuleRef.current = speechModule;
    if (!speechModule?.addListener) return;

    const startSub = speechModule.addListener("start", () => {
      setListening(true);
      setNotice(t("trainer.voice_listening"));
    });
    const endSub = speechModule.addListener("end", () => {
      setListening(false);
      setNotice((current) => (current === t("trainer.voice_listening") ? "" : current));
    });
    const resultSub = speechModule.addListener("result", (event: any) => {
      const transcript = event.results?.[0]?.transcript?.trim();
      if (!transcript) return;
      const prefix = voiceDraftSeedRef.current.trim();
      setDraft(prefix ? `${prefix} ${transcript}` : transcript);
    });
    const errorSub = speechModule.addListener("error", (event: any) => {
      setListening(false);
      if (event.error === "aborted" || event.error === "no-speech" || event.error === "speech-timeout") {
        setNotice(t("trainer.voice_no_speech"));
        return;
      }
      if (event.error === "not-allowed") {
        setNotice(t("trainer.voice_permission_denied"));
        return;
      }
      setNotice(t("trainer.voice_unavailable"));
    });

    return () => {
      startSub.remove();
      endSub.remove();
      resultSub.remove();
      errorSub.remove();
    };
  }, [t]);

  useEffect(() => {
    loadTrainer();
  }, [loadTrainer]);

  useEffect(() => {
    // Coach Forward Phase 6: AskCoachCard (Equipment) navigates here with a
    // pre-composed question. Pre-fill the composer rather than auto-sending
    // — the existing chat-send path is still the user's own tap. Only
    // meaningful once a plan exists; without one, the chat screen (and its
    // composer) isn't rendered at all.
    if (!ask || !plan) return;
    setDraft(ask);
    router.setParams({ ask: undefined });
  }, [ask, plan]);

  useEffect(() => {
    if (authLoading || user) return;
    abortRef.current?.abort();
    speechModuleRef.current?.abort();
    setLoading(false);
    setListening(false);
    setNotice(t("trainer.session_expired_page"));
    resetChatSession();
  }, [authLoading, resetChatSession, t, user]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      speechModuleRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  }, [conversation.length, notice]);

  const visibleConversation = useMemo(() => {
    if (conversation.length > 0) return conversation;
    return [
      {
        role: "assistant" as const,
        content: t("trainer.starter_message"),
        id: "starter",
        createdAt: "",
        rulesMetadata: undefined,
        feedbackFlaggedAt: undefined,
      },
    ];
  }, [conversation, t]);

  const todayBaseSession = (plan?.sessions?.[0] as ReliableSession | undefined) ?? null;

  // Rule-based only: this preview never calls Coach or any provider.
  const adjustPreview = useMemo(() => {
    if (!adjustOpen || !todayBaseSession) return null;
    return adjustSessionForToday(todayBaseSession, {
      readiness: adjustReadiness,
      pain: adjustPain,
      availableMinutes: adjustMinutes,
      unavailableEquipment: adjustUnavailable
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 2),
    });
  }, [adjustOpen, todayBaseSession, adjustReadiness, adjustPain, adjustMinutes, adjustUnavailable]);

  const exerciseName = (exerciseId: string): string =>
    todayBaseSession?.exercises.find((item) => item.exercise_id === exerciseId)?.name ?? exerciseId;

  const describeChange = (change: SessionChange): string => {
    switch (change.code) {
      case "sets_reduced":
        return t("trainer.coach_adjust_sets_reduced", { exercise: exerciseName(change.exercise_id) });
      case "effort_capped":
        return t("trainer.coach_adjust_effort_capped", { exercise: exerciseName(change.exercise_id) });
      case "exercise_substituted":
        return t("trainer.coach_adjust_substituted", {
          exercise: exerciseName(change.exercise_id),
          replacement: change.to,
        });
      case "exercise_removed":
        return change.reason === "equipment"
          ? t("trainer.coach_adjust_removed_equipment", { exercise: exerciseName(change.exercise_id) })
          : t("trainer.coach_adjust_removed_time", { exercise: exerciseName(change.exercise_id) });
      case "pain_guardrail":
      default:
        return t("trainer.coach_adjust_pain_guardrail");
    }
  };

  const adjustSummary = (): string => {
    if (!adjustPreview) return "";
    const lines = adjustPreview.changes.map((change) => `- ${describeChange(change)}`);
    const body = lines.length > 0 ? lines.join("\n") : t("trainer.coach_adjust_no_changes");
    const listed = adjustPreview.session.exercises
      .map((item) => `- ${item.name}: ${item.sets} x ${item.rep_range.min}-${item.rep_range.max}`)
      .join("\n");
    const warning =
      adjustPreview.outcome === "insufficient_equipment" ? `\n\n${t("trainer.coach_adjust_insufficient")}` : "";
    return `${t("trainer.coach_adjust_heading", {
      minutes: adjustPreview.session.estimated_minutes,
    })}\n\n${body}\n\n${listed}${warning}`;
  };

  const applyAdjustmentForToday = () => {
    if (!adjustPreview) return;
    addConversationMessage({ role: "assistant", content: adjustSummary() });
    setNotice(t("trainer.coach_adjust_applied_today"));
    setAdjustOpen(false);
  };

  const keepAdjustmentInPlan = () => {
    if (!adjustPreview || !plan) return;
    // Only an explicit choice edits the saved plan.
    updatePlan({ ...plan, sessions: [adjustPreview.session, ...plan.sessions.slice(1)] } as typeof plan);
    addConversationMessage({ role: "assistant", content: adjustSummary() });
    setNotice(t("trainer.coach_adjust_kept"));
    setAdjustOpen(false);
  };

  const handleResponse = (response: CoachResponse) => {
    const assistantText = getCoachResponseText(response);
    addConversationMessage({ role: "assistant", content: assistantText }, response.rulesMetadata);

    if (response.status === "plan_ready") {
      // The very first plan (onboarding) applies immediately — it's not a
      // "change" to an existing plan, so there's nothing to stage.
      setPlan(response.plan);
      setNotice(t("trainer.plan_ready_notice"));
    } else if (response.status === "plan_updated") {
      // Stage it: CoachSuggestionCard renders it, and only "Apply today"
      // (applyPendingPlanChange) edits the saved plan.
      setPendingPlanChange(response);
      setNotice("");
    } else if (response.status === "needs_safety_review") {
      // This account has never completed plan-setup's safety-triage step.
      // No plan change happened server-side — send them to answer it, then
      // come back and try again.
      setNotice("");
      usePlanSetupStore.getState().beginFromProfile(profile);
      router.push(usePlanSetupStore.getState().isComplete() ? "/plan-setup/limitations" : "/plan-setup/goal");
    } else {
      setNotice("");
    }
  };

  const handleApplyPendingPlanChange = () => {
    applyPendingPlanChange();
    addConversationMessage({ role: "assistant", content: t("trainer.coach_suggestion.applied_notice") });
  };

  const handleDismissPendingPlanChange = () => {
    dismissPendingPlanChange();
    addConversationMessage({ role: "assistant", content: t("trainer.coach_suggestion.kept_notice") });
  };

  const flagRulesReply = async (message: { id: string; rulesMetadata?: CoachResponse["rulesMetadata"] }) => {
    if (!message.rulesMetadata) return;
    const { data } = await supabase.auth.getSession();
    if (!data.session?.access_token) return;
    try {
      await flagRulesCoachResponse(message.rulesMetadata, { authToken: data.session.access_token });
      markConversationFeedbackFlagged(message.id);
    } catch {
      setNotice(t("trainer.coach_connect_error"));
    }
  };

  const handleFeelingSelect = (nextFeeling: Feeling) => {
    setFeeling(nextFeeling);
    submitMessage(t(`trainer.feeling_check_in.${nextFeeling}_message`));
  };

  const submitMessage = async (messageText?: string) => {
    const text = (messageText ?? draft).trim();
    if (!text || loading) return;

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token || !user) {
      setDraft(text);
      setFailedPrompt(text);
      setNotice(t("trainer.session_expired_send"));
      resetChatSession();
      return;
    }

    if (hasCoachMedicalRedFlag(text)) {
      addConversationMessage({ role: "user", content: text });
      addConversationMessage({ role: "assistant", content: t("trainer.coach_medical_stop") });
      setNotice(t("trainer.coach_medical_notice"));
      setDraft("");
      setFailedPrompt(null);
      return;
    }

    if (!plan) {
      // The chat screen only mounts once a plan exists (see the render
      // branch below) — this is a defensive guard, not a normal path.
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;
    setLoading(true);
    setNotice("");
    setFailedPrompt(text);
    addConversationMessage({ role: "user", content: text });
    setDraft("");

    try {
      if (/goal|constraint|injur|days|equipment|schedule/i.test(text)) {
        setNotice(t("trainer.coach_building_plan"));
        const response = await runCoachTrainerJob({
          mode: "update_goals",
          units,
          language: coachLanguage,
          currentPlan: plan,
          newGoal: text,
        }, { authToken: session.access_token, signal: controller.signal });
        handleResponse(response);
        setFailedPrompt(null);
      } else if (/shorter|short on time|sore|hurt|swap|adjust|missed|skipped|rpe|too hard|too easy|workout/i.test(text)) {
        setNotice(t("trainer.coach_building_plan"));
        const response = await runCoachTrainerJob({
          mode: "adapt",
          units,
          language: coachLanguage,
          currentPlan: plan,
          logs: makeFreeformWorkoutLog(text),
        }, { authToken: session.access_token, signal: controller.signal });
        handleResponse(response);
        setFailedPrompt(null);
      } else {
        const response = await callCoachTrainer({
          mode: "chat",
          units,
          language: coachLanguage,
          currentPlan: plan,
          question: text,
        }, { authToken: session.access_token, signal: controller.signal });
        handleResponse(response);
        setFailedPrompt(null);
      }
    } catch (error: any) {
      if (error?.name === "AbortError" || error?.isCanceled) {
        setDraft(text);
        setNotice(t("trainer.chat_interrupted"));
      } else {
        setFailedPrompt(text);
        setDraft(text);
        setNotice(t("trainer.coach_connect_error"));
      }
    } finally {
      setLoading(false);
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  const toggleVoiceInput = async () => {
    const speechModule = speechModuleRef.current ?? loadSpeechRecognitionModule();
    speechModuleRef.current = speechModule;

    if (!speechModule) {
      setNotice(t("trainer.voice_requires_dev_build"));
      return;
    }

    if (listening) {
      speechModule.stop();
      return;
    }

    if (!speechModule.isRecognitionAvailable()) {
      setNotice(t("trainer.voice_unavailable"));
      return;
    }

    const permissions = await speechModule.requestPermissionsAsync();
    if (!permissions.granted) {
      setNotice(t("trainer.voice_permission_denied"));
      return;
    }

    voiceDraftSeedRef.current = draft;
    setNotice(t("trainer.voice_listening"));
    speechModule.start({
      lang: i18n.language?.startsWith("es") ? "es-US" : "en-US",
      interimResults: true,
      continuous: false,
      addsPunctuation: true,
      contextualStrings: ["workout", "sets", "reps", "bench press", "deadlift", "squat", "Coach"],
    });
  };

  const confirmReset = () => {
    Alert.alert(t("trainer.reset_title"), t("trainer.reset_message"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("trainer.reset"),
        style: "destructive",
        onPress: () => {
          setFeeling(null);
          clearTrainer();
        },
      },
    ]);
  };

  if (!hasLoaded) {
    return (
      <SafeScreen>
        <View style={styles.centered}>
          <ActivityIndicator color={colors.coral} />
        </View>
      </SafeScreen>
    );
  }

  if (!user) {
    return (
      <SafeScreen edges={["top"]}>
        <ScrollView style={styles.introScroll} contentContainerStyle={[styles.introContent, { paddingBottom: tabBarSpace }]} showsVerticalScrollIndicator={false}>
          <View style={styles.introHeader}>
            <Text style={styles.eyebrow}>{t("trainer.personal_trainer")}</Text>
            <Text style={styles.title}>{t("trainer.meet_title")}</Text>
            <Text style={styles.introSubtitle}>{t("trainer.intro_ready")}</Text>
          </View>

          <View style={styles.coachIntroCard}>
            <View style={styles.coachIntroCopy}>
              <Text style={styles.coachIntroEyebrow}>{t("trainer.coach_locked")}</Text>
              <Text style={styles.coachIntroTitle}>{t("trainer.hi_coach")}</Text>
              <Text style={styles.coachIntroText}>{t("trainer.coach_intro")}</Text>
            </View>
          </View>

          <TouchableOpacity style={[styles.chatWithMeButton, styles.sendButtonDisabled]} disabled>
            <Text style={styles.chatWithMeText}>{t("trainer.sign_in_to_chat")}</Text>
            <Ionicons name="arrow-forward" size={18} color={colors.white} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.authLinkButton} onPress={() => router.push("/(auth)/login")}>
            <Text style={styles.authLinkText}>{t("trainer.go_to_sign_in")}</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeScreen>
    );
  }

  if (!plan) {
    // Coach Forward Phase 1 decision: one entry point, one card. The tap-only
    // setup wizard (app/plan-setup/*) is the only way to build a plan now —
    // there's no free-text intake chat to fall back into.
    return (
      <SafeScreen edges={["top"]}>
        <ScrollView style={styles.introScroll} contentContainerStyle={[styles.introContent, { paddingBottom: tabBarSpace }]} showsVerticalScrollIndicator={false}>
          <View style={styles.introHeader}>
            <Text style={styles.eyebrow}>{t("trainer.personal_trainer")}</Text>
            <Text style={styles.title}>{t("trainer.meet_title")}</Text>
            <Text style={styles.introSubtitle}>{t("trainer.intro_ready")}</Text>
          </View>

          <View style={styles.coachIntroCard}>
            <View style={styles.coachIntroCopy}>
              <Text style={styles.coachIntroEyebrow}>{t("trainer.coach_locked")}</Text>
              <Text style={styles.coachIntroTitle}>{t("trainer.hi_coach")}</Text>
              <Text style={styles.coachIntroText}>{t("trainer.no_plan_snapshot")}</Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.chatWithMeButton}
            onPress={() => {
              usePlanSetupStore.getState().reset();
              router.push("/plan-setup/goal");
            }}
            accessibilityRole="button"
            accessibilityLabel={t("trainer.build_plan_cta")}
          >
            <Text style={styles.chatWithMeText}>{t("trainer.build_plan_cta")}</Text>
            <Ionicons name="arrow-forward" size={18} color={colors.white} />
          </TouchableOpacity>
        </ScrollView>
      </SafeScreen>
    );
  }

  return (
    <SafeScreen edges={["top"]} style={styles.chatScreen}>
      <KeyboardAvoidingView
        style={[styles.keyboard, { paddingBottom: tabBarSpace }]}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      >
        <View style={styles.header}>
          <View style={styles.headerAvatar}>
            <Ionicons name="star" size={16} color={coachColors.coachGold} />
          </View>
          <Text style={styles.headerTitle}>{t("trainer.coach_header_title")}</Text>
          <TouchableOpacity
            style={styles.menuButton}
            onPress={() => setMenuOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={t("trainer.coach_menu_button")}
          >
            <Ionicons name="ellipsis-horizontal" size={20} color={coachColors.text} />
          </TouchableOpacity>
        </View>

        <View style={styles.chipsWrap}>
          <ProfileSummaryChips profile={profile} plan={plan} />
        </View>

        <CoachHeaderMenu
          visible={menuOpen}
          onClose={() => setMenuOpen(false)}
          items={[
            { key: "adjust", label: t("trainer.quick_actions.adjust_today"), onPress: () => setAdjustOpen((open) => !open) },
            { key: "week", label: t("trainer.coach_week_button"), onPress: () => router.push("/coach-week") },
            {
              key: "rebuild",
              label: t("trainer.rebuild_plan"),
              onPress: () => {
                usePlanSetupStore.getState().beginFromProfile(profile);
                router.push("/plan-setup/goal");
              },
            },
            ...(conversation.length > 0
              ? [{ key: "reset", label: t("trainer.start_fresh"), onPress: confirmReset, destructive: true }]
              : []),
          ]}
        />

        <View style={styles.feelingCheckInWrap}>
          <FeelingCheckIn selected={feeling} onSelect={handleFeelingSelect} />
        </View>

        <ScrollView
          ref={scrollRef}
          style={styles.messages}
          contentContainerStyle={styles.messagesContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {visibleConversation.map((message, index) => (
            <View key={message.id ?? `${message.role}-${index}-${message.content.slice(0, 12)}`}>
              <CoachMessageBubble message={message} />
              {message.role === "assistant" && message.rulesMetadata && !message.feedbackFlaggedAt ? (
                <TouchableOpacity
                  style={styles.rulesFeedbackButton}
                  onPress={() => void flagRulesReply(message)}
                  accessibilityLabel={coachLanguage === "es" ? "Esto no fue correcto" : "That wasn't right"}
                >
                  <Text style={styles.rulesFeedbackText}>{coachLanguage === "es" ? "Esto no fue correcto" : "That wasn't right"}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ))}

          {pendingPlanChange ? (
            <View style={styles.suggestionWrap}>
              <CoachSuggestionCard
                response={pendingPlanChange}
                onApply={handleApplyPendingPlanChange}
                onKeep={handleDismissPendingPlanChange}
              />
              {pendingPlanChange.plan.safety_flags.length > 0 ? (
                <SafetyNote text={pendingPlanChange.plan.safety_flags[0]} />
              ) : null}
            </View>
          ) : null}

          {loading ? (
            <View style={styles.thinkingCard}>
              <ActivityIndicator color={coachColors.coachGold} size="small" />
              <Text style={styles.thinkingText}>{t("trainer.coach_thinking")}</Text>
            </View>
          ) : null}

          {notice ? (
            <View style={styles.noticeCard}>
              <Ionicons name="sparkles" size={17} color={coachColors.coachGoldText} />
              <Text style={styles.noticeText}>{notice}</Text>
              {failedPrompt ? (
                <TouchableOpacity style={styles.resendButton} onPress={() => submitMessage(failedPrompt)} disabled={loading}>
                  <Text style={styles.resendText}>{t("trainer.resend")}</Text>
                </TouchableOpacity>
              ) : plan ? (
                <TouchableOpacity style={styles.resendButton} onPress={() => router.push("/plan")}>
                  <Text style={styles.resendText}>{t("trainer.open")}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}
        </ScrollView>

        {adjustOpen ? (
          <View style={styles.adjustPanel}>
            <Text style={styles.adjustTitle}>{t("trainer.coach_adjust_title")}</Text>
            {todayBaseSession ? (
              <>
                <Text style={styles.adjustLabel}>{t("trainer.coach_adjust_readiness")}</Text>
                <View style={styles.adjustRow}>
                  {(["good", "okay", "poor"] as const).map((level) => (
                    <TouchableOpacity
                      key={level}
                      style={[styles.adjustChip, adjustReadiness === level && styles.adjustChipActive]}
                      onPress={() => setAdjustReadiness(level)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: adjustReadiness === level }}
                    >
                      <Text style={[styles.adjustChipText, adjustReadiness === level && styles.adjustChipTextActive]}>
                        {t(`trainer.coach_adjust_readiness_${level}`)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.adjustLabel}>{t("trainer.coach_adjust_time")}</Text>
                <View style={styles.adjustRow}>
                  {([null, 30, 20] as const).map((minutes) => (
                    <TouchableOpacity
                      key={String(minutes)}
                      style={[styles.adjustChip, adjustMinutes === minutes && styles.adjustChipActive]}
                      onPress={() => setAdjustMinutes(minutes)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: adjustMinutes === minutes }}
                    >
                      <Text style={[styles.adjustChipText, adjustMinutes === minutes && styles.adjustChipTextActive]}>
                        {minutes === null ? t("trainer.coach_adjust_time_full") : t("trainer.coach_adjust_time_minutes", { minutes })}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <TouchableOpacity
                  style={[styles.adjustChip, adjustPain && styles.adjustChipActive, styles.adjustPainChip]}
                  onPress={() => setAdjustPain((value) => !value)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: adjustPain }}
                >
                  <Text style={[styles.adjustChipText, adjustPain && styles.adjustChipTextActive]}>
                    {t("trainer.coach_adjust_pain")}
                  </Text>
                </TouchableOpacity>

                <Text style={styles.adjustLabel}>{t("trainer.coach_adjust_unavailable")}</Text>
                <TextInput
                  style={styles.adjustInput}
                  value={adjustUnavailable}
                  onChangeText={setAdjustUnavailable}
                  placeholder={t("trainer.coach_adjust_unavailable_placeholder")}
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="none"
                  accessibilityLabel={t("trainer.coach_adjust_unavailable")}
                />

                {adjustPreview ? (
                  <View style={styles.adjustPreview}>
                    <Text style={styles.adjustPreviewText}>{adjustSummary()}</Text>
                  </View>
                ) : null}

                <View style={styles.adjustRow}>
                  <TouchableOpacity style={styles.adjustPrimary} onPress={applyAdjustmentForToday}>
                    <Text style={styles.adjustPrimaryText}>{t("trainer.coach_adjust_use_today")}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.adjustSecondary} onPress={keepAdjustmentInPlan}>
                    <Text style={styles.adjustSecondaryText}>{t("trainer.coach_adjust_keep")}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.adjustSecondary} onPress={() => setAdjustOpen(false)}>
                    <Text style={styles.adjustSecondaryText}>{t("trainer.coach_adjust_cancel")}</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.adjustFootnote}>{t("trainer.coach_adjust_no_ai")}</Text>
              </>
            ) : (
              <Text style={styles.adjustPreviewText}>{t("trainer.coach_adjust_needs_plan")}</Text>
            )}
          </View>
        ) : null}

        <View style={styles.quickActions}>
          <SuggestedPrompts
            prompts={QUICK_ACTIONS.map((action) => ({ key: action, label: t(action) }))}
            onPress={(action) =>
              action === "trainer.quick_actions.adjust_today"
                ? setAdjustOpen((open) => !open)
                : submitMessage(t(action))
            }
          />
        </View>

        <View style={styles.composerWrap}>
          <CoachComposer
            value={draft}
            onChangeText={setDraft}
            onSend={() => submitMessage()}
            onCameraPress={() => router.push("/(tabs)/scan")}
            onVoicePress={toggleVoiceInput}
            listening={listening}
            loading={loading}
            placeholder={t("trainer.placeholder_plan")}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  keyboard: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  introScroll: { flex: 1 },
  introContent: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 34 },
  introHeader: { marginBottom: 16 },
  introSubtitle: { color: colors.textSecondary, fontFamily: fonts.body, fontSize: 15, lineHeight: 22, marginTop: 6 },
  coachIntroCard: {
    borderRadius: 26,
    padding: 18,
    backgroundColor: colors.ndNavy,
    borderWidth: 1,
    borderColor: colors.ndGold + "55",
    alignItems: "center",
    overflow: "hidden",
  },
  coachIntroCopy: { alignSelf: "stretch", backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 18, padding: 16 },
  coachIntroEyebrow: { color: colors.ndGold, fontFamily: fonts.extraBold, fontSize: 11, textTransform: "uppercase" },
  coachIntroTitle: { color: colors.white, fontFamily: fonts.heading, fontSize: 32, marginTop: 3 },
  coachIntroText: { color: "rgba(255,255,255,0.78)", fontFamily: fonts.body, fontSize: 14, lineHeight: 21, marginTop: 5 },
  backgroundCard: {
    marginTop: 14,
    borderRadius: 18,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: 14,
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
  },
  backgroundIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: colors.ndGold + "18",
    alignItems: "center",
    justifyContent: "center",
  },
  backgroundTitle: { color: colors.text, fontFamily: fonts.bold, fontSize: 15 },
  backgroundText: { color: colors.textSecondary, fontFamily: fonts.body, fontSize: 13, lineHeight: 19, marginTop: 3 },
  introNotice: {
    marginTop: 12,
    flexDirection: "row",
    gap: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.coral + "30",
    backgroundColor: colors.coral + "10",
    padding: 12,
  },
  introNoticeText: { flex: 1, color: colors.text, fontFamily: fonts.semiBold, fontSize: 13, lineHeight: 18 },
  chatWithMeButton: {
    marginTop: 16,
    minHeight: 54,
    borderRadius: 18,
    backgroundColor: colors.ndGold,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 9,
  },
  chatWithMeText: { color: colors.white, fontFamily: fonts.extraBold, fontSize: 16 },
  authLinkButton: { alignItems: "center", paddingVertical: 14 },
  authLinkText: { color: colors.ndNavy, fontFamily: fonts.bold, fontSize: 14 },
  chatScreen: { backgroundColor: coachColors.bg },
  header: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  headerAvatar: {
    width: 36,
    height: 36,
    borderRadius: radii.pill,
    backgroundColor: coachColors.coachNavy,
    alignItems: "center",
    justifyContent: "center",
  },
  menuButton: {
    width: 44,
    height: 44,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { flex: 1, color: coachColors.text, fontFamily: coachFonts.heading, fontSize: 20 },
  chipsWrap: { paddingBottom: spacing.sm },
  eyebrow: { color: colors.textMuted, fontFamily: fonts.bold, fontSize: 12, textTransform: "uppercase" },
  title: { color: colors.text, fontFamily: fonts.heading, fontSize: 34 },
  headerControls: { alignItems: "flex-end", gap: 8 },
  planShortcut: {
    minHeight: 42,
    borderRadius: 13,
    backgroundColor: colors.ndNavy,
    borderWidth: 1,
    borderColor: colors.ndGold + "55",
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  planShortcutText: { color: colors.ndGold, fontFamily: fonts.bold, fontSize: 13 },
  unitSwitch: {
    flexDirection: "row",
    borderRadius: 10,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.ndGold + "55",
    backgroundColor: colors.card,
  },
  unitButton: { minWidth: 36, minHeight: 32, alignItems: "center", justifyContent: "center" },
  unitButtonActive: { backgroundColor: colors.ndGold },
  unitText: { color: colors.textMuted, fontFamily: fonts.bold, fontSize: 12 },
  unitTextActive: { color: colors.white },
  feelingCheckInWrap: { paddingHorizontal: spacing.xl, paddingBottom: spacing.md },
  messages: { flex: 1 },
  messagesContent: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 18, gap: 12 },
  suggestionWrap: { gap: spacing.sm },
  noticeCard: {
    flexDirection: "row",
    gap: 8,
    backgroundColor: colors.ndGold + "16",
    borderColor: colors.ndGold + "45",
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
  },
  noticeText: { flex: 1, color: colors.text, fontFamily: fonts.semiBold, fontSize: 13, lineHeight: 18 },
  thinkingCard: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    maxWidth: "86%",
    borderRadius: 18,
    borderBottomLeftRadius: 6,
    borderWidth: 1,
    borderColor: colors.ndGold + "35",
    backgroundColor: colors.ndGold + "12",
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  thinkingText: { color: colors.text, fontFamily: fonts.semiBold, fontSize: 13 },
  resendButton: {
    alignSelf: "center",
    borderRadius: 10,
    backgroundColor: colors.ndGold,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  resendText: { color: colors.white, fontFamily: fonts.extraBold, fontSize: 12 },
  quickActions: { borderTopWidth: 1, borderTopColor: coachColors.border, paddingTop: 10 },
  adjustPanel: {
    borderTopWidth: 1,
    borderTopColor: coachColors.border,
    paddingTop: 12,
    paddingHorizontal: 4,
    gap: 8,
  },
  adjustTitle: { color: colors.text, fontFamily: fonts.semiBold, fontSize: 15 },
  adjustLabel: { color: colors.textMuted, fontFamily: fonts.semiBold, fontSize: 12, textTransform: "uppercase" },
  adjustRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  adjustChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.card,
  },
  adjustChipActive: { backgroundColor: colors.coral, borderColor: colors.coral },
  adjustChipText: { color: colors.text, fontFamily: fonts.semiBold, fontSize: 13 },
  adjustChipTextActive: { color: colors.white },
  adjustPainChip: { alignSelf: "flex-start" },
  adjustPreview: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: 10,
  },
  adjustPreviewText: { color: colors.text, fontFamily: fonts.body, fontSize: 13, lineHeight: 19 },
  adjustPrimary: { backgroundColor: colors.coral, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10 },
  adjustPrimaryText: { color: colors.white, fontFamily: fonts.semiBold, fontSize: 13 },
  adjustSecondary: {
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  adjustSecondaryText: { color: colors.text, fontFamily: fonts.semiBold, fontSize: 13 },
  adjustFootnote: { color: colors.textMuted, fontFamily: fonts.body, fontSize: 11 },
  adjustInput: {
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 13,
    backgroundColor: colors.card,
  },
  composerWrap: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.sm,
  },
  sendButtonDisabled: { opacity: 0.5 },
  rulesFeedbackButton: { alignSelf: "flex-start", marginLeft: spacing.sm, marginTop: -2, marginBottom: 8, paddingVertical: 5, paddingHorizontal: 8 },
  rulesFeedbackText: { color: colors.textMuted, fontFamily: fonts.semiBold, fontSize: 11, textDecorationLine: "underline" },
  resetButton: { alignSelf: "center", paddingVertical: 8, marginBottom: 4 },
  resetText: { color: colors.textMuted, fontFamily: fonts.semiBold, fontSize: 12 },
});
