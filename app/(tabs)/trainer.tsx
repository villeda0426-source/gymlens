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
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import SafeScreen from "@/components/Layout/SafeScreen";
import { colors, fonts } from "@/constants/theme";
import { supabase } from "@/lib/supabase";
import { createIdempotencyKey } from "@/lib/api";
import {
  callCoachTrainer,
  CoachMessage,
  CoachResponse,
  flagRulesCoachResponse,
  getCoachTrainerJob,
  makeFreeformWorkoutLog,
  startCoachTrainerJob,
} from "@/lib/coachTrainer";
import { useCoachTrainerStore } from "@/store/coachTrainerStore";
import { useAuthStore } from "@/store/authStore";
import {
  adjustSessionForToday,
  hasCoachMedicalRedFlag,
  ReliableSession,
  SessionChange,
  TodayContext,
} from "@/shared/reliableCoach";

const QUICK_ACTIONS = [
  "trainer.quick_actions.create_plan",
  "trainer.quick_actions.train_today",
  "trainer.quick_actions.thirty_minutes",
  "trainer.quick_actions.sore_today",
  "trainer.quick_actions.swap_exercise",
  "trainer.quick_actions.shorter",
  "trainer.quick_actions.adjust_today",
  "trainer.quick_actions.explain",
];

const COACH_JOB_POLL_INTERVAL_MS = 2500;
const COACH_JOB_MAX_WAIT_MS = 180000;

function makeAbortError() {
  const error = new Error("Coach job polling aborted.");
  error.name = "AbortError";
  return error;
}

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

function stringifyCoachResponse(response: CoachResponse): string {
  return JSON.stringify(response);
}

