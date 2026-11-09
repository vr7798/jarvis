const MAX_QUEUE = 32768;
const WINDOW_BYTES = 16384;
const encoder = new TextEncoder();

// A small sliding window allows ordinary typing to flow without waiting for an
// HTTP round trip. Acknowledgements bound large pastes; they never echo text.
export function createTerminalInput({ id, csrf, call, onError, onMode, socketFactory = (url, protocols) => new WebSocket(url, protocols), location = window.location, handshakeMs = 2000 }) {
  let socket, mode = 'connecting', queue = '', sending = false, stopped = false;
  let sequence = 0, inFlightBytes = 0, inFlightCharacters = 0, lastAcknowledged = 0;
  const pending = new Map();
  let handshake;

  function changeMode(value) { mode = value; onMode?.(value); }
  function fail(error) {
    if (stopped) return;
    stopped = true; queue = ''; pending.clear(); clearTimeout(handshake);
    socket?.close(); onError?.(error);
  }
  function chunk() {
    let length = Math.min(2048, queue.length);
    if (length < queue.length && /[\uD800-\uDBFF]/.test(queue[length - 1])) length--;
    return queue.slice(0, length);
  }
  async function flushHttp() {
    if (sending || stopped || mode !== 'http') return;
    sending = true;
    try {
      while (queue && !stopped) {
        const data = chunk(); queue = queue.slice(data.length);
        await call(`/terminal/${id}/input`, { body: { data } });
      }
    } catch (error) { fail(error); }
    finally { sending = false; }
  }
  function flush() {
    if (stopped) return;
    if (mode === 'http') { flushHttp(); return; }
    if (mode !== 'websocket' || socket.readyState !== 1) return;
    while (queue) {
      const data = chunk(), bytes = encoder.encode(data).byteLength;
      if (inFlightBytes + bytes > WINDOW_BYTES) break;
      const number = ++sequence;
      pending.set(number, { bytes, characters: data.length });
      inFlightBytes += bytes; inFlightCharacters += data.length;
      queue = queue.slice(data.length);
      try { socket.send(JSON.stringify({ type: 'input', sequence: number, data })); }
      catch { fail(new Error('A entrada do terminal foi interrompida. Abra uma nova sessão para continuar.')); return; }
    }
  }
  function fallback() {
    if (stopped || mode === 'http') return;
    clearTimeout(handshake);
    if (pending.size) {
      // Never replay unacknowledged commands: they may already have executed.
      fail(new Error('Canal de entrada interrompido. Parte da digitação pode ter sido enviada. Abra uma nova sessão para continuar.'));
      return;
    }
    changeMode('http'); socket?.close(); flush();
  }

  try {
    const url = new URL(`/api/terminal/${id}/input-stream`, location.href);
    url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    socket = socketFactory(url.href, ['jarvis-terminal-v1', `csrf.${csrf}`]);
    socket.onmessage = event => {
      if (stopped || mode === 'http') return;
      let message;
      try { message = JSON.parse(event.data); } catch { fail(new Error('Resposta inválida do canal de entrada.')); return; }
      if (message.type === 'ready' && mode === 'connecting') {
        clearTimeout(handshake); changeMode('websocket'); flush();
      } else if (message.type === 'ack' && mode === 'websocket') {
        const record = pending.get(message.sequence);
        if (!record || message.sequence !== lastAcknowledged + 1) { fail(new Error('O canal de entrada perdeu a sequência. Abra uma nova sessão.')); return; }
        pending.delete(message.sequence); lastAcknowledged = message.sequence;
        inFlightBytes -= record.bytes; inFlightCharacters -= record.characters;
        flush();
      } else if (message.type === 'error') {
        fail(Object.assign(new Error(message.error || 'A entrada do terminal foi interrompida.'), { status: message.status }));
      }
    };
    socket.onerror = fallback;
    socket.onclose = fallback;
    handshake = setTimeout(fallback, handshakeMs);
  } catch { fallback(); }

  return {
    write(data) {
      if (stopped || typeof data !== 'string' || !data) return false;
      if (queue.length + inFlightCharacters + data.length > MAX_QUEUE) return false;
      queue += data; flush(); return true;
    },
    close() {
      stopped = true; queue = ''; pending.clear(); clearTimeout(handshake); socket?.close();
    },
  };
}
