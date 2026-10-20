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
import { coachColors, coachFonts, radii, spacing } from "@/constants/theme";
import { useTabBarSpace } from "@/components/CoachTabBar";
import CoachComposer from "@/components/Coach/CoachComposer";
import CoachMessageBubble from "@/components/Coach/CoachMessageBubble";
import CoachQuestionCard from "@/components/Coach/CoachQuestionCard";
import CoachSuggestionCard from "@/components/Coach/CoachSuggestionCard";
import FeelingCheckIn, { Feeling } from "@/components/Coach/FeelingCheckIn";
import SafetyNote from "@/components/Coach/SafetyNote";
import SuggestedPrompts from "@/components/Coach/SuggestedPrompts";
import { supabase } from "@/lib/supabase";
import {
  callCoachTrainer,
  CoachMessage,
  CoachResponse,
  getLatestCoachWorkoutReview,
  makeFreeformWorkoutLog,
} from "@/lib/coachTrainer";
import {
  adjustPlanOption,
  generateAiPlanOptions,
  generateSessionOptions,
  instructionsDirective,
  type PlanOption,
} from "@/lib/planOptions";
import { isPermanentChange, looksLikeWorkoutInstruction, parseInstructionOverrides, type InstructionOverrides } from "@/lib/coachInstructions";
import { buildPlanSequence, nextWorkoutItem } from "@/lib/planSequence";
import PlanOptionCards from "@/components/Coach/PlanOptionCards";
import { getCoachChips, getCoachPlanState, type CoachChip } from "@/lib/coachSuggestions";
import {
  answerLabel,
  buildFlowIntakeMessage,
  buildFlowTemplateOptions,
  flowInstructions,
  getQuestion,
  remainingQuestions,
  type QuestionAnswer,
  type QuestionFlowAnswers,
  type QuestionId,
} from "@/lib/coachQuestionFlow";
import { useCoachTrainerStore } from "@/store/coachTrainerStore";
import { usePlanSetupStore, type SessionMinutes } from "@/store/planSetupStore";
import { useAuthStore } from "@/store/authStore";
import CoachIcon from "@/components/Coach/CoachIcon";

// The step-by-step plan questions in progress. Answered pairs render from
// here (not the conversation) until the last answer, so going back to change
// one doesn't leave stale bubbles behind.
type QuestionFlowState = {
  order: QuestionId[];
  index: number;
  answers: QuestionFlowAnswers;
  sessionMinutes: SessionMinutes;
  note?: string;
};

type FinishedQuestionFlow = Pick<QuestionFlowState, "answers" | "sessionMinutes" | "note">;

// Coach's two options on screen, waiting for a pick. `source` is what made
// them, so typing more instructions while choosing can rebuild both.
type PlanChoiceSource =
  | { type: "flow"; finished: FinishedQuestionFlow }
  | { type: "intake"; history: CoachMessage[]; userMessage: string }
  | { type: "workout"; sessionIndex: number; instructions: string };

type PlanChoice = {
  kind: "plan" | "workout";
  options: PlanOption[];
  source: PlanChoiceSource;
  // Set when the instructions behind these options sound permanent, so
  // picking one also offers to save the change to the profile.
  permanent: InstructionOverrides | null;
};

function joinInstructions(previous: string | null | undefined, next: string): string {
  return previous?.trim() ? `${previous.trim()}; ${next.trim()}` : next.trim();
}

