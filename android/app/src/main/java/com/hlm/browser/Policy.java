package com.hlm.browser;

import java.net.URI;
import java.util.Locale;
import java.util.HashSet;
import java.util.Set;

/** Exact origins only: no suffix matching, user info, wildcards or implicit ports. */
public final class Policy {
    public final String website;
    public final Set<String> origins = new HashSet<>();
    public final boolean allowHttp;
    public Policy(String website, String[] extra, boolean allowHttp) {
        if (extra.length > 100) throw new IllegalArgumentException("At most 100 additional origins are allowed");
        this.allowHttp = allowHttp;
        this.website = parse(website, allowHttp).toASCIIString();
        origins.add(origin(parse(website, allowHttp)));
        for (String raw : extra) {
            if (raw.trim().isEmpty()) continue;
            URI u = parse(raw.trim(), allowHttp);
            if (!(u.getPath().isEmpty() || u.getPath().equals("/")) || u.getQuery() != null || u.getFragment() != null)
                throw new IllegalArgumentException("Allowed origins cannot include paths, queries or fragments");
            origins.add(origin(u));
        }
    }
    static URI parse(String raw, boolean http) {
        try {
            if (raw == null || raw.length() > 4096 || !raw.equals(raw.trim())) throw new Exception();
            URI u = new URI(raw);
            String scheme = u.getScheme();
            if (!("https".equalsIgnoreCase(scheme) || (http && "http".equalsIgnoreCase(scheme))) || u.getHost() == null || u.getUserInfo() != null || u.getPort() < -1 || u.getPort() > 65535 || u.getPort() == 0) throw new Exception();
            return u;
        } catch (Exception e) { throw new IllegalArgumentException("Enter a valid HTTPS URL without credentials (HTTP requires explicit opt-in)"); }
    }
    static String origin(URI u) {
        String scheme = u.getScheme().toLowerCase(Locale.ROOT);
        int port = u.getPort() == -1 ? (scheme.equals("https") ? 443 : 80) : u.getPort();
        return scheme + "://" + u.getHost().toLowerCase(Locale.ROOT) + ":" + port;
    }
    public boolean allows(String raw) {
        try { return origins.contains(origin(parse(raw, allowHttp))); }
        catch (IllegalArgumentException e) { return false; }
    }
    public boolean mediaAllowed(String origin, String[] kinds, boolean camera, boolean microphone) {
        if (!allows(origin) || !origin.toLowerCase(Locale.ROOT).startsWith("https:") || kinds == null || kinds.length == 0) return false;
        for (String kind : kinds) if (!(kind.equals("video") && camera) && !(kind.equals("audio") && microphone)) return false;
        return true;
    }
}
