package com.rnpexpress.checker;

import android.animation.ObjectAnimator;
import android.animation.ValueAnimator;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.DialogInterface;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.StateListDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.Vibrator;
import android.text.Editable;
import android.text.InputType;
import android.text.TextUtils;
import android.text.TextWatcher;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputMethodManager;
import android.widget.BaseAdapter;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ListView;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.lang.reflect.Method;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Single-screen Checker for handheld scanners: Ref Check and Cross Ref Check against the packing server.
 * Input comes from a keyboard-wedge scanner (keystrokes + Enter/Tab), scanner broadcast intents
 * (Zebra DataWedge, Honeywell, Urovo, iData, Chainway, Newland, Sunmi, ...), or typing.
 */
public class MainActivity extends Activity {
    static final int PRI = 0xFFD71920, PRI2 = 0xFFB0141A, OK = 0xFF16A34A, BAD = 0xFFDC2626, NF = 0xFFD97706,
            WAIT = 0xFF475569, INK = 0xFF1D2230, MUTED = 0xFF6B7280, LINE = 0xFFE5E7EB, BG = 0xFFF3F4F6;
    static final int R_OK = 1, R_BAD = 2, R_NF = 3, R_WAIT = 4;

    private SharedPreferences prefs;
    private Api api;
    private final ExecutorService net = Executors.newSingleThreadExecutor();
    private final Handler ui = new Handler(Looper.getMainLooper());
    private Beeper beeper;
    private Vibrator vibrator;

    private FrameLayout root;
    private View alertFrame;
    private ObjectAnimator alertAnim;
    private boolean checkerShown;

    // login screen
    private EditText loginInput;
    private TextView loginStatus;

    // checker screen
    private String tab;
    private EditText refQ, c1, c2;
    private TextView l1, l2, counts, listTitle, soundBtn, kbBtn;
    private FrameLayout resultBox;
    private ListView list;
    private final RowAdapter adapter = new RowAdapter();
    private boolean listIsBox;
    private int scanNo;
    private String lastScan = "";
    private long lastScanAt;
    private String lastSummary = "";

    private final BroadcastReceiver scanReceiver = new BroadcastReceiver() {
        @Override public void onReceive(Context c, Intent i) {
            String v = Scan.fromIntent(i);
            if (v != null) onScan(v);
        }
    };

    // ------------------------------------------------------------------ lifecycle

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        prefs = getSharedPreferences("rnp", MODE_PRIVATE);
        api = new Api(prefs);
        beeper = new Beeper();
        vibrator = (Vibrator) getSystemService(VIBRATOR_SERVICE);
        scanNo = prefs.getInt("scanNo", 0);
        tab = prefs.getString("tab", "cross");

        root = new FrameLayout(this);
        setContentView(root);
        alertFrame = new View(this);
        alertFrame.setAlpha(0f);
        alertFrame.setClickable(false);

