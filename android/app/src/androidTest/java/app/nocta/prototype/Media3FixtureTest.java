package app.nocta.prototype;
import android.content.Context;
import android.os.SystemClock;
import androidx.media3.common.MediaItem;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;
@RunWith(AndroidJUnit4.class)
public class Media3FixtureTest {
 private void verify(String file,String mime) {
  ExoPlayer[] player=new ExoPlayer[1];long[] position=new long[1];
  android.app.Instrumentation instrumentation=InstrumentationRegistry.getInstrumentation();Context context=instrumentation.getTargetContext();
  instrumentation.runOnMainSync(()->{player[0]=new ExoPlayer.Builder(context).build();player[0].setMediaItem(new MediaItem.Builder().setUri("asset:///native-fixtures/"+file).setMimeType(mime.equals("application/vnd.apple.mpegurl")?androidx.media3.common.MimeTypes.APPLICATION_M3U8:mime).build());player[0].prepare();player[0].play();});
  try {for(int attempt=0;attempt<40;attempt++){SystemClock.sleep(500);instrumentation.runOnMainSync(()->position[0]=player[0].getCurrentPosition());if(position[0]>2000)break;}assertTrue("Media3 must advance past two seconds",position[0]>2000);instrumentation.runOnMainSync(()->assertNull(player[0].getPlayerError()));}
  finally {instrumentation.runOnMainSync(()->player[0].release());}
 }
 @Test public void mp4ControlledPlayback(){verify("sample.mp4","video/mp4");}
 @Test public void hlsControlledPlayback(){verify("master.m3u8","application/vnd.apple.mpegurl");}
}
