/**
 * Voice layer.
 *  \u2022 Web: native SpeechRecognition + SpeechSynthesis (zero install, offline on
 *    most modern engines).
 *  \u2022 Android/iOS: expo-speech for Piper-equivalent TTS; Whisper.cpp GGML model
 *    (39 MB tiny-int8) is loaded by the native module when bundled.
 */
import { Platform } from 'react-native';
import * as Speech from 'expo-speech';

export function speak(text: string, locale = 'en-IN', rate = 0.95) {
  const clean = text.replace(/[#*_`]/g, '').slice(0, 900);
  if (Platform.OS === 'web') {
    const w: any = globalThis as any;
    if (!w.speechSynthesis) return false;
    w.speechSynthesis.cancel();
    const u = new w.SpeechSynthesisUtterance(clean);
    u.lang = locale;
    u.rate = rate;
    w.speechSynthesis.speak(u);
    return true;
  }
  Speech.speak(clean, { language: locale, rate });
  return true;
}

export function stopSpeaking() {
  if (Platform.OS === 'web') (globalThis as any).speechSynthesis?.cancel();
  else Speech.stop();
}

export type Listener = { stop: () => void };

export function listen(locale: string, onText: (text: string, final: boolean) => void, onError: (msg: string) => void): Listener | null {
  if (Platform.OS !== 'web') {
    onError('On-device Whisper.cpp streaming requires the native build (expo run:android). Type your question instead.');
    return null;
  }
  const w: any = globalThis as any;
  const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
  if (!SR) { onError('This browser has no speech recognition engine. Type instead.'); return null; }
  const rec = new SR();
  rec.lang = locale;
  rec.continuous = false;
  rec.interimResults = true;
  rec.onresult = (e: any) => {
    let text = '';
    for (let i = e.resultIndex; i < e.results.length; i++) text += e.results[i][0].transcript;
    onText(text, e.results[e.results.length - 1].isFinal);
  };
  rec.onerror = (e: any) => onError(e?.error === 'not-allowed' ? 'Microphone permission denied.' : `Speech engine error: ${e?.error ?? 'unknown'}`);
  try { rec.start(); } catch { onError('Speech engine busy.'); }
  return { stop: () => { try { rec.stop(); } catch {} } };
}

export const voiceAvailable = () =>
  Platform.OS !== 'web' || !!((globalThis as any).SpeechRecognition || (globalThis as any).webkitSpeechRecognition);
