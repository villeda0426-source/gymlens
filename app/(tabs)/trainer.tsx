import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import SafeScreen from "@/components/Layout/SafeScreen";
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
  getCoachTrainerJob,
  getLatestCoachWorkoutReview,
  makeFreeformWorkoutLog,
  recordCoachJobClientTiming,
  startCoachTrainerJob,
} from "@/lib/coachTrainer";
import { useCoachTrainerStore } from "@/store/coachTrainerStore";
import { usePlanSetupStore } from "@/store/planSetupStore";
import { useAuthStore } from "@/store/authStore";

// Live still has all 8 — "adjust_today" used to open a local rule-based
// panel that doesn't exist in this codebase (it came from a line that
// diverged after the App Store release). Dropped here: tapping it now just
// asks Coach directly like any other quick action, which the backend
// already handles fine via mode "adapt".
const QUICK_ACTIONS = [
  "trainer.quick_actions.create_plan",
  "trainer.quick_actions.train_today",
  "trainer.quick_actions.thirty_minutes",
  "trainer.quick_actions.sore_today",
  "trainer.quick_actions.swap_exercise",
  "trainer.quick_actions.shorter",
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

function getCoachResponseText(response: CoachResponse): string {
  if (response.status === "plan_ready") return response.summary;
  // plan_updated's changes are rendered by CoachSuggestionCard, not repeated
  // as chat text (the card is staged alongside this bubble — see
  // handleResponse below).
  if (response.status === "plan_updated") return response.summary;

  return response.message;
}

export default function TrainerScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { ask } = useLocalSearchParams<{ ask?: string }>();
  const scrollRef = useRef<ScrollView>(null);
  const abortRef = useRef<AbortController | null>(null);
  const voiceDraftSeedRef = useRef("");
  const speechModuleRef = useRef<SpeechRecognitionModule | null>(null);
  const reviewHydratedRef = useRef(false);
  const { user, isLoading: authLoading } = useAuthStore();
  const {
    units,
    plan,
    setPlan,
    hasEnteredCoachChat,
    failedPrompt,
    enterCoachChat,
    setFailedPrompt,
    intakeHistory,
    setIntakeHistory,
    conversation,
    addConversationMessage,
    pendingPlanChange,
    setPendingPlanChange,
    applyPendingPlanChange,
    dismissPendingPlanChange,
    resetChatSession,
    threads,
    openTrainerLibrary,
    selectThread,
    startNewThread,
    latestWorkoutReview,
    setLatestWorkoutReview,
    hasLoaded,
    loadTrainer,
  } = useCoachTrainerStore();

  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [listening, setListening] = useState(false);
  const [feeling, setFeeling] = useState<Feeling | null>(null);

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
    if (!hasLoaded || !user || latestWorkoutReview || reviewHydratedRef.current) return;
    reviewHydratedRef.current = true;
    void supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session?.access_token) return;
      try {
        const review = await getLatestCoachWorkoutReview({ authToken: data.session.access_token });
        if (!review) return;
        setLatestWorkoutReview({
          sessionLabel: review.sessionLabel,
          source: review.source,
          reason: review.reason,
          changes: review.changes,
        });
        if (conversation.length === 0) {
          addConversationMessage({
            role: "assistant",
            content: [
              t("plan.review_for", { session: review.sessionLabel, reason: review.reason }),
              review.changes.length ? t("plan.follow_up_changes", { changes: review.changes.join(" ") }) : t("plan.follow_up_steady"),
            ].join("\n\n"),
          });
          enterCoachChat();
        }
      } catch {
        // The trainer remains usable if review history is temporarily unavailable.
      }
    });
  }, [addConversationMessage, conversation.length, enterCoachChat, hasLoaded, latestWorkoutReview, setLatestWorkoutReview, t, user]);

  useEffect(() => {
    // Coach Forward Phase 6: AskCoachCard (Equipment) navigates here with a
    // pre-composed question. Pre-fill the composer rather than auto-sending
    // — the existing chat-send path is still the user's own tap.
    if (!ask) return;
    if (!hasEnteredCoachChat) enterCoachChat();
    setDraft(ask);
    router.setParams({ ask: undefined });
  }, [ask]);

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

  const visibleConversation = useMemo<CoachMessage[]>(() => {
    if (conversation.length > 0) return conversation;
    return [
      {
        role: "assistant",
        content: t("trainer.starter_message"),
      },
    ];
  }, [conversation, t]);

  const handleResponse = (response: CoachResponse, nextIntakeHistory?: CoachMessage[]) => {
    const assistantText = getCoachResponseText(response);
    addConversationMessage({ role: "assistant", content: assistantText });

    if (nextIntakeHistory) {
      setIntakeHistory([...nextIntakeHistory, { role: "assistant", content: JSON.stringify(response) }]);
    }

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

  const waitForCoachJob = async (jobId: string, authToken: string, signal: AbortSignal) => {
    const startedAt = Date.now();
    let pollCount = 0;

    while (Date.now() - startedAt < COACH_JOB_MAX_WAIT_MS) {
      if (signal.aborted) throw makeAbortError();

      const job = await getCoachTrainerJob(jobId, { authToken, signal });
      pollCount += 1;
      if (job.status === "completed" && job.result) {
        return { result: job.result, timings: job.timings, pollingMs: Date.now() - startedAt, pollCount };
      }
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

    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;
    setLoading(true);
    setNotice("");
    setFailedPrompt(text);
    addConversationMessage({ role: "user", content: text });
    setDraft("");

    try {
      const language = i18n.language?.startsWith("es") ? ("es" as const) : ("en" as const);
      if (!plan) {
        const nextHistory =
          intakeHistory.length === 0
            ? [{ role: "user" as const, content: `CONTEXT: ${JSON.stringify({ mode: "intake", units })}\n\n${text}` }]
            : [...intakeHistory, { role: "user" as const, content: text }];

        setNotice(t("trainer.coach_building_plan"));
        const clientStartedAt = Date.now();
        const jobStartAt = Date.now();
        const job = await startCoachTrainerJob({
          mode: "intake",
          units,
          language,
          history: intakeHistory,
          userMessage: text,
        }, { authToken: session.access_token, signal: controller.signal });
        const jobStartRequestMs = Date.now() - jobStartAt;
        const completion = await waitForCoachJob(job.jobId, session.access_token, controller.signal);
        const response = completion.result;
        const responseReceivedAt = Date.now();
        setIntakeHistory(nextHistory);
        handleResponse(response, nextHistory);
        requestAnimationFrame(() => {
          const clientTiming = {
            jobStartRequestMs,
            clientPollingMs: completion.pollingMs,
            responseToRenderMs: Date.now() - responseReceivedAt,
            clientTotalMs: Date.now() - clientStartedAt,
            pollCount: completion.pollCount,
          };
          console.info("[coach-timing]", { jobId: job.jobId, ...completion.timings, ...clientTiming });
          void recordCoachJobClientTiming(job.jobId, clientTiming, { authToken: session.access_token }).catch(() => undefined);
        });
        setFailedPrompt(null);
      } else if (/goal|constraint|injur|days|equipment|schedule/i.test(text)) {
        const response = await callCoachTrainer({
          mode: "update_goals",
          units,
          language,
          currentPlan: plan,
          newGoal: text,
        }, { authToken: session.access_token, signal: controller.signal });
        handleResponse(response);
        setFailedPrompt(null);
      } else if (/shorter|sore|swap|adjust|missed|skipped|rpe|too hard|too easy|workout/i.test(text)) {
        const response = await callCoachTrainer({
          mode: "adapt",
          units,
          language,
          currentPlan: plan,
          logs: makeFreeformWorkoutLog(text),
        }, { authToken: session.access_token, signal: controller.signal });
        handleResponse(response);
        setFailedPrompt(null);
      } else {
        const response = await callCoachTrainer({
          mode: "chat",
          units,
          language,
          currentPlan: plan,
          question: text,
        }, { authToken: session.access_token, signal: controller.signal });
        handleResponse(response);
        setFailedPrompt(null);
      }
    } catch (error: any) {
      if (error?.name === "AbortError") {
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

  const handleFeelingSelect = (nextFeeling: Feeling) => {
    setFeeling(nextFeeling);
    submitMessage(t(`trainer.feeling_check_in.${nextFeeling}_message`));
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
      ...(plan
        ? [{
            text: t("trainer.rebuild_plan"),
            onPress: () => {
              // QA #12: this used to launch the tap-only setup flow from
              // scratch (beginFromProfile + /plan-setup/goal), discarding the
              // existing thread. Rebuild Plan should continue THIS
              // conversation instead — seed the composer with a prompt
              // referencing the current plan and let the user say what to
              // change, same as any other in-thread request.
              setDraft(
                t("trainer.rebuild_plan_prompt", {
                  goal: plan.goal,
                  days: plan.days_per_week,
                })
              );
            },
          }]
        : []),
      { text: t("trainer.new_conversation"), onPress: startNewThread },
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
          <View style={styles.libraryHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.eyebrow}>{t("trainer.personal_trainer")}</Text>
              <Text style={styles.title}>{t("trainer.library_title")}</Text>
              <Text style={styles.introSubtitle}>{t("trainer.library_subtitle")}</Text>
            </View>
            <TouchableOpacity style={styles.newThreadButton} onPress={startNewThread} disabled={!user}>
              <Ionicons name="add" size={22} color={coachColors.card} />
            </TouchableOpacity>
          </View>

          {threads.length > 0 ? (
            <View style={styles.threadList}>
              {threads.map((thread) => (
                <TouchableOpacity
                  key={thread.id}
                  style={styles.threadCard}
                  activeOpacity={0.85}
                  onPress={() => selectThread(thread.id)}
                >
                  <View style={styles.threadIcon}>
                    <Ionicons name={thread.plan ? "barbell" : "chatbubble-ellipses"} size={21} color={coachColors.coachGoldText} />
                  </View>
                  <View style={styles.threadCopy}>
                    <Text style={styles.threadTitle} numberOfLines={1}>{thread.title}</Text>
                    <Text style={styles.threadMeta} numberOfLines={1}>
                      {thread.plan
                        ? `${t("trainer.days_per_week", { count: thread.plan.days_per_week })} · ${thread.plan.split}`
                        : t("trainer.plan_in_progress")}
                    </Text>
                    <Text style={styles.threadDate}>
                      {new Date(thread.updatedAt).toLocaleDateString(i18n.language?.startsWith("es") ? "es-US" : "en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </Text>
                  </View>
                  <View style={styles.threadCount}>
                    <Ionicons name="chatbubble-outline" size={13} color={coachColors.textSecondary} />
                    <Text style={styles.threadCountText}>{thread.conversation.length}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={19} color={coachColors.textSecondary} />
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <View style={styles.coachIntroCard}>
              <View style={styles.coachIntroCopy}>
                <Text style={styles.coachIntroEyebrow}>{t("trainer.coach_locked")}</Text>
                <Text style={styles.coachIntroTitle}>{t("trainer.hi_coach")}</Text>
                <Text style={styles.coachIntroText}>{t("trainer.coach_intro")}</Text>
              </View>
            </View>
          )}

          {notice ? (
            <View style={styles.introNotice}>
              <Ionicons name="information-circle" size={18} color={colors.coral} />
              <Text style={styles.introNoticeText}>{notice}</Text>
            </View>
          ) : null}

          <TouchableOpacity
            style={[styles.chatWithMeButton, !user && styles.sendButtonDisabled]}
            disabled={!user}
            onPress={() => {
              usePlanSetupStore.getState().reset();
              startNewThread();
              router.push("/plan-setup/goal");
            }}
            accessibilityRole="button"
            accessibilityLabel={t("trainer.build_plan_cta")}
          >
            <Text style={styles.chatWithMeText}>
              {user ? t("trainer.build_plan_cta") : t("trainer.sign_in_to_chat")}
            </Text>
            <Ionicons name="arrow-forward" size={18} color={coachColors.card} />
          </TouchableOpacity>

          {user ? (
            <TouchableOpacity
              style={styles.authLinkButton}
              onPress={() => {
                // QA #4/#7 root cause: this used to call startNewThread()
                // alone, dropping straight into the old open-ended chat
                // intake — a second entry point parallel to "Build a plan"
                // above, which is why the redesigned setup flow sometimes
                // never appeared. Both buttons only ever show in the same
                // "no threads yet" state, so there's no real case this one
                // should behave differently. Route it through the same
                // tap-only flow.
                usePlanSetupStore.getState().reset();
                startNewThread();
                router.push("/plan-setup/goal");
              }}
            >
              <Text style={styles.authLinkText}>{t("trainer.new_conversation")}</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.authLinkButton} onPress={() => router.push("/(auth)/login")}>
              <Text style={styles.authLinkText}>{t("trainer.go_to_sign_in")}</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </SafeScreen>
    );
  }

  return (
    <SafeScreen edges={["top"]} style={styles.chatScreen}>
      <KeyboardAvoidingView
        style={styles.keyboard}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      >
        <View style={styles.header}>
          <TouchableOpacity style={styles.libraryBackButton} onPress={openTrainerLibrary} accessibilityRole="button" accessibilityLabel={t("trainer.back_to_library")}>
            <Ionicons name="chevron-back" size={22} color={coachColors.text} />
          </TouchableOpacity>
          <View style={styles.headerAvatar}>
            <Ionicons name="star" size={18} color={coachColors.coachGold} />
          </View>
          <View style={styles.headerCopy}>
            <Text style={styles.headerTitle}>{t("trainer.coach_header_title")}</Text>
            <Text style={styles.headerSubtitle}>{t("trainer.coach_header_subtitle")}</Text>
          </View>
          {plan ? (
            <TouchableOpacity
              style={styles.weekButton}
              onPress={() => router.push("/coach-week")}
              accessibilityRole="button"
              accessibilityLabel={t("trainer.coach_week_button")}
            >
              <Ionicons name="bar-chart-outline" size={20} color={coachColors.text} />
            </TouchableOpacity>
          ) : null}
          {plan ? (
            <TouchableOpacity style={styles.headerPlanButton} onPress={() => router.push("/plan")} accessibilityRole="button" accessibilityLabel={t("trainer.open_plan")}>
              <Ionicons name="barbell-outline" size={18} color={coachColors.coachGold} />
            </TouchableOpacity>
          ) : null}
          {conversation.length > 0 ? (
            <TouchableOpacity style={styles.headerMenuButton} onPress={confirmReset} accessibilityRole="button" accessibilityLabel={t("trainer.start_fresh")}>
              <Ionicons name="ellipsis-horizontal" size={20} color={coachColors.text} />
            </TouchableOpacity>
          ) : null}
        </View>

        {plan ? (
          <View style={styles.feelingCheckInWrap}>
            <FeelingCheckIn selected={feeling} onSelect={handleFeelingSelect} />
          </View>
        ) : null}

        <ScrollView
          ref={scrollRef}
          style={styles.messages}
          contentContainerStyle={styles.messagesContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {visibleConversation.map((message, index) => (
            <CoachMessageBubble key={`${message.role}-${index}-${message.content.slice(0, 12)}`} message={message} />
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
              ) : notice === t("trainer.plan_ready_notice") ? (
                <TouchableOpacity style={styles.resendButton} onPress={() => router.push("/plan")}>
                  <Text style={styles.resendText}>{t("trainer.open")}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}
        </ScrollView>

        <View style={styles.quickActions}>
          <SuggestedPrompts
            prompts={QUICK_ACTIONS.map((action) => ({ key: action, label: t(action) }))}
            onPress={(action) => submitMessage(t(action))}
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
            placeholder={plan ? t("trainer.placeholder_plan") : t("trainer.placeholder_intake")}
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
  libraryHeader: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 18 },
  newThreadButton: {
    width: 48, height: 48, borderRadius: 16, backgroundColor: coachColors.coachNavy,
    alignItems: "center", justifyContent: "center",
  },
  threadList: { gap: 11 },
  threadCard: {
    minHeight: 92, borderRadius: 18, backgroundColor: coachColors.card, borderWidth: 1,
    borderColor: coachColors.border, padding: 14, flexDirection: "row", alignItems: "center", gap: 12,
  },
  threadIcon: {
    width: 46, height: 46, borderRadius: 15, backgroundColor: coachColors.coachGold + "18",
    alignItems: "center", justifyContent: "center",
  },
  threadCopy: { flex: 1 },
  threadTitle: { color: coachColors.text, fontFamily: coachFonts.bodyBold, fontSize: 16 },
  threadMeta: { color: coachColors.textSecondary, fontFamily: coachFonts.body, fontSize: 12, marginTop: 4 },
  threadDate: { color: coachColors.textSecondary, fontFamily: coachFonts.body, fontSize: 11, marginTop: 4 },
  threadCount: { flexDirection: "row", alignItems: "center", gap: 4 },
  threadCountText: { color: coachColors.textSecondary, fontFamily: coachFonts.bodySemiBold, fontSize: 11 },
  introSubtitle: { color: colors.textSecondary, fontFamily: fonts.body, fontSize: 15, lineHeight: 22, marginTop: 6 },
  coachIntroCard: {
    borderRadius: 26,
    padding: 18,
    backgroundColor: coachColors.coachNavy,
    alignItems: "center",
    overflow: "hidden",
  },
  coachIntroCopy: { alignSelf: "stretch", backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 18, padding: 16 },
  coachIntroEyebrow: { color: coachColors.coachGold, fontFamily: fonts.extraBold, fontSize: 11, textTransform: "uppercase" },
  coachIntroTitle: { color: coachColors.card, fontFamily: fonts.heading, fontSize: 32, marginTop: 3 },
  coachIntroText: { color: "rgba(255,255,255,0.78)", fontFamily: fonts.body, fontSize: 14, lineHeight: 21, marginTop: 5 },
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
    backgroundColor: coachColors.coachGold,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 9,
  },
  chatWithMeText: { color: coachColors.card, fontFamily: fonts.extraBold, fontSize: 16 },
  authLinkButton: { alignItems: "center", paddingVertical: 14 },
  authLinkText: { color: coachColors.coachNavy, fontFamily: fonts.bold, fontSize: 14 },
  chatScreen: { backgroundColor: coachColors.bg },
  header: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  libraryBackButton: {
    width: 40, height: 40, borderRadius: radii.pill, backgroundColor: coachColors.card,
    borderWidth: 1, borderColor: coachColors.border, alignItems: "center", justifyContent: "center",
  },
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: radii.pill,
    backgroundColor: coachColors.coachNavy,
    alignItems: "center",
    justifyContent: "center",
  },
  headerPlanButton: {
    width: 40, height: 40, borderRadius: radii.pill, backgroundColor: coachColors.coachNavy,
    alignItems: "center", justifyContent: "center",
  },
  weekButton: {
    width: 40,
    height: 40,
    borderRadius: radii.pill,
    backgroundColor: coachColors.card,
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } },
      android: { elevation: 2 },
      default: { boxShadow: "0 1px 3px rgba(12,35,64,0.1)" },
    }),
  },
  // ••• menu — holds "Start fresh" (and "Rebuild my plan" when a plan
  // exists, via the same confirmReset action sheet). Previously a standalone
  // text link pinned above the composer, where it sat under the floating tab
  // bar; moved into the header per the Coach-chat-cleanup fix list.
  headerMenuButton: {
    width: 40,
    height: 40,
    borderRadius: radii.pill,
    backgroundColor: coachColors.card,
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } },
      android: { elevation: 2 },
      default: { boxShadow: "0 1px 3px rgba(12,35,64,0.1)" },
    }),
  },
  headerCopy: { flex: 1 },
  headerTitle: { color: coachColors.text, fontFamily: coachFonts.heading, fontSize: 22 },
  headerSubtitle: { color: coachColors.textSecondary, fontFamily: coachFonts.body, fontSize: 12, marginTop: 1 },
  eyebrow: { color: colors.textMuted, fontFamily: fonts.bold, fontSize: 12, textTransform: "uppercase" },
  title: { color: colors.text, fontFamily: fonts.heading, fontSize: 34 },
  feelingCheckInWrap: { paddingHorizontal: spacing.xl, paddingBottom: spacing.md },
  messages: { flex: 1 },
  // paddingTop was 4 — the first message bubble sat almost flush against the
  // compact header, reading as clipped. Per the fix list ("Coach chat header
  // clips the first message"), give it real breathing room.
  messagesContent: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 18, gap: 12 },
  suggestionWrap: { gap: spacing.sm },
  noticeCard: {
    flexDirection: "row",
    gap: 8,
    backgroundColor: coachColors.coachGold + "16",
    borderColor: coachColors.coachGold + "45",
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
    borderColor: coachColors.coachGold + "35",
    backgroundColor: coachColors.coachGold + "12",
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  thinkingText: { color: colors.text, fontFamily: fonts.semiBold, fontSize: 13 },
  resendButton: {
    alignSelf: "center",
    borderRadius: 10,
    backgroundColor: coachColors.coachGold,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  resendText: { color: coachColors.card, fontFamily: fonts.extraBold, fontSize: 12 },
  quickActions: { borderTopWidth: 1, borderTopColor: coachColors.border, paddingTop: 10 },
  composerWrap: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.sm,
  },
  sendButtonDisabled: { opacity: 0.5 },
});
