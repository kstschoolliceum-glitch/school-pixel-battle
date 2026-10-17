// SPDX-License-Identifier: MIT
import java.io.File;
import org.recompile.mobile.MIDletLoader;

public final class LoaderProbe {
    public static void main(String[] args) throws Exception {
        // Run only our fixtures. This harness is not a sandbox for arbitrary JARs.
        if (args.length > 1 && args[1].equals("graphics")) {
            org.recompile.mobile.Mobile.setPlatform(new org.recompile.mobile.MobilePlatform("./unused", 240, 320));
        }
        MIDletLoader loader = MIDletLoader.getMIDletLoader(new File(args[0]));
        try { loader.start(); }
        finally { loader.close(); }
    }
}