function permanentOverrides(instructions: string | null | undefined): InstructionOverrides | null {
  if (!instructions || !isPermanentChange(instructions)) return null;
  const overrides = parseInstructionOverrides(instructions);
  return overrides.location || overrides.sessionMinutes ? overrides : null;
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
  const tabBarSpace = useTabBarSpace();
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
    updatePlan,
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
    archiveThread,
    unarchiveThread,
    latestWorkoutReview,
    setLatestWorkoutReview,
    hasLoaded,
    loadTrainer,
    activeThreadId,
    completedExerciseIds,
    sessionCompletedAt,
  } = useCoachTrainerStore();

  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [listening, setListening] = useState(false);
  const [feeling, setFeeling] = useState<Feeling | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [questionFlow, setQuestionFlow] = useState<QuestionFlowState | null>(null);
  const [failedFlow, setFailedFlow] = useState<FinishedQuestionFlow | null>(null);
  const [planChoice, setPlanChoice] = useState<PlanChoice | null>(null);
  const [adjustingOptionId, setAdjustingOptionId] = useState<string | null>(null);
  const [profilePrompt, setProfilePrompt] = useState<InstructionOverrides | null>(null);

  // Questions and options in progress belong to the thread they started in.
  useEffect(() => {
    setQuestionFlow(null);
    setFailedFlow(null);
    setPlanChoice(null);
    setProfilePrompt(null);
  }, [activeThreadId]);

  const chips = useMemo(
    () => getCoachChips(getCoachPlanState({ plan, completedExerciseIds, sessionCompletedAt }), feeling),
    [plan, completedExerciseIds, sessionCompletedAt, feeling]
  );

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
  }, [conversation.length, notice, questionFlow?.index, planChoice, profilePrompt]);

  const visibleConversation = useMemo<CoachMessage[]>(() => {
    if (conversation.length > 0) return conversation;
    return [
      {
        role: "assistant",
        content: plan ? t("trainer.starter_message_plan") : t("trainer.starter_message"),
      },
    ];
  }, [conversation, plan, t]);

  const activeThreads = useMemo(() => threads.filter((thread) => !thread.archivedAt), [threads]);
  const archivedThreads = useMemo(() => threads.filter((thread) => thread.archivedAt), [threads]);

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

  const submitMessage = async (messageText?: string) => {
    const text = (messageText ?? draft).trim();
    if (!text || loading) return;

    // While a question card is up, typing is the free-text answer to it.
    if (questionFlow) {
      setDraft("");
      handleQuestionAnswer({ values: [], text });
      return;
    }

    // While two options are up, typing is more instructions: rebuild both.
    if (planChoice) {
      setDraft("");
      addConversationMessage({ role: "user", content: text });
      void regeneratePlanChoice(planChoice, text);
      return;
    }

    // A plan is running and this changes how the next workout should look
    // ("bodyweight only today", "make it 30 minutes"): two takes on it.
    if (plan && looksLikeWorkoutInstruction(text)) {
      setDraft("");
      addConversationMessage({ role: "user", content: text });
      void offerWorkoutOptions(text);
      return;
    }

    // No plan yet and no Coach intake already underway: a statement ("I want
    // to get stronger") starts the question cards with it as context; a
    // question ("What can you help with?") is just answered.
    const startsQuestions = !plan && intakeHistory.length === 0 && !/[?？]\s*$/.test(text);
    if (startsQuestions) {
      setDraft("");
      startQuestionFlow({ userText: text, note: text, introKey: "intro_note" });
      return;
    }

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
      if (!plan && intakeHistory.length > 0) {
        setNotice(t("trainer.coach_building_plan"));
        await offerAiPlanOptions({ history: intakeHistory, userMessage: text, authToken: session.access_token, signal: controller.signal });
        setFailedPrompt(null);
      } else if (!plan) {
        const response = await callCoachTrainer({
          mode: "chat",
          units,
          language,
          currentPlan: null,
          question: text,
        }, { authToken: session.access_token, signal: controller.signal });
        handleResponse(response);
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

  const startQuestionFlow = ({
    userText,
    note,
    introKey,
    sessionMinutes = 45,
  }: {
    userText: string;
    note?: string;
    introKey: "intro_create" | "intro_thirty" | "intro_next_block" | "intro_note";
    sessionMinutes?: SessionMinutes;
  }) => {
    if (loading) return;
    setNotice("");
    setFailedFlow(null);
    addConversationMessage({ role: "user", content: userText });
    addConversationMessage({ role: "assistant", content: t(`trainer.question_flow.${introKey}`) });
    // Session length is never one of the cards: it comes from the path
    // ("I only have 30 minutes") or defaults to 45.
    const answers: QuestionFlowAnswers = {};
    setQuestionFlow({ order: remainingQuestions(answers), index: 0, answers, sessionMinutes, note });
  };

  const handleQuestionAnswer = (answer: QuestionAnswer) => {
    if (!questionFlow) return;
    const id = questionFlow.order[questionFlow.index];
    const answers = { ...questionFlow.answers, [id]: answer };
    if (questionFlow.index + 1 < questionFlow.order.length) {
      setQuestionFlow({ ...questionFlow, answers, index: questionFlow.index + 1 });
      return;
    }

    // Last answer: the Q/A pairs become real chat history, then build.
    for (const questionId of questionFlow.order) {
      const given = answers[questionId];
      if (!given) continue;
      addConversationMessage({ role: "assistant", content: t(`trainer.question_flow.${questionId}.title`) });
      addConversationMessage({ role: "user", content: answerLabel(t, questionId, given) });
    }
    setQuestionFlow(null);
    void generatePlanFromFlow({ answers, sessionMinutes: questionFlow.sessionMinutes, note: questionFlow.note });
  };

  const handleQuestionBack = () => {
    if (!questionFlow) return;
    if (questionFlow.index === 0) {
      setQuestionFlow(null);
      addConversationMessage({ role: "assistant", content: t("trainer.question_flow.cancelled") });
      return;
    }
    setQuestionFlow({ ...questionFlow, index: questionFlow.index - 1 });
  };

  const coachLanguage = () => (i18n.language?.startsWith("es") ? ("es" as const) : ("en" as const));

  // Two AI options from an intake conversation. Shown as cards; nothing is
  // saved until one is picked. A question back from Coach is just a reply.
  const offerAiPlanOptions = async (args: {
    history: CoachMessage[];
    userMessage: string;
    authToken: string;
    signal: AbortSignal;
    permanent?: InstructionOverrides | null;
    source?: PlanChoiceSource;
  }) => {
    const result = await generateAiPlanOptions({
      units,
      language: coachLanguage(),
      history: args.history,
      userMessage: args.userMessage,
      authToken: args.authToken,
      signal: args.signal,
    });
    const nextHistory: CoachMessage[] =
      args.history.length === 0
        ? [{ role: "user", content: `CONTEXT: ${JSON.stringify({ mode: "intake", units })}\n\n${args.userMessage}` }]
        : [...args.history, { role: "user", content: args.userMessage }];
    if (result.kind === "message") {
      handleResponse(result.response, nextHistory);
      return;
    }
    setIntakeHistory(nextHistory);
    showPlanChoice({
      kind: "plan",
      options: result.options,
      source: args.source ?? { type: "intake", history: args.history, userMessage: args.userMessage },
      permanent: args.permanent ?? null,
    });
  };

  const showPlanChoice = (choice: PlanChoice) => {
    setPlanChoice(choice);
    setNotice(choice.options.length < 2 ? t("plan_options.only_one") : "");
    addConversationMessage({
      role: "assistant",
      content: t(choice.kind === "plan" ? "plan_options.intro_plan" : "plan_options.intro_workout"),
    });
  };

  // Session check + abort + loading/notice handling shared by every
  // option-generating request.
  const runCoachRequest = async (
    work: (authToken: string, signal: AbortSignal) => Promise<void>,
    onError?: (error: any) => boolean
  ) => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token || !user) {
      setNotice(t("trainer.session_expired_send"));
      resetChatSession();
      return;
    }
    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;
    setLoading(true);
    setNotice(t("trainer.coach_building_plan"));
    try {
      await work(session.access_token, controller.signal);
    } catch (error: any) {
      if (onError?.(error)) return;
      setNotice(error?.name === "AbortError" ? t("trainer.chat_interrupted") : t("trainer.coach_connect_error"));
    } finally {
      setLoading(false);
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  const generatePlanFromFlow = async (finished: FinishedQuestionFlow) => {
    const language = coachLanguage();
    const instructions = flowInstructions(finished.answers);
    const permanent = permanentOverrides(instructions);
    const source: PlanChoiceSource = { type: "flow", finished };
    const templateArgs = {
      sessionMinutes: finished.sessionMinutes,
      units,
      language,
      hasNote: !!finished.note?.trim(),
    };
    const templateOptions = buildFlowTemplateOptions(finished.answers, templateArgs);
    if (templateOptions) {
      setFailedFlow(null);
      showPlanChoice({ kind: "plan", options: templateOptions, source, permanent });
      return;
    }

    setFailedFlow(null);
    setFailedPrompt(null);
    await runCoachRequest(
      async (authToken, signal) => {
        const userMessage = buildFlowIntakeMessage(t, finished.answers, {
          sessionMinutes: finished.sessionMinutes,
          note: finished.note,
        });
        await offerAiPlanOptions({ history: [], userMessage, authToken, signal, permanent, source });
      },
      (error) => {
        // Coach unreachable but the instructions are ones the app can apply
        // itself (equipment, session length): still offer two plans.
        if (error?.name !== "AbortError" && instructions) {
          const fallback = buildFlowTemplateOptions(finished.answers, { ...templateArgs, applyInstructions: true });
          if (fallback) {
            showPlanChoice({ kind: "plan", options: fallback, source, permanent });
            return true;
          }
        }
        setFailedFlow(finished);
        return false;
      }
    );
  };

  // Custom instructions with a plan running: two takes on the next workout.
  const offerWorkoutOptions = async (instructions: string) => {
    if (!plan) return;
    const sequence = buildPlanSequence({ plan, completedExerciseIds, sessionCompletedAt });
    const next = nextWorkoutItem(sequence);
    if (!next) {
      addConversationMessage({ role: "assistant", content: t("plan_options.no_next_workout") });
      return;
    }
    await runCoachRequest(async (authToken, signal) => {
      const options = await generateSessionOptions({
        plan,
        sessionIndex: next.sessionIndex,
        instructions,
        units,
        language: coachLanguage(),
        authToken,
        signal,
      });
      showPlanChoice({
        kind: "workout",
        options,
        source: { type: "workout", sessionIndex: next.sessionIndex, instructions },
        permanent: permanentOverrides(instructions),
      });
    });
  };

  const regeneratePlanChoice = async (choice: PlanChoice, extra: string) => {
    setPlanChoice(null);
    const source = choice.source;
    if (source.type === "flow") {
      const answers = {
        ...source.finished.answers,
        instructions: { values: ["add"], text: joinInstructions(flowInstructions(source.finished.answers), extra) },
      };
      await generatePlanFromFlow({ ...source.finished, answers });
      return;
    }
    if (source.type === "workout") {
      await offerWorkoutOptions(joinInstructions(source.instructions, extra));
      return;
    }
    await runCoachRequest((authToken, signal) =>
      offerAiPlanOptions({
        history: source.history,
        userMessage: `${source.userMessage} ${instructionsDirective(extra)}`,
        authToken,
        signal,
        permanent: permanentOverrides(extra) ?? choice.permanent,
      })
    );
  };

  const handleChooseOption = (option: PlanOption) => {
    if (!planChoice) return;
    const choice = planChoice;
    setPlanChoice(null);
    addConversationMessage({ role: "user", content: t("plan_options.chose", { id: option.id }) });
    if (choice.kind === "plan") {
      setPlan(option.plan);
      addConversationMessage({ role: "assistant", content: option.summary });
      setNotice(t("trainer.plan_ready_notice"));
    } else if (plan && choice.source.type === "workout") {
      const { sessionIndex } = choice.source;
      const original = plan.sessions[sessionIndex];
      const chosen = option.plan.sessions[0];
      if (original && chosen) {
        // Completion is tracked by exercise id, so an id another workout
        // already uses gets a suffix rather than finishing both at once.
        const otherIds = new Set(
          plan.sessions.flatMap((session, index) => (index === sessionIndex ? [] : session.exercises.map((exercise) => exercise.exercise_id)))
        );
        const exercises = chosen.exercises.map((exercise) =>
          otherIds.has(exercise.exercise_id) ? { ...exercise, exercise_id: `${exercise.exercise_id}-s${sessionIndex + 1}` } : exercise
        );
        // Keeps the original label so history and feedback still match it.
        const sessions = plan.sessions.map((session, index) =>
          index === sessionIndex ? { ...chosen, exercises, day_label: original.day_label } : session
        );
        updatePlan({ ...plan, sessions });
      }
      addConversationMessage({
        role: "assistant",
        content: t("plan_options.workout_updated", { number: sessionIndex + 1 }),
      });
      setNotice("");
    }
    if (choice.permanent) setProfilePrompt(choice.permanent);
  };

  const handleAdjustOption = async (option: PlanOption, instructions: string) => {
    if (!planChoice) return;
    const choice = planChoice;
    addConversationMessage({ role: "user", content: t("plan_options.adjust_message", { id: option.id, instructions }) });
    setAdjustingOptionId(option.id);
    await runCoachRequest(async (authToken, signal) => {
      const adjusted = await adjustPlanOption({ option, instructions, units, language: coachLanguage(), authToken, signal });
      const updated: PlanOption =
        choice.kind === "workout"
          ? { ...adjusted, plan: { ...adjusted.plan, days_per_week: 1, sessions: adjusted.plan.sessions.slice(0, 1) } }
          : adjusted;
      setPlanChoice((current) =>
        current ? { ...current, options: current.options.map((item) => (item.id === option.id ? updated : item)), permanent: current.permanent ?? permanentOverrides(instructions) } : current
      );
      setNotice("");
    });
    setAdjustingOptionId(null);
  };

  // A permanent-sounding change ("I don't have a gym anymore"): save it to
  // the profile only if the person says so.
  const handleProfilePrompt = async (save: boolean) => {
    const overrides = profilePrompt;
    setProfilePrompt(null);
    if (!save || !overrides || !user) {
      addConversationMessage({ role: "assistant", content: t("plan_options.profile_kept") });
      return;
    }
    const { error } = await supabase
      .from("profiles")
      .update({
        ...(overrides.location ? { equipment_type: overrides.location } : {}),
        ...(overrides.sessionMinutes ? { session_minutes: overrides.sessionMinutes } : {}),
      })
      .eq("id", user.id);
    addConversationMessage({
      role: "assistant",
      content: t(error ? "plan_options.profile_save_failed" : "plan_options.profile_saved"),
    });
  };

  const handleChipPress = (chip: CoachChip) => {
    const label = t(chip.key);
    if (chip.action.type === "navigate") {
      router.push(chip.action.pathname);
      return;
    }
    if (chip.action.type === "flow") {
      const introKey = chip.action.sessionMinutes
        ? "intro_thirty"
        : chip.key.endsWith("build_next_block")
          ? "intro_next_block"
          : "intro_create";
      startQuestionFlow({ userText: label, introKey, sessionMinutes: chip.action.sessionMinutes });
      return;
    }
    submitMessage(label);
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
          <ActivityIndicator color={coachColors.coral} />
        </View>
      </SafeScreen>
    );
  }

  if (!hasEnteredCoachChat) {
    return (
      <SafeScreen edges={["top"]}>
        <ScrollView style={styles.introScroll} contentContainerStyle={[styles.introContent, { paddingBottom: tabBarSpace }]} showsVerticalScrollIndicator={false}>
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
              {activeThreads.map((thread) => (
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
                  <TouchableOpacity
                    style={styles.threadArchiveButton}
                    onPress={(event) => {
                      event.stopPropagation();
                      archiveThread(thread.id);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={t("trainer.archive_thread")}
                    hitSlop={8}
                  >
                    <Ionicons name="archive-outline" size={18} color={coachColors.textSecondary} />
                  </TouchableOpacity>
                </TouchableOpacity>
              ))}

              {/* QA #13: archive, not delete — recoverable. Collapsed by
                  default so a long history doesn't clutter the main list. */}
              {archivedThreads.length > 0 ? (
                <>
                  <TouchableOpacity
                    style={styles.archivedToggle}
                    onPress={() => setShowArchived((value) => !value)}
                  >
                    <Ionicons name={showArchived ? "chevron-down" : "chevron-forward"} size={16} color={coachColors.textSecondary} />
                    <Text style={styles.archivedToggleText}>
                      {t("trainer.archived_count", { count: archivedThreads.length })}
                    </Text>
                  </TouchableOpacity>
                  {showArchived
                    ? archivedThreads.map((thread) => (
                        <View key={thread.id} style={[styles.threadCard, styles.threadCardArchived]}>
                          <View style={styles.threadIcon}>
                            <Ionicons name={thread.plan ? "barbell" : "chatbubble-ellipses"} size={21} color={coachColors.textSecondary} />
                          </View>
                          <TouchableOpacity style={styles.threadCopy} onPress={() => selectThread(thread.id)}>
                            <Text style={styles.threadTitle} numberOfLines={1}>{thread.title}</Text>
                            <Text style={styles.threadMeta} numberOfLines={1}>
                              {thread.plan
                                ? `${t("trainer.days_per_week", { count: thread.plan.days_per_week })} · ${thread.plan.split}`
                                : t("trainer.plan_in_progress")}
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.unarchiveButton}
                            onPress={() => unarchiveThread(thread.id)}
                            accessibilityRole="button"
                            accessibilityLabel={t("trainer.unarchive_thread")}
                          >
                            <Text style={styles.unarchiveButtonText}>{t("trainer.unarchive_thread")}</Text>
                          </TouchableOpacity>
                        </View>
                      ))
                    : null}
                </>
              ) : null}
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
              <Ionicons name="information-circle" size={18} color={coachColors.coral} />
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

          {user ? (
            <TouchableOpacity style={styles.authLinkButton} onPress={() => router.push("/import-routine")}>
              <Text style={styles.authLinkText}>{t("import_routine.title")}</Text>
            </TouchableOpacity>
          ) : null}
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
          <CoachIcon size={28} badgeSize={40} style={styles.headerAvatar} />
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

          {questionFlow
            ? questionFlow.order.slice(0, questionFlow.index).map((questionId) => {
                const given = questionFlow.answers[questionId];
                if (!given) return null;
                return (
                  <React.Fragment key={`flow-${questionId}`}>
                    <CoachMessageBubble message={{ role: "assistant", content: t(`trainer.question_flow.${questionId}.title`) }} />
                    <CoachMessageBubble message={{ role: "user", content: answerLabel(t, questionId, given) }} />
                  </React.Fragment>
                );
              })
            : null}

          {questionFlow ? (
            <CoachQuestionCard
              key={questionFlow.order[questionFlow.index]}
              question={getQuestion(questionFlow.order[questionFlow.index])}
              step={questionFlow.index + 1}
              totalSteps={questionFlow.order.length}
              initialAnswer={questionFlow.answers[questionFlow.order[questionFlow.index]]}
              onSubmit={handleQuestionAnswer}
              onBack={handleQuestionBack}
              disabled={loading}
            />
          ) : null}

          {planChoice ? (
            <PlanOptionCards
              options={planChoice.options}
              kind={planChoice.kind}
              onChoose={handleChooseOption}
              onAdjust={handleAdjustOption}
              adjustingId={adjustingOptionId}
              disabled={loading}
            />
          ) : null}

          {profilePrompt ? (
            <View style={styles.profilePrompt}>
              <Text style={styles.profilePromptText}>
                {t("plan_options.profile_question", {
                  change: [
                    profilePrompt.location ? t(`plan_options.location.${profilePrompt.location}`) : null,
                    profilePrompt.sessionMinutes ? t("plan_options.minutes_value", { count: profilePrompt.sessionMinutes }) : null,
                  ].filter(Boolean).join(", "),
                })}
              </Text>
              <View style={styles.profilePromptButtons}>
                <TouchableOpacity style={styles.profilePromptPrimary} onPress={() => handleProfilePrompt(true)} accessibilityRole="button">
                  <Text style={styles.profilePromptPrimaryText}>{t("plan_options.profile_yes")}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.profilePromptSecondary} onPress={() => handleProfilePrompt(false)} accessibilityRole="button">
                  <Text style={styles.profilePromptSecondaryText}>{t("plan_options.profile_no")}</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

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
              {failedFlow ? (
                <TouchableOpacity style={styles.resendButton} onPress={() => generatePlanFromFlow(failedFlow)} disabled={loading}>
                  <Text style={styles.resendText}>{t("trainer.resend")}</Text>
                </TouchableOpacity>
              ) : failedPrompt ? (
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

        {questionFlow || planChoice ? null : (
          <View style={styles.quickActions}>
            <SuggestedPrompts
              prompts={chips.map((chip) => ({ key: chip.key, label: t(chip.key) }))}
              onPress={(key) => {
                const chip = chips.find((item) => item.key === key);
                if (chip) handleChipPress(chip);
              }}
            />
          </View>
        )}

        <View style={[styles.composerWrap, { paddingBottom: tabBarSpace }]}>
          <CoachComposer
            value={draft}
            onChangeText={setDraft}
            onSend={() => submitMessage()}
            onVoicePress={toggleVoiceInput}
            listening={listening}
            loading={loading}
            placeholder={
              questionFlow
                ? t("trainer.question_flow.composer_placeholder")
                : planChoice
                  ? t("plan_options.composer_placeholder")
                  : plan
                  ? t("trainer.placeholder_plan")
                  : t("trainer.placeholder_intake")
            }
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
  threadArchiveButton: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  threadCardArchived: { opacity: 0.75 },
  archivedToggle: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingVertical: 10, paddingHorizontal: 4, alignSelf: "flex-start",
  },
  archivedToggleText: { color: coachColors.textSecondary, fontFamily: coachFonts.bodySemiBold, fontSize: 13 },
  unarchiveButton: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: radii.pill,
    borderWidth: 1, borderColor: coachColors.border,
  },
  unarchiveButtonText: { color: coachColors.text, fontFamily: coachFonts.bodySemiBold, fontSize: 12 },
  introSubtitle: { color: coachColors.textSecondary, fontFamily: coachFonts.body, fontSize: 15, lineHeight: 22, marginTop: 6 },
  coachIntroCard: {
    borderRadius: 26,
    padding: 18,
    backgroundColor: coachColors.coachNavy,
    alignItems: "center",
    overflow: "hidden",
  },
  coachIntroCopy: { alignSelf: "stretch", backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 18, padding: 16 },
  coachIntroEyebrow: { color: coachColors.coachGold, fontFamily: coachFonts.bodyExtraBold, fontSize: 11, textTransform: "uppercase" },
  coachIntroTitle: { color: coachColors.card, fontFamily: coachFonts.heading, fontSize: 32, marginTop: 3 },
  coachIntroText: { color: "rgba(255,255,255,0.78)", fontFamily: coachFonts.body, fontSize: 14, lineHeight: 21, marginTop: 5 },
  introNotice: {
    marginTop: 12,
    flexDirection: "row",
    gap: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: coachColors.coral + "30",
    backgroundColor: coachColors.coral + "10",
    padding: 12,
  },
  introNoticeText: { flex: 1, color: coachColors.text, fontFamily: coachFonts.bodySemiBold, fontSize: 13, lineHeight: 18 },
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
  chatWithMeText: { color: coachColors.card, fontFamily: coachFonts.bodyExtraBold, fontSize: 16 },
  authLinkButton: { alignItems: "center", paddingVertical: 14 },
  authLinkText: { color: coachColors.coachNavy, fontFamily: coachFonts.bodyBold, fontSize: 14 },
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
  headerAvatar: { borderWidth: 1, borderColor: coachColors.border },
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
  eyebrow: { color: coachColors.textSecondary, fontFamily: coachFonts.bodyBold, fontSize: 12, textTransform: "uppercase" },
  title: { color: coachColors.text, fontFamily: coachFonts.heading, fontSize: 34 },
  feelingCheckInWrap: { paddingHorizontal: spacing.xl, paddingBottom: spacing.md },
  messages: { flex: 1 },
  // paddingTop was 4 — the first message bubble sat almost flush against the
  // compact header, reading as clipped. Per the fix list ("Coach chat header
  // clips the first message"), give it real breathing room.
  messagesContent: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 18, gap: 12 },
  suggestionWrap: { gap: spacing.sm },
  profilePrompt: {
    alignSelf: "flex-start",
    maxWidth: "88%",
    backgroundColor: coachColors.card,
    borderWidth: 1.5,
    borderColor: coachColors.coachGold,
    borderRadius: radii.card,
    padding: spacing.lg,
    gap: spacing.md,
  },
  profilePromptText: { color: coachColors.text, fontFamily: coachFonts.bodySemiBold, fontSize: 15, lineHeight: 21 },
  profilePromptButtons: { flexDirection: "row", gap: spacing.sm },
  profilePromptPrimary: {
    flex: 1, height: 44, borderRadius: radii.pill, backgroundColor: coachColors.coralPressed,
    alignItems: "center", justifyContent: "center", paddingHorizontal: 10,
  },
  profilePromptPrimaryText: { color: coachColors.card, fontFamily: coachFonts.bodyExtraBold, fontSize: 14 },
  profilePromptSecondary: {
    flex: 1, height: 44, borderRadius: radii.pill, borderWidth: 1.5, borderColor: coachColors.border,
    alignItems: "center", justifyContent: "center", paddingHorizontal: 10,
  },
  profilePromptSecondaryText: { color: coachColors.text, fontFamily: coachFonts.bodyBold, fontSize: 14 },
  noticeCard: {
    flexDirection: "row",
    gap: 8,
    backgroundColor: coachColors.coachGold + "16",
    borderColor: coachColors.coachGold + "45",
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
  },
  noticeText: { flex: 1, color: coachColors.text, fontFamily: coachFonts.bodySemiBold, fontSize: 13, lineHeight: 18 },
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
  thinkingText: { color: coachColors.text, fontFamily: coachFonts.bodySemiBold, fontSize: 13 },
  resendButton: {
    alignSelf: "center",
    borderRadius: 10,
    backgroundColor: coachColors.coachGold,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  resendText: { color: coachColors.card, fontFamily: coachFonts.bodyExtraBold, fontSize: 12 },
  quickActions: { borderTopWidth: 1, borderTopColor: coachColors.border, paddingTop: 10 },
  composerWrap: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.sm,
  },
  sendButtonDisabled: { opacity: 0.5 },
});
