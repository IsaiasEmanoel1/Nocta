package app.nocta.prototype;

import android.graphics.Color;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebChromeClient;
import android.widget.FrameLayout;
import androidx.activity.OnBackPressedCallback;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;

public class MainActivity extends BridgeActivity {
    private FrameLayout fullscreen;
    private WebChromeClient.CustomViewCallback fullscreenCallback;
    private OnBackPressedCallback fullscreenBack;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(NoctaNativePlayerPlugin.class);
        super.onCreate(savedInstanceState);
        getWindow().getDecorView().setBackgroundColor(Color.rgb(7, 11, 20));
        fullscreenBack = new OnBackPressedCallback(false) {
            @Override public void handleOnBackPressed() { closeFullscreen(); }
        };
        getOnBackPressedDispatcher().addCallback(this, fullscreenBack);
        bridge.getWebView().setWebChromeClient(new BridgeWebChromeClient(bridge) {
            @Override public void onShowCustomView(View view, CustomViewCallback callback) {
                if (fullscreen != null) { callback.onCustomViewHidden(); return; }
                fullscreenCallback = callback;
                fullscreen = new FrameLayout(MainActivity.this);
                fullscreen.setBackgroundColor(Color.BLACK);
                fullscreen.addView(view, new FrameLayout.LayoutParams(-1, -1));
                ViewCompat.setOnApplyWindowInsetsListener(fullscreen, (v, insets) -> {
                    Insets safe = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
                    v.setPadding(safe.left, safe.top, safe.right, safe.bottom);
                    return insets;
                });
                ((ViewGroup) getWindow().getDecorView()).addView(fullscreen, new ViewGroup.LayoutParams(-1, -1));
                ViewCompat.requestApplyInsets(fullscreen);
                bridge.getWebView().setVisibility(View.INVISIBLE);
                fullscreenBack.setEnabled(true);
            }
            @Override public void onHideCustomView() { closeFullscreen(); }
        });
    }

    private void closeFullscreen() {
        if (fullscreen == null) return;
        ((ViewGroup) fullscreen.getParent()).removeView(fullscreen);
        fullscreen = null;
        bridge.getWebView().setVisibility(View.VISIBLE);
        fullscreenBack.setEnabled(false);
        WebChromeClient.CustomViewCallback callback = fullscreenCallback;
        fullscreenCallback = null;
        if (callback != null) callback.onCustomViewHidden();
    }
}
