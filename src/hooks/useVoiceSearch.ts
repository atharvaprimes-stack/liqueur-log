import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';

type WebSpeechRecognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type WebSpeechWindow = Window & {
  SpeechRecognition?: new () => WebSpeechRecognition;
  webkitSpeechRecognition?: new () => WebSpeechRecognition;
};

function webSpeechCtor(): (new () => WebSpeechRecognition) | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return null;
  }
  const speechWindow = window as WebSpeechWindow;
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
}

function speechLang(language: string): string {
  return language.startsWith('mr') ? 'mr-IN' : 'en-IN';
}

export function useVoiceSearch(onTranscript: (text: string) => void, language: string) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);
  const webRef = useRef<WebSpeechRecognition | null>(null);
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  useEffect(() => {
    const webAvailable = webSpeechCtor() !== null;
    let nativeAvailable = false;
    try {
      nativeAvailable = ExpoSpeechRecognitionModule.isRecognitionAvailable();
    } catch {
      nativeAvailable = false;
    }
    setSupported(webAvailable || nativeAvailable);
  }, []);

  useSpeechRecognitionEvent('result', (event) => {
    const transcript = event.results[0]?.transcript?.trim();
    if (transcript) {
      onTranscriptRef.current(transcript);
    }
  });

  useSpeechRecognitionEvent('end', () => {
    setListening(false);
  });

  useSpeechRecognitionEvent('error', () => {
    setListening(false);
  });

  useEffect(() => {
    return () => {
      webRef.current?.abort();
      try {
        ExpoSpeechRecognitionModule.abort();
      } catch {
        // Native module may be unavailable in Expo Go.
      }
    };
  }, []);

  const stop = useCallback(() => {
    webRef.current?.stop();
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch {
      // Ignore when the native module is missing.
    }
    setListening(false);
  }, []);

  const start = useCallback(async () => {
    const lang = speechLang(language);
    const WebSpeech = webSpeechCtor();
    if (WebSpeech) {
      webRef.current?.abort();
      const recognition = new WebSpeech();
      recognition.lang = lang;
      recognition.interimResults = false;
      recognition.continuous = false;
      recognition.onresult = (event) => {
        const transcript = event.results[0]?.[0]?.transcript?.trim();
        if (transcript) {
          onTranscriptRef.current(transcript);
        }
      };
      recognition.onerror = () => setListening(false);
      recognition.onend = () => setListening(false);
      webRef.current = recognition;
      setListening(true);
      recognition.start();
      return;
    }

    try {
      const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!permission.granted) {
        return;
      }
      setListening(true);
      ExpoSpeechRecognitionModule.start({
        lang,
        interimResults: false,
        continuous: false,
        addsPunctuation: false,
      });
    } catch {
      setListening(false);
    }
  }, [language]);

  const toggle = useCallback(() => {
    if (listening) {
      stop();
      return;
    }
    void start();
  }, [listening, start, stop]);

  return { supported, listening, toggle, stop };
}
