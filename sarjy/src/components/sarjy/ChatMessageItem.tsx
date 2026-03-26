"use client";

import { motion } from "framer-motion";
import { parseAssistantContent } from "@/lib/parseAssistantContent";
import { AssistantContent } from "./AssistantContent";

export type ChatMessage = { role: "user" | "assistant"; content: string };

type ChatMessageItemProps = {
  message: ChatMessage;
};

export function ChatMessageItem({ message }: ChatMessageItemProps) {
  const isUser = message.role === "user";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10, filter: "blur(4px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      className={`flex ${isUser ? "justify-end" : "justify-start"}`}
    >
      <div
        className={`max-w-[min(100%,560px)] space-y-1 ${isUser ? "items-end" : "items-start"}`}
      >
        <div
          className={[
            "rounded-2xl px-4 py-3.5 shadow-[var(--sarjy-shadow-soft)]",
            isUser
              ? "bg-[var(--sarjy-user-bg)] text-[var(--sarjy-user-text)]"
              : "border border-[var(--sarjy-border)] bg-[var(--sarjy-elevated)] text-[var(--sarjy-text)]",
          ].join(" ")}
        >
          {isUser ? (
            <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{message.content}</p>
          ) : (
            <AssistantContent block={parseAssistantContent(message.content)} />
          )}
        </div>
        <p
          className={`px-1 text-[10px] font-medium uppercase tracking-wider text-[var(--sarjy-faint)] ${isUser ? "text-right" : "text-left"}`}
        >
          {isUser ? "You" : "Sarjy"}
        </p>
      </div>
    </motion.div>
  );
}
