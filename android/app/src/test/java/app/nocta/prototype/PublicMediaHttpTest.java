package app.nocta.prototype;

import java.net.InetAddress;
import java.net.ConnectException;
import java.net.UnknownHostException;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutionException;
import javax.net.ssl.SSLHandshakeException;
import okhttp3.HttpUrl;
import org.junit.Test;
import static org.junit.Assert.*;

public class PublicMediaHttpTest {
    @Test public void upgradesOnlyValidBlockedRedirectsWithoutOpeningCleartext() {
        HttpUrl current = HttpUrl.get("http://zjo.lat/redirect");
        HttpUrl next = HttpUrl.get("http://cdn.example.org/media?key=a%2Fb");
        assertEquals("https://cdn.example.org/media?key=a%2Fb", PublicMediaHttp.redirectTarget(current, current, next, true, "GET").toString());
        assertNull(PublicMediaHttp.redirectTarget(current, current, next, true, "POST"));
        assertNull(PublicMediaHttp.redirectTarget(current, current, HttpUrl.get("http://127.0.0.1/media"), true, "GET"));
        assertNull(PublicMediaHttp.redirectTarget(current, current, HttpUrl.get("http://user@cdn.example.org/media"), true, "GET"));
        assertNull(PublicMediaHttp.redirectTarget(current, next.newBuilder().scheme("https").port(443).build(), next, true, "GET"));
        HttpUrl allowed = HttpUrl.get("http://dbonline.tech-cdn.top/media");
        assertEquals(allowed, PublicMediaHttp.redirectTarget(current, current, allowed, true, "GET"));
    }
    @Test public void storesOnlyExplicitlyPublicResponsesWithinTheMediaCacheWindow() {
        assertTrue(LocalMediaCache.allowsStorage(java.util.Map.of("Cache-Control", java.util.List.of("public, max-age=7200"))));
        assertFalse(LocalMediaCache.allowsStorage(java.util.Map.of("Cache-Control", java.util.List.of("public, max-age=7200, no-store"))));
        assertFalse(LocalMediaCache.allowsStorage(java.util.Map.of("Cache-Control", java.util.List.of("public, max-age=7200"), "Age", java.util.List.of("4000"))));
        assertFalse(LocalMediaCache.allowsStorage(java.util.Map.of("Cache-Control", java.util.List.of("public, max-age=7200"), "Set-Cookie", java.util.List.of("private=value"))));
    }
    @Test public void detectsAnMp4RootWithoutMistakingPlaylistOrShortDataForMedia() {
        assertTrue(PublicMediaHttp.startsWithMp4FileType(new byte[]{0, 0, 0, 24, 'f', 't', 'y', 'p', 'i', 's', 'o', 'm'}));
        assertFalse(PublicMediaHttp.startsWithMp4FileType("#EXTM3U\n#EXT-X-VERSION:3".getBytes(StandardCharsets.UTF_8)));
        assertFalse(PublicMediaHttp.startsWithMp4FileType("1234ftyp".getBytes(StandardCharsets.UTF_8)));
    }
    @Test public void distinguishesWrappedRedirectRejectionsFromConnectionFailures() {
        IOException redirect = new PublicMediaHttp.TransportPolicyException("redirect-policy", 302, HttpUrl.get("http://example.org/video"));
        assertEquals("redirect-policy", MediaNetworkFailure.reason(new IOException(new ExecutionException(redirect))));
        assertEquals("dns", MediaNetworkFailure.reason(new IOException(new UnknownHostException("example.org"))));
        assertEquals("tcp-connect", MediaNetworkFailure.reason(new ConnectException()));
        assertEquals("tls", MediaNetworkFailure.reason(new SSLHandshakeException("fixture")));
        assertTrue(MediaNetworkFailure.deterministicPolicy("redirect-policy"));
        assertFalse(MediaNetworkFailure.deterministicPolicy("tcp-connect"));
    }
    @Test public void allowsBadgerChainWithoutAllowingOtherCleartextDestinations() {
        HttpUrl root = HttpUrl.get("https://fenixflix.fenixhub.online/r/example");
        assertTrue(PublicMediaHttp.allowsCleartext(root, "video/mp4"));
        assertTrue(PublicMediaHttp.allowedHop(root, HttpUrl.get("http://dbonline.tech-cdn.top/example"), true));
        assertTrue(PublicMediaHttp.allowedHop(root, HttpUrl.get("http://zjo.lat/example"), true));
        assertTrue(PublicMediaHttp.allowedHop(root, HttpUrl.get("https://cdn.example.org/video"), true));
        assertFalse(PublicMediaHttp.allowedHop(root, HttpUrl.get("http://rfc-infinite.top/example"), true));
        assertFalse(PublicMediaHttp.allowedHop(root, HttpUrl.get("http://cdn.example.org/video"), true));
        assertFalse(PublicMediaHttp.allowedHop(root, HttpUrl.get("http://sub.zjo.lat/example"), true));
        assertFalse(PublicMediaHttp.allowedHop(root, HttpUrl.get("http://zjo.lat/example"), false));
    }

    @Test public void rejectsUnsafeUrlsAndNonPublicDnsResults() throws Exception {
        assertFalse(PublicMediaHttp.allowed(HttpUrl.get("https://127.0.0.1/video"), false));
        assertFalse(PublicMediaHttp.allowed(HttpUrl.get("https://[::1]/video"), false));
        assertFalse(PublicMediaHttp.allowed(HttpUrl.get("https://user@cdn.example.org/video"), false));
        assertFalse(PublicMediaHttp.allowed(HttpUrl.get("https://cdn.example.org:8443/video"), false));
        for (String address : new String[]{"127.0.0.1", "10.0.0.1", "169.254.169.254", "100.64.0.1", "::1", "fc00::1"}) {
            assertFalse(address, PublicMediaHttp.publicAddress(InetAddress.getByName(address)));
        }
        assertTrue(PublicMediaHttp.publicAddress(InetAddress.getByName("8.8.8.8")));
        assertTrue(PublicMediaHttp.publicAddress(InetAddress.getByName("2001:4860:4860::8888")));
    }
}
