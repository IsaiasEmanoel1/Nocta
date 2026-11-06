package app.nocta.prototype;

import java.io.IOException;
import java.net.InetAddress;
import java.net.Proxy;
import java.net.UnknownHostException;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.TimeUnit;
import okhttp3.Dns;
import okhttp3.HttpUrl;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;

/** HTTP transport for addon media in the experimental Android build. */
final class PublicMediaHttp {
    private static final int MAX_REDIRECTS = 5;

    private PublicMediaHttp() {}

    static final class TransportPolicyException extends IOException {
        final String reason;
        final Integer status;
        final String destinationScheme;

        TransportPolicyException(String reason, Integer status, HttpUrl destination) {
            super(reason);
            this.reason = reason;
            this.status = status;
            this.destinationScheme = destination == null ? null : destination.scheme();
        }
    }

    static final class NonPublicDnsException extends UnknownHostException {
        NonPublicDnsException() { super("Non-public media address"); }
    }

    static final class Mp4InsteadOfPlaylistException extends IOException {
        Mp4InsteadOfPlaylistException() { super("Progressive MP4 returned for the HLS root"); }
    }

    static boolean startsWithMp4FileType(byte[] prefix) {
        return prefix.length >= 12 && prefix[4] == 'f' && prefix[5] == 't' && prefix[6] == 'y' && prefix[7] == 'p';
    }

    static boolean cleartextHost(String host) {
        return badgerHop(host) || host.equals("rfc-infinite.top");
    }

    private static boolean badgerHop(String host) {
        return host.equals("dbonline.tech-cdn.top") || host.equals("zjo.lat");
    }

    private static boolean badgerRoot(HttpUrl url) {
        return url.isHttps() && url.host().equals("fenixflix.fenixhub.online") && url.encodedPath().startsWith("/r/");
    }

    static boolean allowed(HttpUrl url, boolean cleartext) {
        if (url == null || !url.username().isEmpty() || !url.password().isEmpty() || url.fragment() != null) return false;
        String host = url.host();
        if (!host.matches("[a-z0-9-]+(?:\\.[a-z0-9-]+)+") || host.matches("[0-9.]+")
            || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")
            || host.endsWith(".home.arpa") || host.endsWith(".lan") || host.endsWith(".localdomain")
            || host.endsWith(".onion")) return false;
        return url.isHttps() ? url.port() == 443 : cleartext && url.port() == 80 && cleartextHost(host);
    }

    static boolean allowsCleartext(HttpUrl root, String mime) {
        return root != null && "video/mp4".equals(mime) && (cleartextHost(root.host()) || badgerRoot(root));
    }

    static boolean allowedHop(HttpUrl root, HttpUrl next, boolean cleartext) {
        if (!allowed(next, cleartext)) return false;
        return next.isHttps() || next.host().equals(root.host())
            || (badgerRoot(root) || badgerHop(root.host())) && badgerHop(next.host());
    }

    static HttpUrl redirectTarget(HttpUrl root, HttpUrl current, HttpUrl next, boolean cleartext, String method) {
        if (allowedHop(root, next, cleartext)) return next;
        if (next == null || next.isHttps() || next.port() != 80 || !(method.equals("GET") || method.equals("HEAD"))) return null;
        // Try the same public endpoint over TLS. No cleartext fallback or host substitution.
        HttpUrl upgraded = next.newBuilder().scheme("https").port(443).build();
        return !upgraded.equals(current) && allowedHop(root, upgraded, cleartext) ? upgraded : null;
    }

    static boolean publicAddress(InetAddress address) {
        if (address.isAnyLocalAddress() || address.isLoopbackAddress() || address.isLinkLocalAddress()
            || address.isSiteLocalAddress() || address.isMulticastAddress()) return false;
        byte[] bytes = address.getAddress();
        int a = bytes[0] & 255, b = bytes[1] & 255, c = bytes[2] & 255;
        if (bytes.length == 4) {
            return a > 0 && a < 224 && !(a == 100 && b >= 64 && b <= 127)
                && !(a == 192 && b == 0 && (c == 0 || c == 2))
                && !(a == 192 && b == 88 && c == 99)
                && !(a == 198 && (b == 18 || b == 19 || b == 51 && c == 100))
                && !(a == 203 && b == 0 && c == 113);
        }
        return (a & 224) == 32 && !(a == 32 && b == 2) // Exclude 6to4.
            && !(a == 32 && b == 1 && (c < 2 || c == 13 && (bytes[3] & 255) == 184))
            && !(a == 63 && b == 255);
    }

    private static List<InetAddress> resolvePublic(String host) throws UnknownHostException {
        List<InetAddress> addresses = Dns.SYSTEM.lookup(host);
        for (InetAddress address : addresses) {
            if (!publicAddress(address)) throw new NonPublicDnsException();
        }
        return addresses;
    }

    static OkHttpClient client(HttpUrl root, boolean cleartext, int readTimeout, AtomicBoolean inspectHlsRoot) {
        return new OkHttpClient.Builder()
            .proxy(Proxy.NO_PROXY)
            .dns(PublicMediaHttp::resolvePublic)
            .connectTimeout(8, TimeUnit.SECONDS)
            .readTimeout(readTimeout, TimeUnit.MILLISECONDS)
            .followRedirects(false)
            .followSslRedirects(false)
            .addInterceptor(chain -> {
                Request request = chain.request();
                boolean rootRequest = root.equals(request.url());
                for (int hops = 0; ; hops++) {
                    HttpUrl url = request.url();
                    if (!allowedHop(root, url, cleartext)) throw new TransportPolicyException("destination-policy", null, url);
                    if (!sameOrigin(root, url)) request = withoutOriginHeaders(request).build();
                    Response response = chain.proceed(request);
                    int status = response.code();
                    if (status != 301 && status != 302 && status != 303 && status != 307 && status != 308) {
                        if (rootRequest && response.isSuccessful() && inspectHlsRoot.get()) {
                            try {
                                boolean mp4 = startsWithMp4FileType(response.peekBody(16).bytes());
                                inspectHlsRoot.set(false);
                                if (mp4) throw new Mp4InsteadOfPlaylistException();
                            } catch (IOException error) {
                                response.close();
                                throw error;
                            }
                        }
                        return response;
                    }
                    String location = response.header("Location");
                    if (location == null) return response;
                    HttpUrl next = url.resolve(location);
                    response.close();
                    if (hops >= MAX_REDIRECTS) throw new TransportPolicyException("redirect-limit", status, next);
                    HttpUrl destination = redirectTarget(root, url, next, cleartext, request.method());
                    if (destination == null) throw new TransportPolicyException("redirect-policy", status, next);
                    request = (sameOrigin(url, destination) && destination.equals(next) ? request.newBuilder() : withoutOriginHeaders(request)).url(destination).build();
                }
            }).build();
    }

    private static boolean sameOrigin(HttpUrl first, HttpUrl second) {
        return first.scheme().equals(second.scheme()) && first.host().equals(second.host()) && first.port() == second.port();
    }

    private static Request.Builder withoutOriginHeaders(Request request) {
        return request.newBuilder().removeHeader("User-Agent").removeHeader("Referer")
            .removeHeader("Authorization").removeHeader("Cookie");
    }
}
