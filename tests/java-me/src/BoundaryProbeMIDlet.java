// SPDX-License-Identifier: MIT
// Benign local-only probe: writes only a marker under the harness-owned temp dir.
// This is a loader boundary test on a desktop JVM, NOT proof of a browser exploit.
import javax.microedition.midlet.MIDlet;
import java.io.File;
import java.io.FileOutputStream;

public final class BoundaryProbeMIDlet extends MIDlet {
    protected void startApp() {
        try {
            Class.forName("java.net.URL"); // Class availability only: no network request.
            Class.forName("java.lang.reflect.Method");
            String directory = System.getProperty("spb.fixture.directory");
            if (directory == null) throw new IllegalStateException("Harness directory required");
            File file = new File(directory, "owned-marker.txt");
            FileOutputStream stream = new FileOutputStream(file);
            stream.write(42); stream.close();
            System.out.println("BOUNDARY: JSE classes reachable; own marker written");
        } catch (Exception error) { throw new RuntimeException(error); }
    }
    protected void pauseApp() { }
    protected void destroyApp(boolean unconditional) { }
}
