#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
"""Bundle the pinned JS2ME checkout. No network access, no third-party minifier."""
import argparse
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--out',type=Path,required=True);a=p.parse_args()
order=['zip/zip.js','zip/inflate.js','zip/zip-ext.js','js2me.js','bufferStream.js','convert.js','classes.js','execute.js','events.js','manifest.js','methodStub.js','launcher.js','loader.js','numbers.js','resources.js','threads.js','utils.js','program_zazu.js']
parts=['// JS2ME 828b81b468953c34bb754b59e67c1021754e8bdb. See THIRD_PARTY.md and LICENSE.\n']
for name in order:
 source=(a.source/'js'/name).read_text()
 if name=='convert.js': source=source.replace("attributeName == 'StackMap' ||", "attributeName == 'StackMapTable' || attributeName == 'StackMap' ||")
 if name=='methodStub.js': source=source.replace('localStorage', 'js2me.codeCache')
 parts += ['\n// upstream: js/'+name+'\n',source+'\n;\n']
parts += ['\nvar JS2ME_CLASS_SOURCES = Object.create(null);\n']
for f in sorted((a.source/'js/me').rglob('*.js')):
 name=f.relative_to(a.source).as_posix();s=f.read_text()
 # Two browser integration patches: explicit canvas attach events, game-scoped RMS.
 if name.endswith('/lcdui/Canvas.js'):
  s=s.replace('DOMNodeInserted','spb-attached').replace('DOMNodeRemoved','spb-detached')
  s=s.replace('function mouseHandler(event)', 'this.keyPressListener.spbCanvas = this;\n\t\tfunction mouseHandler(event)')
 if name.endswith('/lcdui/Display.js'):
  s=s.replace("screen.innerHTML = '';", "Array.prototype.forEach.call(screen.children, function(n) { n.dispatchEvent(new Event('spb-detached')); }); screen.innerHTML = '';")
  s=s.replace('screen.appendChild(displayable.element);',"screen.appendChild(displayable.element); displayable.element.dispatchEvent(new Event('spb-attached'));")
 if name.endswith('/rms/RecordStore.js'):
  s=s.replace('localStorage','js2me.rmsStorage')
  s=s.replace("console.warn('delete record');", "throw new javaRoot.$javax.$microedition.$rms.$RecordStoreException('deleteRecord is not supported by this engine');")
 parts += ["\n// upstream: "+name+"\nJS2ME_CLASS_SOURCES['"+name+"'] = function() {\n"+s+'\n};\n']
a.out.parent.mkdir(parents=True,exist_ok=True);a.out.write_text(''.join(parts))
print(a.out, a.out.stat().st_size)
