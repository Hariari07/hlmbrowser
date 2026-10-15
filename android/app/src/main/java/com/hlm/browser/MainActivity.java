package com.hlm.browser;

import android.app.*;
import android.os.*;
import android.content.*;
import android.net.*;
import android.net.http.SslError;
import android.graphics.Color;
import android.view.*;
import android.webkit.*;
import android.widget.*;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.*;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;
import android.util.Base64;
import android.util.AtomicFile;

/** Platform shell. See docs/android.md for the WebView network-enforcement limitation. */
public class MainActivity extends Activity {
    private volatile Policy policy;
    private boolean invalid = false;
    private JSONObject saved;
    private WebView web;
    private LinearLayout root, content;
    private TextView status;
    private boolean full = false;
    private long nextAttempt = 0;
    private ValueCallback<Uri[]> fileCallback;
    private AtomicFile settings;
    private static final int PICK_FILE = 12;
    private static final int SAVE_DOWNLOAD = 13;
    private String downloadUrl, downloadAgent;
    private Policy downloadPolicy;
    private final java.util.Map<WebView, Dialog> popups = new java.util.HashMap<>();
    private PermissionRequest pendingMedia;
    private WebView mediaView;
    private Policy mediaPolicy;
    private String mediaDocument;
    private AlertDialog mediaPrompt;
    private static final int MEDIA_PERMISSIONS = 61;
    private boolean capability(String name) {
        JSONObject caps = saved == null ? null : saved.optJSONObject("config").optJSONObject("capabilities");
        return caps != null && caps.optBoolean(name, false);
    }
    private byte[] hash(String password, byte[] salt) throws Exception {
        PBEKeySpec spec = new PBEKeySpec(password.toCharArray(), salt, 210000, 256);
        try { return SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).getEncoded(); }
        finally { spec.clearPassword(); }
    }
    private String encode(byte[] b) { return Base64.encodeToString(b, Base64.NO_WRAP); }
    private byte[] decode(String s) { return Base64.decode(s, Base64.NO_WRAP); }
    private Policy readPolicy(JSONObject c) throws Exception {
        if (c.getInt("version") != 1) throw new Exception("Unsupported configuration version");
        if (c.has("capabilities")) {
            JSONObject caps = c.getJSONObject("capabilities");
            for (String key : new String[]{"camera", "microphone", "popups", "thirdPartyCookies"}) if (caps.has(key) && !(caps.get(key) instanceof Boolean)) throw new Exception("Invalid capability");
        }
        JSONArray a = c.getJSONArray("origins"); String[] extra = new String[a.length()];
        for (int i = 0; i < a.length(); i++) extra[i] = a.getString(i);
        return new Policy(c.getString("website"), extra, c.getBoolean("allowHttp"));
    }
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        WebView.setWebContentsDebuggingEnabled(false);
        settings = new AtomicFile(new File(getFilesDir(), "settings.json"));
        root = new LinearLayout(this); root.setOrientation(LinearLayout.VERTICAL);
        root.setOnApplyWindowInsetsListener((v, insets) -> { v.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(), insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom()); return insets; });
        LinearLayout bar = new LinearLayout(this);
        Button menu = new Button(this); menu.setText("HLM • Menu"); bar.addView(menu);
        status = new TextView(this); bar.addView(status); root.addView(bar);
        content = new LinearLayout(this); content.setOrientation(LinearLayout.VERTICAL); root.addView(content, new LinearLayout.LayoutParams(-1, 0, 1)); setContentView(root);
        menu.setOnClickListener(v -> new AlertDialog.Builder(this).setItems(new String[]{"Settings", "Full screen / normal", "Print", "Exit"}, (d, n) -> {
            if (n == 0 && !invalid) { if (saved == null) setup(); else unlock(); }
            if (n == 1) fullscreen(!full);
            if (n == 2 && web != null && content.indexOfChild(web) >= 0) ((android.print.PrintManager)getSystemService(PRINT_SERVICE)).print("HLM document", web.createPrintDocumentAdapter("HLM document"), null);
            if (n == 3) finish();
        }).show());
        try {
            if (!settings.getBaseFile().exists()) { setup(); return; }
            saved = new JSONObject(new String(settings.readFully(), StandardCharsets.UTF_8));
            policy = readPolicy(saved.getJSONObject("config"));
            if (decode(saved.getString("salt")).length != 16 || decode(saved.getString("hash")).length != 32) throw new Exception();
            fullscreen(saved.getJSONObject("config").getBoolean("fullscreen"));
            if (saved.getJSONObject("config").getBoolean("autoOpen")) open();
            else message("Application ready", "Open the configured application when ready.", "Open application", this::open);
        } catch (Exception e) { invalid = true; policy = null; message("Settings need recovery", "Settings are invalid. An authorized device administrator must clear app storage or restore a valid configuration. Access is blocked.", null, null); }
    }
    private void fullscreen(boolean enabled) {
        full = enabled;
        if (enabled) getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
        else getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_VISIBLE);
    }
    private void message(String title, String detail, String action, Runnable run) {
        content.removeAllViews(); TextView t = new TextView(this); t.setText(title + "\n\n" + detail); t.setPadding(24, 24, 24, 24); t.setTextSize(18); content.addView(t);
        if (action != null) button(content, action, run);
    }
    private void button(LinearLayout parent, String text, Runnable run) { Button b = new Button(this); b.setText(text); parent.addView(b); b.setOnClickListener(v -> run.run()); }
    private EditText field(LinearLayout parent, String label, String value, boolean password) {
        TextView l = new TextView(this); l.setText(label); parent.addView(l);
        EditText e = new EditText(this); e.setText(value); e.setSingleLine(password || !label.startsWith("Approved"));
        if (password) e.setInputType(129); else e.setInputType(android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS);
        e.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO); parent.addView(e); return e;
    }
    private void unlock() {
        EditText p = new EditText(this); p.setInputType(129);
        AlertDialog d = new AlertDialog.Builder(this).setTitle("Administrator password").setView(p).setNegativeButton("Cancel", null).setPositiveButton("Unlock", null).create();
        d.setOnShowListener(v -> d.getButton(-1).setOnClickListener(x -> {
            if (SystemClock.elapsedRealtime() < nextAttempt) { p.setError("Wait before trying again"); return; }
            nextAttempt = SystemClock.elapsedRealtime() + 2000;
            String entered = p.getText().toString(); p.setText("");
            new Thread(() -> {
                boolean ok = false;
                try { ok = entered.length() <= 256 && MessageDigest.isEqual(hash(entered, decode(saved.getString("salt"))), decode(saved.getString("hash"))); } catch (Exception ignored) {}
                final boolean success = ok;
                runOnUiThread(() -> { if (success) { d.dismiss(); setup(); } else p.setError("Incorrect password"); });
            }).start();
        })); d.show();
    }
    private CheckBox check(LinearLayout p, String title, boolean checked) { CheckBox c = new CheckBox(this); c.setText(title); c.setChecked(checked); p.addView(c); return c; }
    private void setup() {
        content.removeAllViews(); ScrollView scroll = new ScrollView(this); content.addView(scroll); LinearLayout form = new LinearLayout(this); form.setPadding(24, 16, 24, 16); form.setOrientation(LinearLayout.VERTICAL); scroll.addView(form);
        JSONObject c = saved == null ? new JSONObject() : saved.optJSONObject("config");
        TextView title = new TextView(this); title.setText("HLM Browser setup"); title.setTextSize(24); form.addView(title);
        TextView warning = new TextView(this); warning.setText("Android WebView cannot enforce the origin allowlist for all network channels (including WebSockets). Use managed network controls for strict isolation. Camera and microphone require IT approval, HTTPS and Android permission."); form.addView(warning);
        EditText website = field(form, "Website URL", c.optString("website", ""), false);
        JSONArray a = c.optJSONArray("origins"); StringBuilder rules = new StringBuilder();
        if (a != null) for (int i = 0; i < a.length(); i++) rules.append(a.optString(i)).append('\n');
        EditText origins = field(form, "Approved origins (one per line)", rules.toString(), false); origins.setMinLines(3);
        CheckBox http = check(form, "Allow HTTP for trusted internal/development sites", c.optBoolean("allowHttp", false));
        CheckBox fullscreen = check(form, "Start full screen", c.optBoolean("fullscreen", false));
        CheckBox auto = check(form, "Open application on launch", c.optBoolean("autoOpen", true));
        CheckBox camera = check(form, "IT: allow camera on approved HTTPS origins", capability("camera"));
        CheckBox microphone = check(form, "IT: allow microphone on approved HTTPS origins", capability("microphone"));
        CheckBox popup = check(form, "IT: allow sign-in/application pop-ups on approved origins", capability("popups"));
        CheckBox thirdParty = check(form, "IT: allow third-party cookies for approved embedded authentication", capability("thirdPartyCookies"));
        EditText password = saved == null ? field(form, "Create administrator password (12–256 characters)", "", true) : null;
        TextView error = new TextView(this); error.setTextColor(Color.RED); form.addView(error);
        button(form, "Save and open", () -> {
            try {
                Policy next = new Policy(website.getText().toString(), origins.getText().toString().split("\\r?\\n"), http.isChecked());
                String pass = password == null ? null : password.getText().toString();
                if (pass != null && (pass.length() < 12 || pass.length() > 256)) throw new Exception("Use a password of 12–256 characters");
                Runnable save = () -> {
                    try {
                        JSONObject conf = new JSONObject(); conf.put("website", next.website); JSONArray approved = new JSONArray(); for (String line : origins.getText().toString().split("\\r?\\n")) if (!line.trim().isEmpty()) approved.put(line.trim()); conf.put("origins", approved); conf.put("allowHttp", http.isChecked()); conf.put("fullscreen", fullscreen.isChecked()); conf.put("autoOpen", auto.isChecked()); conf.put("version", 1);
                        JSONObject caps = new JSONObject(); caps.put("camera", camera.isChecked()); caps.put("microphone", microphone.isChecked()); caps.put("popups", popup.isChecked()); caps.put("thirdPartyCookies", thirdParty.isChecked()); conf.put("capabilities", caps);
                        JSONObject record = new JSONObject(); record.put("config", conf);
                        if (saved == null) { byte[] salt = new byte[16]; new SecureRandom().nextBytes(salt); record.put("salt", encode(salt)); record.put("hash", encode(hash(pass, salt))); }
                        else { record.put("salt", saved.getString("salt")); record.put("hash", saved.getString("hash")); }
                        FileOutputStream stream = null;
                        try { stream = settings.startWrite(); stream.write(record.toString().getBytes(StandardCharsets.UTF_8)); settings.finishWrite(stream); }
                        catch (Exception e) { if (stream != null) settings.failWrite(stream); throw e; }
                        boolean changed = saved != null && !saved.getJSONObject("config").toString().equals(conf.toString());
                        cancelMedia(); closePopups();
                        if (web != null) { web.stopLoading(); web.destroy(); web = null; }
                        saved = record; policy = next; fullscreen(fullscreen.isChecked());
                        if (changed) { WebStorage.getInstance().deleteAllData(); CookieManager.getInstance().removeAllCookies(removed -> { CookieManager.getInstance().flush(); open(); }); }
                        else open();
                    } catch (Exception e) { error.setText("Could not save settings: " + e.getMessage()); }
                };
                if (saved == null) save.run(); else new AlertDialog.Builder(this).setTitle("Replace settings?").setMessage(next.website).setNegativeButton("Cancel", null).setPositiveButton("Replace", (d, n) -> save.run()).show();
            } catch (Exception e) { error.setText(e.getMessage()); }
        });
        if (saved != null) button(form, "Cancel", this::open);
    }
    private WebResourceResponse blockedResponse() { return new WebResourceResponse("text/plain", "utf-8", 403, "Blocked by HLM policy", java.util.Collections.emptyMap(), new ByteArrayInputStream(new byte[0])); }
    private void cancelMedia() {
        PermissionRequest request = pendingMedia; pendingMedia = null; mediaView = null; mediaPolicy = null; mediaDocument = null;
        AlertDialog prompt = mediaPrompt; mediaPrompt = null; if (prompt != null) prompt.dismiss();
        if (request != null) { try { request.deny(); } catch (Exception ignored) {} }
    }
    private boolean mediaStillAllowed() {
        if (pendingMedia == null || policy == null || mediaPolicy != policy || mediaView == null || mediaDocument == null || !java.util.Objects.equals(mediaDocument, mediaView.getUrl()) || !mediaDocument.startsWith("https:") || !policy.allows(mediaDocument)) return false;
        String[] resources = pendingMedia.getResources(); String[] kinds = new String[resources.length];
        for (int i = 0; i < resources.length; i++) {
            if (resources[i].equals(PermissionRequest.RESOURCE_VIDEO_CAPTURE)) kinds[i] = "video";
            else if (resources[i].equals(PermissionRequest.RESOURCE_AUDIO_CAPTURE)) kinds[i] = "audio";
            else return false;
        }
        return policy.mediaAllowed(pendingMedia.getOrigin().toString(), kinds, capability("camera"), capability("microphone"));
    }
    private void grantMedia() {
        if (!mediaStillAllowed()) { cancelMedia(); return; }
        for (String resource : pendingMedia.getResources()) {
            String permission = resource.equals(PermissionRequest.RESOURCE_VIDEO_CAPTURE) ? android.Manifest.permission.CAMERA : android.Manifest.permission.RECORD_AUDIO;
            if (checkSelfPermission(permission) != android.content.pm.PackageManager.PERMISSION_GRANTED) { cancelMedia(); return; }
        }
        PermissionRequest request = pendingMedia; pendingMedia = null; mediaView = null; mediaPolicy = null; mediaDocument = null;
        request.grant(request.getResources());
    }
    private void requestMedia(WebView browser, PermissionRequest request) {
        if (pendingMedia != null) { request.deny(); return; }
        pendingMedia = request; mediaPolicy = policy; mediaView = browser; mediaDocument = browser.getUrl();
        if (!mediaStillAllowed()) { cancelMedia(); return; }
        mediaPrompt = new AlertDialog.Builder(this).setTitle("Application camera / microphone access")
            .setMessage(request.getOrigin().toString() + " requests " + java.util.Arrays.toString(request.getResources()) + ". Allow this request?")
            .setNegativeButton("Deny", (d, n) -> cancelMedia()).setOnCancelListener(d -> cancelMedia())
            .setPositiveButton("Continue", (d, n) -> {
                mediaPrompt = null;
                if (!mediaStillAllowed()) { cancelMedia(); return; }
                java.util.ArrayList<String> missing = new java.util.ArrayList<>();
                for (String resource : request.getResources()) {
                    String permission = resource.equals(PermissionRequest.RESOURCE_VIDEO_CAPTURE) ? android.Manifest.permission.CAMERA : android.Manifest.permission.RECORD_AUDIO;
                    if (checkSelfPermission(permission) != android.content.pm.PackageManager.PERMISSION_GRANTED && !missing.contains(permission)) missing.add(permission);
                }
                if (missing.isEmpty()) grantMedia(); else requestPermissions(missing.toArray(new String[0]), MEDIA_PERMISSIONS);
            }).create(); mediaPrompt.show();
    }
    @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grants) {
        super.onRequestPermissionsResult(requestCode, permissions, grants);
        if (requestCode == MEDIA_PERMISSIONS) grantMedia();
    }
    private void closePopups() { for (Dialog dialog : new java.util.ArrayList<>(popups.values())) dialog.dismiss(); }
    private boolean createPopup(WebView opener, android.os.Message message) {
        if (!capability("popups") || popups.size() >= 5 || policy == null || !policy.allows(opener.getUrl())) { status.setText("Pop-up blocked by IT policy"); return false; }
        WebView child = new WebView(this); configureWeb(child);
        Dialog dialog = new Dialog(this); LinearLayout layout = new LinearLayout(this); layout.setOrientation(LinearLayout.VERTICAL);
        button(layout, "Close application window", dialog::dismiss);
        button(layout, "Print", () -> ((android.print.PrintManager)getSystemService(PRINT_SERVICE)).print("HLM document", child.createPrintDocumentAdapter("HLM document"), null));
        layout.addView(child, new LinearLayout.LayoutParams(-1, 0, 1)); dialog.setContentView(layout);
        popups.put(child, dialog);
        dialog.setOnDismissListener(d -> { popups.remove(child); if (mediaView == child) cancelMedia(); child.stopLoading(); child.destroy(); });
        dialog.show(); dialog.getWindow().setLayout(-1, -1);
        ((WebView.WebViewTransport)message.obj).setWebView(child); message.sendToTarget(); return true;
    }
    private void pageError(WebView browser, String detail) {
        if (browser == web) unavailable(detail);
        else { status.setText(detail); Dialog dialog = popups.get(browser); if (dialog != null) dialog.dismiss(); }
    }
    private void configureWeb(WebView browser) {
            WebSettings s = browser.getSettings(); s.setJavaScriptEnabled(true); s.setDomStorageEnabled(true); s.setAllowFileAccess(false); s.setAllowContentAccess(false); s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW); s.setSupportMultipleWindows(true); s.setJavaScriptCanOpenWindowsAutomatically(capability("popups")); s.setSafeBrowsingEnabled(true); s.setMediaPlaybackRequiresUserGesture(true);
            CookieManager.getInstance().setAcceptCookie(true); CookieManager.getInstance().setAcceptThirdPartyCookies(browser, capability("thirdPartyCookies"));
            ServiceWorkerController.getInstance().setServiceWorkerClient(new ServiceWorkerClient() {
                @Override public WebResourceResponse shouldInterceptRequest(WebResourceRequest r) { return policy != null && policy.allows(r.getUrl().toString()) ? null : blockedResponse(); }
            });
            browser.setWebViewClient(new WebViewClient() {
                @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) { boolean denied = !(policy.allows(r.getUrl().toString()) || (browser != web && r.getUrl().toString().equals("about:blank"))); if (denied) status.setText("Unapproved destination blocked"); return denied; }
                @Override public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) { return policy != null && policy.allows(r.getUrl().toString()) ? null : blockedResponse(); }
                @Override public void onPageStarted(WebView v, String url, android.graphics.Bitmap icon) { status.setText("Loading…"); if (!policy.allows(url) && !(browser != web && url.equals("about:blank"))) { v.stopLoading(); pageError(browser, "Unapproved navigation blocked"); } }
                @Override public void onPageFinished(WebView v, String url) { status.setText(""); CookieManager.getInstance().flush(); }
                @Override public void onReceivedError(WebView v, WebResourceRequest r, WebResourceError e) { if (r.isForMainFrame()) pageError(browser, "Check your connection and configured URL, then retry."); }
                @Override public void onReceivedHttpError(WebView v, WebResourceRequest r, WebResourceResponse response) { if (r.isForMainFrame() && response.getStatusCode() >= 400) pageError(browser, "The server returned HTTP " + response.getStatusCode()); }
                @Override public void onReceivedSslError(WebView v, SslErrorHandler handler, SslError error) { handler.cancel(); pageError(browser, "The server certificate could not be verified. Contact your administrator."); }
            });
            browser.setWebChromeClient(new WebChromeClient() {
                @Override public void onPermissionRequest(PermissionRequest r) { requestMedia(browser, r); }
                @Override public void onPermissionRequestCanceled(PermissionRequest r) { if (pendingMedia == r) cancelMedia(); }
                @Override public void onCloseWindow(WebView closed) { Dialog dialog = popups.get(closed); if (dialog != null) dialog.dismiss(); }
                @Override public boolean onCreateWindow(WebView v, boolean dialog, boolean gesture, android.os.Message message) { return createPopup(browser, message); }
                @Override public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> callback, FileChooserParams params) {
                    if (fileCallback != null) fileCallback.onReceiveValue(null); fileCallback = callback;
                    Intent pick = new Intent(Intent.ACTION_OPEN_DOCUMENT); pick.addCategory(Intent.CATEGORY_OPENABLE); pick.setType("*/*"); pick.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE);
                    try { startActivityForResult(pick, PICK_FILE); return true; } catch (Exception e) { fileCallback = null; return false; }
                }
            });
            browser.setDownloadListener((url, agent, disposition, mime, size) -> {
                if (!policy.allows(url)) { status.setText("Unapproved download blocked"); return; }
                downloadUrl = url; downloadAgent = agent; downloadPolicy = policy;
                String filename = URLUtil.guessFileName(url, disposition, mime).replaceAll("[\\\\/:*?\"<>|]", "_");
                Intent create = new Intent(Intent.ACTION_CREATE_DOCUMENT); create.addCategory(Intent.CATEGORY_OPENABLE); create.setType(mime == null || !mime.contains("/") ? "application/octet-stream" : mime); create.putExtra(Intent.EXTRA_TITLE, filename);
                try { startActivityForResult(create, SAVE_DOWNLOAD); } catch (Exception e) { status.setText("No document provider is available"); }
            });
    }
    private void open() {
        if (policy == null) return;
        if (web == null) { web = new WebView(this); configureWeb(web); }
        content.removeAllViews(); content.addView(web, new LinearLayout.LayoutParams(-1, -1)); web.loadUrl(policy.website);
    }
    private void unavailable(String detail) { runOnUiThread(() -> message("Application unavailable", detail, "Retry", this::open)); }
    private void download(String original, String agent, Policy expected, Uri target) {
        new Thread(() -> {
            java.net.HttpURLConnection connection = null;
            try {
                String url = original;
                for (int redirects = 0; ; redirects++) {
                    if (redirects > 10 || policy != expected || !expected.allows(url)) throw new IOException("Download destination is no longer approved");
                    connection = (java.net.HttpURLConnection)new java.net.URL(url).openConnection();
                    connection.setInstanceFollowRedirects(false); connection.setConnectTimeout(20000); connection.setReadTimeout(30000);
                    connection.setRequestProperty("User-Agent", agent);
                    String cookie = CookieManager.getInstance().getCookie(url); if (cookie != null) connection.setRequestProperty("Cookie", cookie);
                    int code = connection.getResponseCode();
                    if (code >= 300 && code < 400) {
                        String location = connection.getHeaderField("Location"); if (location == null) throw new IOException("Invalid redirect");
                        url = new java.net.URL(new java.net.URL(url), location).toString(); connection.disconnect(); continue;
                    }
                    if (code < 200 || code >= 300) throw new IOException("HTTP " + code);
                    try (InputStream input = connection.getInputStream(); OutputStream output = getContentResolver().openOutputStream(target, "w")) {
                        if (output == null) throw new IOException("Cannot open the selected document");
                        byte[] buffer = new byte[32768]; int count;
                        while ((count = input.read(buffer)) != -1) { if (policy != expected || isFinishing()) throw new IOException("Download canceled"); output.write(buffer, 0, count); }
                    }
                    runOnUiThread(() -> status.setText("Download saved")); return;
                }
            } catch (Exception e) {
                try { android.provider.DocumentsContract.deleteDocument(getContentResolver(), target); } catch (Exception ignored) {}
                runOnUiThread(() -> status.setText("Download failed: " + e.getMessage()));
            } finally { if (connection != null) connection.disconnect(); }
        }).start();
    }
    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request == SAVE_DOWNLOAD) {
            if (result == RESULT_OK && data != null && data.getData() != null && downloadUrl != null) download(downloadUrl, downloadAgent, downloadPolicy, data.getData());
            downloadUrl = null; downloadAgent = null; downloadPolicy = null;
        }
        if (request == PICK_FILE && fileCallback != null) {
            Uri[] uris = null;
            if (result == RESULT_OK && data != null) {
                if (data.getClipData() != null) { int count = data.getClipData().getItemCount(); uris = new Uri[count]; for (int i = 0; i < count; i++) uris[i] = data.getClipData().getItemAt(i).getUri(); }
                else if (data.getData() != null) uris = new Uri[]{data.getData()};
            }
            fileCallback.onReceiveValue(uris); fileCallback = null;
        }
    }
    @Override public void onBackPressed() { new AlertDialog.Builder(this).setTitle("Exit HLM Browser?").setNegativeButton("Stay", null).setPositiveButton("Exit", (d, n) -> finish()).show(); }
    @Override protected void onPause() { if (web != null) web.onPause(); for (WebView popup : popups.keySet()) popup.onPause(); CookieManager.getInstance().flush(); super.onPause(); }
    @Override protected void onResume() { super.onResume(); if (web != null) web.onResume(); for (WebView popup : popups.keySet()) popup.onResume(); }
    @Override protected void onDestroy() { cancelMedia(); closePopups(); if (fileCallback != null) fileCallback.onReceiveValue(null); if (web != null) { web.stopLoading(); web.destroy(); } super.onDestroy(); }
}
