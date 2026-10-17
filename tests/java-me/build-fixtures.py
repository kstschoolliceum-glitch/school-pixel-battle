#!/usr/bin/env python3
"""SPDX-License-Identifier: MIT. Build original, permitted fixtures, without downloads.

Requires a local FreeJ2ME-Web JAR as a compile-time API. The emulator is not bundled.
Uses JDK compiler module because stripped JDK installations may omit the javac launcher.
"""
import argparse
from pathlib import Path
import subprocess
import zipfile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--emulator', type=Path, required=True)
parser.add_argument('--out', type=Path, required=True)
args = parser.parse_args()
emulator = args.emulator.resolve(strict=True)
out = args.out.resolve()
out.mkdir(parents=True, exist_ok=True)
root = Path(__file__).resolve().parent
compiler = ['java', '--module', 'jdk.compiler/com.sun.tools.javac.Main', '--release', '8']
for name in ['CanvasKeysMIDlet', 'RmsAudioMIDlet', 'BoundaryProbeMIDlet']:
    classes = out / name
    classes.mkdir(exist_ok=True)
    subprocess.run(compiler + ['-cp', str(emulator), '-d', str(classes), str(root / 'src' / (name + '.java'))], check=True)
    manifest = ('Manifest-Version: 1.0\r\nMIDlet-Name: ' + name + '\r\nMIDlet-Version: 1.0.0\r\n'
                'MIDlet-Vendor: School Pixel Battle test fixtures\r\nMIDlet-1: ' + name + ',, ' + name + '\r\n'
                'MicroEdition-Configuration: CLDC-1.1\r\nMicroEdition-Profile: MIDP-2.0\r\n\r\n')
    jar = out / (name + '.jar')
    with zipfile.ZipFile(jar, 'w', zipfile.ZIP_DEFLATED) as archive:
        archive.writestr('META-INF/MANIFEST.MF', manifest)
        for file in sorted(classes.glob('*.class')):
            archive.write(file, file.name)
    print(jar.name, 'built')
harness = out / 'harness'
harness.mkdir(exist_ok=True)
subprocess.run(compiler + ['-cp', str(emulator), '-d', str(harness), str(root / 'harness' / 'LoaderProbe.java')], check=True)
