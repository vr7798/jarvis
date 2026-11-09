import { useCallback, useEffect, useRef, useState } from 'react';

const recognitionMessages = {
  'not-allowed': 'O acesso ao microfone foi negado. Permita o microfone nas configurações deste site e tente novamente.',
  'service-not-allowed': 'O navegador não permitiu o reconhecimento de voz. Confira as permissões do site.',
  'audio-capture': 'Não foi possível acessar o microfone. Confira se ele está conectado e disponível.',
  'no-speech': 'Não ouvi nenhuma fala. Toque no microfone para tentar novamente.',
  network: 'O serviço de voz não conseguiu se conectar. Confira sua conexão e tente novamente.',
  'language-not-supported': 'Este navegador não oferece reconhecimento nesse idioma.',
};

// Short utterances avoid browser limits on long speech synthesis requests.
function chunks(text, limit = 220) {
  const sentences = String(text).trim().match(/[^.!?\n]+[.!?\n]*|[.!?\n]+/g) || [];
  const result = [];
  for (const sentence of sentences) {
    const words = sentence.trim().split(/\s+/);
    let current = '';
    for (const word of words) {
      if (current && current.length + word.length + 1 > limit) { result.push(current); current = ''; }
      if (word.length > limit) {
        if (current) { result.push(current); current = ''; }
        for (let i = 0; i < word.length; i += limit) result.push(word.slice(i, i + limit));
      } else current += `${current ? ' ' : ''}${word}`;
    }
    if (current) result.push(current);
  }
  return result;
}

