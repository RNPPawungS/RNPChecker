package com.rnpexpress.checker;

import android.content.SharedPreferences;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.KeyStore;
import java.security.MessageDigest;
import java.security.cert.Certificate;
import java.security.cert.CertificateException;
import java.security.cert.X509Certificate;

import javax.net.ssl.HostnameVerifier;
import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLException;
import javax.net.ssl.SSLSession;
import javax.net.ssl.SSLSocketFactory;
import javax.net.ssl.TrustManager;
import javax.net.ssl.TrustManagerFactory;
import javax.net.ssl.X509TrustManager;

/**
 * Small JSON client for the packing server. Runs on a background thread (callers use an executor).
 * The server uses a self-signed certificate, so we trust it on first use: the user confirms its
 * SHA-256 fingerprint once and it is pinned in preferences.
 */
final class Api {
    static final class HttpError extends Exception {
        final int status; final String code;
        HttpError(int status, String msg, String code) { super(msg); this.status = status; this.code = code; }
    }

    static final class UntrustedCert extends Exception {
        final String fingerprint;
        UntrustedCert(String fp) { super("untrusted certificate"); fingerprint = fp; }
    }

    private final SharedPreferences prefs;
    private final PinTrust trust;
    private final SSLSocketFactory sslFactory;
    private final HostnameVerifier hostVerifier;

    Api(SharedPreferences prefs) {
        this.prefs = prefs;
        PinTrust t = null; SSLSocketFactory f = null;
        try {
            TrustManagerFactory tmf = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm());
            tmf.init((KeyStore) null);
            X509TrustManager def = null;
            for (TrustManager m : tmf.getTrustManagers()) if (m instanceof X509TrustManager) def = (X509TrustManager) m;
            t = new PinTrust(def);
            SSLContext ctx = SSLContext.getInstance("TLS");
            ctx.init(null, new TrustManager[]{t}, null);
            f = ctx.getSocketFactory();
        } catch (Exception ignored) {}
        trust = t; sslFactory = f;
        hostVerifier = new HostnameVerifier() {
            @Override public boolean verify(String host, SSLSession s) {
                if (HttpsURLConnection.getDefaultHostnameVerifier().verify(host, s)) return true;
                try { return sha256(s.getPeerCertificates()[0]).equals(pin()); } catch (Exception e) { return false; }
            }
        };
    }

    String server() {
        String s = prefs.getString("server", BuildInfo.DEFAULT_SERVER).trim();
        while (s.endsWith("/")) s = s.substring(0, s.length() - 1);
        return s;
    }

    private String pin() { return prefs.getString("pin", ""); }

    JSONObject get(String path) throws Exception { return request("GET", path, null, true); }

    JSONObject post(String path, JSONObject body) throws Exception { return request("POST", path, body, true); }

    /** For the pairing call: an old/expired token must not be sent. */
    JSONObject postNoAuth(String path, JSONObject body) throws Exception { return request("POST", path, body, false); }

    private JSONObject request(String method, String path, JSONObject body, boolean withToken) throws Exception {
        URL url = new URL(server() + path);
        HttpURLConnection c = (HttpURLConnection) url.openConnection();
        if (c instanceof HttpsURLConnection && sslFactory != null) {
            ((HttpsURLConnection) c).setSSLSocketFactory(sslFactory);
            ((HttpsURLConnection) c).setHostnameVerifier(hostVerifier);
        }
        c.setConnectTimeout(6000);
        c.setReadTimeout(15000);
        c.setInstanceFollowRedirects(false);
        c.setUseCaches(false);
        c.setRequestMethod(method);
        c.setRequestProperty("Accept", "application/json");
        c.setRequestProperty("User-Agent", "RNPChecker-Android/" + BuildInfo.VERSION);
        String token = prefs.getString("token", "");
        if (withToken && !token.isEmpty()) c.setRequestProperty("Authorization", "Bearer " + token);
        if (trust != null) trust.lastFingerprint = null;
        try {
            if (body != null) {
                byte[] b = body.toString().getBytes("UTF-8");
                c.setDoOutput(true);
                c.setFixedLengthStreamingMode(b.length);
                c.setRequestProperty("Content-Type", "application/json; charset=utf-8");
                OutputStream os = c.getOutputStream();
                os.write(b);
                os.close();
            }
            int status = c.getResponseCode();
            String text = read(status >= 400 ? c.getErrorStream() : c.getInputStream());
            JSONObject json = null;
            try { json = new JSONObject(text); } catch (Exception ignored) {}
            if (status >= 300 && status < 400) {
                // the web app redirects to /login when not signed in
                throw new HttpError(401, "กรุณาเข้าสู่ระบบใหม่", "auth");
            }
            if (status >= 400 || json == null) {
                String msg = json != null ? json.optString("error", "") : "";
                String code = json != null ? json.optString("code", "") : "";
                if (msg.isEmpty()) {
                    msg = status == 404 ? "เซิร์ฟเวอร์ยังไม่รองรับแอป (ต้องอัปเดตเว็บเป็นเวอร์ชันล่าสุด)"
                            : status >= 500 ? "เซิร์ฟเวอร์ผิดพลาด (" + status + ")"
                            : "เซิร์ฟเวอร์ตอบกลับไม่ถูกต้อง (" + status + ")";
                }
                throw new HttpError(status, msg, code);
            }
            return json;
        } catch (SSLException e) {
            if (trust != null && trust.lastFingerprint != null) throw new UntrustedCert(trust.lastFingerprint);
            throw e;
        }
    }

    private static String read(InputStream in) throws Exception {
        if (in == null) return "";
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        int n;
        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
        in.close();
        return out.toString("UTF-8");
    }

    static String sha256(Certificate cert) throws Exception {
        byte[] d = MessageDigest.getInstance("SHA-256").digest(cert.getEncoded());
        StringBuilder b = new StringBuilder();
        for (int i = 0; i < d.length; i++) {
            if (i > 0) b.append(':');
            b.append(String.format("%02X", d[i]));
        }
        return b.toString();
    }

    private final class PinTrust implements X509TrustManager {
        private final X509TrustManager def;
        volatile String lastFingerprint;

        PinTrust(X509TrustManager def) { this.def = def; }

        @Override public void checkClientTrusted(X509Certificate[] chain, String type) throws CertificateException {
            if (def != null) def.checkClientTrusted(chain, type);
        }

        @Override public void checkServerTrusted(X509Certificate[] chain, String type) throws CertificateException {
            try {
                if (def == null) throw new CertificateException("no default trust manager");
                def.checkServerTrusted(chain, type);
            } catch (CertificateException e) {
                String fp;
                try { fp = sha256(chain[0]); } catch (Exception x) { throw e; }
                if (fp.equals(pin())) return;
                lastFingerprint = fp;
                throw e;
            }
        }

        @Override public X509Certificate[] getAcceptedIssuers() {
            return def != null ? def.getAcceptedIssuers() : new X509Certificate[0];
        }
    }
}
