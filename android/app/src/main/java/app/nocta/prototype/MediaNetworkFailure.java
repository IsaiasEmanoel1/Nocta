package app.nocta.prototype;

import androidx.media3.datasource.HttpDataSource;
import java.io.EOFException;
import java.net.ConnectException;
import java.net.NoRouteToHostException;
import java.net.ProtocolException;
import java.net.SocketException;
import java.net.SocketTimeoutException;
import java.net.UnknownHostException;
import java.util.Locale;
import javax.net.ssl.SSLException;

final class MediaNetworkFailure {
    private MediaNetworkFailure() {}

    // Inspect exception classes and known message fragments. Never return a raw message.
    static String reason(Throwable error) {
        String reason = null;
        for (int depth = 0; error != null && depth < 12; depth++, error = error.getCause()) {
            if (error instanceof PublicMediaHttp.TransportPolicyException)
                return ((PublicMediaHttp.TransportPolicyException) error).reason;
            if (error instanceof PublicMediaHttp.Mp4InsteadOfPlaylistException) return "hls-returned-mp4";
            if (error instanceof PublicMediaHttp.NonPublicDnsException) return "dns-policy";
            if (error instanceof HttpDataSource.InvalidResponseCodeException) return "http-status";
            if (error instanceof HttpDataSource.CleartextNotPermittedException) return "cleartext-policy";
            if (error instanceof HttpDataSource.InvalidContentTypeException) return "http-content-type";
            if (error instanceof SSLException) return "tls";
            if (error instanceof UnknownHostException) return "dns";
            if (error instanceof ConnectException || error instanceof NoRouteToHostException) reason = "tcp-connect";
            else if (error instanceof SocketTimeoutException && reason == null) reason = "network-timeout";
            else if (error instanceof EOFException && reason == null) reason = "connection-ended";
            else if (error instanceof SocketException || error instanceof ProtocolException || error instanceof java.io.IOException) {
                String message = String.valueOf(error.getMessage()).toLowerCase(Locale.ROOT);
                if (message.contains("unexpected end of stream") || message.contains("connection reset") || message.contains("broken pipe"))
                    reason = "connection-ended";
                else if (error instanceof ProtocolException && reason == null) reason = "http-protocol";
                else if (error instanceof SocketException && reason == null) reason = "socket";
            }
        }
        return reason;
    }

    static boolean deterministicPolicy(String reason) {
        return "redirect-policy".equals(reason) || "redirect-limit".equals(reason) || "destination-policy".equals(reason)
            || "dns-policy".equals(reason) || "cleartext-policy".equals(reason);
    }
}