        if (Scan.isZebra() && !prefs.getBoolean("dwDone", false)) {
            Scan.configureDataWedge(this);
            prefs.edit().putBoolean("dwDone", true).apply();
        }
        if (prefs.getString("token", "").isEmpty()) showLogin(null); else showChecker();
        handleLink(getIntent());
    }

    @Override protected void onNewIntent(Intent i) {
        super.onNewIntent(i);
        setIntent(i);
        handleLink(i);
    }

    @Override protected void onResume() {
        super.onResume();
        registerScanReceiver();
        if (Scan.isHoneywell()) Scan.claimHoneywell(this, true);
        if (prefs.getBoolean("keepOn", true)) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        if (checkerShown) { refocus(); refreshLogs(0); }
    }

    @Override protected void onPause() {
        super.onPause();
        try { unregisterReceiver(scanReceiver); } catch (Exception ignored) {}
        if (Scan.isHoneywell()) Scan.claimHoneywell(this, false);
    }

    @Override protected void onDestroy() {
        super.onDestroy();
        net.shutdownNow();
        beeper.release();
    }

    private void registerScanReceiver() {
        IntentFilter f = Scan.filter();
        try {
            if (Build.VERSION.SDK_INT >= 26) {
                // Android 13+ requires RECEIVER_EXPORTED (0x2) for broadcasts from the scanner service
                Method m = Context.class.getMethod("registerReceiver", BroadcastReceiver.class, IntentFilter.class, int.class);
                m.invoke(this, scanReceiver, f, 2);
                return;
            }
        } catch (Exception ignored) {}
        registerReceiver(scanReceiver, f);
    }

    private void handleLink(Intent i) {
        Uri u = i != null ? i.getData() : null;
        if (u == null || !"rnpchecker".equals(u.getScheme())) return;
        String code = Scan.pairCode(u.getQueryParameter("code"));
        i.setData(null);
        if (code != null) pair(code);
    }

    // Scanner keystrokes that land while no text field has focus (e.g. after tapping a button) go to the active field.
    @Override public boolean dispatchKeyEvent(KeyEvent e) {
        View f = getWindow().getDecorView().findFocus();
        if (!(f instanceof EditText) && (e.isPrintingKey() || isEnter(e.getKeyCode()))) {
            EditText t = checkerShown ? activeField() : loginInput;
            if (t != null) {
                t.requestFocus();
                return t.dispatchKeyEvent(e);
            }
        }
        return super.dispatchKeyEvent(e);
    }

    private static boolean isEnter(int k) {
        return k == KeyEvent.KEYCODE_ENTER || k == KeyEvent.KEYCODE_NUMPAD_ENTER || k == KeyEvent.KEYCODE_TAB;
    }

    /** A scan delivered by broadcast intent. */
    private void onScan(String raw) {
        long now = System.currentTimeMillis();
        if (raw.equals(lastScan) && now - lastScanAt < 400) return; // same scan via wedge + intent
        lastScan = raw; lastScanAt = now;
        String code = Scan.pairCode(raw);
        if (code != null) { askSwitchUser(code); return; }
        if (!checkerShown) {
            if (loginStatus != null) status(loginStatus, "นี่ไม่ใช่ QR สำหรับเข้าสู่ระบบ กรุณายิง QR จากหน้าเว็บ", BAD);
            buzz(R_BAD);
            return;
        }
        EditText t = activeField();
        t.setText(raw);
        submit(t);
    }

    // ------------------------------------------------------------------ login

    private void showLogin(String msg) {
        checkerShown = false;
        root.removeAllViews();
        LinearLayout page = vbox();
        page.setBackgroundColor(BG);
        page.addView(topBar("RNP Checker", "เข้าสู่ระบบ", false));

        ScrollView sv = new ScrollView(this);
        LinearLayout body = vbox();
        body.setPadding(dp(16), dp(16), dp(16), dp(16));
        sv.addView(body);
        page.addView(sv, new LinearLayout.LayoutParams(-1, 0, 1));

        LinearLayout card = card();
        card.addView(text("ยิง QR เพื่อเข้าสู่ระบบ", 22, INK, true));
        TextView how = text("1. บนคอมพิวเตอร์ เข้าเว็บ Packing แล้วเลือกเมนู \"แอป Android (Checker)\"\n" +
                "2. ยิงบาร์โค้ด QR ที่แสดงบนหน้าจอด้วยเครื่องนี้", 16, INK, false);
        how.setPadding(0, dp(8), 0, dp(12));
        how.setLineSpacing(dp(3), 1);
        card.addView(how);
        loginInput = scanField("ยิง QR ที่นี่");
        card.addView(loginInput, new LinearLayout.LayoutParams(-1, dp(56)));
        loginStatus = text(msg != null ? msg : "", 15, msg != null ? BAD : MUTED, true);
        loginStatus.setPadding(0, dp(10), 0, 0);
        card.addView(loginStatus);
        body.addView(card);

        LinearLayout alt = card();
        alt.addView(text("หรือ", 14, MUTED, false));
        Button g = button("เข้าสู่ระบบด้วย Google ผ่านเบราว์เซอร์", Color.WHITE, INK, true);
        g.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) {
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(api.server() + "/app/login")));
                } catch (Exception e) {
                    toast("ไม่พบเบราว์เซอร์ในเครื่อง");
                }
            }
        });
        alt.addView(g, new LinearLayout.LayoutParams(-1, dp(52)));
        TextView gNote = text("ใช้ได้เฉพาะเครื่องที่เข้า packing.rnpexpress.co.th ได้ ถ้าไม่ได้ให้ใช้วิธียิง QR ด้านบน", 12, MUTED, false);
        gNote.setPadding(0, dp(4), 0, 0);
        alt.addView(gNote);
        TextView srv = text("เซิร์ฟเวอร์: " + api.server(), 14, MUTED, false);
        srv.setPadding(0, dp(12), 0, 0);
        alt.addView(srv);
        Button chg = button("ตั้งค่า", Color.WHITE, INK, true);
        chg.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { showSettings(); }
        });
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-2, dp(44));
        lp.topMargin = dp(8);
        alt.addView(chg, lp);
        body.addView(alt);
        TextView ver = text("RNP Checker v" + BuildInfo.VERSION + " · " + Build.MANUFACTURER + " " + Build.MODEL, 12, MUTED, false);
        ver.setGravity(Gravity.CENTER);
        body.addView(ver);

        root.addView(page);
        root.addView(alertFrame, new FrameLayout.LayoutParams(-1, -1));
        loginInput.requestFocus();
    }

    private void askSwitchUser(final String code) {
        if (!checkerShown) { pair(code); return; }
        new AlertDialog.Builder(this)
                .setTitle("เปลี่ยนผู้ใช้")
                .setMessage("ยิง QR เข้าสู่ระบบ ต้องการเปลี่ยนผู้ใช้จาก " + prefs.getString("email", "") + " หรือไม่?")
                .setPositiveButton("เปลี่ยนผู้ใช้", new DialogInterface.OnClickListener() {
                    @Override public void onClick(DialogInterface d, int w) { pair(code); }
                })
                .setNegativeButton("ยกเลิก", null)
                .show();
    }

    private void pair(final String code) {
        if (loginStatus != null && !checkerShown) status(loginStatus, "กำลังเข้าสู่ระบบ...", MUTED);
        net.execute(new Runnable() {
            @Override public void run() {
                try {
                    JSONObject body = new JSONObject();
                    body.put("code", code);
                    final JSONObject d = api.postNoAuth("/api/app/token", body);
                    ui.post(new Runnable() {
                        @Override public void run() {
                            prefs.edit().putString("token", d.optString("token"))
                                    .putString("email", d.optString("email"))
                                    .putString("name", d.optString("name")).apply();
                            buzz(R_OK);
                            toast("เข้าสู่ระบบเป็น " + d.optString("email"));
                            showChecker();
                        }
                    });
                } catch (final Exception e) {
                    ui.post(new Runnable() {
                        @Override public void run() {
                            if (e instanceof Api.HttpError) { // never log the current user out because a QR was bad
                                buzz(R_BAD);
                                if (checkerShown) toast(e.getMessage()); else status(loginStatus, e.getMessage(), BAD);
                                return;
                            }
                            onError(e, new Runnable() { @Override public void run() { pair(code); } }, null);
                        }
                    });
                }
            }
        });
    }

    private void logout(String msg) {
        prefs.edit().remove("token").remove("email").remove("name").apply();
        showLogin(msg);
    }

    // ------------------------------------------------------------------ checker screen

    private void showChecker() {
        checkerShown = true;
        root.removeAllViews();
        LinearLayout page = vbox();
        page.setBackgroundColor(BG);
        String who = prefs.getString("name", "");
        String email = prefs.getString("email", "");
        page.addView(topBar("Checker", TextUtils.isEmpty(who) ? email : who + " · " + email, true));

        // tabs
        LinearLayout tabs = hbox();
        tabs.setPadding(dp(8), dp(8), dp(8), 0);
        tabs.addView(tabButton("1. Ref Check", "ref"), new LinearLayout.LayoutParams(0, dp(48), 1));
        View gap = new View(this);
        tabs.addView(gap, new LinearLayout.LayoutParams(dp(8), 1));
        tabs.addView(tabButton("2. Cross Ref Check", "cross"), new LinearLayout.LayoutParams(0, dp(48), 1));
        page.addView(tabs);

        LinearLayout input = card();
        LinearLayout.LayoutParams ip = new LinearLayout.LayoutParams(-1, -2);
        ip.setMargins(dp(8), dp(8), dp(8), 0);
        input.setLayoutParams(ip);
        input.setPadding(dp(10), dp(8), dp(10), dp(10));
        refQ = c1 = c2 = null;
        if (tab.equals("ref")) buildRef(input); else buildCross(input);
        page.addView(input);

        resultBox = new FrameLayout(this);
        LinearLayout.LayoutParams rp = new LinearLayout.LayoutParams(-1, -2);
        rp.setMargins(dp(8), dp(8), dp(8), 0);
        page.addView(resultBox, rp);
        renderIdle();

        counts = text("", 14, INK, true);
        counts.setPadding(dp(12), dp(6), dp(12), 0);
        counts.setVisibility(tab.equals("cross") ? View.VISIBLE : View.GONE);
        page.addView(counts);

        listTitle = text("ประวัติการตรวจวันนี้", 13, MUTED, true);
        listTitle.setPadding(dp(12), dp(8), dp(12), dp(4));
        page.addView(listTitle);
        list = new ListView(this);
        list.setAdapter(adapter);
        list.setDivider(new android.graphics.drawable.ColorDrawable(LINE));
        list.setDividerHeight(1);
        list.setBackgroundColor(Color.WHITE);
        list.setFocusable(false);
        list.setItemsCanFocus(false);
        list.setOnItemClickListener(null);
        listIsBox = false;
        adapter.set(new ArrayList<Row>());
        page.addView(list, new LinearLayout.LayoutParams(-1, 0, 1));

        root.addView(page);
        root.addView(alertFrame, new FrameLayout.LayoutParams(-1, -1));
        refocus();
        refreshLogs(0);
    }

    private View tabButton(String label, final String key) {
        boolean on = tab.equals(key);
        Button b = button(label, on ? PRI : Color.WHITE, on ? Color.WHITE : INK, !on);
        b.setTextSize(16);
        b.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) {
                if (tab.equals(key)) { refocus(); return; }
                tab = key;
                prefs.edit().putString("tab", key).apply();
                showChecker();
            }
        });
        return b;
    }

    private void buildRef(LinearLayout box) {
        final String[][] types = {{"auto", "อัตโนมัติ"}, {"waybill", "Waybill No."}, {"box", "Box No."}};
        final LinearLayout row = hbox();
        final String cur = prefs.getString("refType", "auto");
        for (final String[] t : types) {
            boolean on = t[0].equals(cur);
            Button b = chip(t[1], on);
            b.setOnClickListener(new View.OnClickListener() {
                @Override public void onClick(View v) {
                    prefs.edit().putString("refType", t[0]).apply();
                    for (int i = 0; i < types.length; i++) styleChip((Button) row.getChildAt(i), types[i][0].equals(t[0]));
                    refocus();
                }
            });
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, dp(40), 1);
            lp.rightMargin = dp(6);
            row.addView(b, lp);
        }
        box.addView(row);
        refQ = scanField("ยิง Waybill / Box No.");
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, dp(60));
        lp.topMargin = dp(8);
        box.addView(refQ, lp);
    }

    private void buildCross(LinearLayout box) {
        final LinearLayout row = hbox();
        final String cur = prefs.getString("order", "wb");
        final String[][] orders = {{"wb", "Waybill → Box"}, {"bw", "Box → Waybill"}};
        for (final String[] o : orders) {
            Button b = chip(o[1], o[0].equals(cur));
            b.setOnClickListener(new View.OnClickListener() {
                @Override public void onClick(View v) {
                    prefs.edit().putString("order", o[0]).apply();
                    for (int i = 0; i < orders.length; i++) styleChip((Button) row.getChildAt(i), orders[i][0].equals(o[0])); // row also holds the clear button
                    crossLabels();
                    c1.setText(""); c2.setText("");
                    c1.requestFocus();
                }
            });
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, dp(40), 1);
            lp.rightMargin = dp(6);
            row.addView(b, lp);
        }
        Button clear = chip("ล้าง", false);
        clear.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) {
                c1.setText(""); c2.setText("");
                c1.requestFocus();
                lastSummary = "";
                stopAlert();
                renderIdle();
            }
        });
        row.addView(clear, new LinearLayout.LayoutParams(dp(64), dp(40)));
        box.addView(row);

        l1 = text("", 14, INK, true);
        l2 = text("", 14, INK, true);
        c1 = scanField("");
        c2 = scanField("");
        box.addView(fieldRow(l1, c1));
        box.addView(fieldRow(l2, c2));
        crossLabels();
    }

    private View fieldRow(TextView label, EditText field) {
        LinearLayout r = hbox();
        r.setGravity(Gravity.CENTER_VERTICAL);
        r.setPadding(0, dp(8), 0, 0);
        label.setLayoutParams(new LinearLayout.LayoutParams(dp(92), -2));
        r.addView(label);
        r.addView(field, new LinearLayout.LayoutParams(0, dp(56), 1));
        return r;
    }

    private boolean wbFirst() { return !"bw".equals(prefs.getString("order", "wb")); }

    private void crossLabels() {
        boolean wb = wbFirst();
        l1.setText("1. " + (wb ? "Waybill" : "Box No."));
        l2.setText("2. " + (wb ? "Box No." : "Waybill"));
        c1.setHint("ยิง " + (wb ? "Waybill No." : "Box No."));
        c2.setHint("ยิง " + (wb ? "Box No." : "Waybill No."));
    }

    private EditText activeField() {
        if (refQ != null) return refQ;
        View f = getWindow().getDecorView().findFocus();
        if (f == c2) return c2;
        if (f == c1) return c1;
        return (c1.getText().length() > 0 && c2.getText().length() == 0) ? c2 : c1;
    }

    private void refocus() {
        EditText t = checkerShown ? activeField() : loginInput;
        if (t != null) t.requestFocus();
    }

    /** Enter/Tab (or a broadcast scan) on a field. */
    private void submit(EditText e) {
        String raw = e.getText().toString();
        String code = Scan.pairCode(raw);
        if (code != null) { e.setText(""); askSwitchUser(code); return; }
        if (e == loginInput) {
            e.setText("");
            if (Scan.clean(raw).isEmpty()) return;
            status(loginStatus, "นี่ไม่ใช่ QR สำหรับเข้าสู่ระบบ กรุณายิง QR จากหน้าเว็บ", BAD);
            buzz(R_BAD);
            return;
        }
        String v = Scan.clean(raw);
        if (e == refQ) {
            e.setText("");
            if (!v.isEmpty()) doRef(v);
        } else if (e == c1) {
            if (v.isEmpty()) { c1.setText(""); return; }
            c1.setText(v);
            c2.requestFocus();
            c2.selectAll();
        } else if (e == c2) {
            if (v.isEmpty()) { c2.setText(""); return; }
            c2.setText(v);
            String first = Scan.clean(c1.getText().toString());
            if (first.isEmpty()) { c1.setText(""); c1.requestFocus(); return; }
            // clear right away so the next pair can be scanned while this one is checked
            c1.setText(""); c2.setText("");
            c1.requestFocus();
            doCross(first, v);
        }
    }

    // ------------------------------------------------------------------ checks

    private void doRef(final String q) {
        final String type = prefs.getString("refType", "auto");
        startWait(pairs("เลขที่ยิง", q, "hl"));
        if (listIsBox) { listIsBox = false; refreshLogs(0); }
        net.execute(new Runnable() {
            @Override public void run() {
                try {
                    JSONObject body = new JSONObject();
                    body.put("q", q);
                    body.put("type", type);
                    final JSONObject d = api.post("/api/checker/ref", body);
                    ui.post(new Runnable() { @Override public void run() { showRef(q, d); } });
                } catch (final Exception e) {
                    ui.post(new Runnable() { @Override public void run() { onError(e, null, q); } });
                }
            }
        });
    }

    private void showRef(String q, JSONObject d) {
        if (!checkerShown) return;
        if ("not_found".equals(d.optString("result"))) {
            panel(R_NF, "ไม่พบ", pairs("เลขที่ยิง", q, "hl"), d.optString("message"), q + " → ไม่พบ");
        } else if ("waybill".equals(d.optString("kind"))) {
            List<String[]> p = pairs("Waybill No. (ที่ยิง)", d.optString("waybill_no"), "hl");
            p.add(new String[]{"Box No.", d.optString("box_no"), "big"});
            p.add(new String[]{"Operation Date", d.optString("operation_date"), ""});
            p.add(new String[]{"ในกล่องนี้", d.optInt("box_count") + " รายการ", ""});
            panel(R_OK, "Box No. " + d.optString("box_no"), p, null, d.optString("waybill_no") + " → Box " + d.optString("box_no"));
        } else {
            List<String[]> p = pairs("Box No. (ที่ยิง)", d.optString("box_no"), "hl");
            p.add(new String[]{"จำนวน Waybill", d.optInt("count") + " รายการ", "big"});
            JSONArray dates = d.optJSONArray("dates");
            StringBuilder ds = new StringBuilder();
            for (int i = 0; dates != null && i < dates.length(); i++) ds.append(i > 0 ? ", " : "").append(dates.optString(i));
            p.add(new String[]{"Operation Date", ds.toString(), ""});
            panel(R_OK, d.optInt("count") + " Waybill", p, null, "Box " + d.optString("box_no") + " → " + d.optInt("count") + " Waybill");
            JSONArray wbs = d.optJSONArray("waybills");
            List<Row> rows = new ArrayList<>();
            for (int i = 0; wbs != null && i < wbs.length(); i++) {
                JSONObject w = wbs.optJSONObject(i);
                rows.add(new Row(String.valueOf(i + 1), w.optString("waybill_no"), w.optString("operation_date"), 0, null));
            }
            listIsBox = true;
            listTitle.setText("Waybill No. ในกล่อง " + d.optString("box_no") + " (" + rows.size() + ")");
            adapter.set(rows);
            list.setSelection(0);
        }
        refreshLogs(1500);
    }

    private void doCross(final String first, final String second) {
        final boolean wb = wbFirst();
        List<String[]> p = pairs(wb ? "Waybill No." : "Box No.", first, "hl");
        p.add(new String[]{wb ? "Box No." : "Waybill No.", second, "hl"});
        startWait(p);
        net.execute(new Runnable() {
            @Override public void run() {
                try {
                    JSONObject body = new JSONObject();
                    body.put("order", wb ? "wb" : "bw");
                    body.put("first", first);
                    body.put("second", second);
                    final JSONObject d = api.post("/api/checker/cross", body);
                    ui.post(new Runnable() { @Override public void run() { showCross(wb, d); } });
                } catch (final Exception e) {
                    ui.post(new Runnable() { @Override public void run() { onError(e, null, first + " / " + second); } });
                }
            }
        });
    }

    private void showCross(boolean wb, JSONObject d) {
        if (!checkerShown) return;
        String r = d.optString("result");
        List<String[]> p = new ArrayList<>();
        String[] w = {"Waybill No. (ที่ยิง)", d.optString("waybill_no"), "hl big"};
        String[] b = {"Box No. (ที่ยิง)", d.optString("box_no"), "hl big"};
        p.add(wb ? w : b);
        p.add(wb ? b : w);
        if ("mismatch".equals(r)) p.add(new String[]{"กล่องที่ถูกต้อง", d.optString("expected_box"), "big"});
        if (!d.isNull("operation_date") && !d.optString("operation_date").isEmpty()) p.add(new String[]{"Operation Date", d.optString("operation_date"), ""});
        String title = "match".equals(r) ? "ตรง ถูกต้อง" : "mismatch".equals(r) ? "ไม่ตรง!" : "ไม่พบในระบบ";
        panel("match".equals(r) ? R_OK : "mismatch".equals(r) ? R_BAD : R_NF, title, p, d.optString("message"),
                d.optString("waybill_no") + " / " + d.optString("box_no") + " → " + title);
        refreshLogs(1200);
    }

    private void onError(Exception e, final Runnable retry, String input) {
        if (e instanceof Api.UntrustedCert) {
            final String fp = ((Api.UntrustedCert) e).fingerprint;
            new AlertDialog.Builder(this)
                    .setTitle("ยืนยันใบรับรองของเซิร์ฟเวอร์")
                    .setMessage("เซิร์ฟเวอร์ " + Uri.parse(api.server()).getHost() + " ใช้ใบรับรองที่ออกเอง (self-signed)\n\nSHA-256:\n" + fp +
                            "\n\nถ้าเป็นเซิร์ฟเวอร์ของบริษัท ให้กด \"เชื่อถือ\" (ถามครั้งเดียว)")
                    .setPositiveButton("เชื่อถือ", new DialogInterface.OnClickListener() {
                        @Override public void onClick(DialogInterface d, int which) {
                            prefs.edit().putString("pin", fp).apply();
                            if (retry != null) retry.run();
                            else if (checkerShown) { renderIdle(); refreshLogs(0); toast("เชื่อถือแล้ว กรุณายิงใหม่อีกครั้ง"); }
                        }
                    })
                    .setNegativeButton("ยกเลิก", null)
                    .show();
            if (checkerShown && input != null) panel(R_BAD, "ยังไม่ได้ยืนยันใบรับรอง", pairs("เลขที่ยิง", input, "hl"), "กด \"เชื่อถือ\" แล้วยิงใหม่", null);
            return;
        }
        if (e instanceof Api.HttpError) {
            Api.HttpError h = (Api.HttpError) e;
            if (h.status == 401 || "auth".equals(h.code) || "status".equals(h.code)) {
                buzz(R_BAD);
                logout(h.getMessage());
                return;
            }
            if (!checkerShown) { status(loginStatus, h.getMessage(), BAD); buzz(R_BAD); return; }
            panel(R_BAD, h.getMessage(), input != null ? pairs("เลขที่ยิง", input, "hl") : null, null, input != null ? input + " ✖" : null);
            return;
        }
        String msg = "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้";
        String detail = "ตรวจสอบ Wi-Fi แล้วยิงใหม่อีกครั้ง (" + e.getClass().getSimpleName() + ")";
        if (!checkerShown) { status(loginStatus, msg + "\n" + detail, BAD); buzz(R_BAD); return; }
        panel(R_BAD, msg, input != null ? pairs("เลขที่ยิง", input, "hl") : null, detail, null);
    }

    private final Runnable logsTask = new Runnable() {
        @Override public void run() {
            net.execute(new Runnable() {
                @Override public void run() {
                    try {
                        final JSONObject d = api.get("/api/checker/logs");
                        ui.post(new Runnable() { @Override public void run() { showLogs(d); } });
                    } catch (final Exception e) {
                        ui.post(new Runnable() {
                            @Override public void run() {
                                if (e instanceof Api.HttpError && ((Api.HttpError) e).status == 401) logout(e.getMessage());
                                else if (e instanceof Api.UntrustedCert) onError(e, null, null);
                            }
                        });
                    }
                }
            });
        }
    };

    private CharSequence countsText(int ok, int bad, int nf) {
        android.text.SpannableStringBuilder b = new android.text.SpannableStringBuilder("วันนี้   ");
        Object[][] parts = {{"ตรง " + ok, OK}, {"ไม่ตรง " + bad, BAD}, {"ไม่พบ " + nf, NF}};
        for (Object[] x : parts) {
            int st = b.length();
            b.append((String) x[0]);
            b.setSpan(new android.text.style.ForegroundColorSpan((Integer) x[1]), st, b.length(), 0);
            b.append("    ");
        }
        return b;
    }

    private void refreshLogs(long delay) {
        ui.removeCallbacks(logsTask);
        ui.postDelayed(logsTask, delay);
    }

    private void showLogs(JSONObject d) {
        if (!checkerShown) return;
        JSONObject s = d.optJSONObject("summary");
        if (s != null) counts.setText(countsText(s.optInt("match"), s.optInt("mismatch"), s.optInt("not_found")));
        if (listIsBox) return;
        JSONArray rows = d.optJSONArray("rows");
        List<Row> out = new ArrayList<>();
        for (int i = 0; rows != null && i < rows.length(); i++) {
            JSONObject r = rows.optJSONObject(i);
            String res = r.optString("result");
            int color = "found".equals(res) || "match".equals(res) ? OK : "mismatch".equals(res) ? BAD : NF;
            String tag = "found".equals(res) ? "พบ" : "match".equals(res) ? "ตรง" : "mismatch".equals(res) ? "ไม่ตรง" : "ไม่พบ";
            String at = r.optString("created_at");
            int sp = at.indexOf(' ');
            String time = sp > 0 ? at.substring(sp + 1) : at;
            String type = "ref".equals(r.optString("mode")) ? "Ref" : ("bw".equals(r.optString("check_order")) ? "Box→Waybill" : "Waybill→Box");
            String in = r.optString("input1") + (r.isNull("input2") || r.optString("input2").isEmpty() ? "" : " → " + r.optString("input2"));
            out.add(new Row(time, in, type + " · " + (r.isNull("detail") ? "" : r.optString("detail")), color, tag));
        }
        listTitle.setText("ประวัติการตรวจวันนี้ (" + out.size() + ")");
        adapter.set(out);
    }

    // ------------------------------------------------------------------ result panel

    private static List<String[]> pairs(String label, String value, String cls) {
        List<String[]> p = new ArrayList<>();
        p.add(new String[]{label, value, cls});
        return p;
    }

    private void renderIdle() {
        resultBox.removeAllViews();
        TextView t = text(tab.equals("ref") ? "ยิงบาร์โค้ด Waybill No. หรือ Box No." : "ยิงบาร์โค้ดทีละคู่: ช่อง 1 แล้วช่อง 2", 16, MUTED, true);
        t.setGravity(Gravity.CENTER);
        t.setPadding(dp(12), dp(22), dp(12), dp(22));
        t.setBackground(round(Color.WHITE, dp(14), LINE));
        resultBox.addView(t);
    }

    private void startWait(List<String[]> p) {
        scanNo++;
        prefs.edit().putInt("scanNo", scanNo).apply();
        panel(R_WAIT, "กำลังตรวจ...", p, null, null);
    }

    private final Runnable staleTask = new Runnable() {
        @Override public void run() {
            if (resultBox.getChildCount() == 0) return;
            View v = resultBox.getChildAt(0);
            v.animate().alpha(.45f).setDuration(400).start();
            View tag = v.findViewWithTag("new");
            if (tag instanceof TextView) ((TextView) tag).setText("ผลก่อนหน้า");
        }
    };

    private void panel(int cls, String title, List<String[]> p, String msg, String summary) {
        ui.removeCallbacks(staleTask);
        int bg = cls == R_OK ? OK : cls == R_BAD ? BAD : cls == R_NF ? NF : WAIT;
        LinearLayout v = vbox();
        v.setBackground(round(bg, dp(14), 0));
        v.setPadding(dp(14), dp(10), dp(14), dp(12));

        LinearLayout head = hbox();
        head.setGravity(Gravity.CENTER_VERTICAL);
        IconView icon = new IconView(this, cls == R_OK ? IconView.CHECK : cls == R_BAD ? IconView.CROSS : cls == R_NF ? IconView.QUESTION : IconView.WAIT, bg);
        head.addView(icon, new LinearLayout.LayoutParams(dp(58), dp(58)));
        LinearLayout ht = vbox();
        ht.setPadding(dp(12), 0, 0, 0);
        LinearLayout meta = hbox();
        TextView num = text("#" + scanNo + "  " + new SimpleDateFormat("HH:mm:ss", Locale.US).format(new Date()), 13, Color.WHITE, true);
        meta.addView(num, new LinearLayout.LayoutParams(0, -2, 1));
        if (cls != R_WAIT) {
            TextView nw = text("● ผลล่าสุด", 12, INK, true);
            nw.setTag("new");
            nw.setPadding(dp(8), dp(1), dp(8), dp(1));
            nw.setBackground(round(Color.WHITE, dp(10), 0));
            meta.addView(nw);
        }
        ht.addView(meta);
        TextView tt = text(title, title.length() > 14 ? 28 : 38, Color.WHITE, true);
        tt.setLineSpacing(0, .95f);
        ht.addView(tt);
        head.addView(ht, new LinearLayout.LayoutParams(0, -2, 1));
        v.addView(head);

        if (p != null && !p.isEmpty()) {
            LinearLayout grid = vbox();
            grid.setPadding(0, dp(8), 0, 0);
            LinearLayout row = null;
            for (int i = 0; i < p.size(); i++) {
                String[] x = p.get(i);
                boolean hl = x[2].contains("hl"), big = x[2].contains("big");
                if (i % 2 == 0) {
                    row = hbox();
                    row.setBaselineAligned(false);
                    LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, -2);
                    lp.topMargin = i > 0 ? dp(6) : 0;
                    grid.addView(row, lp);
                }
                LinearLayout cell = vbox();
                cell.setPadding(dp(8), dp(4), dp(8), dp(5));
                cell.setBackground(round(hl ? Color.WHITE : 0x29FFFFFF, dp(8), 0));
                cell.addView(text(x[0], 11, hl ? MUTED : 0xE6FFFFFF, false));
                TextView val = text(x[1], big ? 20 : 16, hl ? INK : Color.WHITE, true);
                val.setTypeface(Typeface.MONOSPACE, Typeface.BOLD);
                cell.addView(val);
                cell.setMinimumHeight(dp(big ? 56 : 48));
                LinearLayout.LayoutParams cp = new LinearLayout.LayoutParams(0, -2, 1);
                if (i % 2 == 0) cp.rightMargin = dp(6);
                row.addView(cell, cp);
            }
            if (p.size() % 2 == 1) row.addView(new View(this), new LinearLayout.LayoutParams(0, 0, 1));
            v.addView(grid);
        }
        if (msg != null && !msg.isEmpty()) {
            TextView m = text(msg, 15, Color.WHITE, true);
            m.setPadding(0, dp(8), 0, 0);
            v.addView(m);
        }
        if (cls == R_WAIT && !lastSummary.isEmpty()) {
            TextView pv = text("ก่อนหน้า: " + lastSummary, 13, 0xE6FFFFFF, false);
            pv.setPadding(0, dp(6), 0, 0);
            v.addView(pv);
        }

        resultBox.removeAllViews();
        resultBox.addView(v);
        if (cls == R_WAIT) { stopAlert(); return; }
        if (summary != null) lastSummary = summary;
        v.setScaleX(.96f); v.setScaleY(.96f);
        v.animate().scaleX(1).scaleY(1).setDuration(180).start();
        alert(cls);
        buzz(cls);
        ui.postDelayed(staleTask, 10000);
    }

    /** Coloured frame around the screen: one flash for OK, keeps pulsing on mismatch / not found until the next scan. */
    private void alert(int cls) {
        stopAlert();
        int color = cls == R_OK ? OK : cls == R_BAD ? BAD : NF;
        GradientDrawable g = new GradientDrawable();
        g.setColor(Color.TRANSPARENT);
        g.setStroke(dp(cls == R_OK ? 12 : 14), color);
        alertFrame.setBackground(g);
        alertFrame.bringToFront();
        if (cls == R_OK) {
            alertFrame.setAlpha(1f);
            alertFrame.animate().alpha(0f).setDuration(900).start();
        } else {
            alertAnim = ObjectAnimator.ofFloat(alertFrame, "alpha", 1f, .25f);
            alertAnim.setDuration(500);
            alertAnim.setRepeatMode(ValueAnimator.REVERSE);
            alertAnim.setRepeatCount(ValueAnimator.INFINITE);
            alertAnim.start();
        }
    }

    private void stopAlert() {
        if (alertAnim != null) { alertAnim.cancel(); alertAnim = null; }
        alertFrame.animate().cancel();
        alertFrame.setAlpha(0f);
    }

    private void buzz(int cls) {
        if (prefs.getBoolean("sound", true)) beeper.play(cls == R_OK);
        if (prefs.getBoolean("vibrate", true) && vibrator != null) {
            try {
                if (cls == R_OK) vibrator.vibrate(40);
                else if (cls == R_BAD) vibrator.vibrate(new long[]{0, 250, 120, 250}, -1);
                else vibrator.vibrate(new long[]{0, 400}, -1);
            } catch (Exception ignored) {}
        }
    }

    // ------------------------------------------------------------------ settings

    private void showSettings() {
        LinearLayout box = vbox();
        box.setPadding(dp(20), dp(8), dp(20), 0);
        box.addView(text("เซิร์ฟเวอร์", 13, MUTED, true));
        final EditText server = new EditText(this);
        server.setSingleLine(true);
        server.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        server.setText(api.server());
        box.addView(server);
        TextView hint = text("ค่าเริ่มต้น " + BuildInfo.DEFAULT_SERVER, 12, MUTED, false);
        box.addView(hint);
        final CheckBox sound = check("เสียงแจ้งผล", prefs.getBoolean("sound", true));
        final CheckBox vib = check("สั่นแจ้งผล", prefs.getBoolean("vibrate", true));
        final CheckBox kb = check("แสดงคีย์บอร์ดบนจอเมื่อแตะช่องกรอก", prefs.getBoolean("keyboard", false));
        final CheckBox keep = check("เปิดหน้าจอค้างไว้ขณะใช้งาน", prefs.getBoolean("keepOn", true));
        box.addView(sound); box.addView(vib); box.addView(kb); box.addView(keep);

        Button dw = button("ตั้งค่า Zebra DataWedge อัตโนมัติ", Color.WHITE, INK, true);
        dw.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) {
                Scan.configureDataWedge(MainActivity.this);
                toast("ส่งค่าตั้ง DataWedge แล้ว (โปรไฟล์ RNPChecker)");
            }
        });
        LinearLayout.LayoutParams bp = new LinearLayout.LayoutParams(-1, dp(46));
        bp.topMargin = dp(10);
        box.addView(dw, bp);
        final AlertDialog[] dlg = new AlertDialog[1];
        if (checkerShown) {
            Button out = button("ออกจากระบบ (" + prefs.getString("email", "") + ")", Color.WHITE, BAD, true);
            out.setOnClickListener(new View.OnClickListener() {
                @Override public void onClick(View v) { dlg[0].dismiss(); logout(null); }
            });
            box.addView(out, bp);
        }
        TextView ver = text("RNP Checker v" + BuildInfo.VERSION + " · " + Build.MANUFACTURER + " " + Build.MODEL + " · Android " + Build.VERSION.RELEASE, 12, MUTED, false);
        ver.setPadding(0, dp(10), 0, dp(4));
        box.addView(ver);
        ScrollView sv = new ScrollView(this);
        sv.addView(box);

        dlg[0] = new AlertDialog.Builder(this)
                .setTitle("ตั้งค่า")
                .setView(sv)
                .setPositiveButton("บันทึก", new DialogInterface.OnClickListener() {
                    @Override public void onClick(DialogInterface d, int which) {
                        String s = server.getText().toString().trim();
                        if (!s.isEmpty() && !s.startsWith("http")) s = "https://" + s;
                        SharedPreferences.Editor ed = prefs.edit();
                        if (!s.isEmpty() && !s.equals(api.server())) ed.putString("server", s).remove("pin");
                        ed.putBoolean("sound", sound.isChecked()).putBoolean("vibrate", vib.isChecked())
                                .putBoolean("keyboard", kb.isChecked()).putBoolean("keepOn", keep.isChecked()).apply();
                        if (keep.isChecked()) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                        else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                        if (checkerShown) showChecker(); else showLogin(null);
                    }
                })
                .setNegativeButton("ปิด", null)
                .create();
        dlg[0].setOnDismissListener(new DialogInterface.OnDismissListener() {
            @Override public void onDismiss(DialogInterface d) { refocus(); }
        });
        dlg[0].show();
    }

    // ------------------------------------------------------------------ view helpers

    private View topBar(String title, String sub, boolean tools) {
        LinearLayout bar = hbox();
        bar.setBackgroundColor(PRI);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setPadding(dp(14), dp(6), dp(4), dp(6));
        LinearLayout t = vbox();
        t.addView(text(title, 19, Color.WHITE, true));
        if (sub != null && !sub.isEmpty()) {
            TextView s = text(sub, 12, 0xE6FFFFFF, false);
            s.setSingleLine(true);
            s.setEllipsize(TextUtils.TruncateAt.END);
            t.addView(s);
        }
        bar.addView(t, new LinearLayout.LayoutParams(0, -2, 1));
        if (tools) {
            kbBtn = barButton("Aa");
            kbBtn.setAlpha(prefs.getBoolean("keyboard", false) ? 1f : .55f);
            kbBtn.setOnClickListener(new View.OnClickListener() {
                @Override public void onClick(View v) { toggleKeyboard(); }
            });
            bar.addView(kbBtn);
            soundBtn = barButton("♪");
            soundBtn.setAlpha(prefs.getBoolean("sound", true) ? 1f : .4f);
            soundBtn.setOnClickListener(new View.OnClickListener() {
                @Override public void onClick(View v) {
                    boolean on = !prefs.getBoolean("sound", true);
                    prefs.edit().putBoolean("sound", on).apply();
                    soundBtn.setAlpha(on ? 1f : .4f);
                    toast(on ? "เปิดเสียงแจ้งผล" : "ปิดเสียงแจ้งผล");
                    refocus();
                }
            });
            bar.addView(soundBtn);
        }
        TextView gear = barButton("⋮");
        gear.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { showSettings(); }
        });
        bar.addView(gear);
        return bar;
    }

    private TextView barButton(String s) {
        TextView b = text(s, 22, Color.WHITE, false);
        b.setGravity(Gravity.CENTER);
        b.setBackground(pressable(Color.TRANSPARENT, PRI2, 0, dp(8)));
        b.setFocusable(false);
        b.setLayoutParams(new LinearLayout.LayoutParams(dp(48), dp(44)));
        return b;
    }

    private void toggleKeyboard() {
        boolean on = !prefs.getBoolean("keyboard", false);
        prefs.edit().putBoolean("keyboard", on).apply();
        kbBtn.setAlpha(on ? 1f : .55f);
        EditText[] fs = {refQ, c1, c2};
        for (EditText f : fs) if (f != null) f.setShowSoftInputOnFocus(on);
        EditText t = activeField();
        t.requestFocus();
        InputMethodManager imm = (InputMethodManager) getSystemService(INPUT_METHOD_SERVICE);
        if (on) imm.showSoftInput(t, InputMethodManager.SHOW_IMPLICIT);
        else imm.hideSoftInputFromWindow(t.getWindowToken(), 0);
        toast(on ? "แสดงคีย์บอร์ด (พิมพ์เอง)" : "ซ่อนคีย์บอร์ด (โหมดเครื่องยิง)");
    }

    private EditText scanField(String hint) {
        final EditText e = new EditText(this);
        e.setSingleLine(true);
        e.setHint(hint);
        e.setTextSize(TypedValue.COMPLEX_UNIT_SP, 21);
        e.setTypeface(Typeface.MONOSPACE, Typeface.BOLD);
        e.setTextColor(INK);
        e.setHintTextColor(0xFF9CA3AF);
        e.setPadding(dp(12), 0, dp(12), 0);
        e.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD | InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS);
        e.setImeOptions(EditorInfo.IME_ACTION_DONE | EditorInfo.IME_FLAG_NO_EXTRACT_UI | EditorInfo.IME_FLAG_NO_FULLSCREEN);
        e.setShowSoftInputOnFocus(prefs.getBoolean("keyboard", false));
        e.setSelectAllOnFocus(false);
        styleField(e, false);
        e.setOnFocusChangeListener(new View.OnFocusChangeListener() {
            @Override public void onFocusChange(View v, boolean has) { styleField(e, has); }
        });
        e.setOnKeyListener(new View.OnKeyListener() {
            @Override public boolean onKey(View v, int code, KeyEvent ev) {
                if (!isEnter(code)) return false;
                if (ev.getAction() == KeyEvent.ACTION_DOWN && ev.getRepeatCount() == 0) submit(e);
                return true;
            }
        });
        e.setOnEditorActionListener(new TextView.OnEditorActionListener() {
            @Override public boolean onEditorAction(TextView v, int id, KeyEvent ev) {
                if (ev != null && isEnter(ev.getKeyCode())) return true; // handled by the key listener
                submit(e);
                return true;
            }
        });
        // some scanners "type" the suffix as a character instead of an Enter key event
        e.addTextChangedListener(new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int a, int b, int c) {}
            @Override public void onTextChanged(CharSequence s, int a, int b, int c) {}
            @Override public void afterTextChanged(Editable s) {
                String t = s.toString();
                if (t.indexOf('\n') < 0 && t.indexOf('\r') < 0 && t.indexOf('\t') < 0) return;
                final String v = t.replaceAll("[\\r\\n\\t]", "");
                e.post(new Runnable() {
                    @Override public void run() { e.setText(v); submit(e); }
                });
            }
        });
        return e;
    }

    private void styleField(EditText e, boolean focused) {
        GradientDrawable g = new GradientDrawable();
        g.setColor(focused ? 0xFFFFF7F7 : Color.WHITE);
        g.setCornerRadius(dp(10));
        g.setStroke(dp(focused ? 3 : 1), focused ? PRI : 0xFFD1D5DB);
        e.setBackground(g);
    }

    private Button chip(String label, boolean on) {
        Button b = new Button(this);
        b.setText(label);
        b.setAllCaps(false);
        b.setTextSize(14);
        b.setPadding(dp(4), 0, dp(4), 0);
        b.setMinHeight(0);
        b.setMinimumHeight(0);
        b.setFocusable(false);
        b.setStateListAnimator(null);
        styleChip(b, on);
        return b;
    }

    private void styleChip(Button b, boolean on) {
        b.setTextColor(on ? Color.WHITE : INK);
        b.setTypeface(Typeface.DEFAULT, on ? Typeface.BOLD : Typeface.NORMAL);
        b.setBackground(pressable(on ? INK : Color.WHITE, on ? 0xFF000000 : 0xFFE5E7EB, on ? 0 : 0xFFD1D5DB, dp(8)));
    }

    private Button button(String label, int bg, int fg, boolean border) {
        Button b = new Button(this);
        b.setText(label);
        b.setAllCaps(false);
        b.setTextColor(fg);
        b.setTextSize(15);
        b.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        b.setFocusable(false);
        b.setStateListAnimator(null);
        b.setBackground(pressable(bg, bg == Color.WHITE ? 0xFFF3F4F6 : PRI2, border ? 0xFFD1D5DB : 0, dp(10)));
        return b;
    }

    private CheckBox check(String label, boolean on) {
        CheckBox c = new CheckBox(this);
        c.setText(label);
        c.setTextSize(15);
        c.setChecked(on);
        c.setPadding(dp(4), dp(10), 0, dp(10));
        return c;
    }

    private StateListDrawable pressable(int bg, int pressed, int stroke, int radius) {
        StateListDrawable s = new StateListDrawable();
        s.addState(new int[]{android.R.attr.state_pressed}, round(pressed, radius, stroke));
        s.addState(new int[]{}, round(bg, radius, stroke));
        return s;
    }

    private GradientDrawable round(int color, int radius, int stroke) {
        GradientDrawable g = new GradientDrawable();
        g.setColor(color);
        g.setCornerRadius(radius);
        if (stroke != 0) g.setStroke(dp(1), stroke);
        return g;
    }

    private LinearLayout card() {
        LinearLayout c = vbox();
        c.setBackground(round(Color.WHITE, dp(14), LINE));
        c.setPadding(dp(16), dp(14), dp(16), dp(16));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, -2);
        lp.bottomMargin = dp(12);
        c.setLayoutParams(lp);
        return c;
    }

    private LinearLayout vbox() {
        LinearLayout l = new LinearLayout(this);
        l.setOrientation(LinearLayout.VERTICAL);
        return l;
    }

    private LinearLayout hbox() {
        LinearLayout l = new LinearLayout(this);
        l.setOrientation(LinearLayout.HORIZONTAL);
        return l;
    }

    private TextView text(String s, int sp, int color, boolean bold) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setTextColor(color);
        if (bold) t.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        return t;
    }

    private void status(TextView t, String msg, int color) {
        if (t == null) return;
        t.setText(msg);
        t.setTextColor(color);
    }

    private void toast(String s) { Toast.makeText(this, s, Toast.LENGTH_SHORT).show(); }

    private int dp(int v) { return Math.round(v * getResources().getDisplayMetrics().density); }

    // ------------------------------------------------------------------ list

    static final class Row {
        final String left, main, sub, tag; final int color;
        Row(String left, String main, String sub, int color, String tag) {
            this.left = left; this.main = main; this.sub = sub; this.color = color; this.tag = tag;
        }
    }

    private final class RowAdapter extends BaseAdapter {
        private List<Row> rows = new ArrayList<>();

        void set(List<Row> r) { rows = r; notifyDataSetChanged(); }

        @Override public int getCount() { return rows.size(); }
        @Override public Object getItem(int i) { return rows.get(i); }
        @Override public long getItemId(int i) { return i; }
        @Override public boolean isEnabled(int i) { return false; }

        @Override public View getView(int i, View v, ViewGroup parent) {
            Holder h;
            if (v == null) {
                LinearLayout r = hbox();
                r.setGravity(Gravity.CENTER_VERTICAL);
                r.setPadding(dp(12), dp(7), dp(12), dp(7));
                h = new Holder();
                h.left = text("", 12, MUTED, false);
                r.addView(h.left, new LinearLayout.LayoutParams(dp(62), -2));
                LinearLayout mid = vbox();
                h.main = text("", 15, INK, true);
                h.main.setTypeface(Typeface.MONOSPACE, Typeface.BOLD);
                h.sub = text("", 12, MUTED, false);
                h.sub.setMaxLines(2);
                h.sub.setEllipsize(TextUtils.TruncateAt.END);
                mid.addView(h.main);
                mid.addView(h.sub);
                r.addView(mid, new LinearLayout.LayoutParams(0, -2, 1));
                h.tag = text("", 12, Color.WHITE, true);
                h.tag.setPadding(dp(8), dp(2), dp(8), dp(2));
                r.addView(h.tag);
                r.setTag(h);
                v = r;
            } else h = (Holder) v.getTag();
            Row row = rows.get(i);
            h.left.setText(row.left);
            h.main.setText(row.main);
            h.sub.setText(row.sub);
            h.sub.setVisibility(TextUtils.isEmpty(row.sub) ? View.GONE : View.VISIBLE);
            if (row.tag != null) {
                h.tag.setVisibility(View.VISIBLE);
                h.tag.setText(row.tag);
                h.tag.setBackground(round(row.color, dp(10), 0));
            } else h.tag.setVisibility(View.GONE);
            return v;
        }
    }

    private static final class Holder { TextView left, main, sub, tag; }
}
