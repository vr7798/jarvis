import { useId } from 'react';
import '../studio.css';

function AudioIcon({ name, size = 20 }) {
  const paths = {
    mic: <><rect x="9" y="2" width="6" height="13" rx="3" /><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M9 22h6" /></>,
    speaker: <><path d="m11 4-6 5H2v6h3l6 5V4ZM15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14" /></>,
    stop: <rect x="6" y="6" width="12" height="12" rx="2" />,
    play: <path d="m8 4 12 8-12 8V4Z" />,
    pause: <><path d="M8 5v14M16 5v14" /></>,
    check: <path d="m5 12 4 4L19 6" />,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.speaker}</svg>;
}

/** Panel content: its parent owns the dialog and the existing voice hook. */
export default function VoiceStudio({ voice, preferences, setPreferences, onDictate, disabled = false, lastResponse = null }) {
  const id = useId();
  const pref = (key, value) => setPreferences(previous => ({ ...previous, [key]: value }));
  const speaking = Boolean(voice.speakingId);
  const active = voice.listening || (speaking && !voice.paused);
  const state = voice.listening ? 'Ouvindo você' : voice.paused ? 'Leitura pausada' : speaking ? 'Lendo em voz alta' : 'Sua voz. Seu ritmo.';
  const availableVoices = [...voice.voices].sort((a, b) => Number(/^pt/i.test(b.lang)) - Number(/^pt/i.test(a.lang)) || a.name.localeCompare(b.name));
  const sample = 'Olá! Seu estúdio de voz está pronto. Dite uma ideia, revise a mensagem e deixe o Luck ajudar no próximo passo.';
  return <div className="voice-studio studio-content">
    <div className={`voice-stage ${active ? 'is-active' : ''} ${voice.listening ? 'is-recording' : ''}`}>
      <span className="studio-eyebrow">VOICE STUDIO <span>PT-BR</span></span>
      <div className="voice-sphere" aria-hidden="true"><span /><span /><span /><i><AudioIcon name={voice.listening ? 'mic' : 'speaker'} size={29} /></i></div>
      <h3 aria-live="polite">{state}</h3>
      <p>{voice.listening ? 'Fale naturalmente. Você revisa o texto antes de enviar.' : speaking ? 'Você controla a reprodução a qualquer momento.' : 'Dite suas ideias e ouça as respostas com a voz que preferir.'}</p>
      <div className="voice-waveform" aria-hidden="true">{Array.from({ length: 31 }, (_, index) => <i key={index} style={{ '--wave-delay': `${(index % 7) * -0.13}s`, '--wave-size': `${12 + Math.sin(index * 1.6) ** 2 * 22}px` }} />)}</div>
      <div className="voice-stage-actions">
        <button type="button" className="studio-primary" disabled={disabled || !voice.supportedRecognition} aria-pressed={voice.listening} onClick={() => voice.listening ? voice.stopListening() : onDictate?.()}><AudioIcon name={voice.listening ? 'stop' : 'mic'} size={18} />{voice.listening ? 'Concluir ditado' : 'Começar ditado'}</button>
        {speaking ? <><button type="button" className="studio-secondary" onClick={voice.paused ? voice.resumeSpeaking : voice.pauseSpeaking}><AudioIcon name={voice.paused ? 'play' : 'pause'} size={18} />{voice.paused ? 'Continuar' : 'Pausar'}</button><button type="button" className="studio-icon" aria-label="Parar leitura" title="Parar leitura" onClick={voice.stopSpeaking}><AudioIcon name="stop" size={17} /></button></> : <button type="button" className="studio-secondary" disabled={!voice.supportedSpeech || !lastResponse?.text} onClick={() => voice.speak(lastResponse.id, lastResponse.text, preferences)}><AudioIcon name="speaker" size={18} />Ouvir resposta</button>}
      </div>
      {speaking && <div className="voice-progress"><progress value={voice.speechProgress || 0} max="1" aria-label="Progresso da leitura" /><span>{Math.round((voice.speechProgress || 0) * 100)}%</span></div>}
    </div>
    {(voice.interim || voice.lastTranscript) && <div className="voice-transcript"><span className="studio-eyebrow">TRANSCRIÇÃO</span><p aria-live="polite">{voice.lastTranscript}{voice.interim && <span className="voice-interim">{voice.lastTranscript ? ' ' : ''}{voice.interim}</span>}</p><small>O texto reconhecido está no campo da mensagem.</small></div>}
    <div className="studio-support"><span className={voice.supportedRecognition ? 'is-available' : ''}><i />Ditado {voice.supportedRecognition ? 'disponível' : 'indisponível'}</span><span className={voice.supportedSpeech ? 'is-available' : ''}><i />Leitura {voice.supportedSpeech ? 'disponível' : 'indisponível'}</span></div>
    <div className="voice-settings-grid">
      <label className="studio-field" htmlFor={`${id}-voice`}>Voz de leitura<select id={`${id}-voice`} value={preferences.voiceURI || ''} disabled={!voice.supportedSpeech} onChange={event => pref('voiceURI', event.target.value)}><option value="">Automática · português</option>{availableVoices.map(item => <option key={`${item.voiceURI}-${item.lang}`} value={item.voiceURI}>{item.name} · {item.lang}{item.localService ? ' · local' : ''}</option>)}</select></label>
      <div className="studio-field voice-rate"><label htmlFor={`${id}-rate`}>Velocidade <output htmlFor={`${id}-rate`}>{Number(preferences.rate || 1).toFixed(1)}×</output></label><input id={`${id}-rate`} type="range" min="0.6" max="1.6" step="0.1" value={preferences.rate || 1} disabled={!voice.supportedSpeech} onChange={event => pref('rate', Number(event.target.value))} /><span><span>Mais calma</span><span>Mais rápida</span></span></div>
    </div>
    <div className="voice-auto-read"><label htmlFor={`${id}-auto`}><span><strong>Ouvir novas respostas</strong><small>A leitura começa quando o Luck terminar a resposta.</small></span><input id={`${id}-auto`} type="checkbox" role="switch" checked={Boolean(preferences.autoRead)} disabled={!voice.supportedSpeech} onChange={event => pref('autoRead', event.target.checked)} /></label></div>
    <div className="voice-studio-footer"><button type="button" className="studio-secondary" disabled={!voice.supportedSpeech} onClick={() => voice.speak('voice-preview', sample, preferences)}><AudioIcon name={voice.speakingId === 'voice-preview' ? 'stop' : 'play'} size={16} />{voice.speakingId === 'voice-preview' ? 'Parar teste' : 'Testar esta voz'}</button><span>Vozes fornecidas pelo seu navegador.</span></div>
    {voice.error && <div className="studio-error" role="alert"><span>{voice.error}</span><button type="button" onClick={voice.clearError}>Fechar</button></div>}
    <p className="studio-footnote">O microfone só liga quando você inicia o ditado. Requer HTTPS e permissão; o serviço de voz do navegador pode processar o áudio. Fechar esta janela mantém o ditado ou a leitura em curso; use os controles para parar.</p>
  </div>;
}
