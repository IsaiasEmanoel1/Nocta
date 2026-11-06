package app.nocta.prototype;

import android.content.Context;
import android.net.Uri;
import androidx.media3.database.StandaloneDatabaseProvider;
import androidx.media3.datasource.DataSink;
import androidx.media3.datasource.DataSource;
import androidx.media3.datasource.DataSpec;
import androidx.media3.datasource.TransferListener;
import androidx.media3.datasource.cache.CacheDataSink;
import androidx.media3.datasource.cache.CacheDataSource;
import androidx.media3.datasource.cache.LeastRecentlyUsedCacheEvictor;
import androidx.media3.datasource.cache.SimpleCache;
import java.io.File;
import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

final class LocalMediaCache {
    private static final long HOUR_MS = 3_600_000L;
    private static final long CAPACITY = 200L * 1024 * 1024;
    private static final Pattern MAX_AGE = Pattern.compile("(?:^|,)\\s*max-age=(\\d+)", Pattern.CASE_INSENSITIVE);
    private static SimpleCache cache;

    private LocalMediaCache() {}

    private static synchronized SimpleCache shared(Context context) {
        if (cache == null) cache = new SimpleCache(new File(context.getCacheDir(), "licensed-media-v1"),
            new LeastRecentlyUsedCacheEvictor(CAPACITY), new StandaloneDatabaseProvider(context.getApplicationContext()));
        return cache;
    }

    static DataSource.Factory wrap(Context context, DataSource.Factory network, Uri root, String identity) {
        return () -> {
            DataSource upstream = network.createDataSource();
            try {
                SimpleCache store = shared(context);
                // The authorized root is the only cache key. Do not persist redirect destinations.
                DataSource safeMetadata = new DataSource() {
                    @Override public void addTransferListener(TransferListener listener) { upstream.addTransferListener(listener); }
                    @Override public long open(DataSpec spec) throws IOException { return upstream.open(spec); }
                    @Override public int read(byte[] buffer, int offset, int length) throws IOException { return upstream.read(buffer, offset, length); }
                    @Override public Uri getUri() { return upstream.getUri() == null ? null : root; }
                    @Override public Map<String,List<String>> getResponseHeaders() { return upstream.getResponseHeaders(); }
                    @Override public void close() throws IOException { upstream.close(); }
                };
                return new CacheDataSource.Factory().setCache(store).setFlags(CacheDataSource.FLAG_IGNORE_CACHE_ON_ERROR)
                    .setCacheKeyFactory(spec -> identity + ":" + System.currentTimeMillis() / HOUR_MS)
                    .setUpstreamDataSourceFactory(() -> safeMetadata)
                    .setCacheWriteDataSinkFactory(() -> new DataSink() {
                        private DataSink sink;
                        @Override public void open(DataSpec spec) throws IOException {
                            if (!root.equals(upstream.getUri()) || !allowsStorage(upstream.getResponseHeaders())) return;
                            sink = new CacheDataSink.Factory().setCache(store).createDataSink();
                            try { sink.open(spec); } catch (IOException unavailable) { close(); }
                        }
                        @Override public void write(byte[] bytes, int offset, int length) {
                            if (sink != null) { try { sink.write(bytes, offset, length); } catch (IOException unavailable) { close(); } }
                        }
                        @Override public void close() {
                            if (sink != null) { try { sink.close(); } catch (IOException ignored) {} finally { sink = null; } }
                        }
                    }).createDataSource();
            } catch (RuntimeException unavailable) { return upstream; }
        };
    }

    static boolean allowsStorage(Map<String,List<String>> headers) {
        String control = header(headers, "Cache-Control").toLowerCase(java.util.Locale.ROOT);
        if (!control.matches(".*\\bpublic\\b.*") || control.matches(".*\\b(?:no-store|no-cache|private)\\b.*")
            || !header(headers, "Set-Cookie").isEmpty() || !header(headers, "Vary").isEmpty()) return false;
        Matcher maxAge = MAX_AGE.matcher(control);
        try {
            String ageHeader = header(headers, "Age");
            long age = ageHeader.isEmpty() ? 0 : Long.parseLong(ageHeader);
            return age >= 0 && maxAge.find() && Long.parseLong(maxAge.group(1)) - age >= HOUR_MS / 1000;
        } catch (NumberFormatException invalid) { return false; }
    }

    private static String header(Map<String,List<String>> headers, String name) {
        for (Map.Entry<String,List<String>> entry : headers.entrySet()) {
            if (!name.equalsIgnoreCase(entry.getKey())) continue;
            StringBuilder joined = new StringBuilder();
            for (String value : entry.getValue()) {
                if (joined.length() > 0) joined.append(',');
                joined.append(value);
            }
            return joined.toString();
        }
        return "";
    }
}
