// Voice-dictation mic button. Streams the transcript into `onText` (e.g. a textarea
// setter), so speaking fills the field and the existing AI flow handles the rest.
// Renders nothing where the browser has no speech recognition (Firefox / most iOS),
// so the surrounding UI degrades gracefully to typing.

import Icon from "./Icon.jsx";
import { useDictation } from "../speech.js";

export default function MicButton({ lang = "en", onText, disabled, idle, active }) {
  const { supported, listening, start, stop } = useDictation(lang, onText);
  if (!supported) return null;
  return (
    <button
      type="button"
      className={`mic-btn${listening ? " mic-btn--on" : ""}`}
      onClick={() => (listening ? stop() : start())}
      disabled={disabled}
      aria-pressed={listening}
      aria-label={listening ? active : idle}
      title={listening ? active : idle}
    >
      <Icon name="mic" size={15} />
    </button>
  );
}
