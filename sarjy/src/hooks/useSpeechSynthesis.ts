"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ─── Tuning (edit these in one place) ──────────────────────
const VOICE_SETTINGS = { rate: 0.95, pitch: 1.0, volume: 1 };

const PREFERRED_NAMES = [
  "Google US English",
  "Samantha",
  "Alex",
  "Daniel",
  "Karen",
  "Moira",
  "Aaron",
];

const NATURAL_KEYWORDS = ["natural", "enhanced", "premium", "siri"];

const LS_KEY = "sarjy-voice";
const MIN_CHUNK_LENGTH = 60;

// ─── Helpers ───────────────────────────────────────────────

function pickBestVoice(
  voices: SpeechSynthesisVoice[]
): SpeechSynthesisVoice | null {
  const english = voices.filter((v) => v.lang.startsWith("en"));
  if (english.length === 0) return null;

  for (const name of PREFERRED_NAMES) {
    const match = english.find((v) => v.name.includes(name));
    if (match) return match;
  }

  const natural = english.find((v) =>
    NATURAL_KEYWORDS.some((kw) => v.name.toLowerCase().includes(kw))
  );
  if (natural) return natural;

  return english.find((v) => v.lang === "en-US") ?? english[0];
}

/** Clean up assistant text so it sounds better when spoken aloud. */
export function prepareForSpeech(text: string): string {
  return (
    text
      .replace(/\u2014/g, ". ")
      .replace(/\u2013/g, ", ")
      .replace(/\*{1,2}/g, "")
      .replace(/`/g, "")
      .replace(/\n{2,}/g, ". ")
      .replace(/\n/g, " ")
      // "2:00 PM" → "2 PM"
      .replace(/:00\s*(AM|PM)/gi, " $1")
      .replace(/\s{2,}/g, " ")
      .trim()
  );
}

/** Split text on sentence boundaries, merging short sentences together. */
export function splitIntoChunks(text: string): string[] {
  let sentences: string[];
  try {
    sentences = text.split(new RegExp("(?<=[.!?])\\s+"));
  } catch {
    sentences = text.split(/[.!?]\s+/);
  }
  if (sentences.length <= 1) return text.length > 0 ? [text] : [];

  const merged: string[] = [];
  let buf = "";
  for (const s of sentences) {
    buf = buf ? buf + " " + s : s;
    if (buf.length >= MIN_CHUNK_LENGTH) {
      merged.push(buf);
      buf = "";
    }
  }
  if (buf) merged.push(buf);
  return merged;
}

// ─── Hook ──────────────────────────────────────────────────

export function useSpeechSynthesis() {
  const [isSupported, setIsSupported] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceName, setVoiceName] = useState("");

  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const safetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearSafetyTimer() {
    if (safetyTimerRef.current) {
      clearTimeout(safetyTimerRef.current);
      safetyTimerRef.current = null;
    }
  }

  function makeUtterance(text: string): SpeechSynthesisUtterance {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US";
    if (voiceRef.current) u.voice = voiceRef.current;
    u.rate = VOICE_SETTINGS.rate;
    u.pitch = VOICE_SETTINGS.pitch;
    u.volume = VOICE_SETTINGS.volume;
    return u;
  }

  // Load voices + restore saved choice
  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    setIsSupported(true);

    const saved = localStorage.getItem(LS_KEY);

    function onVoicesReady() {
      const all = window.speechSynthesis.getVoices();
      if (all.length === 0) return;

      const english = all.filter((v) => v.lang.startsWith("en"));
      setVoices(english);

      if (saved) {
        const match = english.find((v) => v.name === saved);
        if (match) {
          voiceRef.current = match;
          setVoiceName(match.name);
          return;
        }
      }

      const best = pickBestVoice(all);
      voiceRef.current = best;
      setVoiceName(best?.name ?? "");
    }

    onVoicesReady();
    window.speechSynthesis.addEventListener("voiceschanged", onVoicesReady);
    return () =>
      window.speechSynthesis.removeEventListener(
        "voiceschanged",
        onVoicesReady
      );
  }, []);

  const selectVoice = useCallback(
    (name: string) => {
      const match = voices.find((v) => v.name === name);
      if (!match) return;
      voiceRef.current = match;
      setVoiceName(match.name);
      localStorage.setItem(LS_KEY, match.name);
    },
    [voices]
  );

  const speak = useCallback(
    (text: string) => {
      if (
        !voiceEnabled ||
        typeof window === "undefined" ||
        !("speechSynthesis" in window)
      )
        return;

      window.speechSynthesis.cancel();
      clearSafetyTimer();

      const chunks = splitIntoChunks(prepareForSpeech(text));
      if (chunks.length === 0) return;

      setIsSpeaking(true);

      safetyTimerRef.current = setTimeout(() => {
        window.speechSynthesis.cancel();
        setIsSpeaking(false);
      }, 30_000);

      chunks.forEach((chunk, i) => {
        const u = makeUtterance(chunk);
        if (i === chunks.length - 1) {
          u.onend = () => { clearSafetyTimer(); setIsSpeaking(false); };
          u.onerror = () => { clearSafetyTimer(); setIsSpeaking(false); };
        }
        window.speechSynthesis.speak(u);
      });
    },
    [voiceEnabled]
  );

  const stopSpeaking = useCallback(() => {
    clearSafetyTimer();
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
  }, []);

  const toggleVoice = useCallback(() => {
    setVoiceEnabled((prev) => {
      if (prev) {
        if (typeof window !== "undefined" && "speechSynthesis" in window) {
          window.speechSynthesis.cancel();
        }
        setIsSpeaking(false);
      }
      return !prev;
    });
  }, []);

  return {
    isSupported,
    voiceEnabled,
    isSpeaking,
    voices,
    voiceName,
    speak,
    stopSpeaking,
    toggleVoice,
    selectVoice,
  };
}
