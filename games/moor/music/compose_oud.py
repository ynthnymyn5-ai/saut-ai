"""Original solo-oud loop for «مور» in maqam Bayati: a short taqsim (free improvisation) that settles
into a gentle lilting melody over the low strings, then returns home. Everything is synthesised here."""
import sys, numpy as np, wave

SR = 44100
rng = np.random.default_rng(11)

# maqam Bayati on D (E a quarter tone flat); degree 0 = D3
CENTS = [0, 150, 300, 500, 700, 800, 1000]
D3 = 146.83
def freq(deg):
    o, d = divmod(deg, 7)
    return D3 * 2 ** ((CENTS[d] + 1200 * o) / 1200)

def ks(f, n, damp, pos):
    """One Karplus-Strong string; `pos` = plucking position (0..0.5) shapes the tone."""
    p = max(2, int(round(SR / f)))
    buf = rng.uniform(-1, 1, p)
    k = max(1, int(p * pos)); buf = buf - np.roll(buf, k)   # comb: plectrum position
    for _ in range(2): buf = (buf + np.roll(buf, 1)) / 2
    out = np.empty(n); idx = 0
    for i in range(n):
        v = buf[idx]; buf[idx] = damp * .5 * (v + buf[(idx + 1) % p]); out[i] = v; idx = (idx + 1) % p
    return out

def body(x):
    """Wooden body: gentle low-pass plus a warm resonance around 110 Hz and 280 Hz."""
    y = np.convolve(x, np.ones(4) / 4, 'same')
    for fr, q, g in ((120, 6, .10), (280, 5, .12)):
        w = 2 * np.pi * fr / SR; r = 1 - w / q
        a1, a2 = -2 * r * np.cos(w), r * r
        z = np.zeros_like(y); z1 = z2 = 0.0
        for i, v in enumerate(y):
            o = v - a1 * z1 - a2 * z2; z2, z1 = z1, o; z[i] = o
        y = y + z * g * (1 - r)
    return y

def oud(f, dur, vol=.5, bright=.55):
    """A doubled oud course: two strings a few cents apart, plucked together."""
    n = int(SR * (dur + .8)); damp = .9955 - (1 - bright) * .004
    s = ks(f, n, damp, .13) + .8 * ks(f * 2 ** (3.5 / 1200), n, damp, .17)
    env = np.minimum(1, np.arange(n) / (SR * .002))
    return s * env * vol * .55

DUR = 0.0
events = []          # (time, degree, duration, volume, kind)
def note(t, deg, d, vol=.5, kind='n'): events.append((t, deg, d, vol, kind))

# ---- 1) taqsim: free rhythm, tremolo on held notes, descending home to D
t = 0.0
taq = [(4, .9, 't'), (5, .35, 'n'), (4, .35, 'n'), (3, .9, 't'), (2, .3, 'n'), (3, .3, 'n'), (4, 1.4, 't'),
       (3, .3, 'n'), (2, .3, 'n'), (1, .45, 'n'), (2, .3, 'n'), (1, .3, 'n'), (0, 1.8, 't')]
for deg, d, kind in taq:
    note(t, deg, d, .72, kind); t += d
note(t - 1.8, -7, 2.4, .22)        # low D under the arrival
t += .5

# ---- 2) gentle melody in a lilting 6/8 (one bar = 6 eighths)
E = .21                              # eighth-note length (~95 bpm dotted-quarter)
BAR = 6 * E
M1 = [(4,2),(3,1),(2,2),(3,1), (4,3),(5,1),(4,1),(3,1), (2,2),(1,1),(2,2),(3,1), (1,3),(0,3)]
M2 = [(7,2),(6,1),(5,2),(4,1), (5,3),(4,1),(3,1),(2,1), (3,2),(2,1),(1,2),(2,1), (0,6)]
M3 = [(2,1),(3,1),(4,1),(5,2),(4,1), (6,3),(5,1),(4,1),(3,1), (4,2),(3,1),(2,2),(1,1), (0,6)]
mel_start = t
for phrase in (M1, M2, M3, M2):
    p0 = t
    for deg, eighths in phrase:
        d = eighths * E
        kind = 't' if eighths >= 3 else 'n'
        note(t, deg, d, .5, kind)
        t += d
    # low strings: D on beat 1 and A on beat 2 of every bar of this phrase
    for b in range(int(round((t - p0) / BAR))):
        note(p0 + b * BAR, -7, 3 * E, .17)
        note(p0 + b * BAR + 3 * E, -3, 3 * E, .14)
LEN = t + .4
N = int(SR * (LEN + 3))
mix = np.zeros(N)
def add(sig, at):
    i = int(at * SR); j = min(N, i + len(sig)); mix[i:j] += sig[:j - i]

for at, deg, d, vol, kind in events:
    f = freq(deg)
    if kind == 't':                  # risha tremolo: fast alternate picking, softly swelling
        step = .075; k = max(1, int(d / step))
        for r in range(k):
            sw = .75 + .25 * np.sin(np.pi * r / max(1, k - 1))
            add(oud(f, step + .05, vol * sw * (.85 if r % 2 else 1), .5), at + r * step)
    else:
        add(oud(f, d, vol, .6), at + rng.uniform(0, .008))
        if d >= .4 and deg > 0 and rng.random() < .5:      # grace note from below
            add(oud(freq(deg - 1), .08, vol * .35), at - .06)

mix = body(mix)
# warm it: two gentle one-pole low-passes (~2.6 kHz), like the oud's soft top
al = 1 - np.exp(-2 * np.pi * 2600 / SR)
for _ in range(2):
    y = np.empty_like(mix); z = 0.0
    for i, v in enumerate(mix): z += al * (v - z); y[i] = z
    mix = y
# high-pass ~70 Hz: keep the low strings warm without boom
lp = np.convolve(mix, np.ones(int(SR/70))/int(SR/70), 'same'); mix = mix - lp*.85
# warm room
ir_n = int(SR * 1.6); ir = rng.uniform(-1, 1, ir_n) * np.exp(-np.arange(ir_n) / (SR * .4)); ir[0] = 0
wet = np.fft.irfft(np.fft.rfft(mix, 2 * N) * np.fft.rfft(ir, 2 * N))[:N] * .010
out = mix + wet
L = int(SR * LEN); tail = out[L:]; out = out[:L].copy(); out[:len(tail)] += tail   # seamless loop
out = np.tanh(out / np.max(np.abs(out)) * 1.2) / np.tanh(1.2) * .89
st = np.stack([out, np.roll(out, int(SR * .0008))], 1)
with wave.open(sys.argv[1], 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((st * 32767).astype('<i2').tobytes())
print(f'{LEN:.1f}s')
