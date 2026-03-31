"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface RecognitionResult {
  readonly [index: number]: { transcript: string; confidence: number };
  readonly length: number;
}

interface RecognitionResultList {
  readonly [index: number]: RecognitionResult;
  readonly length: number;
}

interface RecognitionEvent {
  results: RecognitionResultList;
  resultIndex: number;
}

interface RecognitionErrorEvent {
  error: string;
}

interface RecognitionInstance {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  onstart: (() => void) | null;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type RecognitionCtor = new () => RecognitionInstance;

function getCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  if (!window.isSecureContext) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function useSpeechRecognition(onTranscript: (text: string) => void) {
  const [isSupported, setIsSupported] = useState(false);
  const [micEnabled, setMicEnabled] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const instanceRef = useRef<RecognitionInstance | null>(null);
  const callbackRef = useRef(onTranscript);
  const enabledRef = useRef(false);
  const pausedRef = useRef(false);
  const restartTimestamps = useRef<number[]>([]);

  useEffect(() => {
    callbackRef.current = onTranscript;
  }, [onTranscript]);

  useEffect(() => {
    if (typeof window !== "undefined" && !window.isSecureContext) {
      setError("Mic needs HTTPS — use the https:// link (e.g. your Vercel URL).");
      setIsSupported(false);
      return;
    }
    setIsSupported(getCtor() !== null);
  }, []);

  const boot = useCallback(() => {
    const Ctor = getCtor();
    if (!Ctor || !enabledRef.current) return;

    const now = Date.now();
    restartTimestamps.current = restartTimestamps.current.filter((t) => now - t < 3000);
    if (restartTimestamps.current.length >= 5) {
      enabledRef.current = false;
      setMicEnabled(false);
      setError("Microphone keeps failing — disabled automatically. Try toggling it again.");
      return;
    }
    restartTimestamps.current.push(now);

    instanceRef.current?.abort();

    const recognition = new Ctor();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.continuous = true;

    recognition.onstart = () => setIsListening(true);

    recognition.onresult = (event) => {
      const result = event.results[event.resultIndex];
      const transcript = result?.[0]?.transcript;
      if (transcript) callbackRef.current(transcript);
    };

    recognition.onerror = (event) => {
      if (event.error === "aborted" || event.error === "no-speech") return;

      if (
        event.error === "not-allowed" ||
        event.error === "service-not-allowed"
      ) {
        enabledRef.current = false;
        setMicEnabled(false);
      }

      setError(
        event.error === "not-allowed"
          ? "Microphone access denied"
          : `Speech error: ${event.error}`
      );
    };

    recognition.onend = () => {
      setIsListening(false);
      instanceRef.current = null;
      if (enabledRef.current && !pausedRef.current) {
        setTimeout(() => boot(), 200);
      }
    };

    instanceRef.current = recognition;
    try {
      recognition.start();
    } catch {
      /* already running */
    }
  }, []);

  const toggleMic = useCallback(() => {
    if (enabledRef.current) {
      enabledRef.current = false;
      pausedRef.current = false;
      setMicEnabled(false);
      instanceRef.current?.abort();
      instanceRef.current = null;
    } else {
      enabledRef.current = true;
      pausedRef.current = false;
      restartTimestamps.current = [];
      setMicEnabled(true);
      setError(null);
      boot();
    }
  }, [boot]);

  const pause = useCallback(() => {
    pausedRef.current = true;
    instanceRef.current?.abort();
    instanceRef.current = null;
  }, []);

  const resume = useCallback(() => {
    pausedRef.current = false;
    if (enabledRef.current) boot();
  }, [boot]);

  return { isSupported, micEnabled, isListening, error, toggleMic, pause, resume };
}