export default function useVoice() {
  const supportedRecognition = typeof window !== 'undefined' && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
  const supportedSpeech = typeof window !== 'undefined' && Boolean(window.speechSynthesis && window.SpeechSynthesisUtterance);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [speakingId, setSpeakingId] = useState(null);
  const [paused, setPaused] = useState(false);
  const [speechProgress, setSpeechProgress] = useState(0);
  const [lastTranscript, setLastTranscript] = useState('');
  const [error, setError] = useState('');
  const [voices, setVoices] = useState([]);
  const recognitionRef = useRef(null);
  const recognitionStopping = useRef(false);
  const speechRef = useRef(null);
  const speechIdRef = useRef(null);
  const speechToken = useRef(0);
  const mounted = useRef(true);

  const stopSpeaking = useCallback(() => {
    speechToken.current += 1;
    speechIdRef.current = null;
    speechRef.current = null;
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      const synthesis = window.speechSynthesis;
      synthesis.cancel();
      // cancel() clears the queue but leaves the engine's paused flag intact.
      if (synthesis.paused) synthesis.resume();
    }
    setSpeakingId(null);
    setPaused(false);
    setSpeechProgress(0);
  }, []);

  const pauseSpeaking = useCallback(() => {
    if (!speechIdRef.current || !supportedSpeech) return;
    window.speechSynthesis.pause();
    setPaused(true);
  }, [supportedSpeech]);

  const resumeSpeaking = useCallback(() => {
    if (!speechIdRef.current || !supportedSpeech) return;
    window.speechSynthesis.resume();
    setPaused(false);
  }, [supportedSpeech]);

  const stopListening = useCallback(({ cancel = false } = {}) => {
    const recognition = recognitionRef.current;
    if (recognition) {
      recognitionStopping.current = true;
      if (cancel) { recognition.onresult = null; recognitionRef.current = null; }
      try { cancel ? recognition.abort() : recognition.stop(); } catch {}
    }
    setListening(false);
    setInterim('');
    if (cancel) setLastTranscript('');
  }, []);

  const startListening = useCallback((onText, language = 'pt-BR') => {
    if (!supportedRecognition) { setError('Seu navegador não oferece ditado por voz. Tente no Chrome ou Edge.'); return; }
    if (!window.isSecureContext) { setError('Abra o Jarvis com HTTPS para usar o microfone.'); return; }
    if (recognitionRef.current) return;
    stopSpeaking();
    setError(''); setInterim(''); setLastTranscript('');
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    let recognition;
    try { recognition = new Recognition(); }
    catch { setError('Não foi possível iniciar o reconhecimento de voz neste navegador.'); return; }
    recognition.lang = language;
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    const finalized = new Set();
    recognitionStopping.current = false;
    recognitionRef.current = recognition;
    recognition.onstart = () => { if (mounted.current && recognitionRef.current === recognition && !recognitionStopping.current) setListening(true); };
    recognition.onresult = event => {
      if (!mounted.current || recognitionRef.current !== recognition) return;
      let partial = '';
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (result.isFinal && !finalized.has(index)) {
          finalized.add(index);
          const text = result[0].transcript.trim();
          if (text) {
            setLastTranscript(previous => `${previous}${previous ? ' ' : ''}${text}`);
            if (typeof onText === 'function') onText(text);
          }
        }
        else if (!result.isFinal) partial += result[0].transcript;
      }
      setInterim(recognitionStopping.current ? '' : partial);
    };
    recognition.onerror = event => {
      if (!mounted.current || recognitionRef.current !== recognition) return;
      if (event.error !== 'aborted' && !recognitionStopping.current) setError(recognitionMessages[event.error] || 'Não foi possível reconhecer a fala. Tente novamente.');
      setListening(false); setInterim('');
    };
    recognition.onend = () => {
      if (recognitionRef.current === recognition) {
        recognitionRef.current = null;
        recognitionStopping.current = false;
        if (mounted.current) { setListening(false); setInterim(''); }
      }
    };
    try { recognition.start(); setListening(true); }
    catch { recognitionRef.current = null; setListening(false); setError('Não foi possível iniciar o microfone. Confira as permissões do navegador.'); }
  }, [supportedRecognition, stopSpeaking]);

  const speak = useCallback((id, text, { rate = 1, voiceURI } = {}) => {
    if (!supportedSpeech) { setError('Este navegador não oferece leitura em voz alta.'); return; }
    const wasSpeaking = speechIdRef.current === id;
    stopSpeaking();
    if (wasSpeaking) return;
    const pieces = chunks(text);
    const totalCharacters = pieces.reduce((total, piece) => total + piece.length, 0);
    if (!pieces.length) return;
    stopListening({ cancel: true });
    setError('');
    const token = speechToken.current;
    const synthesis = window.speechSynthesis;
    const available = synthesis.getVoices();
    const chosen = available.find(voice => voice.voiceURI === voiceURI) || available.find(voice => /^pt[-_]BR$/i.test(voice.lang)) || available.find(voice => /^pt/i.test(voice.lang));
    speechIdRef.current = id;
    setSpeakingId(id);
    setPaused(false);
    setSpeechProgress(0);
    let index = 0;
    let completedCharacters = 0;
    const next = () => {
      if (!mounted.current || token !== speechToken.current) return;
      if (index >= pieces.length) { speechIdRef.current = null; speechRef.current = null; setSpeakingId(null); setPaused(false); setSpeechProgress(1); return; }
      const piece = pieces[index++];
      const pieceStart = completedCharacters;
      const utterance = new window.SpeechSynthesisUtterance(piece);
      utterance.lang = chosen?.lang || 'pt-BR';
      utterance.rate = Math.min(2, Math.max(0.5, Number(rate) || 1));
      if (chosen) utterance.voice = chosen;
      utterance.onboundary = event => {
        if (mounted.current && token === speechToken.current && speechRef.current === utterance && Number.isFinite(event.charIndex)) setSpeechProgress(Math.min(1, (pieceStart + event.charIndex) / totalCharacters));
      };
      utterance.onend = () => {
        if (!mounted.current || token !== speechToken.current || speechRef.current !== utterance) return;
        speechRef.current = null;
        completedCharacters += piece.length;
        setSpeechProgress(Math.min(1, completedCharacters / totalCharacters));
        next();
      };
      utterance.onerror = event => {
        if (!mounted.current || token !== speechToken.current || speechRef.current !== utterance) return;
        speechToken.current += 1;
        speechIdRef.current = null; speechRef.current = null; setSpeakingId(null); setPaused(false);
        if (!['canceled', 'interrupted'].includes(event.error)) setError('Não foi possível ler a resposta. Confira a voz escolhida e tente novamente.');
      };
      speechRef.current = utterance;
      try { synthesis.speak(utterance); }
      catch { speechToken.current += 1; speechIdRef.current = null; speechRef.current = null; setSpeakingId(null); setPaused(false); setError('Não foi possível iniciar a leitura em voz alta.'); }
    };
    next();
  }, [supportedSpeech, stopListening, stopSpeaking]);

  useEffect(() => {
    mounted.current = true;
    const synthesis = supportedSpeech ? window.speechSynthesis : null;
    const loadVoices = () => setVoices(synthesis?.getVoices() || []);
    loadVoices();
    synthesis?.addEventListener('voiceschanged', loadVoices);
    return () => {
      mounted.current = false;
      synthesis?.removeEventListener('voiceschanged', loadVoices);
      speechToken.current += 1;
      if (speechRef.current) synthesis?.cancel();
      const recognition = recognitionRef.current;
      recognitionRef.current = null;
      if (recognition) { recognition.onresult = null; recognition.onend = null; recognition.onerror = null; try { recognition.abort(); } catch {} }
    };
  }, [supportedSpeech]);

  const clearError = useCallback(() => setError(''), []);
  return { supportedRecognition, supportedSpeech, listening, interim, lastTranscript, speakingId, paused, speechProgress, error, clearError, startListening, stopListening, speak, stopSpeaking, pauseSpeaking, resumeSpeaking, voices };
}
