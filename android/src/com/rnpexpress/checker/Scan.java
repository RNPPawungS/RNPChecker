package com.rnpexpress.checker;

import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Build;
import android.os.Bundle;

import java.util.HashMap;
import java.util.Map;
import java.util.regex.Pattern;

/** Barcode input helpers: cleaning scanned text and reading scanner broadcast intents. */
final class Scan {
    private Scan() {}

    /** Broadcast action our DataWedge / Honeywell profile is configured to send. */
    static final String ACTION = "com.rnpexpress.checker.SCAN";

    /** Broadcast actions used by common Android handhelds when the scanner is set to "broadcast/intent" output. */
    static final String[] ACTIONS = {
            ACTION,
            "android.intent.ACTION_DECODE_DATA",              // Urovo
            "scan.rcv.message",                               // Urovo (old)
            "android.intent.action.SCANRESULT",               // iData, Kaicom
            "com.scanner.broadcast",                          // Chainway
            "nlscan.action.SCANNER_RESULT",                   // Newland
            "com.sunmi.scanner.ACTION_DATA_CODE_RECEIVED",    // Sunmi
            "com.android.server.scannerservice.broadcast",    // Seuic
            "com.xcheng.scanner.action.BARCODE_DECODING_BROADCAST",
            "android.intent.action.SCANNER_RESULT",
            "com.android.scanner.broadcast",
    };

    private static final String[] KEYS = {
            "com.symbol.datawedge.data_string", "data", "barcode_string", "barcodeData", "barcode",
            "scannerdata", "value", "SCAN_BARCODE1", "decode_data", "scan_data", "scanResult",
            "EXTRA_BARCODE_DECODING_DATA", "code", "result", "text",
    };

    static IntentFilter filter() {
        IntentFilter f = new IntentFilter();
        for (String a : ACTIONS) f.addAction(a);
        f.addCategory(Intent.CATEGORY_DEFAULT);
        return f;
    }

    /** Pulls the barcode text out of a scanner broadcast, or null. */
    static String fromIntent(Intent i) {
        Bundle b = i.getExtras();
        if (b == null) return null;
        for (String k : KEYS) {
            Object v = b.get(k);
            if (v instanceof String && !((String) v).isEmpty()) return (String) v;
            if (v instanceof byte[]) return bytes((byte[]) v, b.getInt("length", -1));
        }
        Object barocode = b.get("barocode"); // Urovo spells it this way
        if (barocode instanceof byte[]) return bytes((byte[]) barocode, b.getInt("length", -1));
        for (String k : b.keySet()) {
            Object v = b.get(k);
            if (v instanceof String && !((String) v).isEmpty() && !k.toLowerCase().contains("type") && !k.toLowerCase().contains("source")) return (String) v;
        }
        return null;
    }

    private static String bytes(byte[] d, int len) {
        if (len < 0 || len > d.length) len = d.length;
        try { return new String(d, 0, len, "UTF-8"); } catch (Exception e) { return new String(d, 0, len); }
    }

    // Scanners type through the active keyboard layout; with Thai (Kedmanee) the code arrives as Thai characters.
    private static final Map<Character, Character> TH = new HashMap<>();
    static {
        String th = "ๅ/-ภถุึคตจ+๑๒๓๔ู฿๕๖๗๘๙ๆไำพะัีรนยฟหกดเ้่าสวงผปแอิืทมใฝ๐\"ฎฑธํ๊ณฯญฤฆฏโฌ็๋ษศ()ฉฮฺ์?บลฃฐฅซฒฬฦ";
        String en = "1234567890!@#$%^&*()_+qwertyuiopasdfghjkl;'zxcvbnm,./QWERTYUIOPASDFGHJKLZXCVBNM[]\\{|:<>?";
        for (int i = 0; i < th.length(); i++) TH.put(th.charAt(i), en.charAt(i));
    }

    private static final Pattern THAI = Pattern.compile("[\\u0E00-\\u0E7F]");

