// SPDX-License-Identifier: MIT
// Counts launches using the real RMS API. Tone is a separate user action (5/OK).
import javax.microedition.midlet.MIDlet;
import javax.microedition.lcdui.Canvas;
import javax.microedition.lcdui.Display;
import javax.microedition.lcdui.Graphics;
import javax.microedition.media.Manager;
import javax.microedition.rms.RecordStore;

public final class RmsAudioMIDlet extends MIDlet {
    protected void startApp() {
        String result;
        try {
            RecordStore rs = RecordStore.openRecordStore("spb-fixture", true);
            int count = rs.getNumRecords() == 0 ? 0 : (rs.getRecord(1)[0] & 255);
            byte[] value = { (byte)(count + 1) };
            if (rs.getNumRecords() == 0) rs.addRecord(value, 0, 1); else rs.setRecord(1, value, 0, 1);
            rs.closeRecordStore();
            result = "RMS launches: " + (count + 1);
        } catch (Exception e) { result = "RMS ERROR: " + e.getClass().getName(); }
        Display.getDisplay(this).setCurrent(new Screen(result));
    }
    protected void pauseApp() { }
    protected void destroyApp(boolean unconditional) { }
    private static final class Screen extends Canvas {
        private String status;
        Screen(String text) { status = text; }
        public void keyPressed(int code) {
            if (code == 53 || code == -5 || getGameAction(code) == FIRE) {
                try { Manager.playTone(69, 150, 40); }
                catch (Exception e) { status = "AUDIO ERROR: " + e.getClass().getName(); }
                repaint();
            }
        }
        protected void paint(Graphics g) {
            g.setColor(0x10182b); g.fillRect(0, 0, getWidth(), getHeight());
            g.setColor(0xffffff);
            g.drawString(status, 6, 20, Graphics.TOP | Graphics.LEFT);
            g.drawString("5 / OK: play tone", 6, 50, Graphics.TOP | Graphics.LEFT);
        }
    }
}
