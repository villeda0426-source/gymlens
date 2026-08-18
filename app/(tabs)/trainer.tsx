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
import { useAuthStore } from "@/store/authStore";

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
    const assistantJson = stringifyCoachResponse(response);
    const assistantText = getCoachResponseText(response);

    addConversationMessage({ role: "assistant", content: assistantText });

    if (nextIntakeHistory) {
      setIntakeHistory([...nextIntakeHistory, { role: "assistant", content: assistantJson }]);
    }

    if (response.status === "plan_ready" || response.status === "plan_updated") {
      setPlan(response.plan);
      setNotice(t("trainer.plan_ready_notice"));
    } else {
      setNotice("");
    }
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
      const language = i18n.language?.startsWith("es") ? "es" as const : "en" as const;
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
              <Ionicons name="add" size={22} color={colors.white} />
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
                    <Ionicons name={thread.plan ? "barbell" : "chatbubble-ellipses"} size={21} color={colors.ndGold} />
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
                    <Ionicons name="chatbubble-outline" size={13} color={colors.textMuted} />
                    <Text style={styles.threadCountText}>{thread.conversation.length}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={19} color={colors.textMuted} />
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
            onPress={startNewThread}
          >
            <Text style={styles.chatWithMeText}>
              {user ? t("trainer.new_conversation") : t("trainer.sign_in_to_chat")}
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
          <TouchableOpacity style={styles.libraryBackButton} onPress={openTrainerLibrary}>
            <Ionicons name="chevron-back" size={23} color={colors.text} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>{t("trainer.personal_trainer")}</Text>
            <Text style={styles.title}>{t("trainer.chat_title")}</Text>
          </View>
          {plan ? (
            <TouchableOpacity style={styles.headerPlanButton} onPress={() => router.push("/plan")}>
              <Ionicons name="barbell-outline" size={18} color={colors.ndGold} />
            </TouchableOpacity>
          ) : null}
        </View>

        <ScrollView
          ref={scrollRef}
          style={styles.messages}
          contentContainerStyle={styles.messagesContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {visibleConversation.map((message, index) => (
            <ChatBubble key={`${message.role}-${index}-${message.content.slice(0, 12)}`} message={message} />
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
              ) : notice === t("trainer.plan_ready_notice") ? (
                <TouchableOpacity style={styles.resendButton} onPress={() => router.push("/plan")}>
                  <Text style={styles.resendText}>{t("trainer.open")}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}
        </ScrollView>

        <View style={styles.quickActions}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickActionsInner}>
            {QUICK_ACTIONS.map((action) => (
              <TouchableOpacity key={action} style={styles.quickChip} onPress={() => submitMessage(t(action))}>
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
  libraryHeader: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 18 },
  newThreadButton: {
    width: 48, height: 48, borderRadius: 16, backgroundColor: colors.ndGold,
    alignItems: "center", justifyContent: "center",
  },
  threadList: { gap: 11 },
  threadCard: {
    minHeight: 92, borderRadius: 18, backgroundColor: colors.card, borderWidth: 1,
    borderColor: colors.cardBorder, padding: 14, flexDirection: "row", alignItems: "center", gap: 12,
  },
  threadIcon: {
    width: 46, height: 46, borderRadius: 15, backgroundColor: colors.ndGold + "18",
    alignItems: "center", justifyContent: "center",
  },
  threadCopy: { flex: 1 },
  threadTitle: { color: colors.text, fontFamily: fonts.bold, fontSize: 16 },
  threadMeta: { color: colors.textSecondary, fontFamily: fonts.body, fontSize: 12, marginTop: 4 },
  threadDate: { color: colors.textMuted, fontFamily: fonts.body, fontSize: 11, marginTop: 4 },
  threadCount: { flexDirection: "row", alignItems: "center", gap: 4 },
  threadCountText: { color: colors.textMuted, fontFamily: fonts.semiBold, fontSize: 11 },
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
  libraryBackButton: {
    width: 42, height: 42, borderRadius: 14, backgroundColor: colors.card,
    borderWidth: 1, borderColor: colors.cardBorder, alignItems: "center", justifyContent: "center", marginRight: 11,
  },
  headerPlanButton: {
    width: 42, height: 42, borderRadius: 14, backgroundColor: colors.ndNavy,
    borderWidth: 1, borderColor: colors.ndGold + "55", alignItems: "center", justifyContent: "center",
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
  resetButton: { alignSelf: "center", paddingVertical: 8, marginBottom: 4 },
  resetText: { color: colors.textMuted, fontFamily: fonts.semiBold, fontSize: 12 },
});
