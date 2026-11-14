"""Original Kuwaiti-folk-style loop for «مور»: oud melody in maqam Bayati (with its quarter tone),
mirwas drum and group hand-claps in a swung «صوت»-like groove. Everything is synthesised here."""
import sys, numpy as np, wave

SR = 44100
BPM = 96
BEAT = 60 / BPM
rng = np.random.default_rng(7)

# maqam Bayati on D: cents above D (E is a quarter tone flat)
CENTS = [0, 150, 300, 500, 700, 800, 1000]
D3 = 146.83
def freq(deg, octave=0):
    o, d = divmod(deg, 7)
    return D3 * 2 ** ((CENTS[d] + 1200 * (o + octave)) / 1200)

def pluck(f, dur, vol=.5, bright=.5):
    """Karplus-Strong string with an oud-like dark body."""
    n = int(SR * dur); p = max(2, int(SR / f))
    buf = rng.uniform(-1, 1, p)
    # soften the excitation (plectrum on gut/nylon)
    for _ in range(2): buf = (buf + np.roll(buf, 1)) / 2
    out = np.empty(n); idx = 0; damp = .994 - (1 - bright) * .006
    for i in range(n):
        v = buf[idx]; nxt = buf[(idx + 1) % p]
        buf[idx] = damp * .5 * (v + nxt); out[i] = v; idx = (idx + 1) % p
    env = np.minimum(1, np.arange(n) / (SR * .003))
    # body resonance: gentle low-pass + a little 2nd harmonic colour
    out = np.convolve(out, np.ones(3) / 3, 'same')
    return out * env * vol

def tone_drum(f0, f1, dur, vol, noise=.2, nfreq=None):
    n = int(SR * dur); t = np.arange(n) / SR
    fr = f0 * (f1 / f0) ** (t / dur)
    ph = 2 * np.pi * np.cumsum(fr) / SR
    s = np.sin(ph) * np.exp(-t / (dur * .35))
    nz = rng.uniform(-1, 1, n) * np.exp(-t / .015)
    if nfreq:  # crude band-pass via difference of moving averages
        k = max(1, int(SR / nfreq / 2)); nz = nz - np.convolve(nz, np.ones(k) / k, 'same')
    return (s + nz * noise) * vol

def clap_group(vol):
    """5 people clapping together, slightly out of sync."""
    n = int(SR * .12); out = np.zeros(n + int(SR * .02))
    for _ in range(5):
        off = int(rng.uniform(0, .014) * SR); t = np.arange(n) / SR
        nz = rng.uniform(-1, 1, n)
        k = 18; hp = nz - np.convolve(nz, np.ones(k) / k, 'same')   # keep the bright part
        lp = np.convolve(hp, np.ones(4) / 4, 'same')
        env = np.exp(-t / .028) * (1 + .6 * np.exp(-t / .004))
        out[off:off + n] += lp * env * rng.uniform(.7, 1)
    return out * vol / 3

# ---- original melody: (degree, beats); degree 0 = D3 ... 7 = D4
A  = [(4,1),(3,.5),(2,.5),(1,1),(2,.5),(3,.5),(4,1.5),(5,.5),(4,1),(3,1)]
A2 = [(4,1),(5,.5),(6,.5),(7,1.5),(6,.5),(5,1),(4,.5),(3,.5),(4,2)]
B  = [(3,1),(2,.5),(1,.5),(2,1),(3,1),(2,.5),(1,.5),(0,1),(1,.5),(2,.5),(0,1)]
B2 = [(0,.5),(1,.5),(2,.5),(3,.5),(4,1),(3,.5),(2,.5),(1,1.5),(2,.5),(0,2)]
SONG = [(A,0),(A2,0),(B,0),(B2,0),(A,1),(A2,1),(B,0),(B2,0)]   # second time: tremolo picking (ريشة)
BARS = sum(sum(b for _, b in ph) for ph, _ in SONG) / 4
LEN = BARS * 4 * BEAT
N = int(SR * (LEN + 3))
mix = np.zeros(N)
def add(sig, t, gain=1.0):
    i = int(t * SR); j = min(N, i + len(sig)); mix[i:j] += sig[:j - i] * gain

# melody
t = 0.0
for phrase, trem in SONG:
    for deg, beats in phrase:
        f = freq(deg); d = beats * BEAT
        swing = .06 * BEAT if (round(t / BEAT * 2) % 2) else 0
        if trem and beats >= 1:
            step = BEAT / 6; k = int(d / step)
            for r in range(k):
                add(pluck(f, step + .25, .40 if r else .58, .55), t + r * step + swing)
        else:
            add(pluck(f, d + .6, .62, .6), t + swing)
            if beats >= 1.5:   # grace note from below, typical oud ornament
                add(pluck(freq(deg - 1), .15, .18), t + swing - .07)
        t += d

# bass drone on the low strings (D2 / A2) under every bar
for bar in range(int(BARS)):
    b0 = bar * 4 * BEAT
    add(pluck(D3 / 2, 1.4, .38, .3), b0)
    add(pluck(D3 / 2 * 1.4983, 1.0, .26, .3), b0 + 2 * BEAT)

# percussion: 12 triplet slots per bar
dum = tone_drum(125, 85, .35, .42, .25, 300)
tak = tone_drum(420, 360, .09, .16, .6, 2500)
for bar in range(int(BARS)):
    b0 = bar * 4 * BEAT; s = BEAT / 3
    for slot in (0, 6): add(dum, b0 + slot * s)
    for slot in (2, 5, 8, 11): add(tak, b0 + slot * s, .9)
    for slot in (3, 8, 9): add(clap_group(.42), b0 + slot * s + rng.uniform(-.004, .004))
    if bar % 4 == 3:   # fill into the next phrase
        for slot in (10, 11): add(dum, b0 + slot * s, .6)

# small-room reverb
ir_n = int(SR * 1.1); ir = rng.uniform(-1, 1, ir_n) * np.exp(-np.arange(ir_n) / (SR * .28)); ir[0] = 0
wet = np.fft.irfft(np.fft.rfft(mix, 2 * N) * np.fft.rfft(ir, 2 * N))[:N] * .012
out = mix + wet
# seamless loop: fold the tail past LEN back onto the start
L = int(SR * LEN); tail = out[L:]; out = out[:L].copy(); out[:len(tail)] += tail
out = np.tanh(out / np.max(np.abs(out)) * 1.3) / np.tanh(1.3) * .89
st = np.stack([out, np.roll(out, int(SR * .0006))], 1)   # tiny width
with wave.open(sys.argv[1], 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((st * 32767).astype('<i2').tobytes())
print(f'{LEN:.1f}s, {BARS:.0f} bars')
