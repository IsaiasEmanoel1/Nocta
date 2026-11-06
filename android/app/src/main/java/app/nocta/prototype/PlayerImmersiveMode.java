package app.nocta.prototype;

import android.os.Build;
import android.view.Window;
import android.view.WindowManager;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

/** Owns the temporary system bar and cutout policy of one fullscreen player. */
final class PlayerImmersiveMode {
    private static final int STATUS = WindowInsetsCompat.Type.statusBars();
    private static final int NAVIGATION = WindowInsetsCompat.Type.navigationBars();
    private final Window window;
    private final WindowInsetsControllerCompat controller;
    private final int previousBehavior;
    private final int visibleBars;
    private final int previousCutoutMode;

    PlayerImmersiveMode(Window window) {
        this.window = window;
        controller = WindowCompat.getInsetsController(window, window.getDecorView());
        previousBehavior = controller.getSystemBarsBehavior();
        WindowInsetsCompat insets = ViewCompat.getRootWindowInsets(window.getDecorView());
        visibleBars = insets == null ? STATUS | NAVIGATION :
                (insets.isVisible(STATUS) ? STATUS : 0) | (insets.isVisible(NAVIGATION) ? NAVIGATION : 0);
        if (Build.VERSION.SDK_INT >= 28) {
            WindowManager.LayoutParams params = window.getAttributes();
            previousCutoutMode = params.layoutInDisplayCutoutMode;
            params.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            window.setAttributes(params);
        } else {
            previousCutoutMode = 0;
        }
        controller.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        controller.hide(STATUS | NAVIGATION);
    }

    void restore() {
        if (Build.VERSION.SDK_INT >= 28) {
            WindowManager.LayoutParams params = window.getAttributes();
            params.layoutInDisplayCutoutMode = previousCutoutMode;
            window.setAttributes(params);
        }
        controller.setSystemBarsBehavior(previousBehavior);
        if (visibleBars != 0) controller.show(visibleBars);
        int hiddenBars = (STATUS | NAVIGATION) & ~visibleBars;
        if (hiddenBars != 0) controller.hide(hiddenBars);
    }
}