function getCoachResponseText(response: CoachResponse): string {
  if (response.status === "plan_ready" || response.status === "plan_updated") {
    const changes =
      response.status === "plan_updated" && response.changes.length > 0
        ? `\n\nChanges:\n${response.changes.map((change) => `- ${change}`).join("\n")}`
        : "";
    return `${response.summary}${changes}`;
  }

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

function ChatBubble({ message }: { message: CoachMessage }) {
  const isUser = message.role === "user";
  const text = isUser ? message.content : formatStoredCoachMessage(message.content);

  return (
    <View style={[styles.bubbleRow, isUser && styles.bubbleRowUser]}>
      {!isUser ? (
        <View style={styles.coachAvatar}>
          <Ionicons name="fitness" size={17} color={colors.white} />
        </View>
      ) : null}
      <View style={[styles.bubble, isUser ? styles.userBubble : styles.coachBubble]}>
        <Text style={[styles.bubbleText, isUser && styles.userBubbleText]}>{text}</Text>
      </View>
    </View>
  );
}

export default function TrainerScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
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
    hasEnteredCoachChat,
    failedPrompt,
    enterCoachChat,
    setFailedPrompt,
    intakeHistory,
    setIntakeHistory,
    conversation,
    addConversationMessage,
    markConversationFeedbackFlagged,
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

  const handleResponse = (response: CoachResponse, nextIntakeHistory?: CoachMessage[]) => {
    const assistantJson = stringifyCoachResponse(response);
    const assistantText = getCoachResponseText(response);

    addConversationMessage({ role: "assistant", content: assistantText }, response.rulesMetadata);

    if (nextIntakeHistory) {
      setIntakeHistory([...nextIntakeHistory, { role: "assistant", content: assistantJson }]);
    }

    if (response.status === "plan_ready") {
      setPlan(response.plan);
      setNotice(t("trainer.plan_ready_notice"));
    } else if (response.status === "plan_updated") {
      updatePlan(response.plan);
      setNotice(t("trainer.plan_ready_notice"));
    } else {
      setNotice("");
    }
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

  const waitForCoachJob = async (jobId: string, authToken: string, signal: AbortSignal) => {
    const startedAt = Date.now();

    while (Date.now() - startedAt < COACH_JOB_MAX_WAIT_MS) {
      if (signal.aborted) throw makeAbortError();

      const job = await getCoachTrainerJob(jobId, { authToken, signal });
      if (job.status === "completed" && job.result) return job.result;
      if (job.status === "failed") {
        throw new Error(job.error || t("trainer.coach_connect_error"));
      }

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(resolve, COACH_JOB_POLL_INTERVAL_MS);
        signal.addEventListener(
          "abort",
          () => {
            clearTimeout(timeout);
            reject(makeAbortError());
          },
          { once: true }
        );
      });
    }

    throw new Error(t("trainer.coach_connect_error"));
  };

  const runCoachJob = async (
    payload: Parameters<typeof startCoachTrainerJob>[0],
    authToken: string,
    idempotencyKey: string,
    signal: AbortSignal
  ) => {
    const job = await startCoachTrainerJob(payload, {
      authToken,
      idempotencyKey,
      signal,
    });
    return waitForCoachJob(job.jobId, authToken, signal);
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

    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;
    const idempotencyKey = createIdempotencyKey("coach-job");
    setLoading(true);
    setNotice("");
    setFailedPrompt(text);
    addConversationMessage({ role: "user", content: text });
    setDraft("");

    try {
      if (!plan) {
        const nextHistory =
          intakeHistory.length === 0
            ? [
                {
                  role: "user" as const,
                  content: `CONTEXT: ${JSON.stringify({ mode: "intake", units, language: coachLanguage })}\n\n${text}`,
                },
              ]
            : [...intakeHistory, { role: "user" as const, content: text }];

        // Only the authenticated server route can create a plan. It loads the
        // account safety context before its rules/AI decision.
        setNotice(t("trainer.coach_building_plan"));
        const response = await runCoachJob({
          mode: "intake",
          units,
          language: coachLanguage,
          history: intakeHistory,
          userMessage: text,
        }, session.access_token, idempotencyKey, controller.signal);
        setIntakeHistory(nextHistory);
        handleResponse(response, nextHistory);
        setFailedPrompt(null);
      } else if (/goal|constraint|injur|days|equipment|schedule/i.test(text)) {
        setNotice(t("trainer.coach_building_plan"));
        const response = await runCoachJob({
          mode: "update_goals",
          units,
          language: coachLanguage,
          currentPlan: plan,
          newGoal: text,
        }, session.access_token, idempotencyKey, controller.signal);
        handleResponse(response);
        setFailedPrompt(null);
      } else if (/shorter|sore|swap|adjust|missed|skipped|rpe|too hard|too easy|workout/i.test(text)) {
        setNotice(t("trainer.coach_building_plan"));
        const response = await runCoachJob({
          mode: "adapt",
          units,
          language: coachLanguage,
          currentPlan: plan,
          logs: makeFreeformWorkoutLog(text),
        }, session.access_token, idempotencyKey, controller.signal);
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
      { text: t("trainer.reset"), style: "destructive", onPress: clearTrainer },
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

  if (!hasEnteredCoachChat) {
    return (
      <SafeScreen edges={["top"]}>
        <ScrollView style={styles.introScroll} contentContainerStyle={styles.introContent} showsVerticalScrollIndicator={false}>
          <View style={styles.introHeader}>
            <Text style={styles.eyebrow}>{t("trainer.personal_trainer")}</Text>
            <Text style={styles.title}>{t("trainer.meet_title")}</Text>
            <Text style={styles.introSubtitle}>
              {t("trainer.intro_ready")}
            </Text>
          </View>

          <View style={styles.coachIntroCard}>
            <View style={styles.coachIntroCopy}>
              <Text style={styles.coachIntroEyebrow}>{t("trainer.coach_locked")}</Text>
              <Text style={styles.coachIntroTitle}>{t("trainer.hi_coach")}</Text>
              <Text style={styles.coachIntroText}>{t("trainer.coach_intro")}</Text>
            </View>
          </View>

          <View style={styles.backgroundCard}>
            <View style={styles.backgroundIcon}>
              <Ionicons name="clipboard" size={20} color={colors.ndGold} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.backgroundTitle}>{t("trainer.training_snapshot")}</Text>
              <Text style={styles.backgroundText}>
                {profile?.username ? `${profile.username}, ` : ""}
                {plan
                  ? `${plan.goal} · ${t("trainer.days_per_week", { count: plan.days_per_week })} · ${plan.split}`
                  : t("trainer.no_plan_snapshot")}
              </Text>
            </View>
          </View>

          {notice ? (
            <View style={styles.introNotice}>
              <Ionicons name="information-circle" size={18} color={colors.coral} />
              <Text style={styles.introNoticeText}>{notice}</Text>
            </View>
          ) : null}

          <TouchableOpacity
            style={[styles.chatWithMeButton, !user && styles.sendButtonDisabled]}
            disabled={!user}
            onPress={enterCoachChat}
          >
            <Text style={styles.chatWithMeText}>
              {user ? t("trainer.chat_with_me") : t("trainer.sign_in_to_chat")}
            </Text>
            <Ionicons name="arrow-forward" size={18} color={colors.white} />
          </TouchableOpacity>

          {!user ? (
            <TouchableOpacity style={styles.authLinkButton} onPress={() => router.push("/(auth)/login")}>
              <Text style={styles.authLinkText}>{t("trainer.go_to_sign_in")}</Text>
            </TouchableOpacity>
          ) : null}
        </ScrollView>
      </SafeScreen>
    );
  }

  return (
    <SafeScreen edges={["top"]}>
      <KeyboardAvoidingView
        style={styles.keyboard}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>{t("trainer.personal_trainer")}</Text>
            <Text style={styles.title}>{t("trainer.chat_title")}</Text>
          </View>
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
              <ChatBubble message={message} />
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

          {loading ? (
            <View style={styles.thinkingCard}>
              <ActivityIndicator color={colors.ndGold} size="small" />
              <Text style={styles.thinkingText}>{t("trainer.coach_thinking")}</Text>
            </View>
          ) : null}

          {notice ? (
            <View style={styles.noticeCard}>
              <Ionicons name="sparkles" size={17} color={colors.ndGold} />
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
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickActionsInner}>
            {QUICK_ACTIONS.map((action) => (
              <TouchableOpacity
                key={action}
                style={styles.quickChip}
                onPress={() =>
                  action === "trainer.quick_actions.adjust_today"
                    ? setAdjustOpen((open) => !open)
                    : submitMessage(t(action))
                }
              >
                <Text style={styles.quickChipText}>{t(action)}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <View style={styles.composerWrap}>
          <TouchableOpacity
            style={[styles.voiceButton, listening && styles.voiceButtonActive]}
            onPress={toggleVoiceInput}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel={listening ? t("trainer.voice_stop") : t("trainer.voice_start")}
          >
            <Ionicons name={listening ? "mic" : "mic-outline"} size={19} color={listening ? colors.white : colors.ndGold} />
          </TouchableOpacity>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={plan ? t("trainer.placeholder_plan") : t("trainer.placeholder_intake")}
            placeholderTextColor={colors.textMuted}
            multiline
            style={styles.composer}
          />
          <TouchableOpacity
            style={[styles.sendButton, (!draft.trim() || loading) && styles.sendButtonDisabled]}
            onPress={() => submitMessage()}
            disabled={!draft.trim() || loading}
          >
            {loading ? (
              <ActivityIndicator color={colors.white} size="small" />
            ) : (
              <Ionicons name="send" size={18} color={colors.white} />
            )}
          </TouchableOpacity>
        </View>

        {conversation.length > 0 ? (
          <TouchableOpacity style={styles.resetButton} onPress={confirmReset}>
            <Text style={styles.resetText}>{t("trainer.start_fresh")}</Text>
          </TouchableOpacity>
        ) : null}
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
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
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
  messages: { flex: 1 },
  messagesContent: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 18, gap: 12 },
  bubbleRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  bubbleRowUser: { justifyContent: "flex-end" },
  coachAvatar: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: colors.text,
    alignItems: "center",
    justifyContent: "center",
  },
  bubble: {
    maxWidth: "82%",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  coachBubble: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderBottomLeftRadius: 6,
  },
  userBubble: {
    backgroundColor: colors.ndNavy,
    borderBottomRightRadius: 6,
  },
  bubbleText: { color: colors.text, fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
  userBubbleText: { color: colors.white },
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
  quickActions: { borderTopWidth: 1, borderTopColor: colors.cardBorder, paddingTop: 10 },
  adjustPanel: {
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
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
  quickActionsInner: { paddingHorizontal: 20, gap: 8, paddingBottom: 10 },
  quickChip: {
    minHeight: 36,
    borderRadius: 18,
    paddingHorizontal: 14,
    backgroundColor: colors.ndNavy + "08",
    borderWidth: 1,
    borderColor: colors.ndGold + "35",
    alignItems: "center",
    justifyContent: "center",
  },
  quickChipText: { color: colors.ndNavy, fontFamily: fonts.semiBold, fontSize: 12 },
  composerWrap: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-end",
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  voiceButton: {
    width: 48,
    height: 48,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.ndGold + "45",
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
  },
  voiceButtonActive: {
    backgroundColor: colors.coral,
    borderColor: colors.coral,
  },
  composer: {
    flex: 1,
    maxHeight: 110,
    minHeight: 48,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.ndGold + "45",
    backgroundColor: colors.card,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 14,
    textAlignVertical: "top",
  },
  sendButton: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: colors.ndGold,
    alignItems: "center",
    justifyContent: "center",
  },
  sendButtonDisabled: { opacity: 0.5 },
  rulesFeedbackButton: { alignSelf: "flex-start", marginLeft: 52, marginTop: -2, marginBottom: 8, paddingVertical: 5, paddingHorizontal: 8 },
  rulesFeedbackText: { color: colors.textMuted, fontFamily: fonts.semiBold, fontSize: 11, textDecorationLine: "underline" },
  resetButton: { alignSelf: "center", paddingVertical: 8, marginBottom: 4 },
  resetText: { color: colors.textMuted, fontFamily: fonts.semiBold, fontSize: 12 },
});
