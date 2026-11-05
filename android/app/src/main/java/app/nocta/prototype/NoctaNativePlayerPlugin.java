package app.nocta.prototype;

import android.app.Dialog;
import android.view.ContextThemeWrapper;
import android.content.Context;
import androidx.activity.OnBackPressedCallback;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Button;
import android.view.Gravity;
import android.content.pm.ActivityInfo;
import android.graphics.Bitmap;
import android.graphics.Rect;
import android.view.PixelCopy;
import android.view.View;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.util.Log;
import android.view.SurfaceHolder;
import android.view.SurfaceView;
import android.view.ViewGroup;
import androidx.media3.common.*;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.DecoderReuseEvaluation;
import androidx.media3.exoplayer.hls.HlsMediaSource;
import androidx.media3.exoplayer.analytics.AnalyticsListener;
import androidx.media3.exoplayer.source.*;
import androidx.media3.datasource.DefaultDataSource;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.datasource.HttpDataSource;
import androidx.media3.datasource.TransferListener;
import androidx.media3.datasource.DataSource;
import androidx.media3.datasource.DataSpec;
import androidx.media3.exoplayer.DecoderCounters;
import java.util.concurrent.atomic.AtomicLong;
import androidx.media3.ui.PlayerView;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.IOException;
import java.util.*;

