// All sound is synthesised with WebAudio: no audio files, no network. Engine hum,
// sirens, impacts and jingles are oscillators and noise shaped by envelopes; the
// music is a small chord loop — Am, F, C, G — played by a lookahead scheduler.
const MUSIC_BPM = 96;
const CHORDS = [
  [57, 60, 64], // Am
  [53, 57, 60], // F
  [48, 52, 55], // C (low)
  [55, 59, 62], // G
];
const BASS = [45, 41, 36, 43];

export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineOsc2 = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenTimer = 0;
  let musicOn = false;
  let musicTimer = null;
  let nextNoteTime = 0;
  let chordIndex = 0;
  let stepIndex = 0;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') void ctx.resume();
      return true;
    }
    try {
      const AudioContext = window.AudioContext ?? window.webkitAudioContext;
      if (!AudioContext) return false;
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);

      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineOsc2 = ctx.createOscillator();
      engineOsc2.type = 'square';
      engineOsc2.frequency.value = 28;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      const engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 420;
      engineOsc.connect(engineFilter);
      engineOsc2.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      engineOsc2.start();

      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'triangle';
      sirenOsc.frequency.value = 740;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      return true;
    } catch {
      ctx = null;
      return false;
    }
  }

  function blip(freq, dur, type, vol, slideTo) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function noise(dur, vol, filterFreq) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const length = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(t);
  }

  /** One named effect: crash, punch, pickup, cash, steal, mission, fail, horn, siren. */
  function sfx(name) {
    if (!ctx) return;
    if (name === 'crash') { noise(0.28, 0.5, 900); blip(90, 0.25, 'sine', 0.5, 45); }
    else if (name === 'punch') { noise(0.12, 0.4, 1400); blip(160, 0.1, 'sine', 0.35, 80); }
    else if (name === 'pickup') { blip(660, 0.12, 'sine', 0.3, 990); }
    else if (name === 'cash') { blip(880, 0.1, 'sine', 0.28, 1320); blip(1320, 0.14, 'sine', 0.22, 1760); }
    else if (name === 'steal') { blip(220, 0.16, 'square', 0.2, 330); }
    else if (name === 'enterCar') { blip(140, 0.12, 'sine', 0.3, 90); }
    else if (name === 'horn') { blip(370, 0.28, 'square', 0.16); blip(466, 0.28, 'square', 0.12); }
    else if (name === 'mission') {
      [523, 659, 784, 1047].forEach((f, i) => {
        setTimeout(() => blip(f, 0.22, 'triangle', 0.3), i * 110);
      });
    } else if (name === 'fail') { blip(392, 0.3, 'sawtooth', 0.22, 196); blip(196, 0.5, 'sawtooth', 0.2, 98); }
    else if (name === 'busted') { blip(311, 0.4, 'sawtooth', 0.25, 155); blip(233, 0.6, 'sawtooth', 0.22, 116); }
  }

  function setEngine(speed01, driving) {
    if (!ctx || !engineGain) return;
    const target = driving ? 0.05 + speed01 * 0.09 : 0;
    engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.08);
    engineOsc.frequency.setTargetAtTime(52 + speed01 * 130, ctx.currentTime, 0.06);
    engineOsc2.frequency.setTargetAtTime(26 + speed01 * 65, ctx.currentTime, 0.06);
  }

  function setSiren(on, dt) {
    if (!ctx || !sirenGain) return;
    sirenGain.gain.setTargetAtTime(on ? 0.045 : 0, ctx.currentTime, 0.15);
    if (on) {
      sirenTimer += dt;
      const high = Math.floor(sirenTimer * 1.6) % 2 === 0;
      sirenOsc.frequency.setTargetAtTime(high ? 950 : 700, ctx.currentTime, 0.05);
    }
  }

  function scheduleMusicStep() {
    if (!ctx || !musicOn) return;
    const beat = 60 / MUSIC_BPM / 2; // eighth notes
    while (nextNoteTime < ctx.currentTime + 0.25) {
      const chord = CHORDS[chordIndex % CHORDS.length];
      const bass = BASS[chordIndex % BASS.length];
      // Bass on the downbeat of each bar.
      if (stepIndex % 8 === 0) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = 440 * Math.pow(2, (bass - 69) / 12);
        gain.gain.setValueAtTime(0.16, nextNoteTime);
        gain.gain.exponentialRampToValueAtTime(0.001, nextNoteTime + beat * 7);
        osc.connect(gain);
        gain.connect(master);
        osc.start(nextNoteTime);
        osc.stop(nextNoteTime + beat * 7);
      }
      // A soft pluck on every other eighth, cycling the chord tones.
      if (stepIndex % 2 === 0) {
        const note = chord[(stepIndex / 2) % chord.length];
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = 440 * Math.pow(2, (note - 69) / 12);
        gain.gain.setValueAtTime(0.09, nextNoteTime);
        gain.gain.exponentialRampToValueAtTime(0.001, nextNoteTime + beat * 1.8);
        osc.connect(gain);
        gain.connect(master);
        osc.start(nextNoteTime);
        osc.stop(nextNoteTime + beat * 2);
      }
      nextNoteTime += beat;
      stepIndex += 1;
      if (stepIndex % 32 === 0) chordIndex += 1;
    }
  }

  function startMusic() {
    if (!ensure() || musicOn) return;
    musicOn = true;
    nextNoteTime = ctx.currentTime + 0.1;
    chordIndex = 0;
    stepIndex = 0;
    musicTimer = window.setInterval(scheduleMusicStep, 90);
  }

  function stopMusic() {
    musicOn = false;
    if (musicTimer !== null) {
      window.clearInterval(musicTimer);
      musicTimer = null;
    }
  }

  return { ensure, sfx, setEngine, setSiren, startMusic, stopMusic };
}
