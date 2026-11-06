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
import android.graphics.Bitmap;
import android.graphics.Rect;
import android.graphics.drawable.GradientDrawable;
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
import androidx.media3.exoplayer.upstream.DefaultLoadErrorHandlingPolicy;
import androidx.media3.exoplayer.upstream.LoadErrorHandlingPolicy.LoadErrorInfo;
import androidx.media3.datasource.DefaultDataSource;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.datasource.okhttp.OkHttpDataSource;
import okhttp3.HttpUrl;
import androidx.media3.datasource.HttpDataSource;
import androidx.media3.datasource.TransferListener;
import androidx.media3.datasource.DataSource;
import androidx.media3.datasource.DataSpec;
import androidx.media3.exoplayer.DecoderCounters;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicBoolean;
import androidx.media3.ui.PlayerView;
import androidx.media3.ui.AspectRatioFrameLayout;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.IOException;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.*;

@CapacitorPlugin(name="NoctaNativePlayer")
public class NoctaNativePlayerPlugin extends Plugin {
 private final Handler handler=new Handler(Looper.getMainLooper());
 private Run active;
 private static final Set<String> HOSTS=new HashSet<>(Arrays.asList("fenixflix.fenixhub.online","cdn-sv01.maximaimg.online","zunderflix.lat","sa-east-1.v-net.work","us-east-2.vy-userfiles.cloud","us-central-1.v-net.work","magikarp.south-america.workers.dev","zeus-br.shardweb.app","brazuca-play-stremio.vercel.app","nsrv.classotaku.app","embedplayer2.xyz"));
 private static final String MALFOY="animezey16082023.animezey16082023.workers.dev";
 private static final long STARTUP_TIMEOUT_MS=45000;
 // Every callback owns its original Run; released callbacks cannot mutate a replacement player.
 private static class Run {
  ExoPlayer player; Dialog dialog; PlayerView view; Runnable ticker; Button nextButton; TextView slowNotice; FrameLayout root; OnBackPressedCallback backCallback; boolean inline,fullscreen,viewportVisible=true; JSObject bounds; boolean nextAvailable; long stallMs; double nextThreshold=35;
  PlayerImmersiveMode immersiveMode; TextView back,title,sources; int webAccessibility;
  final String sessionId,sourceId,providerId,fingerprint; String mime; final Uri mediaUri; final long started=SystemClock.elapsedRealtime();
  boolean video,audio,released,terminal; long previousPosition,waitMs,lastTick=started;
  String languageNotice;
  String lastLoadErrorHash,lastLoadErrorStage;
  final AtomicLong bytesRead=new AtomicLong(); long bytes; int loadStarts,loadCompletions,loadErrors; String surface="not-created";
  Run(PluginCall call,String mime,Uri mediaUri){sessionId=safeId(call.getString("sessionId",""));sourceId=safeId(call.getString("sourceId",""));providerId=safeId(call.getString("providerId",""));fingerprint=safeId(call.getString("inputFingerprint",""));this.mime=mime;this.mediaUri=mediaUri;inline=Boolean.TRUE.equals(call.getBoolean("inline",false));bounds=call.getObject("bounds",new JSObject());nextAvailable=Boolean.TRUE.equals(call.getBoolean("nextAvailable",false));Double threshold=call.getDouble("nextPromptSeconds",35.0);if(threshold!=null&&Double.isFinite(threshold)&&threshold>0)nextThreshold=threshold;}
 }
 private static String safeId(String value){return value!=null&&value.matches("[A-Za-z0-9:._-]{0,120}")?value:"invalid-id";}
 private static String state(int value){switch(value){case Player.STATE_BUFFERING:return "BUFFERING";case Player.STATE_READY:return "READY";case Player.STATE_ENDED:return "ENDED";default:return "IDLE";}}
 private JSObject snapshot(Run run,String event,String detail){
  JSObject value=new JSObject();value.put("event",event);value.put("sessionId",run.sessionId);value.put("sourceId",run.sourceId);value.put("providerId",run.providerId);value.put("inputFingerprint",run.fingerprint);value.put("mimeType",run.mime);value.put("elapsedMs",SystemClock.elapsedRealtime()-run.started);
  value.put("inline",run.inline);value.put("fullscreen",run.fullscreen);value.put("viewportVisible",run.viewportVisible);value.put("rootAlpha",run.root==null?-1:run.root.getAlpha());value.put("stale",active!=run||run.released);value.put("videoRendered",run.video);value.put("audioAdvancing",run.audio);value.put("surface",run.surface);value.put("nextVisible",run.nextButton!=null&&run.nextButton.getVisibility()==View.VISIBLE);
  if (BuildConfig.DEBUG && run.root != null) {
   value.put("rootWidth", run.root.getWidth()); value.put("rootHeight", run.root.getHeight());
   value.put("framing", run.view != null && run.view.getResizeMode() == AspectRatioFrameLayout.RESIZE_MODE_ZOOM ? "zoom" : "fit");
   WindowInsetsCompat insets = ViewCompat.getRootWindowInsets(run.root);
   if (insets != null) {
    value.put("statusBarVisible", insets.isVisible(WindowInsetsCompat.Type.statusBars()));
    value.put("navigationBarVisible", insets.isVisible(WindowInsetsCompat.Type.navigationBars()));
   }
  }
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
 private void cause(JSObject value, Throwable error) {
  value.put("networkCause", MediaNetworkFailure.reason(error));
  JSArray classes = new JSArray();
  int count = 0;
  while (error != null && count++ < 12) {
   classes.put(error.getClass().getSimpleName());
   if (error instanceof HttpDataSource.HttpDataSourceException) {
    HttpDataSource.HttpDataSourceException http = (HttpDataSource.HttpDataSourceException) error;
    value.put("httpOperation", http.type);
    // A HLS load task can request an init resource before the segment in LoadEventInfo.
    value.put("httpRequestHash", uriHash(http.dataSpec.uri));
   }
   if (error instanceof HttpDataSource.InvalidResponseCodeException)
    value.put("httpStatus", ((HttpDataSource.InvalidResponseCodeException) error).responseCode);
   if (error instanceof PublicMediaHttp.TransportPolicyException) {
    PublicMediaHttp.TransportPolicyException policy = (PublicMediaHttp.TransportPolicyException) error;
    value.put("redirectStatus", policy.status); value.put("destinationScheme", policy.destinationScheme);
   }
   error = error.getCause();
  }
  value.put("causes", classes);
 }
 private static String mediaStage(Run run, LoadEventInfo info, MediaLoadData data) {
  if (!"application/vnd.apple.mpegurl".equals(run.mime)) return "progressive";
  if (data.dataType == C.DATA_TYPE_MANIFEST) return run.mediaUri.equals(info.dataSpec.uri) ? "hls-main-playlist" : "hls-variant-playlist";
  if (data.dataType == C.DATA_TYPE_DRM) return "hls-key";
  if (data.dataType == C.DATA_TYPE_MEDIA_INITIALIZATION) return "hls-initialization";
  return data.dataType == C.DATA_TYPE_MEDIA ? "hls-segment" : "hls-resource";
 }
 private static String uriHash(Uri uri) {
  if (uri == null || Uri.EMPTY.equals(uri)) return null;
  try {
   byte[] hash = MessageDigest.getInstance("SHA-256").digest(uri.toString().getBytes(StandardCharsets.UTF_8));
   StringBuilder result = new StringBuilder(hash.length * 2);
   for (byte value : hash) { result.append(Character.forDigit((value & 0xff) >>> 4, 16)); result.append(Character.forDigit(value & 0xf, 16)); }
   return result.toString();
  } catch (NoSuchAlgorithmException e) { throw new IllegalStateException(e); }
 }
 private void loadEvent(Run run, String detail, LoadEventInfo info, MediaLoadData data, IOException error) {
  if (!live(run)) return;
  JSObject value = snapshot(run, "diagnostic", detail);
  value.put("loadTaskId", info.loadTaskId);
  value.put("bytesLoaded", info.bytesLoaded);
  value.put("loadDurationMs", info.loadDurationMs);
  value.put("mediaStage", mediaStage(run, info, data));
  if (BuildConfig.DEBUG) {
   value.put("requestHash", uriHash(info.dataSpec.uri));
   value.put("resolvedHash", uriHash(info.uri));
   value.put("dataType", data.dataType);
   value.put("trackType", data.trackType);
   if (data.trackFormat != null) value.put("trackMimeType", data.trackFormat.sampleMimeType);
  }
  if (error != null) {
   cause(value, error);
   run.lastLoadErrorStage = value.optString("mediaStage");
   run.lastLoadErrorHash = value.optString("httpRequestHash", uriHash(info.dataSpec.uri));
   if ("hls-segment".equals(run.lastLoadErrorStage) && !Objects.equals(run.lastLoadErrorHash, uriHash(info.dataSpec.uri))) {
    run.lastLoadErrorStage = "hls-segment-resource";
    value.put("mediaStage", run.lastLoadErrorStage);
   }
  }
  send(value);
 }
 private void release(Run run,String reason){
  if(run==null||run.released)return;emit(run,"closed",reason);restoreWindow(run);run.released=true;if(run.ticker!=null)handler.removeCallbacks(run.ticker);
  if(run.dialog!=null)run.dialog.setOnDismissListener(null);
  if(run.view!=null)run.view.setPlayer(null);
  if(run.backCallback!=null)run.backCallback.remove();if(run.inline&&run.root!=null&&run.root.getParent() instanceof ViewGroup)((ViewGroup)run.root.getParent()).removeView(run.root);
  if(run.player!=null)run.player.release();if(run.dialog!=null)run.dialog.dismiss();if(active==run)active=null;
 }
 private void fail(Run run,String detail,int code,String category,Throwable error){
  if(!live(run))return;JSObject value=snapshot(run,"failed",detail);if(code>0)value.put("errorCode",code);value.put("category",category);
  if(error!=null)cause(value,error);
  if("network".equals(category)) {
   String hash=value.optString("httpRequestHash",null);
   String stage=hash!=null&&hash.equals(run.lastLoadErrorHash)?run.lastLoadErrorStage:
    "application/vnd.apple.mpegurl".equals(run.mime)?"hls-resource":"progressive";
   value.put("mediaStage",stage);
  }
  send(value);run.terminal=true;release(run,"failure");
 }
 private static boolean allowedMediaOrigin(Uri uri){
  return "https".equals(uri.getScheme())&&uri.getUserInfo()==null&&uri.getFragment()==null
    &&(uri.getPort()==-1||uri.getPort()==443)&&(HOSTS.contains(uri.getHost())||MALFOY.equals(uri.getHost()));
 }
 @PluginMethod public void capabilities(PluginCall call){
  JSObject result=new JSObject();result.put("available",BuildConfig.DEBUG);result.put("playbackAvailable",true);result.put("inlinePlayback",true);result.put("engine","Media3 1.8.0");result.put("verified",false);
  JSArray origins=new JSArray();for(String host:HOSTS)origins.put("https://"+host);origins.put("https://"+MALFOY);
  result.put("mediaOrigins",origins);result.put("publicMediaTransport",BuildConfig.EXPERIMENTAL_MEDIA_TRANSPORT);call.resolve(result);
 }
 @PluginMethod public void inspectFenixRedirect(PluginCall call){
  final URL url;
  try{url=new URL(call.getString("url",""));}catch(Exception error){call.reject("URL de diagnóstico inválida");return;}
  if(!"https".equals(url.getProtocol())||!"fenixflix.fenixhub.online".equals(url.getHost())||
     (url.getPort()!=-1&&url.getPort()!=443)||url.getUserInfo()!=null||url.getRef()!=null||!url.getPath().startsWith("/r/")){
   call.reject("Destino de diagnóstico não permitido");return;
  }
  new Thread(()->{
   HttpURLConnection connection=null;JSObject result=new JSObject();result.put("downgrade",false);
   try{
    connection=(HttpURLConnection)url.openConnection();
    connection.setInstanceFollowRedirects(false);connection.setUseCaches(false);
    connection.setRequestMethod("HEAD");connection.setConnectTimeout(1400);connection.setReadTimeout(1400);
    int status=connection.getResponseCode();result.put("status",status);
    String location=connection.getHeaderField("Location");
    if((status==301||status==302||status==303||status==307||status==308)&&location!=null)
     result.put("downgrade","http".equalsIgnoreCase(new URL(url,location).getProtocol()));
   }catch(IOException ignored){result.put("inconclusive",true);}
   finally{if(connection!=null)connection.disconnect();}
   call.resolve(result);
  },"NoctaRedirectCheck").start();
 }
 @PluginMethod public void load(PluginCall call){
  String url=call.getString("url","");String mime=call.getString("mimeType","");Uri uri=Uri.parse(url);
  boolean fixture=url.equals("asset:///native-fixtures/sample.mp4")||url.equals("asset:///native-fixtures/master.m3u8");
  if(fixture&&!BuildConfig.DEBUG){call.reject("Fixtures are debug-only");return;}
  boolean publicTransport=!fixture&&BuildConfig.EXPERIMENTAL_MEDIA_TRANSPORT&&Boolean.TRUE.equals(call.getBoolean("publicMediaTransport",false));
  HttpUrl publicRoot=publicTransport?HttpUrl.parse(url):null;
  boolean cleartext=publicTransport&&PublicMediaHttp.allowsCleartext(publicRoot,mime);
  if(!fixture&&!(publicTransport?PublicMediaHttp.allowed(publicRoot,cleartext):allowedMediaOrigin(uri))){call.reject("Native destination not permitted","destination-policy");return;}
  if(!Arrays.asList("video/mp4","video/webm","video/x-matroska","application/vnd.apple.mpegurl").contains(mime)){call.reject("Unsupported or unknown native MIME");return;}
  JSObject supplied=call.getObject("headers",new JSObject());Map<String,String> headers=new HashMap<>();Iterator<String> keys=supplied.keys();
  while(keys.hasNext()){String key=keys.next();String value=supplied.optString(key,"");if(!Arrays.asList("User-Agent","Referer").contains(key)||value.contains("\r")||value.contains("\n")){call.reject("Unsupported native header","header-policy");return;}headers.put(key,value);}
  getActivity().runOnUiThread(()->{
   release(active,"replaced");final Run run=new Run(call,mime,uri);active=run;
   try{
    // This reviewed Fenix HLS origin took 10.5 s to return its master playlist in the probe.
    // Keep addon-query and player-startup budgets independent; other hosts keep their existing limit.
    int readTimeout="embedplayer2.xyz".equals(uri.getHost())?15000:8000;
    TransferListener transfer=new TransferListener(){
     public void onTransferInitializing(DataSource source,DataSpec spec,boolean network){}
     public void onTransferStart(DataSource source,DataSpec spec,boolean network){
      JSObject meta=new JSObject();meta.put("readPosition",spec.position);meta.put("readLength",spec.length);
      for(Map.Entry<String,List<String>> entry:source.getResponseHeaders().entrySet()){String key=entry.getKey();if(key!=null&&Arrays.asList("content-length","content-range","content-type").contains(key.toLowerCase(Locale.ROOT))){String value=String.join(",",entry.getValue());if(value.matches("[A-Za-z0-9 /;=+_.:,*-]{0,200}"))meta.put(key.toLowerCase(Locale.ROOT),value);}}
      handler.post(()->{if(live(run)){JSObject event=snapshot(run,"diagnostic","read-start");Iterator<String> fields=meta.keys();while(fields.hasNext()){String key=fields.next();event.put(key,meta.opt(key));}send(event);}});
     }
     public void onBytesTransferred(DataSource source,DataSpec spec,boolean network,int count){run.bytesRead.addAndGet(count);}
     public void onTransferEnd(DataSource source,DataSpec spec,boolean network){handler.post(()->{if(live(run))emit(run,"diagnostic","read-end");});}
    };
    AtomicBoolean inspectHlsRoot=new AtomicBoolean(mime.equals("application/vnd.apple.mpegurl"));
    DataSource.Factory network=publicTransport
      ? new OkHttpDataSource.Factory(PublicMediaHttp.client(publicRoot,cleartext,readTimeout,inspectHlsRoot)).setDefaultRequestProperties(headers).setTransferListener(transfer)
      : new DefaultDataSource.Factory(getContext(),new DefaultHttpDataSource.Factory().setAllowCrossProtocolRedirects(false).setDefaultRequestProperties(headers).setConnectTimeoutMs(8000).setReadTimeoutMs(readTimeout)).setTransferListener(transfer);
    boolean cacheable=publicTransport&&Boolean.TRUE.equals(call.getBoolean("mediaDiskCache",false))&&publicRoot.isHttps()
     &&publicRoot.query()==null&&headers.isEmpty()&&"video/mp4".equals(mime);
    DataSource.Factory data=cacheable?LocalMediaCache.wrap(getContext(),network,uri,uriHash(uri)):network;
    DefaultLoadErrorHandlingPolicy loadPolicy=new DefaultLoadErrorHandlingPolicy(){
     @Override public long getRetryDelayMsFor(LoadErrorInfo info){
      String reason=MediaNetworkFailure.reason(info.exception);
      if(MediaNetworkFailure.deterministicPolicy(reason)||"hls-returned-mp4".equals(reason))return C.TIME_UNSET;
      return super.getRetryDelayMsFor(info);
     }
    };
    final ExoPlayer player=new ExoPlayer.Builder(getContext()).setSeekBackIncrementMs(10000).setSeekForwardIncrementMs(10000).setMediaSourceFactory(new DefaultMediaSourceFactory(data).setLoadErrorHandlingPolicy(loadPolicy)).build();run.player=player;
    Double resume=call.getDouble("startPositionSeconds",0.0);
    long resumeMs=resume!=null&&Double.isFinite(resume)&&resume>0?(long)(resume*1000):0;
    String language=call.getString("preferredLanguage","");
    if(Boolean.TRUE.equals(call.getBoolean("showLanguageNotice",false)) && ("dub".equals(language)||"sub".equals(language)))run.languageNotice=language;
    if(language.equals("dub"))player.setTrackSelectionParameters(player.getTrackSelectionParameters().buildUpon().setPreferredAudioLanguage("pt").build());
    if(language.equals("sub"))player.setTrackSelectionParameters(player.getTrackSelectionParameters().buildUpon().setPreferredTextLanguage("pt").build());
    player.addAnalyticsListener(new AnalyticsListener(){
     @Override public void onRenderedFirstFrame(EventTime time,Object output,long renderTimeMs){if(live(run)){run.video=true;emit(run,"video",null);handler.postDelayed(()->sampleSurface(run),1000);}}
     @Override public void onAudioPositionAdvancing(EventTime time,long startTimeMs){if(live(run)){run.audio=true;emit(run,"audio",null);}}
     @Override public void onVideoInputFormatChanged(EventTime time,Format f,DecoderReuseEvaluation reuse){format(run,"video-input",f);}
     @Override public void onAudioInputFormatChanged(EventTime time,Format f,DecoderReuseEvaluation reuse){format(run,"audio-input",f);}
     @Override public void onVideoDecoderInitialized(EventTime time,String name,long at,long duration){if(live(run))emit(run,"diagnostic","video-decoder:"+name);}
     @Override public void onAudioDecoderInitialized(EventTime time,String name,long at,long duration){if(live(run))emit(run,"diagnostic","audio-decoder:"+name);}
     @Override public void onLoadStarted(EventTime time,LoadEventInfo info,MediaLoadData data){run.loadStarts++;loadEvent(run,"load-started",info,data,null);}
     @Override public void onLoadCompleted(EventTime time,LoadEventInfo info,MediaLoadData data){run.loadCompletions++;run.bytes+=info.bytesLoaded;loadEvent(run,"load-completed",info,data,null);}
     @Override public void onLoadCanceled(EventTime time,LoadEventInfo info,MediaLoadData data){loadEvent(run,"load-canceled",info,data,null);}
     @Override public void onLoadError(EventTime time,LoadEventInfo info,MediaLoadData data,IOException error,boolean canceled){run.loadErrors++;loadEvent(run,canceled?"load-error-canceled":"load-error-retryable",info,data,error);}
    });
    player.addListener(new Player.Listener(){
     @Override public void onPlaybackStateChanged(int value){if(live(run))emit(run,value==Player.STATE_READY?"loaded":value==Player.STATE_ENDED?"ended":"diagnostic","state:"+state(value));}
     @Override public void onPlayWhenReadyChanged(boolean value,int reason){if(live(run))emit(run,"diagnostic","playWhenReady:"+reason);}
     @Override public void onIsPlayingChanged(boolean value){if(live(run))emit(run,"diagnostic","isPlaying");}
     @Override public void onIsLoadingChanged(boolean value){if(live(run))emit(run,"diagnostic","isLoading");}
     @Override public void onTracksChanged(Tracks tracks){if(!live(run))return;JSArray available=new JSArray();for(Tracks.Group group:tracks.getGroups())if(group.getType()==C.TRACK_TYPE_AUDIO||group.getType()==C.TRACK_TYPE_TEXT)for(int i=0;i<group.length;i++){JSObject entry=new JSObject();entry.put("type",group.getType()==C.TRACK_TYPE_AUDIO?"audio":"text");entry.put("language",group.getTrackFormat(i).language);entry.put("supported",group.isTrackSupported(i));entry.put("selected",group.isTrackSelected(i));available.put(entry);}JSObject trackEvent=snapshot(run,"diagnostic","available-tracks");trackEvent.put("tracks",available);send(trackEvent);for(Tracks.Group group:tracks.getGroups())for(int i=0;i<group.length;i++)if(group.isTrackSelected(i))format(run,"selected-track",group.getTrackFormat(i));}
     @Override public void onPlayerError(PlaybackException error){
      if("application/vnd.apple.mpegurl".equals(run.mime)&&"hls-returned-mp4".equals(MediaNetworkFailure.reason(error))){
       handler.post(()->{
        if(!live(run)||!"application/vnd.apple.mpegurl".equals(run.mime))return;
        run.mime="video/mp4";
        emit(run,"diagnostic","format-corrected-to-mp4");
        MediaItem progressive=new MediaItem.Builder().setUri(uri).setMimeType(run.mime).build();
        player.setMediaSource(new ProgressiveMediaSource.Factory(data).setLoadErrorHandlingPolicy(loadPolicy).createMediaSource(progressive),resumeMs);
        player.prepare();
       });
       return;
      }
      int code=error.errorCode;fail(run,error.getErrorCodeName(),code,code>=6000?"protection":code>=5000?"audio":code>=4000?"codec":code>=3000?"format":code>=2000?"network":"initialization",error);
     }
    });
    Context playerContext;
    if(run.inline)playerContext=new ContextThemeWrapper(getActivity(),R.style.NoctaNativePlayerTheme);else{run.dialog=new Dialog(getActivity(),R.style.NoctaNativePlayerTheme);playerContext=run.dialog.getContext();}
    run.view=new PlayerView(playerContext);run.view.setPlayer(player);run.view.setResizeMode(AspectRatioFrameLayout.RESIZE_MODE_FIT);run.view.setControllerShowTimeoutMs(3000);run.view.setShowSubtitleButton(true);
    run.view.setShowBuffering(PlayerView.SHOW_BUFFERING_WHEN_PLAYING);run.view.setFullscreenButtonClickListener(fullscreen->setFullscreen(run,fullscreen));
    if(run.view.getVideoSurfaceView() instanceof SurfaceView){SurfaceView surface=(SurfaceView)run.view.getVideoSurfaceView();surface.getHolder().addCallback(new SurfaceHolder.Callback(){
     public void surfaceCreated(SurfaceHolder holder){run.surface="created:"+holder.getSurface().isValid();emit(run,"diagnostic","surface-created");}
     public void surfaceChanged(SurfaceHolder holder,int format,int width,int height){run.surface="valid="+holder.getSurface().isValid()+":"+width+"x"+height;emit(run,"diagnostic","surface-changed");}
     public void surfaceDestroyed(SurfaceHolder holder){run.surface="destroyed";emit(run,"diagnostic","surface-destroyed");}
    });}
    FrameLayout root=new FrameLayout(playerContext){@Override public boolean dispatchTouchEvent(android.view.MotionEvent event){if(getAlpha()==0f)return false;Rect clip=getClipBounds();if(event.getActionMasked()==android.view.MotionEvent.ACTION_DOWN&&clip!=null&&!clip.contains((int)event.getX(),(int)event.getY()))return false;return super.dispatchTouchEvent(event);}};run.root=root;if(run.inline)root.setAlpha(0f);
    root.setBackgroundColor(run.inline?android.graphics.Color.TRANSPARENT:android.graphics.Color.BLACK);root.addView(run.view,new FrameLayout.LayoutParams(-1,-1));
    root.addOnLayoutChangeListener((view, left, top, right, bottom, oldLeft, oldTop, oldRight, oldBottom) ->
      updateFraming(run, right - left, bottom - top));
    LinearLayout heading=new LinearLayout(playerContext);heading.setGravity(Gravity.CENTER_VERTICAL);int touch=(int)(44*getContext().getResources().getDisplayMetrics().density);heading.setPadding(8,4,8,0);
    TextView back=new TextView(playerContext);run.back=back;back.setText("‹");back.setTextColor(android.graphics.Color.WHITE);back.setTextSize(32);back.setGravity(Gravity.CENTER);back.setContentDescription("Voltar à lista de fontes");back.setOnClickListener(v->{if(live(run)){if(run.fullscreen)setFullscreen(run,false);else{emit(run,"sources",null);release(run,"user-sources");}}});heading.addView(back,new LinearLayout.LayoutParams(touch,touch));
    TextView title=new TextView(playerContext);run.title=title;String caption=call.getString("title","");title.setText(caption.length()>180?caption.substring(0,180):caption);title.setTextColor(android.graphics.Color.WHITE);title.setTextSize(16);title.setMaxLines(1);title.setEllipsize(android.text.TextUtils.TruncateAt.END);heading.addView(title,new LinearLayout.LayoutParams(0,-2,1));
    TextView sources=new TextView(playerContext);run.sources=sources;sources.setText("Servidores");sources.setTextColor(android.graphics.Color.WHITE);sources.setTextSize(12);sources.setPadding(12,0,12,0);sources.setGravity(Gravity.CENTER);sources.setContentDescription("Trocar servidor");sources.setOnClickListener(v->{if(live(run)){emit(run,"sources",null);release(run,"user-sources");}});heading.addView(sources,new LinearLayout.LayoutParams(-2,touch));
    View controlsShade = run.view.findViewById(androidx.media3.ui.R.id.exo_controls_background);
    if (controlsShade != null) controlsShade.setBackground(new GradientDrawable(
      GradientDrawable.Orientation.TOP_BOTTOM, new int[]{0x50000000, 0x18000000, 0x78000000}));
    View bottomBar = run.view.findViewById(androidx.media3.ui.R.id.exo_bottom_bar);
    if (bottomBar != null) bottomBar.setBackgroundColor(android.graphics.Color.TRANSPARENT);
    TextView volume=new TextView(playerContext);volume.setText("♫");volume.setTextColor(android.graphics.Color.WHITE);volume.setTextSize(20);volume.setGravity(Gravity.CENTER);volume.setContentDescription("Silenciar áudio");volume.setOnClickListener(v->{if(live(run)){boolean muted=player.getVolume()>0;player.setVolume(muted?0f:1f);volume.setText(muted?"×":"♫");volume.setContentDescription(muted?"Ativar áudio":"Silenciar áudio");}});heading.addView(volume,new LinearLayout.LayoutParams(touch,touch));
    root.addView(heading,new FrameLayout.LayoutParams(-1,-2,Gravity.TOP));
    ViewCompat.setOnApplyWindowInsetsListener(root, (view, insets) -> {
     Insets safe = run.fullscreen ? insets.getInsetsIgnoringVisibility(WindowInsetsCompat.Type.displayCutout()) : Insets.NONE;
     heading.setPadding(8 + safe.left, 4 + safe.top, 8 + safe.right, 0);
     View controller = run.view.findViewById(androidx.media3.ui.R.id.exo_controller);
     if (controller != null) controller.setPadding(safe.left, safe.top, safe.right, safe.bottom);
     return insets;
    });
    run.slowNotice=new TextView(playerContext);run.slowNotice.setText("A conexão está lenta. Aguarde mais alguns segundos...");run.slowNotice.setTextColor(android.graphics.Color.WHITE);run.slowNotice.setTextSize(12);run.slowNotice.setGravity(Gravity.CENTER);run.slowNotice.setBackgroundColor(0xB3070D18);run.slowNotice.setPadding(12,8,12,8);run.slowNotice.setVisibility(View.GONE);root.addView(run.slowNotice,new FrameLayout.LayoutParams(-1,-2,Gravity.CENTER));
    run.view.setControllerVisibilityListener((PlayerView.ControllerVisibilityListener)visibility->heading.setVisibility(visibility));
    run.nextButton=new Button(playerContext);run.nextButton.setText("Próximo episódio");run.nextButton.setVisibility(View.GONE);run.nextButton.setOnClickListener(v->{if(live(run)){run.nextButton.setEnabled(false);emit(run,"next",null);}});
    FrameLayout.LayoutParams nextLayout=new FrameLayout.LayoutParams(-2,-2,Gravity.BOTTOM|Gravity.END);nextLayout.bottomMargin=(int)(100*getContext().getResources().getDisplayMetrics().density);nextLayout.rightMargin=20;root.addView(run.nextButton,nextLayout);
    if(run.inline){
     ((ViewGroup)getActivity().getWindow().getDecorView()).addView(root,new FrameLayout.LayoutParams(1,1,Gravity.TOP|Gravity.LEFT));layoutInline(run);
     run.backCallback=new OnBackPressedCallback(false){@Override public void handleOnBackPressed(){setFullscreen(run,false);}};getActivity().getOnBackPressedDispatcher().addCallback(run.backCallback);
    }else{run.dialog.setContentView(root,new ViewGroup.LayoutParams(-1,-1));run.dialog.setOnDismissListener(d->release(run,"user-dismissed"));run.dialog.show();}
    ViewCompat.requestApplyInsets(root);
    JSObject input=snapshot(run,"diagnostic","load-request");input.put("readTimeoutMs",readTimeout);input.put("startupTimeoutMs",STARTUP_TIMEOUT_MS);input.put("headerNames",new JSArray(new ArrayList<>(new TreeSet<>(headers.keySet()))));if(BuildConfig.DEBUG)input.put("mediaUrlHash",uriHash(uri));send(input);
    MediaItem item=new MediaItem.Builder().setUri(uri).setMimeType(mime.equals("application/vnd.apple.mpegurl")?MimeTypes.APPLICATION_M3U8:mime).build();
    if(mime.equals("application/vnd.apple.mpegurl"))player.setMediaSource(new HlsMediaSource.Factory(data).setLoadErrorHandlingPolicy(loadPolicy).createMediaSource(item));else player.setMediaItem(item);
    if(resumeMs>0)player.seekTo(resumeMs);player.prepare();player.play();
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
  boolean advancing=run.player.isPlaying()&&position>1000&&position>run.previousPosition;
  if(advancing&&run.video&&run.audio&&run.languageNotice!=null)showLanguageNotice(run);
  emit(run,advancing?"progress":"diagnostic","tick");run.previousPosition=position;
  // Pauses/background do not consume the startup budget. Clock advancement alone is insufficient.
  if((!run.inline||run.fullscreen||run.viewportVisible)&&run.player.getPlayWhenReady()&&!(run.video&&run.audio)&&run.player.getPlaybackState()!=Player.STATE_ENDED)run.waitMs+=delta;
  if(run.waitMs>=STARTUP_TIMEOUT_MS){fail(run,"STARTUP_TIMEOUT",0,"initialization",null);return;}
  handler.postDelayed(run.ticker,500);
 }
 private void showLanguageNotice(Run run){
  boolean dubbed="dub".equals(run.languageNotice);run.languageNotice=null;
  FrameLayout overlay=new FrameLayout(run.root.getContext());
  run.root.addView(overlay,new FrameLayout.LayoutParams(-1,-1));
  TextView notice=new TextView(run.root.getContext());
  notice.setText((dubbed?"♫   Reproduzindo dublado":"▤   Reproduzindo legendado")+"\nVersão informada pelo servidor");
  notice.setTextColor(0xFFF7F8FC);notice.setTextSize(14);notice.setGravity(Gravity.CENTER);
  float density=notice.getResources().getDisplayMetrics().density;
  notice.setPadding((int)(16*density),(int)(9*density),(int)(16*density),(int)(9*density));
  GradientDrawable background=new GradientDrawable();background.setColor(0xD9101420);background.setCornerRadius(12*density);notice.setBackground(background);
  overlay.addView(notice,new FrameLayout.LayoutParams(-2,-2,Gravity.CENTER));
  notice.setTranslationY(-24*density);notice.setAlpha(0f);notice.animate().alpha(1f).setDuration(180).start();
  handler.postDelayed(()->notice.animate().alpha(0f).setDuration(180).withEndAction(()->run.root.removeView(overlay)).start(),1900);
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
 private void restoreWindow(Run run) {
  if (run.immersiveMode == null) return;
  run.immersiveMode.restore();
  run.immersiveMode = null;
  if (run.inline) bridge.getWebView().setImportantForAccessibility(run.webAccessibility);
 }
 private void updateFraming(Run run, int width, int height) {
  int mode = run.fullscreen && height > 0 && width > height
    ? AspectRatioFrameLayout.RESIZE_MODE_ZOOM : AspectRatioFrameLayout.RESIZE_MODE_FIT;
  if (run.view.getResizeMode() != mode) run.view.setResizeMode(mode);
 }
 private void setFullscreen(Run run, boolean fullscreen) {
  if (!live(run) || run.fullscreen == fullscreen) return;
  run.fullscreen = fullscreen;
  if (fullscreen) {
   run.immersiveMode = new PlayerImmersiveMode(run.inline ? getActivity().getWindow() : run.dialog.getWindow());
   if (run.inline) {
    run.webAccessibility = bridge.getWebView().getImportantForAccessibility();
    bridge.getWebView().setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);
   }
  } else {
   restoreWindow(run);
  }
  run.view.setFullscreenButtonState(fullscreen);
  run.root.setBackgroundColor(fullscreen || !run.inline ? android.graphics.Color.BLACK : android.graphics.Color.TRANSPARENT);
  run.root.setClickable(fullscreen);
  run.back.setContentDescription(fullscreen ? "Sair da tela cheia" : "Voltar à lista de fontes");
  run.title.setVisibility(fullscreen ? View.INVISIBLE : View.VISIBLE);
  run.sources.setVisibility(fullscreen ? View.GONE : View.VISIBLE);
  updateFraming(run, run.root.getWidth(), run.root.getHeight());
  if (run.inline) {
   run.backCallback.setEnabled(fullscreen);
   layoutInline(run);
  }
  ViewCompat.requestApplyInsets(run.root);
  emit(run, "diagnostic", fullscreen ? "fullscreen-enter" : "fullscreen-exit");
 }
 @PluginMethod public void play(PluginCall call){getActivity().runOnUiThread(()->{if(active!=null)active.player.play();call.resolve();});}
 @PluginMethod public void pause(PluginCall call){getActivity().runOnUiThread(()->{if(active!=null)active.player.pause();call.resolve();});}
 @PluginMethod public void seek(PluginCall call){Double seconds=call.getDouble("seconds",0.0);if((seconds.isNaN()||seconds.isInfinite())||seconds<0){call.reject("Invalid seek");return;}getActivity().runOnUiThread(()->{if(active!=null){active.player.seekTo((long)(seconds*1000));active.previousPosition=(long)(seconds*1000);}call.resolve();});}
 @PluginMethod public void close(PluginCall call){getActivity().runOnUiThread(()->{String session=call.getString("sessionId","");if(active!=null&&(session.isEmpty()||active.sessionId.equals(session)))release(active,"explicit-close");call.resolve();});}
 @PluginMethod public void updateControls(PluginCall call){getActivity().runOnUiThread(()->{if(active!=null&&active.sessionId.equals(call.getString("sessionId",""))){active.nextAvailable=Boolean.TRUE.equals(call.getBoolean("nextAvailable",active.nextAvailable));JSObject bounds=call.getObject("bounds");if(bounds!=null){active.bounds=bounds;layoutInline(active);}}call.resolve();});}
 @Override protected void handleOnPause(){getActivity().runOnUiThread(()->{if(active!=null){emit(active,"diagnostic","activity-pause");active.player.pause();}});}
 @Override protected void handleOnDestroy(){getActivity().runOnUiThread(()->release(active,"activity-destroy"));}
}
