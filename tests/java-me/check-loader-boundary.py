#!/usr/bin/env python3
"""SPDX-License-Identifier: MIT. Local JVM-only isolation gate for our benign fixture.

Exit 1 means the isolation gate FAILED (JSE filesystem access was allowed).
A JVM denial does not establish browser isolation. Never run arbitrary JARs here.
"""
import argparse
import os
from pathlib import Path
import subprocess
import tempfile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--emulator', type=Path, required=True)
parser.add_argument('--fixtures', type=Path, required=True)
args = parser.parse_args()
fixture = args.fixtures.resolve(strict=True)
classpath = str(args.emulator.resolve(strict=True)) + os.pathsep + str(fixture / 'harness')
with tempfile.TemporaryDirectory(prefix='spb-loader-boundary-') as directory:
    result = subprocess.run(['java', '-Dspb.fixture.directory=' + directory, '-cp', classpath,
                             'LoaderProbe', str(fixture / 'BoundaryProbeMIDlet.jar')],
                            text=True, capture_output=True, timeout=15)
    print(result.stdout, end='')
    print(result.stderr, end='')
    marker = Path(directory) / 'owned-marker.txt'
    if marker.exists() and marker.read_bytes() == b'*':
        print('ISOLATION GATE FAILED: a MIDlet wrote a JSE file outside an RMS provider.')
        raise SystemExit(1)
    print('Probe did not write its marker. Investigate errors; browser isolation is NOT established.')
    raise SystemExit(2)
