// Browser-native voice: read-aloud (TTS) and voice dictation (STT).
//
// Uses the Web Speech API only — no API key, no recording captured or sent by us.
// Text-to-speech (read a plan step aloud) is broadly supported. Speech-to-text
// (dictate a question) is Chrome/Edge-only, so callers must feature-gate on
// `sttSupported()` and only show a mic where it works. In Chrome, dictation audio
// is transcribed via the browser vendor's service — disclose that, not us.
//
// Why voice in a disaster tool: someone evacuating — hands full, eyes on the road,
// in smoke or darkness — often can't read or type. Hearing the step and speaking a
// question keeps the guidance usable when a screen isn't.

import { useCallback, useRef, useState } from "react";

const synth = typeof window !== "undefined" ? window.speechSynthesis : null;
const SR =
  typeof window !== "undefined"
    ? window.SpeechRecognition || window.webkitSpeechRecognition
    : null;

export const ttsSupported = () => !!synth;
export const sttSupported = () => !!SR;

// Map the app's language toggle to a BCP-47 tag the speech engines understand.
const bcp47 = (lang) => (lang === "fr" ? "fr-CA" : "en-US");

function pickVoice(lang) {
  if (!synth) return null;
  const voices = synth.getVoices() || [];
  const exact = lang === "fr" ? "fr-ca" : "en-us";
  const prefix = lang === "fr" ? "fr" : "en";
  return (
    voices.find((v) => (v.lang || "").toLowerCase().startsWith(exact)) ||
    voices.find((v) => (v.lang || "").toLowerCase().startsWith(prefix)) ||
    null
  );
}

// Speak `text` in the given language, cancelling anything already playing.
export function speak(text, lang = "en") {
  if (!synth || !text) return;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = bcp47(lang);
  const v = pickVoice(lang);
  if (v) u.voice = v;
  u.rate = 1;
  synth.speak(u);
}

export function stopSpeaking() {
  if (synth) synth.cancel();
}

// One-shot dictation hook: tap to start, speak, and the transcript (interim + final)
// is streamed to `onText`. Single utterance — stops on its own at end of speech.
export function useDictation(lang, onText) {
  const [listening, setListening] = useState(false);
  const recRef = useRef(null);

  const stop = useCallback(() => {
    const rec = recRef.current;
    if (rec) {
      try { rec.stop(); } catch { /* already stopped */ }
    }
    setListening(false);
  }, []);

  const start = useCallback(() => {
    if (!SR) return;
    const rec = new SR();
    recRef.current = rec;
    rec.lang = bcp47(lang);
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    let finalText = "";
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const chunk = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += chunk;
        else interim += chunk;
      }
      onText((finalText + interim).trim());
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    try {
      rec.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  }, [lang, onText]);

  return { supported: !!SR, listening, start, stop };
}
