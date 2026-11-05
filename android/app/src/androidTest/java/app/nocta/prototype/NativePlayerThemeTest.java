package app.nocta.prototype;

import android.content.Context;
import android.view.ContextThemeWrapper;
import android.view.View;
import android.graphics.drawable.Drawable;
import androidx.media3.ui.PlayerView;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class NativePlayerThemeTest {
 @Test public void fullSizeOverlaysMustNotCoverVideo() {
  InstrumentationRegistry.getInstrumentation().runOnMainSync(()->{
   Context context=new ContextThemeWrapper(InstrumentationRegistry.getInstrumentation().getTargetContext(),R.style.NoctaNativePlayerTheme);
   PlayerView view=new PlayerView(context);
   for(int id:new int[]{androidx.media3.ui.R.id.exo_overlay,androidx.media3.ui.R.id.exo_ad_overlay,androidx.media3.ui.R.id.exo_content_frame}){
    View overlay=view.findViewById(id);assertNotNull(overlay);
    Drawable background=overlay.getBackground();
    assertTrue("PlayerView layers must be transparent above video",background==null||background.getOpacity()==android.graphics.PixelFormat.TRANSPARENT);
   }
  });
 }
}
