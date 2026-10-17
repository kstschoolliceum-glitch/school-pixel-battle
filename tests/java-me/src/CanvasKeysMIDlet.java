// SPDX-License-Identifier: MIT
// Original test fixture. No commercial game assets or code.
import javax.microedition.midlet.MIDlet;
import javax.microedition.lcdui.Canvas;
import javax.microedition.lcdui.Display;
import javax.microedition.lcdui.Graphics;
import javax.microedition.lcdui.Image;

public final class CanvasKeysMIDlet extends MIDlet {
    private final Screen screen = new Screen();
    protected void startApp() { Display.getDisplay(this).setCurrent(screen); }
    protected void pauseApp() { }
    protected void destroyApp(boolean unconditional) { }
    private static final class Screen extends Canvas {
        private int lastKey;
        private boolean down;
        private final Image tile = Image.createRGBImage(new int[] {
            0xffff00ff, 0xff00ffff, 0xff00ffff, 0xffff00ff
        }, 2, 2, false);
        public void keyPressed(int code) { lastKey = code; down = true; repaint(); }
        public void keyReleased(int code) { lastKey = code; down = false; repaint(); }
        protected void paint(Graphics g) {
            g.setColor(0x10182b); g.fillRect(0, 0, getWidth(), getHeight());
            g.setColor(0xffffff);
            g.drawString("Canvas / Image / Nokia", 8, 12, Graphics.TOP | Graphics.LEFT);
            g.drawString(new StringBuffer("Key: ").append(lastKey).toString(), 8, 40, Graphics.TOP | Graphics.LEFT);
            g.drawString(down ? "PRESSED" : "RELEASED", 8, 68, Graphics.TOP | Graphics.LEFT);
            g.drawImage(tile, 8, 104, Graphics.TOP | Graphics.LEFT);
        }
    }
}
