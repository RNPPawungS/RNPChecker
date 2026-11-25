package com.rnpexpress.checker;

import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioTrack;

/** Pre-rendered result tones (same as the web checker: 880 Hz for OK, two low square beeps for problems). */
final class Beeper {
    private static final int RATE = 22050;
    private AudioTrack ok, bad;

    Beeper() {
        ok = track(new double[][]{{880, 0, .12}}, false);
        bad = track(new double[][]{{220, 0, .18}, {220, .25, .18}}, true);
    }

    private static AudioTrack track(double[][] tones, boolean square) {
        try {
            double end = 0;
            for (double[] t : tones) end = Math.max(end, t[1] + t[2]);
            int n = (int) (RATE * (end + .03));
            short[] pcm = new short[n];
            for (double[] t : tones) {
                int s0 = (int) (t[1] * RATE), len = (int) (t[2] * RATE);
                for (int i = 0; i < len && s0 + i < n; i++) {
                    double ph = Math.sin(2 * Math.PI * t[0] * i / RATE);
                    double v = square ? (ph >= 0 ? 1 : -1) * .45 : ph * .9;
                    double env = Math.min(1, Math.min(i, len - i) / (RATE * .004)); // 4 ms fade, no clicks
                    pcm[s0 + i] = (short) (v * env * 32767);
                }
            }
            AudioTrack a = new AudioTrack(AudioManager.STREAM_MUSIC, RATE, AudioFormat.CHANNEL_OUT_MONO,
                    AudioFormat.ENCODING_PCM_16BIT, pcm.length * 2, AudioTrack.MODE_STATIC);
            a.write(pcm, 0, pcm.length);
            return a;
        } catch (Exception e) {
            return null;
        }
    }

    void play(boolean good) {
        AudioTrack a = good ? ok : bad;
        if (a == null) return;
        try {
            if (a.getPlayState() == AudioTrack.PLAYSTATE_PLAYING) a.stop();
            a.reloadStaticData();
            a.play();
        } catch (Exception ignored) {}
    }

    void release() {
        if (ok != null) ok.release();
        if (bad != null) bad.release();
        ok = bad = null;
    }
}
