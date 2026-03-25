"use client";

import { useEffect, useRef, useState } from "react";

type ChatMessage = { role: "user" | "assistant"; content: string };

type PendingAction = {
  intent?: string;
  title?: string;
  date?: string;
  time?: string;
  duration_minutes?: number;
  awaitingConfirmation?: boolean;
} | null;

export default function Home() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const endOfMessagesRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function onSend() {
    const content = input.trim();
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
            : null
        );
      }

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: assistantContent },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            err instanceof Error
              ? `Sorry — ${err.message}`
              : "Sorry — something went wrong.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center p-6">
      <div className="w-full max-w-3xl rounded-2xl border border-white/10 bg-white/5 p-6 shadow-xl">
        <div>
          <h1 className="text-3xl font-bold">Sarjy</h1>
          <p className="mt-2 text-white/70">
            Voice-first calendar assistant with reminders, preferences, and
            conflict detection.
          </p>
        </div>

        <div className="mt-6 h-[420px] rounded-xl border border-white/10 bg-black/30 p-4 overflow-y-auto">
          {messages.length === 0 ? (
            <p className="text-white/50">Ask me anything...</p>
          ) : (
            <div className="flex flex-col gap-3">
              {messages.map((m, idx) => {
                const isUser = m.role === "user";
                return (
                  <div
                    key={`${m.role}-${idx}`}
                    className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={[
                        "max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap",
                        isUser
                          ? "bg-white text-black"
                          : "bg-white/10 text-white border border-white/10",
                      ].join(" ")}
                    >
                      {m.content}
                    </div>
                  </div>
                );
              })}

              {loading ? (
                <div className="flex justify-start">
                  <div className="max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed bg-white/10 text-white border border-white/10">
                    Thinking<span className="inline-block ml-1 animate-pulse">...</span>
                  </div>
                </div>
              ) : null}

              <div ref={endOfMessagesRef} />
            </div>
          )}
        </div>

        <form
          className="mt-4 flex gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void onSend();
          }}
        >
          <input
            className="flex-1 rounded-xl border border-white/10 bg-white/10 px-4 py-3 outline-none placeholder:text-white/50 disabled:opacity-60"
            placeholder="Type a message..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={loading}
          />
          <button
            type="submit"
            className="rounded-xl bg-white text-black px-4 py-3 font-medium disabled:opacity-60"
            disabled={loading || !input.trim()}
          >
            {loading ? "Sending..." : "Send"}
          </button>
          <button
            type="button"
            className="rounded-xl border border-white/10 px-4 py-3 disabled:opacity-60"
            disabled={loading}
          >
            Mic
          </button>
        </form>
      </div>
    </main>
  );
}