@CapacitorPlugin(name="NoctaNativePlayer")
public class NoctaNativePlayerPlugin extends Plugin {
 private final Handler handler=new Handler(Looper.getMainLooper());
 private Run active;
 private static final Set<String> HOSTS=new HashSet<>(Arrays.asList("fenixflix.fenixhub.online","cdn-sv01.maximaimg.online","zunderflix.lat","sa-east-1.v-net.work","us-east-2.vy-userfiles.cloud","us-central-1.v-net.work","magikarp.south-america.workers.dev","zeus-br.shardweb.app","brazuca-play-stremio.vercel.app","nsrv.classotaku.app"));
 private static final String MALFOY="animezey16082023.animezey16082023.workers.dev";
 private static final long STARTUP_TIMEOUT_MS=45000;
 // Every callback owns its original Run; released callbacks cannot mutate a replacement player.
 private static class Run {
  ExoPlayer player; Dialog dialog; PlayerView view; Runnable ticker; Button nextButton; TextView slowNotice; FrameLayout root; OnBackPressedCallback backCallback; boolean inline,fullscreen,viewportVisible=true; JSObject bounds; boolean nextAvailable; int initialOrientation; long stallMs; double nextThreshold=35;
  final String sessionId,sourceId,fingerprint,mime; final long started=SystemClock.elapsedRealtime();
  boolean video,audio,released,terminal; long previousPosition,waitMs,lastTick=started;
  final AtomicLong bytesRead=new AtomicLong(); long bytes; int loadStarts,loadCompletions,loadErrors; String surface="not-created";
  Run(PluginCall call,String mime){sessionId=safeId(call.getString("sessionId",""));sourceId=safeId(call.getString("sourceId",""));fingerprint=safeId(call.getString("inputFingerprint",""));this.mime=mime;inline=Boolean.TRUE.equals(call.getBoolean("inline",false));bounds=call.getObject("bounds",new JSObject());nextAvailable=Boolean.TRUE.equals(call.getBoolean("nextAvailable",false));Double threshold=call.getDouble("nextPromptSeconds",35.0);if(threshold!=null&&Double.isFinite(threshold)&&threshold>0)nextThreshold=threshold;}
 }
 private static String safeId(String value){return value!=null&&value.matches("[A-Za-z0-9:._-]{0,120}")?value:"invalid-id";}
 private static String state(int value){switch(value){case Player.STATE_BUFFERING:return "BUFFERING";case Player.STATE_READY:return "READY";case Player.STATE_ENDED:return "ENDED";default:return "IDLE";}}
 private JSObject snapshot(Run run,String event,String detail){
  JSObject value=new JSObject();value.put("event",event);value.put("sessionId",run.sessionId);value.put("sourceId",run.sourceId);value.put("inputFingerprint",run.fingerprint);value.put("mimeType",run.mime);value.put("elapsedMs",SystemClock.elapsedRealtime()-run.started);
  value.put("inline",run.inline);value.put("fullscreen",run.fullscreen);value.put("viewportVisible",run.viewportVisible);value.put("rootAlpha",run.root==null?-1:run.root.getAlpha());value.put("stale",active!=run||run.released);value.put("videoRendered",run.video);value.put("audioAdvancing",run.audio);value.put("surface",run.surface);value.put("nextVisible",run.nextButton!=null&&run.nextButton.getVisibility()==View.VISIBLE);
  value.put("bytesRead",run.bytesRead.get());value.put("bytesCompleted",run.bytes);value.put("loadStarts",run.loadStarts);value.put("loadCompletions",run.loadCompletions);value.put("loadErrors",run.loadErrors);
  if(!run.released&&run.player!=null){ExoPlayer p=run.player;if(p.getDuration()>0)value.put("durationSeconds",p.getDuration()/1000.0);value.put("state",state(p.getPlaybackState()));value.put("playWhenReady",p.getPlayWhenReady());value.put("isPlaying",p.isPlaying());value.put("isLoading",p.isLoading());value.put("positionSeconds",p.getCurrentPosition()/1000.0);value.put("bufferedSeconds",p.getBufferedPosition()/1000.0);value.put("suppressionReason",p.getPlaybackSuppressionReason());value.put("surfaceAttached",run.view!=null&&run.view.getPlayer()==p&&run.view.isAttachedToWindow());
   DecoderCounters counters=p.getVideoDecoderCounters();if(counters!=null){counters.ensureUpdated();value.put("videoQueued",counters.queuedInputBufferCount);value.put("videoRenderedBuffers",counters.renderedOutputBufferCount);value.put("videoDropped",counters.droppedBufferCount);value.put("videoSkipped",counters.skippedOutputBufferCount);}
   if(run.view!=null){View surface=run.view.getVideoSurfaceView();View shutter=run.view.findViewById(androidx.media3.ui.R.id.exo_shutter);Rect bounds=new Rect();if(surface!=null){value.put("surfaceShown",surface.isShown());value.put("surfaceAlpha",surface.getAlpha());surface.getGlobalVisibleRect(bounds);value.put("surfaceBounds",bounds.toShortString());}value.put("shutterVisibility",shutter==null?-1:shutter.getVisibility());value.put("viewShown",run.view.isShown());
    View overlay=run.view.findViewById(androidx.media3.ui.R.id.exo_overlay);View adOverlay=run.view.findViewById(androidx.media3.ui.R.id.exo_ad_overlay);value.put("overlayBackground",background(overlay));value.put("adOverlayBackground",background(adOverlay));
   }
  }
  if(detail!=null)value.put("detail",detail);return value;
 }
 private static String background(View view){if(view==null)return "absent";android.graphics.drawable.Drawable bg=view.getBackground();return bg instanceof android.graphics.drawable.ColorDrawable?Integer.toHexString(((android.graphics.drawable.ColorDrawable)bg).getColor()):bg==null?"none":bg.getClass().getSimpleName();}
 private void send(JSObject value){if(BuildConfig.DEBUG)Log.i("NoctaMedia3",value.toString());notifyListeners("nativePlayback",value);}
 private void emit(Run run,String event,String detail){send(snapshot(run,event,detail));}
 private boolean live(Run run){if(active==run&&!run.released&&!run.terminal)return true;emit(run,"diagnostic","ignored-stale-callback");return false;}
 private void format(Run run,String kind,Format f){if(!live(run))return;JSObject value=snapshot(run,"diagnostic",kind);value.put("sampleMimeType",f.sampleMimeType);value.put("containerMimeType",f.containerMimeType);value.put("codecs",f.codecs);value.put("width",f.width);value.put("height",f.height);value.put("channels",f.channelCount);value.put("sampleRate",f.sampleRate);value.put("language",f.language);send(value);}
 // Never log exception messages/DataSpec/response headers: they may contain signed URLs.
 private void cause(JSObject value,Throwable error){JSArray classes=new JSArray();int count=0;while(error!=null&&count++<6){classes.put(error.getClass().getSimpleName());if(error instanceof HttpDataSource.HttpDataSourceException)value.put("httpOperation",((HttpDataSource.HttpDataSourceException)error).type);if(error instanceof HttpDataSource.InvalidResponseCodeException)value.put("httpStatus",((HttpDataSource.InvalidResponseCodeException)error).responseCode);error=error.getCause();}value.put("causes",classes);}
 private void loadEvent(Run run,String detail,LoadEventInfo info,IOException error){if(!live(run))return;JSObject value=snapshot(run,"diagnostic",detail);value.put("loadTaskId",info.loadTaskId);value.put("bytesLoaded",info.bytesLoaded);value.put("loadDurationMs",info.loadDurationMs);if(error!=null)cause(value,error);send(value);}
 private void release(Run run,String reason){
  if(run==null||run.released)return;emit(run,"closed",reason);run.released=true;if(run.ticker!=null)handler.removeCallbacks(run.ticker);
  if(run.dialog!=null)run.dialog.setOnDismissListener(null);
  if(run.view!=null)run.view.setPlayer(null);
  if(run.backCallback!=null)run.backCallback.remove();if(run.inline&&run.root!=null&&run.root.getParent() instanceof ViewGroup)((ViewGroup)run.root.getParent()).removeView(run.root);
  if(run.player!=null)run.player.release();if(run.dialog!=null)run.dialog.dismiss();if(active==run){active=null;getActivity().setRequestedOrientation(run.initialOrientation);}
 }
 private void fail(Run run,String detail,int code,String category,Throwable error){
  if(!live(run))return;JSObject value=snapshot(run,"failed",detail);if(code>0)value.put("errorCode",code);value.put("category",category);if(error!=null)cause(value,error);send(value);run.terminal=true;release(run,"failure");
 }
 @PluginMethod public void capabilities(PluginCall call){JSObject result=new JSObject();result.put("available",BuildConfig.DEBUG);result.put("playbackAvailable",true);result.put("inlinePlayback",true);result.put("engine","Media3 1.8.0");result.put("verified",false);call.resolve(result);}
 @PluginMethod public void load(PluginCall call){
  String url=call.getString("url","");String mime=call.getString("mimeType","");Uri uri=Uri.parse(url);
  boolean fixture=url.equals("asset:///native-fixtures/sample.mp4")||url.equals("asset:///native-fixtures/master.m3u8");
  if(fixture&&!BuildConfig.DEBUG){call.reject("Fixtures are debug-only");return;}
  if(!fixture&&(!"https".equals(uri.getScheme())||uri.getUserInfo()!=null||(!HOSTS.contains(uri.getHost())&&!MALFOY.equals(uri.getHost())))){call.reject("Native destination not permitted");return;}
  if(!Arrays.asList("video/mp4","video/webm","video/x-matroska","application/vnd.apple.mpegurl").contains(mime)){call.reject("Unsupported or unknown native MIME");return;}
  JSObject supplied=call.getObject("headers",new JSObject());Map<String,String> headers=new HashMap<>();Iterator<String> keys=supplied.keys();
  while(keys.hasNext()){String key=keys.next();String value=supplied.optString(key,"");if(!Arrays.asList("User-Agent","Referer").contains(key)||value.contains("\r")||value.contains("\n")){call.reject("Unsupported native header");return;}headers.put(key,value);}
  getActivity().runOnUiThread(()->{
   release(active,"replaced");final Run run=new Run(call,mime);run.initialOrientation=getActivity().getRequestedOrientation();active=run;
   try{
    DefaultHttpDataSource.Factory http=new DefaultHttpDataSource.Factory().setAllowCrossProtocolRedirects(false).setDefaultRequestProperties(headers).setConnectTimeoutMs(8000).setReadTimeoutMs(8000);
    DefaultDataSource.Factory data=new DefaultDataSource.Factory(getContext(),http).setTransferListener(new TransferListener(){
     public void onTransferInitializing(DataSource source,DataSpec spec,boolean network){}
     public void onTransferStart(DataSource source,DataSpec spec,boolean network){
      JSObject meta=new JSObject();meta.put("readPosition",spec.position);meta.put("readLength",spec.length);
      for(Map.Entry<String,List<String>> entry:source.getResponseHeaders().entrySet()){String key=entry.getKey();if(key!=null&&Arrays.asList("content-length","content-range","content-type").contains(key.toLowerCase(Locale.ROOT))){String value=String.join(",",entry.getValue());if(value.matches("[A-Za-z0-9 /;=+_.:,*-]{0,200}"))meta.put(key.toLowerCase(Locale.ROOT),value);}}
      handler.post(()->{if(live(run)){JSObject event=snapshot(run,"diagnostic","read-start");Iterator<String> fields=meta.keys();while(fields.hasNext()){String key=fields.next();event.put(key,meta.opt(key));}send(event);}});
     }
     public void onBytesTransferred(DataSource source,DataSpec spec,boolean network,int count){run.bytesRead.addAndGet(count);}
     public void onTransferEnd(DataSource source,DataSpec spec,boolean network){handler.post(()->{if(live(run))emit(run,"diagnostic","read-end");});}
    });
    final ExoPlayer player=new ExoPlayer.Builder(getContext()).setSeekBackIncrementMs(10000).setSeekForwardIncrementMs(10000).setMediaSourceFactory(new DefaultMediaSourceFactory(data)).build();run.player=player;
    String language=call.getString("preferredLanguage","");
    if(language.equals("dub"))player.setTrackSelectionParameters(player.getTrackSelectionParameters().buildUpon().setPreferredAudioLanguage("pt").build());
    if(language.equals("sub"))player.setTrackSelectionParameters(player.getTrackSelectionParameters().buildUpon().setPreferredTextLanguage("pt").build());
    player.addAnalyticsListener(new AnalyticsListener(){
     @Override public void onRenderedFirstFrame(EventTime time,Object output,long renderTimeMs){if(live(run)){run.video=true;emit(run,"video",null);handler.postDelayed(()->sampleSurface(run),1000);}}
     @Override public void onAudioPositionAdvancing(EventTime time,long startTimeMs){if(live(run)){run.audio=true;emit(run,"audio",null);}}
     @Override public void onVideoInputFormatChanged(EventTime time,Format f,DecoderReuseEvaluation reuse){format(run,"video-input",f);}
     @Override public void onAudioInputFormatChanged(EventTime time,Format f,DecoderReuseEvaluation reuse){format(run,"audio-input",f);}
     @Override public void onVideoDecoderInitialized(EventTime time,String name,long at,long duration){if(live(run))emit(run,"diagnostic","video-decoder:"+name);}
     @Override public void onAudioDecoderInitialized(EventTime time,String name,long at,long duration){if(live(run))emit(run,"diagnostic","audio-decoder:"+name);}
     @Override public void onLoadStarted(EventTime time,LoadEventInfo info,MediaLoadData data){run.loadStarts++;loadEvent(run,"load-started",info,null);}
     @Override public void onLoadCompleted(EventTime time,LoadEventInfo info,MediaLoadData data){run.loadCompletions++;run.bytes+=info.bytesLoaded;loadEvent(run,"load-completed",info,null);}
     @Override public void onLoadCanceled(EventTime time,LoadEventInfo info,MediaLoadData data){loadEvent(run,"load-canceled",info,null);}
     @Override public void onLoadError(EventTime time,LoadEventInfo info,MediaLoadData data,IOException error,boolean canceled){run.loadErrors++;loadEvent(run,canceled?"load-error-canceled":"load-error-retryable",info,error);}
    });
    player.addListener(new Player.Listener(){
     @Override public void onPlaybackStateChanged(int value){if(live(run))emit(run,value==Player.STATE_READY?"loaded":value==Player.STATE_ENDED?"ended":"diagnostic","state:"+state(value));}
     @Override public void onPlayWhenReadyChanged(boolean value,int reason){if(live(run))emit(run,"diagnostic","playWhenReady:"+reason);}
     @Override public void onIsPlayingChanged(boolean value){if(live(run))emit(run,"diagnostic","isPlaying");}
     @Override public void onIsLoadingChanged(boolean value){if(live(run))emit(run,"diagnostic","isLoading");}
     @Override public void onTracksChanged(Tracks tracks){if(!live(run))return;JSArray available=new JSArray();for(Tracks.Group group:tracks.getGroups())if(group.getType()==C.TRACK_TYPE_AUDIO||group.getType()==C.TRACK_TYPE_TEXT)for(int i=0;i<group.length;i++){JSObject entry=new JSObject();entry.put("type",group.getType()==C.TRACK_TYPE_AUDIO?"audio":"text");entry.put("language",group.getTrackFormat(i).language);entry.put("supported",group.isTrackSupported(i));entry.put("selected",group.isTrackSelected(i));available.put(entry);}JSObject trackEvent=snapshot(run,"diagnostic","available-tracks");trackEvent.put("tracks",available);send(trackEvent);for(Tracks.Group group:tracks.getGroups())for(int i=0;i<group.length;i++)if(group.isTrackSelected(i))format(run,"selected-track",group.getTrackFormat(i));}
     @Override public void onPlayerError(PlaybackException error){int code=error.errorCode;fail(run,error.getErrorCodeName(),code,code>=6000?"protection":code>=5000?"audio":code>=4000?"codec":code>=3000?"format":code>=2000?"network":"initialization",error);}
    });
    Context playerContext;
    if(run.inline)playerContext=new ContextThemeWrapper(getActivity(),R.style.NoctaNativePlayerTheme);else{run.dialog=new Dialog(getActivity(),R.style.NoctaNativePlayerTheme);playerContext=run.dialog.getContext();}
    run.view=new PlayerView(playerContext);run.view.setPlayer(player);run.view.setControllerShowTimeoutMs(3000);run.view.setShowSubtitleButton(true);
    run.view.setShowBuffering(PlayerView.SHOW_BUFFERING_WHEN_PLAYING);run.view.setFullscreenButtonClickListener(fullscreen->setFullscreen(run,fullscreen));
    if(run.view.getVideoSurfaceView() instanceof SurfaceView){SurfaceView surface=(SurfaceView)run.view.getVideoSurfaceView();surface.getHolder().addCallback(new SurfaceHolder.Callback(){
     public void surfaceCreated(SurfaceHolder holder){run.surface="created:"+holder.getSurface().isValid();emit(run,"diagnostic","surface-created");}
     public void surfaceChanged(SurfaceHolder holder,int format,int width,int height){run.surface="valid="+holder.getSurface().isValid()+":"+width+"x"+height;emit(run,"diagnostic","surface-changed");}
     public void surfaceDestroyed(SurfaceHolder holder){run.surface="destroyed";emit(run,"diagnostic","surface-destroyed");}
    });}
    FrameLayout root=new FrameLayout(playerContext){@Override public boolean dispatchTouchEvent(android.view.MotionEvent event){Rect clip=getClipBounds();if(event.getActionMasked()==android.view.MotionEvent.ACTION_DOWN&&clip!=null&&!clip.contains((int)event.getX(),(int)event.getY()))return false;return super.dispatchTouchEvent(event);}};run.root=root;if(run.inline)root.setAlpha(0f);
    ViewCompat.setOnApplyWindowInsetsListener(root,(view,insets)->{Insets safe=run.inline&&!run.fullscreen?Insets.NONE:insets.getInsets(WindowInsetsCompat.Type.systemBars()|WindowInsetsCompat.Type.displayCutout());view.setPadding(safe.left,safe.top,safe.right,safe.bottom);return insets;});
    root.setBackgroundColor(android.graphics.Color.BLACK);root.addView(run.view,new FrameLayout.LayoutParams(-1,-1));
    LinearLayout heading=new LinearLayout(playerContext);heading.setGravity(Gravity.CENTER_VERTICAL);int touch=(int)(44*getContext().getResources().getDisplayMetrics().density);heading.setPadding(8,4,8,0);
    TextView back=new TextView(playerContext);back.setText("‹");back.setTextColor(android.graphics.Color.WHITE);back.setTextSize(32);back.setGravity(Gravity.CENTER);back.setContentDescription("Voltar à lista de fontes");back.setOnClickListener(v->{if(live(run)){emit(run,"sources",null);release(run,"user-sources");}});heading.addView(back,new LinearLayout.LayoutParams(touch,touch));
    TextView title=new TextView(playerContext);String caption=call.getString("title","");title.setText(caption.length()>180?caption.substring(0,180):caption);title.setTextColor(android.graphics.Color.WHITE);title.setTextSize(16);title.setMaxLines(1);title.setEllipsize(android.text.TextUtils.TruncateAt.END);heading.addView(title,new LinearLayout.LayoutParams(0,-2,1));
    TextView sources=new TextView(playerContext);sources.setText("Servidores");sources.setTextColor(android.graphics.Color.WHITE);sources.setTextSize(12);sources.setPadding(12,0,12,0);sources.setGravity(Gravity.CENTER);sources.setContentDescription("Trocar servidor");sources.setOnClickListener(v->{if(live(run)){emit(run,"sources",null);release(run,"user-sources");}});heading.addView(sources,new LinearLayout.LayoutParams(-2,touch));
    TextView volume=new TextView(playerContext);volume.setText("♫");volume.setTextColor(android.graphics.Color.WHITE);volume.setTextSize(20);volume.setGravity(Gravity.CENTER);volume.setContentDescription("Silenciar áudio");volume.setOnClickListener(v->{if(live(run)){boolean muted=player.getVolume()>0;player.setVolume(muted?0f:1f);volume.setText(muted?"×":"♫");volume.setContentDescription(muted?"Ativar áudio":"Silenciar áudio");}});heading.addView(volume,new LinearLayout.LayoutParams(touch,touch));
    root.addView(heading,new FrameLayout.LayoutParams(-1,-2,Gravity.TOP));
    run.slowNotice=new TextView(playerContext);run.slowNotice.setText("A conexão está lenta. Aguarde mais alguns segundos...");run.slowNotice.setTextColor(android.graphics.Color.WHITE);run.slowNotice.setTextSize(12);run.slowNotice.setGravity(Gravity.CENTER);run.slowNotice.setBackgroundColor(0xB3070D18);run.slowNotice.setPadding(12,8,12,8);run.slowNotice.setVisibility(View.GONE);root.addView(run.slowNotice,new FrameLayout.LayoutParams(-1,-2,Gravity.CENTER));
    run.view.setControllerVisibilityListener((PlayerView.ControllerVisibilityListener)visibility->heading.setVisibility(visibility));
    run.nextButton=new Button(playerContext);run.nextButton.setText("Próximo episódio");run.nextButton.setVisibility(View.GONE);run.nextButton.setOnClickListener(v->{if(live(run)){run.nextButton.setEnabled(false);emit(run,"next",null);}});
    FrameLayout.LayoutParams nextLayout=new FrameLayout.LayoutParams(-2,-2,Gravity.BOTTOM|Gravity.END);nextLayout.bottomMargin=(int)(100*getContext().getResources().getDisplayMetrics().density);nextLayout.rightMargin=20;root.addView(run.nextButton,nextLayout);
    if(run.inline){
     ((ViewGroup)getActivity().getWindow().getDecorView()).addView(root,new FrameLayout.LayoutParams(1,1,Gravity.TOP|Gravity.LEFT));layoutInline(run);
     run.backCallback=new OnBackPressedCallback(false){@Override public void handleOnBackPressed(){setFullscreen(run,false);}};getActivity().getOnBackPressedDispatcher().addCallback(run.backCallback);
    }else{run.dialog.setContentView(root,new ViewGroup.LayoutParams(-1,-1));run.dialog.setOnDismissListener(d->release(run,"user-dismissed"));run.dialog.show();}
    ViewCompat.requestApplyInsets(root);
    JSObject input=snapshot(run,"diagnostic","load-request");input.put("headerNames",new JSArray(new ArrayList<>(new TreeSet<>(headers.keySet()))));send(input);
    MediaItem item=new MediaItem.Builder().setUri(uri).setMimeType(mime.equals("application/vnd.apple.mpegurl")?MimeTypes.APPLICATION_M3U8:mime).build();
    if(mime.equals("application/vnd.apple.mpegurl"))player.setMediaSource(new HlsMediaSource.Factory(data).createMediaSource(item));else player.setMediaItem(item);
    Double resume=call.getDouble("startPositionSeconds",0.0);if(resume!=null&&Double.isFinite(resume)&&resume>0)player.seekTo((long)(resume*1000));player.prepare();player.play();
    run.ticker=()->tick(run);handler.postDelayed(run.ticker,500);call.resolve();
   }catch(Exception error){fail(run,"INITIALIZATION_EXCEPTION",0,"initialization",error);call.reject("Native initialization failed");}
  });
 }
 private void tick(Run run){
  if(!live(run))return;long now=SystemClock.elapsedRealtime();long delta=now-run.lastTick;run.lastTick=now;
  long position=run.player.getCurrentPosition();
  if(run.inline&&run.video&&run.audio&&run.player.isPlaying())run.root.setAlpha(1f);
  long duration=run.player.getDuration();boolean showNext=run.nextAvailable&&duration>0&&position>0&&position<=duration&&duration-position<=Math.min(run.nextThreshold*1000,duration*.3);run.nextButton.setVisibility(showNext?View.VISIBLE:View.GONE);
  if((!run.inline||run.fullscreen||run.viewportVisible)&&run.video&&run.audio&&run.player.getPlayWhenReady()&&position<=run.previousPosition&&run.player.getPlaybackState()!=Player.STATE_ENDED)run.stallMs+=delta;else run.stallMs=0;
  run.slowNotice.setVisibility(run.stallMs>=5000?View.VISIBLE:View.GONE);
  if(run.stallMs>=STARTUP_TIMEOUT_MS){fail(run,"BUFFER_TIMEOUT",0,"network",null);return;}
  emit(run,run.player.isPlaying()&&position>1000&&position>run.previousPosition?"progress":"diagnostic","tick");run.previousPosition=position;
  // Pauses/background do not consume the startup budget. Clock advancement alone is insufficient.
  if((!run.inline||run.fullscreen||run.viewportVisible)&&run.player.getPlayWhenReady()&&!(run.video&&run.audio)&&run.player.getPlaybackState()!=Player.STATE_ENDED)run.waitMs+=delta;
  if(run.waitMs>=STARTUP_TIMEOUT_MS){fail(run,"STARTUP_TIMEOUT",0,"initialization",null);return;}
  handler.postDelayed(run.ticker,500);
 }
 // Diagnostic pixel statistics only; no frame or media URL is persisted.
 private void sampleSurface(Run run){
  if(!live(run)||run.view==null||!(run.view.getVideoSurfaceView() instanceof SurfaceView))return;
  Bitmap bitmap=Bitmap.createBitmap(32,32,Bitmap.Config.ARGB_8888);
  try{PixelCopy.request((SurfaceView)run.view.getVideoSurfaceView(),bitmap,result->{
   if(live(run)){JSObject event=snapshot(run,"diagnostic","surface-pixels");event.put("pixelCopyResult",result);if(result==PixelCopy.SUCCESS){int min=255,max=0,nonDark=0;for(int y=0;y<32;y++)for(int x=0;x<32;x++){int pixel=bitmap.getPixel(x,y);int brightness=Math.max((pixel>>16)&255,Math.max((pixel>>8)&255,pixel&255));min=Math.min(min,brightness);max=Math.max(max,brightness);if(brightness>30)nonDark++;}event.put("pixelMin",min);event.put("pixelMax",max);event.put("nonDarkPixels",nonDark);}send(event);}bitmap.recycle();
  },handler);}catch(Exception error){bitmap.recycle();emit(run,"diagnostic","surface-copy:"+error.getClass().getSimpleName());}
 }
 private void layoutInline(Run run){
  if(!run.inline||run.root==null||run.released)return;
  if(run.fullscreen){run.root.setClipBounds(null);run.root.setVisibility(View.VISIBLE);run.root.setLayoutParams(new FrameLayout.LayoutParams(-1,-1,Gravity.TOP|Gravity.LEFT));ViewCompat.requestApplyInsets(run.root);return;}
  double viewport=run.bounds.optDouble("viewportWidth",0);double width=run.bounds.optDouble("width",0);double height=run.bounds.optDouble("height",0);
  if(viewport<=0||width<=0||height<=0){run.viewportVisible=false;run.root.setVisibility(View.INVISIBLE);return;}
  double scale=bridge.getWebView().getWidth()/viewport;int[] origin=new int[2];bridge.getWebView().getLocationInWindow(origin);
  double x=run.bounds.optDouble("x",0),y=run.bounds.optDouble("y",0);run.viewportVisible=run.bounds.optBoolean("visible",true);
  FrameLayout.LayoutParams layout=new FrameLayout.LayoutParams(Math.max(1,(int)Math.round(width*scale)),Math.max(1,(int)Math.round(height*scale)),Gravity.TOP|Gravity.LEFT);
  layout.leftMargin=origin[0]+(int)Math.round(x*scale);layout.topMargin=origin[1]+(int)Math.round(y*scale);run.root.setLayoutParams(layout);run.root.setPadding(0,0,0,0);run.root.setVisibility(run.viewportVisible?View.VISIBLE:View.INVISIBLE);
  int clipTop=(int)Math.round(Math.max(0,run.bounds.optDouble("clipTop",0))*scale),clipBottom=(int)Math.round(Math.max(0,run.bounds.optDouble("clipBottom",0))*scale);run.root.setClipBounds(new Rect(0,Math.min(layout.height,clipTop),layout.width,Math.max(clipTop,layout.height-clipBottom)));
 }
 private void setFullscreen(Run run,boolean fullscreen){
  if(!live(run))return;run.fullscreen=fullscreen;run.view.setFullscreenButtonState(fullscreen);
  getActivity().setRequestedOrientation(fullscreen?ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE:run.initialOrientation);
  if(run.inline){if(run.backCallback!=null)run.backCallback.setEnabled(fullscreen);layoutInline(run);}emit(run,"diagnostic",fullscreen?"fullscreen-enter":"fullscreen-exit");
 }
 @PluginMethod public void play(PluginCall call){getActivity().runOnUiThread(()->{if(active!=null)active.player.play();call.resolve();});}
 @PluginMethod public void pause(PluginCall call){getActivity().runOnUiThread(()->{if(active!=null)active.player.pause();call.resolve();});}
 @PluginMethod public void seek(PluginCall call){Double seconds=call.getDouble("seconds",0.0);if((seconds.isNaN()||seconds.isInfinite())||seconds<0){call.reject("Invalid seek");return;}getActivity().runOnUiThread(()->{if(active!=null){active.player.seekTo((long)(seconds*1000));active.previousPosition=(long)(seconds*1000);}call.resolve();});}
 @PluginMethod public void close(PluginCall call){getActivity().runOnUiThread(()->{String session=call.getString("sessionId","");if(active!=null&&(session.isEmpty()||active.sessionId.equals(session)))release(active,"explicit-close");call.resolve();});}
 @PluginMethod public void updateControls(PluginCall call){getActivity().runOnUiThread(()->{if(active!=null&&active.sessionId.equals(call.getString("sessionId",""))){active.nextAvailable=Boolean.TRUE.equals(call.getBoolean("nextAvailable",active.nextAvailable));JSObject bounds=call.getObject("bounds");if(bounds!=null){active.bounds=bounds;layoutInline(active);}}call.resolve();});}
 @Override protected void handleOnPause(){getActivity().runOnUiThread(()->{if(active!=null){emit(active,"diagnostic","activity-pause");active.player.pause();}});}
 @Override protected void handleOnDestroy(){getActivity().runOnUiThread(()->release(active,"activity-destroy"));}
}
