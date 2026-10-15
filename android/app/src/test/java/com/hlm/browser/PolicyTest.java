package com.hlm.browser;
import org.junit.Test;
import static org.junit.Assert.*;
public class PolicyTest {
    private Policy policy() { return new Policy("https://app.example/portal", new String[]{"https://login.example", "https://api.example:8443"}, false); }
    @Test public void routesAndApprovedOrigins() { assertTrue(policy().allows("https://app.example/route?a=1#x")); assertTrue(policy().allows("https://login.example/auth")); assertTrue(policy().allows("https://api.example:8443/data")); }
    @Test public void externalDestinationsAreBlocked() {
        for (String u : new String[]{"https://evil.example", "https://app.example.evil.org", "https://sub.app.example", "https://app.example:8443", "http://app.example", "https://app.example@evil.org", "file:///etc/passwd", "javascript:alert(1)", "intent://external", "data:text/html,test"}) assertFalse(u, policy().allows(u));
    }
    @Test public void httpIsExplicitAndPortSpecific() { Policy p = new Policy("http://localhost:8181", new String[]{}, true); assertTrue(p.allows("http://localhost:8181/route")); assertFalse(p.allows("http://localhost:8182/")); }
    @Test public void invalidRulesAreRejected() {
        for (String rule : new String[]{"https://api.example/path", "https://api.example/?q=x", "https://api.example/#x", "http://api.example", "https://user:secret@api.example", "https://*.example"}) {
            try { new Policy("https://app.example", new String[]{rule}, false); fail(rule); } catch (IllegalArgumentException expected) {}
        }
    }
    @Test public void removalTakesEffect() { assertTrue(policy().allows("https://login.example")); assertFalse(new Policy("https://app.example", new String[]{}, false).allows("https://login.example")); }
    @Test public void mediaRequiresApprovedHttpsAndSpecificItCapabilities() {
        assertTrue(policy().mediaAllowed("https://app.example", new String[]{"video"}, true, false));
        assertFalse(policy().mediaAllowed("https://evil.example", new String[]{"video"}, true, true));
        assertFalse(policy().mediaAllowed("https://app.example", new String[]{"audio"}, true, false));
        assertFalse(policy().mediaAllowed("https://app.example", new String[]{"audio", "video"}, false, true));
        assertFalse(policy().mediaAllowed("https://app.example", new String[]{"screen"}, true, true));
        Policy local = new Policy("http://192.168.0.127:4200/fbs", new String[]{}, true);
        assertTrue(local.allows("http://192.168.0.127:4200/route"));
        assertFalse(local.mediaAllowed(local.website, new String[]{"video"}, true, true));
    }
}
