// Web Audio API Synthesized Chime Notification Sound
export function playNotificationSound() {
  if (typeof window === 'undefined') return;

  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    
    // Create oscillator for pleasant dual-tone chime (E5 -> A5)
    const now = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = 'sine';
    osc2.type = 'sine';

    // Tone 1: E5 (659.25 Hz) -> Tone 2: A5 (880 Hz)
    osc1.frequency.setValueAtTime(659.25, now);
    osc1.frequency.setValueAtTime(880.00, now + 0.12);

    osc2.frequency.setValueAtTime(1318.51, now); // E6 octave harmonic
    osc2.frequency.setValueAtTime(1760.00, now + 0.12);

    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start(now);
    osc2.start(now);

    osc1.stop(now + 0.5);
    osc2.stop(now + 0.5);
  } catch (err) {
    console.error('Audio notification error:', err);
  }
}
