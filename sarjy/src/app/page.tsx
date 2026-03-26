"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { useSpeechSynthesis } from "@/hooks/useSpeechSynthesis";
import { AppHeader } from "@/components/sarjy/AppHeader";
import { EmptyState } from "@/components/sarjy/EmptyState";
import { ChatMessageItem, type ChatMessage } from "@/components/sarjy/ChatMessageItem";
import { ThinkingIndicator } from "@/components/sarjy/ThinkingIndicator";
import { Composer } from "@/components/sarjy/Composer";
import { SettingsDrawer } from "@/components/sarjy/SettingsDrawer";

type PendingAction = {
  intent?: string;
  title?: string;
  date?: string;
  time?: string;
  duration_minutes?: number;
  awaitingConfirmation?: boolean;
} | null;

type LastEvent = {
  id: string;
  summary: string;
  start: string;
  end: string;
} | null;

export default function Home() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [lastEvent, setLastEvent] = useState<LastEvent>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [theme, setTheme] = useState<"dark" | "graphite">("dark");

  const endOfMessagesRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const {
    isSupported: ttsSupported,
    voiceEnabled,
    isSpeaking,
    voices,
    voiceName,
    speak,
    stopSpeaking,
    toggleVoice,
    selectVoice,
  } = useSpeechSynthesis();

  const speakRef = useRef(speak);
  speakRef.current = speak;

  const {
    isSupported: micSupported,
    micEnabled,
    isListening,
    error: micError,
    toggleMic,
    pause: pauseMic,
    resume: resumeMic,
  } = useSpeechRecognition((text) => {
    void handleSend(text);
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-sarjy-theme", theme);
  }, [theme]);

  useEffect(() => {
    if (isSpeaking) pauseMic();
    else resumeMic();
  }, [isSpeaking, pauseMic, resumeMic]);

  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: "smooth" });
    if (!loading) inputRef.current?.focus();
  }, [messages, loading]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [isListening]);

  async function handleSend(explicitContent?: string) {
    const content = (explicitContent ?? input).trim();
    if (!content || loading) return;

    const userMessage: ChatMessage = { role: "user", content };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    try {
      const recentMessages = [...messages, userMessage].slice(-8);

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: content,
          messages: recentMessages,
          pendingAction,
          lastEvent,
        }),
      });

      if (!res.ok) throw new Error(`Request failed: ${res.status}`);

      const data = (await res.json()) as Record<string, unknown>;

      const assistantContent =
        typeof data.content === "string" && data.content.trim()
          ? data.content
          : "Sorry, I couldn't generate a response.";

      if ("pendingAction" in data) {
        setPendingAction(
          data.pendingAction && typeof data.pendingAction === "object"
            ? (data.pendingAction as PendingAction)
            : null,
        );
      }

      if ("lastEvent" in data) {
        if (data.lastEvent === null) setLastEvent(null);
        else if (data.lastEvent && typeof data.lastEvent === "object") {
          setLastEvent(data.lastEvent as LastEvent);
        }
      }

      setMessages((prev) => [...prev, { role: "assistant", content: assistantContent }]);

      speakRef.current(assistantContent);
    } catch (err) {
      const errorContent =
        err instanceof Error ? `Sorry — ${err.message}` : "Sorry — something went wrong.";

      setMessages((prev) => [...prev, { role: "assistant", content: errorContent }]);
      speakRef.current(errorContent);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader onOpenSettings={() => setSettingsOpen(true)} calendarConnected />

      <main className="flex flex-1 flex-col px-3 pb-3 pt-4 sm:px-6 sm:pb-6 sm:pt-6">
        <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col overflow-hidden rounded-3xl border border-[var(--sarjy-border)] bg-[var(--sarjy-surface)] shadow-[var(--sarjy-shadow-soft)] min-h-[min(720px,calc(100dvh-5.5rem))] sm:min-h-[min(780px,calc(100dvh-6rem))]">
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-8 sm:py-8">
              {messages.length === 0 ? (
                <EmptyState disabled={loading} onPick={(text) => void handleSend(text)} />
              ) : (
                <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 pb-4">
                  <AnimatePresence initial={false}>
                    {messages.map((m, idx) => (
                      <ChatMessageItem
                        key={`${m.role}-${idx}-${m.content.slice(0, 48)}`}
                        message={m}
                      />
                    ))}
                  </AnimatePresence>
                  {loading ? <ThinkingIndicator /> : null}
                  <div ref={endOfMessagesRef} className="h-px shrink-0" aria-hidden />
                </div>
              )}
            </div>
          </div>

          <Composer
            inputRef={inputRef}
            value={input}
            onChange={setInput}
            onSubmit={() => void handleSend()}
            loading={loading}
            isListening={isListening}
            micSupported={micSupported}
            micEnabled={micEnabled}
            onToggleMic={toggleMic}
            micError={micError}
            isSpeaking={isSpeaking}
            onStopSpeaking={stopSpeaking}
          />
        </div>
      </main>

      <SettingsDrawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        ttsSupported={ttsSupported}
        voiceEnabled={voiceEnabled}
        onToggleVoice={toggleVoice}
        voices={voices}
        voiceName={voiceName}
        onSelectVoice={selectVoice}
        theme={theme}
        onThemeChange={setTheme}
      />
    </div>
  );
}