    static String fixLayout(String s) {
        if (!THAI.matcher(s).find()) return s;
        StringBuilder b = new StringBuilder(s.length());
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            Character m = TH.get(c);
            b.append(m != null ? m : c);
        }
        return b.toString();
    }

    // Same cleaning as the server (src/barcode.js). A scan can carry characters that are not part of the number:
    //   Code 39 *3867497060*, ^3867497060^, Codabar D3867497060D (A-D, T N E), AIM IDs ]C0 ]F0 ...,
    //   control characters (STX/ETX, GS, CR/LF/TAB) and zero-width spaces, also combined (^]F0D3867497060D^).
    private static final Pattern CONTROL = Pattern.compile("[\\p{Cntrl}\\u200B-\\u200D\\u2060\\uFEFF]");
    private static final Pattern AIM = Pattern.compile("^\\][A-Za-z][0-9A-Za-z]");
    private static final Pattern CODABAR = Pattern.compile("^[A-DTNE](\\d+)[A-DTNE]$", Pattern.CASE_INSENSITIVE);

    /** Thai layout fixed and extra characters removed. Codabar letters are kept: the server tries them first. */
    static String clean(String v) {
        if (v == null) return "";
        String s = CONTROL.matcher(fixLayout(v.trim())).replaceAll("").trim();
        for (String prev = null; !s.equals(prev); ) {
            prev = s;
            s = AIM.matcher(s).replaceFirst("").replace("*", "").replaceAll("^\\^+|\\^+$", "").trim();
        }
        return s.length() > 64 ? s.substring(0, 64) : s;
    }

    /** The number to show: clean(), then without Codabar start/stop letters (D3867497060D -> 3867497060). */
    static String show(String v) {
        String s = clean(v);
        java.util.regex.Matcher m = CODABAR.matcher(s);
        return m.matches() ? m.group(1) : s;
    }

    private static final Pattern PAIR = Pattern.compile("^p\\.[0-9a-z]+\\.[0-9a-z]+\\.[0-9a-f]{40}$");

    /** The pairing code shown as a QR on the web page "แอป Android (Checker)". */
    static String pairCode(String raw) {
        if (raw == null) return null;
        String s = fixLayout(raw.trim()).replaceAll("\\p{Cntrl}", "").trim().toLowerCase();
        int q = s.indexOf("code=");
        if (q >= 0) s = s.substring(q + 5);
        return PAIR.matcher(s).matches() ? s : null;
    }

    static boolean isZebra() { return Build.MANUFACTURER != null && Build.MANUFACTURER.toLowerCase().contains("zebra"); }
    static boolean isHoneywell() { return Build.MANUFACTURER != null && Build.MANUFACTURER.toLowerCase().contains("honeywell"); }

    /** Creates/updates a DataWedge profile for this app: barcode on, intent output (broadcast) on, keystroke off. */
    static void configureDataWedge(Context c) {
        String[][] plugins = {
                {"BARCODE", "scanner_selection", "auto", "scanner_input_enabled", "true"},
                {"INTENT", "intent_output_enabled", "true", "intent_action", ACTION, "intent_delivery", "2"},
                {"KEYSTROKE", "keystroke_output_enabled", "false"},
        };
        boolean first = true;
        for (String[] p : plugins) {
            Bundle profile = new Bundle();
            profile.putString("PROFILE_NAME", "RNPChecker");
            profile.putString("PROFILE_ENABLED", "true");
            profile.putString("CONFIG_MODE", first ? "CREATE_IF_NOT_EXIST" : "UPDATE");
            if (first) {
                Bundle app = new Bundle();
                app.putString("PACKAGE_NAME", c.getPackageName());
                app.putStringArray("ACTIVITY_LIST", new String[]{"*"});
                profile.putParcelableArray("APP_LIST", new Bundle[]{app});
            }
            Bundle plugin = new Bundle();
            plugin.putString("PLUGIN_NAME", p[0]);
            plugin.putString("RESET_CONFIG", "true");
            Bundle params = new Bundle();
            for (int i = 1; i + 1 < p.length; i += 2) params.putString(p[i], p[i + 1]);
            plugin.putBundle("PARAM_LIST", params);
            profile.putBundle("PLUGIN_CONFIG", plugin);
            Intent i = new Intent("com.symbol.datawedge.api.ACTION");
            i.putExtra("com.symbol.datawedge.api.SET_CONFIG", profile);
            i.putExtra("SEND_RESULT", "false");
            c.sendBroadcast(i);
            first = false;
        }
    }

    /** Honeywell Intent API: while claimed, scans are delivered to us as a broadcast instead of keystrokes. */
    static void claimHoneywell(Context c, boolean claim) {
        Intent i = new Intent(claim ? "com.honeywell.aidc.action.ACTION_CLAIM_SCANNER" : "com.honeywell.aidc.action.ACTION_RELEASE_SCANNER");
        i.setPackage("com.intermec.datacollectionservice");
        if (claim) {
            i.putExtra("com.honeywell.aidc.extra.EXTRA_SCANNER", "dcs.scanner.imager");
            i.putExtra("com.honeywell.aidc.extra.EXTRA_PROFILE", "DEFAULT");
            Bundle props = new Bundle();
            props.putBoolean("DPR_DATA_INTENT", true);
            props.putString("DPR_DATA_INTENT_ACTION", ACTION);
            i.putExtra("com.honeywell.aidc.extra.EXTRA_PROPERTIES", props);
        }
        try { c.sendBroadcast(i); } catch (Exception ignored) {}
    }

}
