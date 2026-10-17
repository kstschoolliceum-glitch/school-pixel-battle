// JS2ME 828b81b468953c34bb754b59e67c1021754e8bdb. See THIRD_PARTY.md and LICENSE.

// upstream: js/zip/zip.js
/*
 Copyright (c) 2013 Gildas Lormeau. All rights reserved.

 Redistribution and use in source and binary forms, with or without
 modification, are permitted provided that the following conditions are met:

 1. Redistributions of source code must retain the above copyright notice,
 this list of conditions and the following disclaimer.

 2. Redistributions in binary form must reproduce the above copyright
 notice, this list of conditions and the following disclaimer in
 the documentation and/or other materials provided with the distribution.

 3. The names of the authors may not be used to endorse or promote products
 derived from this software without specific prior written permission.

 THIS SOFTWARE IS PROVIDED ``AS IS'' AND ANY EXPRESSED OR IMPLIED WARRANTIES,
 INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND
 FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL JCRAFT,
 INC. OR ANY CONTRIBUTORS TO THIS SOFTWARE BE LIABLE FOR ANY DIRECT, INDIRECT,
 INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA,
 OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
 LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
 NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE,
 EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

(function(obj) {

	var ERR_BAD_FORMAT = "File format is not recognized.";
	var ERR_ENCRYPTED = "File contains encrypted entry.";
	var ERR_ZIP64 = "File is using Zip64 (4gb+ file size).";
	var ERR_READ = "Error while reading zip file.";
	var ERR_WRITE = "Error while writing zip file.";
	var ERR_WRITE_DATA = "Error while writing file data.";
	var ERR_READ_DATA = "Error while reading file data.";
	var ERR_DUPLICATED_NAME = "File already exists.";
	var CHUNK_SIZE = 512 * 1024;

	var INFLATE_JS = "inflate.js";
	var DEFLATE_JS = "deflate.js";
	
	var TEXT_PLAIN = "text/plain";
	
	var MESSAGE_EVENT = "message";

	var appendABViewSupported;
	try {
		appendABViewSupported = new Blob([ new DataView(new ArrayBuffer(0)) ]).size === 0;
	} catch (e) {
	}

	function Crc32() {
		var crc = -1, that = this;
		that.append = function(data) {
			var offset, table = that.table;
			for (offset = 0; offset < data.length; offset++)
				crc = (crc >>> 8) ^ table[(crc ^ data[offset]) & 0xFF];
		};
		that.get = function() {
			return ~crc;
		};
	}
	Crc32.prototype.table = (function() {
		var i, j, t, table = [];
		for (i = 0; i < 256; i++) {
			t = i;
			for (j = 0; j < 8; j++)
				if (t & 1)
					t = (t >>> 1) ^ 0xEDB88320;
				else
					t = t >>> 1;
			table[i] = t;
		}
		return table;
	})();

	function blobSlice(blob, index, length) {
		if (blob.slice)
			return blob.slice(index, index + length);
		else if (blob.webkitSlice)
			return blob.webkitSlice(index, index + length);
		else if (blob.mozSlice)
			return blob.mozSlice(index, index + length);
		else if (blob.msSlice)
			return blob.msSlice(index, index + length);
	}

	function getDataHelper(byteLength, bytes) {
		var dataBuffer, dataArray;
		dataBuffer = new ArrayBuffer(byteLength);
		dataArray = new Uint8Array(dataBuffer);
		if (bytes)
			dataArray.set(bytes, 0);
		return {
			buffer : dataBuffer,
			array : dataArray,
			view : new DataView(dataBuffer)
		};
	}

	// Readers
	function Reader() {
	}

	function TextReader(text) {
		var that = this, blobReader;

		function init(callback, onerror) {
			var blob = new Blob([ text ], {
				type : TEXT_PLAIN
			});
			blobReader = new BlobReader(blob);
			blobReader.init(function() {
				that.size = blobReader.size;
				callback();
			}, onerror);
		}

		function readUint8Array(index, length, callback, onerror) {
			blobReader.readUint8Array(index, length, callback, onerror);
		}

		that.size = 0;
		that.init = init;
		that.readUint8Array = readUint8Array;
	}
	TextReader.prototype = new Reader();
	TextReader.prototype.constructor = TextReader;

	function Data64URIReader(dataURI) {
		var that = this, dataStart;

		function init(callback) {
			var dataEnd = dataURI.length;
			while (dataURI.charAt(dataEnd - 1) == "=")
				dataEnd--;
			dataStart = dataURI.indexOf(",") + 1;
			that.size = Math.floor((dataEnd - dataStart) * 0.75);
			callback();
		}

		function readUint8Array(index, length, callback) {
			var i, data = getDataHelper(length);
			var start = Math.floor(index / 3) * 4;
			var end = Math.ceil((index + length) / 3) * 4;
			var bytes = obj.atob(dataURI.substring(start + dataStart, end + dataStart));
			var delta = index - Math.floor(start / 4) * 3;
			for (i = delta; i < delta + length; i++)
				data.array[i - delta] = bytes.charCodeAt(i);
			callback(data.array);
		}

		that.size = 0;
		that.init = init;
		that.readUint8Array = readUint8Array;
	}
	Data64URIReader.prototype = new Reader();
	Data64URIReader.prototype.constructor = Data64URIReader;

	function BlobReader(blob) {
		var that = this;

		function init(callback) {
			this.size = blob.size;
			callback();
		}

		function readUint8Array(index, length, callback, onerror) {
			var reader = new FileReader();
			reader.onload = function(e) {
				callback(new Uint8Array(e.target.result));
			};
			reader.onerror = onerror;
			reader.readAsArrayBuffer(blobSlice(blob, index, length));
		}

		that.size = 0;
		that.init = init;
		that.readUint8Array = readUint8Array;
	}
	BlobReader.prototype = new Reader();
	BlobReader.prototype.constructor = BlobReader;

	// Writers

	function Writer() {
	}
	Writer.prototype.getData = function(callback) {
		callback(this.data);
	};

	function TextWriter(encoding) {
		var that = this, blob;

		function init(callback) {
			blob = new Blob([], {
				type : TEXT_PLAIN
			});
			callback();
		}

		function writeUint8Array(array, callback) {
			blob = new Blob([ blob, appendABViewSupported ? array : array.buffer ], {
				type : TEXT_PLAIN
			});
			callback();
		}

		function getData(callback, onerror) {
			var reader = new FileReader();
			reader.onload = function(e) {
				callback(e.target.result);
			};
			reader.onerror = onerror;
			reader.readAsText(blob, encoding);
		}

		that.init = init;
		that.writeUint8Array = writeUint8Array;
		that.getData = getData;
	}
	TextWriter.prototype = new Writer();
	TextWriter.prototype.constructor = TextWriter;

	function Data64URIWriter(contentType) {
		var that = this, data = "", pending = "";

		function init(callback) {
			data += "data:" + (contentType || "") + ";base64,";
			callback();
		}

		function writeUint8Array(array, callback) {
			var i, delta = pending.length, dataString = pending;
			pending = "";
			for (i = 0; i < (Math.floor((delta + array.length) / 3) * 3) - delta; i++)
				dataString += String.fromCharCode(array[i]);
			for (; i < array.length; i++)
				pending += String.fromCharCode(array[i]);
			if (dataString.length > 2)
				data += obj.btoa(dataString);
			else
				pending = dataString;
			callback();
		}

		function getData(callback) {
			callback(data + obj.btoa(pending));
		}

		that.init = init;
		that.writeUint8Array = writeUint8Array;
		that.getData = getData;
	}
	Data64URIWriter.prototype = new Writer();
	Data64URIWriter.prototype.constructor = Data64URIWriter;

	function BlobWriter(contentType) {
		var blob, that = this;

		function init(callback) {
			blob = new Blob([], {
				type : contentType
			});
			callback();
		}

		function writeUint8Array(array, callback) {
			blob = new Blob([ blob, appendABViewSupported ? array : array.buffer ], {
				type : contentType
			});
			callback();
		}

		function getData(callback) {
			callback(blob);
		}

		that.init = init;
		that.writeUint8Array = writeUint8Array;
		that.getData = getData;
	}
	BlobWriter.prototype = new Writer();
	BlobWriter.prototype.constructor = BlobWriter;

	// inflate/deflate core functions

	function launchWorkerProcess(worker, reader, writer, offset, size, onappend, onprogress, onend, onreaderror, onwriteerror) {
		var chunkIndex = 0, index, outputSize;

		function onflush() {
			worker.removeEventListener(MESSAGE_EVENT, onmessage, false);
			onend(outputSize);
		}

		function onmessage(event) {
			var message = event.data, data = message.data;

			if (message.onappend) {
				outputSize += data.length;
				writer.writeUint8Array(data, function() {
					onappend(false, data);
					step();
				}, onwriteerror);
			}
			if (message.onflush)
				if (data) {
					outputSize += data.length;
					writer.writeUint8Array(data, function() {
						onappend(false, data);
						onflush();
					}, onwriteerror);
				} else
					onflush();
			if (message.progress && onprogress)
				onprogress(index + message.current, size);
		}

		function step() {
			index = chunkIndex * CHUNK_SIZE;
			if (index < size)
				reader.readUint8Array(offset + index, Math.min(CHUNK_SIZE, size - index), function(array) {
					worker.postMessage({
						append : true,
						data : array
					});
					chunkIndex++;
					if (onprogress)
						onprogress(index, size);
					onappend(true, array);
				}, onreaderror);
			else
				worker.postMessage({
					flush : true
				});
		}

		outputSize = 0;
		worker.addEventListener(MESSAGE_EVENT, onmessage, false);
		step();
	}

	function launchProcess(process, reader, writer, offset, size, onappend, onprogress, onend, onreaderror, onwriteerror) {
		var chunkIndex = 0, index, outputSize = 0;

		function step() {
			var outputData;
			index = chunkIndex * CHUNK_SIZE;
			if (index < size)
				reader.readUint8Array(offset + index, Math.min(CHUNK_SIZE, size - index), function(inputData) {
					var outputData = process.append(inputData, function() {
						if (onprogress)
							onprogress(offset + index, size);
					});
					outputSize += outputData.length;
					onappend(true, inputData);
					writer.writeUint8Array(outputData, function() {
						onappend(false, outputData);
						chunkIndex++;
						setTimeout(step, 1);
					}, onwriteerror);
					if (onprogress)
						onprogress(index, size);
				}, onreaderror);
			else {
				outputData = process.flush();
				if (outputData) {
					outputSize += outputData.length;
					writer.writeUint8Array(outputData, function() {
						onappend(false, outputData);
						onend(outputSize);
					}, onwriteerror);
				} else
					onend(outputSize);
			}
		}

		step();
	}

	function inflate(reader, writer, offset, size, computeCrc32, onend, onprogress, onreaderror, onwriteerror) {
		var worker, crc32 = new Crc32();

		function oninflateappend(sending, array) {
			if (computeCrc32 && !sending)
				crc32.append(array);
		}

		function oninflateend(outputSize) {
			onend(outputSize, crc32.get());
		}

		if (obj.zip.useWebWorkers) {
			worker = new Worker(obj.zip.workerScriptsPath + INFLATE_JS);
			launchWorkerProcess(worker, reader, writer, offset, size, oninflateappend, onprogress, oninflateend, onreaderror, onwriteerror);
		} else
			launchProcess(new obj.zip.Inflater(), reader, writer, offset, size, oninflateappend, onprogress, oninflateend, onreaderror, onwriteerror);
		return worker;
	}

	function deflate(reader, writer, level, onend, onprogress, onreaderror, onwriteerror) {
		var worker, crc32 = new Crc32();

		function ondeflateappend(sending, array) {
			if (sending)
				crc32.append(array);
		}

		function ondeflateend(outputSize) {
			onend(outputSize, crc32.get());
		}

		function onmessage() {
			worker.removeEventListener(MESSAGE_EVENT, onmessage, false);
			launchWorkerProcess(worker, reader, writer, 0, reader.size, ondeflateappend, onprogress, ondeflateend, onreaderror, onwriteerror);
		}

		if (obj.zip.useWebWorkers) {
			worker = new Worker(obj.zip.workerScriptsPath + DEFLATE_JS);
			worker.addEventListener(MESSAGE_EVENT, onmessage, false);
			worker.postMessage({
				init : true,
				level : level
			});
		} else
			launchProcess(new obj.zip.Deflater(), reader, writer, 0, reader.size, ondeflateappend, onprogress, ondeflateend, onreaderror, onwriteerror);
		return worker;
	}

	function copy(reader, writer, offset, size, computeCrc32, onend, onprogress, onreaderror, onwriteerror) {
		var chunkIndex = 0, crc32 = new Crc32();

		function step() {
			var index = chunkIndex * CHUNK_SIZE;
			if (index < size)
				reader.readUint8Array(offset + index, Math.min(CHUNK_SIZE, size - index), function(array) {
					if (computeCrc32)
						crc32.append(array);
					if (onprogress)
						onprogress(index, size, array);
					writer.writeUint8Array(array, function() {
						chunkIndex++;
						step();
					}, onwriteerror);
				}, onreaderror);
			else
				onend(size, crc32.get());
		}

		step();
	}

	// ZipReader

	function decodeASCII(str) {
		var i, out = "", charCode, extendedASCII = [ '\u00C7', '\u00FC', '\u00E9', '\u00E2', '\u00E4', '\u00E0', '\u00E5', '\u00E7', '\u00EA', '\u00EB',
				'\u00E8', '\u00EF', '\u00EE', '\u00EC', '\u00C4', '\u00C5', '\u00C9', '\u00E6', '\u00C6', '\u00F4', '\u00F6', '\u00F2', '\u00FB', '\u00F9',
				'\u00FF', '\u00D6', '\u00DC', '\u00F8', '\u00A3', '\u00D8', '\u00D7', '\u0192', '\u00E1', '\u00ED', '\u00F3', '\u00FA', '\u00F1', '\u00D1',
				'\u00AA', '\u00BA', '\u00BF', '\u00AE', '\u00AC', '\u00BD', '\u00BC', '\u00A1', '\u00AB', '\u00BB', '_', '_', '_', '\u00A6', '\u00A6',
				'\u00C1', '\u00C2', '\u00C0', '\u00A9', '\u00A6', '\u00A6', '+', '+', '\u00A2', '\u00A5', '+', '+', '-', '-', '+', '-', '+', '\u00E3',
				'\u00C3', '+', '+', '-', '-', '\u00A6', '-', '+', '\u00A4', '\u00F0', '\u00D0', '\u00CA', '\u00CB', '\u00C8', 'i', '\u00CD', '\u00CE',
				'\u00CF', '+', '+', '_', '_', '\u00A6', '\u00CC', '_', '\u00D3', '\u00DF', '\u00D4', '\u00D2', '\u00F5', '\u00D5', '\u00B5', '\u00FE',
				'\u00DE', '\u00DA', '\u00DB', '\u00D9', '\u00FD', '\u00DD', '\u00AF', '\u00B4', '\u00AD', '\u00B1', '_', '\u00BE', '\u00B6', '\u00A7',
				'\u00F7', '\u00B8', '\u00B0', '\u00A8', '\u00B7', '\u00B9', '\u00B3', '\u00B2', '_', ' ' ];
		for (i = 0; i < str.length; i++) {
			charCode = str.charCodeAt(i) & 0xFF;
			if (charCode > 127)
				out += extendedASCII[charCode - 128];
			else
				out += String.fromCharCode(charCode);
		}
		return out;
	}

	function decodeUTF8(string) {
		return decodeURIComponent(escape(string));
	}

	function getString(bytes) {
		var i, str = "";
		for (i = 0; i < bytes.length; i++)
			str += String.fromCharCode(bytes[i]);
		return str;
	}

	function getDate(timeRaw) {
		var date = (timeRaw & 0xffff0000) >> 16, time = timeRaw & 0x0000ffff;
		try {
			return new Date(1980 + ((date & 0xFE00) >> 9), ((date & 0x01E0) >> 5) - 1, date & 0x001F, (time & 0xF800) >> 11, (time & 0x07E0) >> 5,
					(time & 0x001F) * 2, 0);
		} catch (e) {
		}
	}

	function readCommonHeader(entry, data, index, centralDirectory, onerror) {
		entry.version = data.view.getUint16(index, true);
		entry.bitFlag = data.view.getUint16(index + 2, true);
		entry.compressionMethod = data.view.getUint16(index + 4, true);
		entry.lastModDateRaw = data.view.getUint32(index + 6, true);
		entry.lastModDate = getDate(entry.lastModDateRaw);
		if ((entry.bitFlag & 0x01) === 0x01) {
			onerror(ERR_ENCRYPTED);
			return;
		}
		if (centralDirectory || (entry.bitFlag & 0x0008) != 0x0008) {
			entry.crc32 = data.view.getUint32(index + 10, true);
			entry.compressedSize = data.view.getUint32(index + 14, true);
			entry.uncompressedSize = data.view.getUint32(index + 18, true);
		}
		if (entry.compressedSize === 0xFFFFFFFF || entry.uncompressedSize === 0xFFFFFFFF) {
			onerror(ERR_ZIP64);
			return;
		}
		entry.filenameLength = data.view.getUint16(index + 22, true);
		entry.extraFieldLength = data.view.getUint16(index + 24, true);
	}

	function createZipReader(reader, onerror) {
		function Entry() {
		}

		Entry.prototype.getData = function(writer, onend, onprogress, checkCrc32) {
			var that = this, worker;

			function terminate(callback, param) {
				if (worker)
					worker.terminate();
				worker = null;
				if (callback)
					callback(param);
			}

			function testCrc32(crc32) {
				var dataCrc32 = getDataHelper(4);
				dataCrc32.view.setUint32(0, crc32);
				return that.crc32 == dataCrc32.view.getUint32(0);
			}

			function getWriterData(uncompressedSize, crc32) {
				if (checkCrc32 && !testCrc32(crc32))
					onreaderror();
				else
					writer.getData(function(data) {
						terminate(onend, data);
					});
			}

			function onreaderror() {
				terminate(onerror, ERR_READ_DATA);
			}

			function onwriteerror() {
				terminate(onerror, ERR_WRITE_DATA);
			}

			reader.readUint8Array(that.offset, 30, function(bytes) {
				var data = getDataHelper(bytes.length, bytes), dataOffset;
				if (data.view.getUint32(0) != 0x504b0304) {
					onerror(ERR_BAD_FORMAT);
					return;
				}
				readCommonHeader(that, data, 4, false, onerror);
				dataOffset = that.offset + 30 + that.filenameLength + that.extraFieldLength;
				writer.init(function() {
					if (that.compressionMethod === 0)
						copy(reader, writer, dataOffset, that.compressedSize, checkCrc32, getWriterData, onprogress, onreaderror, onwriteerror);
					else
						worker = inflate(reader, writer, dataOffset, that.compressedSize, checkCrc32, getWriterData, onprogress, onreaderror, onwriteerror);
				}, onwriteerror);
			}, onreaderror);
		};

		function seekEOCDR(offset, entriesCallback) {
			reader.readUint8Array(reader.size - offset, offset, function(bytes) {
				var dataView = getDataHelper(bytes.length, bytes).view;
				if (dataView.getUint32(0) != 0x504b0506) {
					seekEOCDR(offset + 1, entriesCallback);
				} else {
					entriesCallback(dataView);
				}
			}, function() {
				onerror(ERR_READ);
			});
		}

		return {
			getEntries : function(callback) {
				if (reader.size < 22) {
					onerror(ERR_BAD_FORMAT);
					return;
				}
				// look for End of central directory record
				seekEOCDR(22, function(dataView) {
					var datalength, fileslength;
					datalength = dataView.getUint32(16, true);
					fileslength = dataView.getUint16(8, true);
					reader.readUint8Array(datalength, reader.size - datalength, function(bytes) {
						var i, index = 0, entries = [], entry, filename, comment, data = getDataHelper(bytes.length, bytes);
						for (i = 0; i < fileslength; i++) {
							entry = new Entry();
							if (data.view.getUint32(index) != 0x504b0102) {
								onerror(ERR_BAD_FORMAT);
								return;
							}
							readCommonHeader(entry, data, index + 6, true, onerror);
							entry.commentLength = data.view.getUint16(index + 32, true);
							entry.directory = ((data.view.getUint8(index + 38) & 0x10) == 0x10);
							entry.offset = data.view.getUint32(index + 42, true);
							filename = getString(data.array.subarray(index + 46, index + 46 + entry.filenameLength));
							entry.filename = ((entry.bitFlag & 0x0800) === 0x0800) ? decodeUTF8(filename) : decodeASCII(filename);
							if (!entry.directory && entry.filename.charAt(entry.filename.length - 1) == "/")
								entry.directory = true;
							comment = getString(data.array.subarray(index + 46 + entry.filenameLength + entry.extraFieldLength, index + 46
									+ entry.filenameLength + entry.extraFieldLength + entry.commentLength));
							entry.comment = ((entry.bitFlag & 0x0800) === 0x0800) ? decodeUTF8(comment) : decodeASCII(comment);
							entries.push(entry);
							index += 46 + entry.filenameLength + entry.extraFieldLength + entry.commentLength;
						}
						callback(entries);
					}, function() {
						onerror(ERR_READ);
					});
				});
			},
			close : function(callback) {
				if (callback)
					callback();
			}
		};
	}

	// ZipWriter

	function encodeUTF8(string) {
		return unescape(encodeURIComponent(string));
	}

	function getBytes(str) {
		var i, array = [];
		for (i = 0; i < str.length; i++)
			array.push(str.charCodeAt(i));
		return array;
	}

	function createZipWriter(writer, onerror, dontDeflate) {
		var worker, files = {}, filenames = [], datalength = 0;

		function terminate(callback, message) {
			if (worker)
				worker.terminate();
			worker = null;
			if (callback)
				callback(message);
		}

		function onwriteerror() {
			terminate(onerror, ERR_WRITE);
		}

		function onreaderror() {
			terminate(onerror, ERR_READ_DATA);
		}

		return {
			add : function(name, reader, onend, onprogress, options) {
				var header, filename, date;

				function writeHeader(callback) {
					var data;
					date = options.lastModDate || new Date();
					header = getDataHelper(26);
					files[name] = {
						headerArray : header.array,
						directory : options.directory,
						filename : filename,
						offset : datalength,
						comment : getBytes(encodeUTF8(options.comment || ""))
					};
					header.view.setUint32(0, 0x14000808);
					if (options.version)
						header.view.setUint8(0, options.version);
					if (!dontDeflate && options.level !== 0 && !options.directory)
						header.view.setUint16(4, 0x0800);
					header.view.setUint16(6, (((date.getHours() << 6) | date.getMinutes()) << 5) | date.getSeconds() / 2, true);
					header.view.setUint16(8, ((((date.getFullYear() - 1980) << 4) | (date.getMonth() + 1)) << 5) | date.getDate(), true);
					header.view.setUint16(22, filename.length, true);
					data = getDataHelper(30 + filename.length);
					data.view.setUint32(0, 0x504b0304);
					data.array.set(header.array, 4);
					data.array.set(filename, 30);
					datalength += data.array.length;
					writer.writeUint8Array(data.array, callback, onwriteerror);
				}

				function writeFooter(compressedLength, crc32) {
					var footer = getDataHelper(16);
					datalength += compressedLength || 0;
					footer.view.setUint32(0, 0x504b0708);
					if (typeof crc32 != "undefined") {
						header.view.setUint32(10, crc32, true);
						footer.view.setUint32(4, crc32, true);
					}
					if (reader) {
						footer.view.setUint32(8, compressedLength, true);
						header.view.setUint32(14, compressedLength, true);
						footer.view.setUint32(12, reader.size, true);
						header.view.setUint32(18, reader.size, true);
					}
					writer.writeUint8Array(footer.array, function() {
						datalength += 16;
						terminate(onend);
					}, onwriteerror);
				}

				function writeFile() {
					options = options || {};
					name = name.trim();
					if (options.directory && name.charAt(name.length - 1) != "/")
						name += "/";
					if (files.hasOwnProperty(name)) {
						onerror(ERR_DUPLICATED_NAME);
						return;
					}
					filename = getBytes(encodeUTF8(name));
					filenames.push(name);
					writeHeader(function() {
						if (reader)
							if (dontDeflate || options.level === 0)
								copy(reader, writer, 0, reader.size, true, writeFooter, onprogress, onreaderror, onwriteerror);
							else
								worker = deflate(reader, writer, options.level, writeFooter, onprogress, onreaderror, onwriteerror);
						else
							writeFooter();
					}, onwriteerror);
				}

				if (reader)
					reader.init(writeFile, onreaderror);
				else
					writeFile();
			},
			close : function(callback) {
				var data, length = 0, index = 0, indexFilename, file;
				for (indexFilename = 0; indexFilename < filenames.length; indexFilename++) {
					file = files[filenames[indexFilename]];
					length += 46 + file.filename.length + file.comment.length;
				}
				data = getDataHelper(length + 22);
				for (indexFilename = 0; indexFilename < filenames.length; indexFilename++) {
					file = files[filenames[indexFilename]];
					data.view.setUint32(index, 0x504b0102);
					data.view.setUint16(index + 4, 0x1400);
					data.array.set(file.headerArray, index + 6);
					data.view.setUint16(index + 32, file.comment.length, true);
					if (file.directory)
						data.view.setUint8(index + 38, 0x10);
					data.view.setUint32(index + 42, file.offset, true);
					data.array.set(file.filename, index + 46);
					data.array.set(file.comment, index + 46 + file.filename.length);
					index += 46 + file.filename.length + file.comment.length;
				}
				data.view.setUint32(index, 0x504b0506);
				data.view.setUint16(index + 8, filenames.length, true);
				data.view.setUint16(index + 10, filenames.length, true);
				data.view.setUint32(index + 12, length, true);
				data.view.setUint32(index + 16, datalength, true);
				writer.writeUint8Array(data.array, function() {
					terminate(function() {
						writer.getData(callback);
					});
				}, onwriteerror);
			}
		};
	}

	obj.zip = {
		Reader : Reader,
		Writer : Writer,
		BlobReader : BlobReader,
		Data64URIReader : Data64URIReader,
		TextReader : TextReader,
		BlobWriter : BlobWriter,
		Data64URIWriter : Data64URIWriter,
		TextWriter : TextWriter,
		createReader : function(reader, callback, onerror) {
			reader.init(function() {
				callback(createZipReader(reader, onerror));
			}, onerror);
		},
		createWriter : function(writer, callback, onerror, dontDeflate) {
			writer.init(function() {
				callback(createZipWriter(writer, onerror, dontDeflate));
			}, onerror);
		},
		workerScriptsPath : "",
		useWebWorkers : true
	};

})(this);


;

// upstream: js/zip/inflate.js
/*
 Copyright (c) 2013 Gildas Lormeau. All rights reserved.

 Redistribution and use in source and binary forms, with or without
 modification, are permitted provided that the following conditions are met:

 1. Redistributions of source code must retain the above copyright notice,
 this list of conditions and the following disclaimer.

 2. Redistributions in binary form must reproduce the above copyright 
 notice, this list of conditions and the following disclaimer in 
 the documentation and/or other materials provided with the distribution.

 3. The names of the authors may not be used to endorse or promote products
 derived from this software without specific prior written permission.

 THIS SOFTWARE IS PROVIDED ``AS IS'' AND ANY EXPRESSED OR IMPLIED WARRANTIES,
 INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND
 FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL JCRAFT,
 INC. OR ANY CONTRIBUTORS TO THIS SOFTWARE BE LIABLE FOR ANY DIRECT, INDIRECT,
 INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA,
 OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
 LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
 NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE,
 EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

/*
 * This program is based on JZlib 1.0.2 ymnk, JCraft,Inc.
 * JZlib is based on zlib-1.1.3, so all credit should go authors
 * Jean-loup Gailly(jloup@gzip.org) and Mark Adler(madler@alumni.caltech.edu)
 * and contributors of zlib.
 */

(function(obj) {

	// Global
	var MAX_BITS = 15;

	var Z_OK = 0;
	var Z_STREAM_END = 1;
	var Z_NEED_DICT = 2;
	var Z_STREAM_ERROR = -2;
	var Z_DATA_ERROR = -3;
	var Z_MEM_ERROR = -4;
	var Z_BUF_ERROR = -5;

	var inflate_mask = [ 0x00000000, 0x00000001, 0x00000003, 0x00000007, 0x0000000f, 0x0000001f, 0x0000003f, 0x0000007f, 0x000000ff, 0x000001ff, 0x000003ff,
			0x000007ff, 0x00000fff, 0x00001fff, 0x00003fff, 0x00007fff, 0x0000ffff ];

	var MANY = 1440;

	// JZlib version : "1.0.2"
	var Z_NO_FLUSH = 0;
	var Z_FINISH = 4;

	// InfTree
	var fixed_bl = 9;
	var fixed_bd = 5;

	var fixed_tl = [ 96, 7, 256, 0, 8, 80, 0, 8, 16, 84, 8, 115, 82, 7, 31, 0, 8, 112, 0, 8, 48, 0, 9, 192, 80, 7, 10, 0, 8, 96, 0, 8, 32, 0, 9, 160, 0, 8, 0,
			0, 8, 128, 0, 8, 64, 0, 9, 224, 80, 7, 6, 0, 8, 88, 0, 8, 24, 0, 9, 144, 83, 7, 59, 0, 8, 120, 0, 8, 56, 0, 9, 208, 81, 7, 17, 0, 8, 104, 0, 8, 40,
			0, 9, 176, 0, 8, 8, 0, 8, 136, 0, 8, 72, 0, 9, 240, 80, 7, 4, 0, 8, 84, 0, 8, 20, 85, 8, 227, 83, 7, 43, 0, 8, 116, 0, 8, 52, 0, 9, 200, 81, 7, 13,
			0, 8, 100, 0, 8, 36, 0, 9, 168, 0, 8, 4, 0, 8, 132, 0, 8, 68, 0, 9, 232, 80, 7, 8, 0, 8, 92, 0, 8, 28, 0, 9, 152, 84, 7, 83, 0, 8, 124, 0, 8, 60,
			0, 9, 216, 82, 7, 23, 0, 8, 108, 0, 8, 44, 0, 9, 184, 0, 8, 12, 0, 8, 140, 0, 8, 76, 0, 9, 248, 80, 7, 3, 0, 8, 82, 0, 8, 18, 85, 8, 163, 83, 7,
			35, 0, 8, 114, 0, 8, 50, 0, 9, 196, 81, 7, 11, 0, 8, 98, 0, 8, 34, 0, 9, 164, 0, 8, 2, 0, 8, 130, 0, 8, 66, 0, 9, 228, 80, 7, 7, 0, 8, 90, 0, 8,
			26, 0, 9, 148, 84, 7, 67, 0, 8, 122, 0, 8, 58, 0, 9, 212, 82, 7, 19, 0, 8, 106, 0, 8, 42, 0, 9, 180, 0, 8, 10, 0, 8, 138, 0, 8, 74, 0, 9, 244, 80,
			7, 5, 0, 8, 86, 0, 8, 22, 192, 8, 0, 83, 7, 51, 0, 8, 118, 0, 8, 54, 0, 9, 204, 81, 7, 15, 0, 8, 102, 0, 8, 38, 0, 9, 172, 0, 8, 6, 0, 8, 134, 0,
			8, 70, 0, 9, 236, 80, 7, 9, 0, 8, 94, 0, 8, 30, 0, 9, 156, 84, 7, 99, 0, 8, 126, 0, 8, 62, 0, 9, 220, 82, 7, 27, 0, 8, 110, 0, 8, 46, 0, 9, 188, 0,
			8, 14, 0, 8, 142, 0, 8, 78, 0, 9, 252, 96, 7, 256, 0, 8, 81, 0, 8, 17, 85, 8, 131, 82, 7, 31, 0, 8, 113, 0, 8, 49, 0, 9, 194, 80, 7, 10, 0, 8, 97,
			0, 8, 33, 0, 9, 162, 0, 8, 1, 0, 8, 129, 0, 8, 65, 0, 9, 226, 80, 7, 6, 0, 8, 89, 0, 8, 25, 0, 9, 146, 83, 7, 59, 0, 8, 121, 0, 8, 57, 0, 9, 210,
			81, 7, 17, 0, 8, 105, 0, 8, 41, 0, 9, 178, 0, 8, 9, 0, 8, 137, 0, 8, 73, 0, 9, 242, 80, 7, 4, 0, 8, 85, 0, 8, 21, 80, 8, 258, 83, 7, 43, 0, 8, 117,
			0, 8, 53, 0, 9, 202, 81, 7, 13, 0, 8, 101, 0, 8, 37, 0, 9, 170, 0, 8, 5, 0, 8, 133, 0, 8, 69, 0, 9, 234, 80, 7, 8, 0, 8, 93, 0, 8, 29, 0, 9, 154,
			84, 7, 83, 0, 8, 125, 0, 8, 61, 0, 9, 218, 82, 7, 23, 0, 8, 109, 0, 8, 45, 0, 9, 186, 0, 8, 13, 0, 8, 141, 0, 8, 77, 0, 9, 250, 80, 7, 3, 0, 8, 83,
			0, 8, 19, 85, 8, 195, 83, 7, 35, 0, 8, 115, 0, 8, 51, 0, 9, 198, 81, 7, 11, 0, 8, 99, 0, 8, 35, 0, 9, 166, 0, 8, 3, 0, 8, 131, 0, 8, 67, 0, 9, 230,
			80, 7, 7, 0, 8, 91, 0, 8, 27, 0, 9, 150, 84, 7, 67, 0, 8, 123, 0, 8, 59, 0, 9, 214, 82, 7, 19, 0, 8, 107, 0, 8, 43, 0, 9, 182, 0, 8, 11, 0, 8, 139,
			0, 8, 75, 0, 9, 246, 80, 7, 5, 0, 8, 87, 0, 8, 23, 192, 8, 0, 83, 7, 51, 0, 8, 119, 0, 8, 55, 0, 9, 206, 81, 7, 15, 0, 8, 103, 0, 8, 39, 0, 9, 174,
			0, 8, 7, 0, 8, 135, 0, 8, 71, 0, 9, 238, 80, 7, 9, 0, 8, 95, 0, 8, 31, 0, 9, 158, 84, 7, 99, 0, 8, 127, 0, 8, 63, 0, 9, 222, 82, 7, 27, 0, 8, 111,
			0, 8, 47, 0, 9, 190, 0, 8, 15, 0, 8, 143, 0, 8, 79, 0, 9, 254, 96, 7, 256, 0, 8, 80, 0, 8, 16, 84, 8, 115, 82, 7, 31, 0, 8, 112, 0, 8, 48, 0, 9,
			193, 80, 7, 10, 0, 8, 96, 0, 8, 32, 0, 9, 161, 0, 8, 0, 0, 8, 128, 0, 8, 64, 0, 9, 225, 80, 7, 6, 0, 8, 88, 0, 8, 24, 0, 9, 145, 83, 7, 59, 0, 8,
			120, 0, 8, 56, 0, 9, 209, 81, 7, 17, 0, 8, 104, 0, 8, 40, 0, 9, 177, 0, 8, 8, 0, 8, 136, 0, 8, 72, 0, 9, 241, 80, 7, 4, 0, 8, 84, 0, 8, 20, 85, 8,
			227, 83, 7, 43, 0, 8, 116, 0, 8, 52, 0, 9, 201, 81, 7, 13, 0, 8, 100, 0, 8, 36, 0, 9, 169, 0, 8, 4, 0, 8, 132, 0, 8, 68, 0, 9, 233, 80, 7, 8, 0, 8,
			92, 0, 8, 28, 0, 9, 153, 84, 7, 83, 0, 8, 124, 0, 8, 60, 0, 9, 217, 82, 7, 23, 0, 8, 108, 0, 8, 44, 0, 9, 185, 0, 8, 12, 0, 8, 140, 0, 8, 76, 0, 9,
			249, 80, 7, 3, 0, 8, 82, 0, 8, 18, 85, 8, 163, 83, 7, 35, 0, 8, 114, 0, 8, 50, 0, 9, 197, 81, 7, 11, 0, 8, 98, 0, 8, 34, 0, 9, 165, 0, 8, 2, 0, 8,
			130, 0, 8, 66, 0, 9, 229, 80, 7, 7, 0, 8, 90, 0, 8, 26, 0, 9, 149, 84, 7, 67, 0, 8, 122, 0, 8, 58, 0, 9, 213, 82, 7, 19, 0, 8, 106, 0, 8, 42, 0, 9,
			181, 0, 8, 10, 0, 8, 138, 0, 8, 74, 0, 9, 245, 80, 7, 5, 0, 8, 86, 0, 8, 22, 192, 8, 0, 83, 7, 51, 0, 8, 118, 0, 8, 54, 0, 9, 205, 81, 7, 15, 0, 8,
			102, 0, 8, 38, 0, 9, 173, 0, 8, 6, 0, 8, 134, 0, 8, 70, 0, 9, 237, 80, 7, 9, 0, 8, 94, 0, 8, 30, 0, 9, 157, 84, 7, 99, 0, 8, 126, 0, 8, 62, 0, 9,
			221, 82, 7, 27, 0, 8, 110, 0, 8, 46, 0, 9, 189, 0, 8, 14, 0, 8, 142, 0, 8, 78, 0, 9, 253, 96, 7, 256, 0, 8, 81, 0, 8, 17, 85, 8, 131, 82, 7, 31, 0,
			8, 113, 0, 8, 49, 0, 9, 195, 80, 7, 10, 0, 8, 97, 0, 8, 33, 0, 9, 163, 0, 8, 1, 0, 8, 129, 0, 8, 65, 0, 9, 227, 80, 7, 6, 0, 8, 89, 0, 8, 25, 0, 9,
			147, 83, 7, 59, 0, 8, 121, 0, 8, 57, 0, 9, 211, 81, 7, 17, 0, 8, 105, 0, 8, 41, 0, 9, 179, 0, 8, 9, 0, 8, 137, 0, 8, 73, 0, 9, 243, 80, 7, 4, 0, 8,
			85, 0, 8, 21, 80, 8, 258, 83, 7, 43, 0, 8, 117, 0, 8, 53, 0, 9, 203, 81, 7, 13, 0, 8, 101, 0, 8, 37, 0, 9, 171, 0, 8, 5, 0, 8, 133, 0, 8, 69, 0, 9,
			235, 80, 7, 8, 0, 8, 93, 0, 8, 29, 0, 9, 155, 84, 7, 83, 0, 8, 125, 0, 8, 61, 0, 9, 219, 82, 7, 23, 0, 8, 109, 0, 8, 45, 0, 9, 187, 0, 8, 13, 0, 8,
			141, 0, 8, 77, 0, 9, 251, 80, 7, 3, 0, 8, 83, 0, 8, 19, 85, 8, 195, 83, 7, 35, 0, 8, 115, 0, 8, 51, 0, 9, 199, 81, 7, 11, 0, 8, 99, 0, 8, 35, 0, 9,
			167, 0, 8, 3, 0, 8, 131, 0, 8, 67, 0, 9, 231, 80, 7, 7, 0, 8, 91, 0, 8, 27, 0, 9, 151, 84, 7, 67, 0, 8, 123, 0, 8, 59, 0, 9, 215, 82, 7, 19, 0, 8,
			107, 0, 8, 43, 0, 9, 183, 0, 8, 11, 0, 8, 139, 0, 8, 75, 0, 9, 247, 80, 7, 5, 0, 8, 87, 0, 8, 23, 192, 8, 0, 83, 7, 51, 0, 8, 119, 0, 8, 55, 0, 9,
			207, 81, 7, 15, 0, 8, 103, 0, 8, 39, 0, 9, 175, 0, 8, 7, 0, 8, 135, 0, 8, 71, 0, 9, 239, 80, 7, 9, 0, 8, 95, 0, 8, 31, 0, 9, 159, 84, 7, 99, 0, 8,
			127, 0, 8, 63, 0, 9, 223, 82, 7, 27, 0, 8, 111, 0, 8, 47, 0, 9, 191, 0, 8, 15, 0, 8, 143, 0, 8, 79, 0, 9, 255 ];
	var fixed_td = [ 80, 5, 1, 87, 5, 257, 83, 5, 17, 91, 5, 4097, 81, 5, 5, 89, 5, 1025, 85, 5, 65, 93, 5, 16385, 80, 5, 3, 88, 5, 513, 84, 5, 33, 92, 5,
			8193, 82, 5, 9, 90, 5, 2049, 86, 5, 129, 192, 5, 24577, 80, 5, 2, 87, 5, 385, 83, 5, 25, 91, 5, 6145, 81, 5, 7, 89, 5, 1537, 85, 5, 97, 93, 5,
			24577, 80, 5, 4, 88, 5, 769, 84, 5, 49, 92, 5, 12289, 82, 5, 13, 90, 5, 3073, 86, 5, 193, 192, 5, 24577 ];

	// Tables for deflate from PKZIP's appnote.txt.
	var cplens = [ // Copy lengths for literal codes 257..285
	3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258, 0, 0 ];

	// see note #13 above about 258
	var cplext = [ // Extra bits for literal codes 257..285
	0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0, 112, 112 // 112==invalid
	];

	var cpdist = [ // Copy offsets for distance codes 0..29
	1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577 ];

	var cpdext = [ // Extra bits for distance codes
	0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13 ];

	// If BMAX needs to be larger than 16, then h and x[] should be uLong.
	var BMAX = 15; // maximum bit length of any code

	function InfTree() {
		var that = this;

		var hn; // hufts used in space
		var v; // work area for huft_build
		var c; // bit length count table
		var r; // table entry for structure assignment
		var u; // table stack
		var x; // bit offsets, then code stack

		function huft_build(b, // code lengths in bits (all assumed <=
		// BMAX)
		bindex, n, // number of codes (assumed <= 288)
		s, // number of simple-valued codes (0..s-1)
		d, // list of base values for non-simple codes
		e, // list of extra bits for non-simple codes
		t, // result: starting table
		m, // maximum lookup bits, returns actual
		hp,// space for trees
		hn,// hufts used in space
		v // working area: values in order of bit length
		) {
			// Given a list of code lengths and a maximum table size, make a set of
			// tables to decode that set of codes. Return Z_OK on success,
			// Z_BUF_ERROR
			// if the given code set is incomplete (the tables are still built in
			// this
			// case), Z_DATA_ERROR if the input is invalid (an over-subscribed set
			// of
			// lengths), or Z_MEM_ERROR if not enough memory.

			var a; // counter for codes of length k
			var f; // i repeats in table every f entries
			var g; // maximum code length
			var h; // table level
			var i; // counter, current code
			var j; // counter
			var k; // number of bits in current code
			var l; // bits per table (returned in m)
			var mask; // (1 << w) - 1, to avoid cc -O bug on HP
			var p; // pointer into c[], b[], or v[]
			var q; // points to current table
			var w; // bits before this table == (l * h)
			var xp; // pointer into x
			var y; // number of dummy codes added
			var z; // number of entries in current table

			// Generate counts for each bit length

			p = 0;
			i = n;
			do {
				c[b[bindex + p]]++;
				p++;
				i--; // assume all entries <= BMAX
			} while (i !== 0);

			if (c[0] == n) { // null input--all zero length codes
				t[0] = -1;
				m[0] = 0;
				return Z_OK;
			}

			// Find minimum and maximum length, bound *m by those
			l = m[0];
			for (j = 1; j <= BMAX; j++)
				if (c[j] !== 0)
					break;
			k = j; // minimum code length
			if (l < j) {
				l = j;
			}
			for (i = BMAX; i !== 0; i--) {
				if (c[i] !== 0)
					break;
			}
			g = i; // maximum code length
			if (l > i) {
				l = i;
			}
			m[0] = l;

			// Adjust last length count to fill out codes, if needed
			for (y = 1 << j; j < i; j++, y <<= 1) {
				if ((y -= c[j]) < 0) {
					return Z_DATA_ERROR;
				}
			}
			if ((y -= c[i]) < 0) {
				return Z_DATA_ERROR;
			}
			c[i] += y;

			// Generate starting offsets into the value table for each length
			x[1] = j = 0;
			p = 1;
			xp = 2;
			while (--i !== 0) { // note that i == g from above
				x[xp] = (j += c[p]);
				xp++;
				p++;
			}

			// Make a table of values in order of bit lengths
			i = 0;
			p = 0;
			do {
				if ((j = b[bindex + p]) !== 0) {
					v[x[j]++] = i;
				}
				p++;
			} while (++i < n);
			n = x[g]; // set n to length of v

			// Generate the Huffman codes and for each, make the table entries
			x[0] = i = 0; // first Huffman code is zero
			p = 0; // grab values in bit order
			h = -1; // no tables yet--level -1
			w = -l; // bits decoded == (l * h)
			u[0] = 0; // just to keep compilers happy
			q = 0; // ditto
			z = 0; // ditto

			// go through the bit lengths (k already is bits in shortest code)
			for (; k <= g; k++) {
				a = c[k];
				while (a-- !== 0) {
					// here i is the Huffman code of length k bits for value *p
					// make tables up to required level
					while (k > w + l) {
						h++;
						w += l; // previous table always l bits
						// compute minimum size table less than or equal to l bits
						z = g - w;
						z = (z > l) ? l : z; // table size upper limit
						if ((f = 1 << (j = k - w)) > a + 1) { // try a k-w bit table
							// too few codes for
							// k-w bit table
							f -= a + 1; // deduct codes from patterns left
							xp = k;
							if (j < z) {
								while (++j < z) { // try smaller tables up to z bits
									if ((f <<= 1) <= c[++xp])
										break; // enough codes to use up j bits
									f -= c[xp]; // else deduct codes from patterns
								}
							}
						}
						z = 1 << j; // table entries for j-bit table

						// allocate new table
						if (hn[0] + z > MANY) { // (note: doesn't matter for fixed)
							return Z_DATA_ERROR; // overflow of MANY
						}
						u[h] = q = /* hp+ */hn[0]; // DEBUG
						hn[0] += z;

						// connect to last table, if there is one
						if (h !== 0) {
							x[h] = i; // save pattern for backing up
							r[0] = /* (byte) */j; // bits in this table
							r[1] = /* (byte) */l; // bits to dump before this table
							j = i >>> (w - l);
							r[2] = /* (int) */(q - u[h - 1] - j); // offset to this table
							hp.set(r, (u[h - 1] + j) * 3);
							// to
							// last
							// table
						} else {
							t[0] = q; // first table is returned result
						}
					}

					// set up table entry in r
					r[1] = /* (byte) */(k - w);
					if (p >= n) {
						r[0] = 128 + 64; // out of values--invalid code
					} else if (v[p] < s) {
						r[0] = /* (byte) */(v[p] < 256 ? 0 : 32 + 64); // 256 is
						// end-of-block
						r[2] = v[p++]; // simple code is just the value
					} else {
						r[0] = /* (byte) */(e[v[p] - s] + 16 + 64); // non-simple--look
						// up in lists
						r[2] = d[v[p++] - s];
					}

					// fill code-like entries with r
					f = 1 << (k - w);
					for (j = i >>> w; j < z; j += f) {
						hp.set(r, (q + j) * 3);
					}

					// backwards increment the k-bit code i
					for (j = 1 << (k - 1); (i & j) !== 0; j >>>= 1) {
						i ^= j;
					}
					i ^= j;

					// backup over finished tables
					mask = (1 << w) - 1; // needed on HP, cc -O bug
					while ((i & mask) != x[h]) {
						h--; // don't need to update q
						w -= l;
						mask = (1 << w) - 1;
					}
				}
			}
			// Return Z_BUF_ERROR if we were given an incomplete table
			return y !== 0 && g != 1 ? Z_BUF_ERROR : Z_OK;
		}

		function initWorkArea(vsize) {
			var i;
			if (!hn) {
				hn = []; // []; //new Array(1);
				v = []; // new Array(vsize);
				c = new Int32Array(BMAX + 1); // new Array(BMAX + 1);
				r = []; // new Array(3);
				u = new Int32Array(BMAX); // new Array(BMAX);
				x = new Int32Array(BMAX + 1); // new Array(BMAX + 1);
			}
			if (v.length < vsize) {
				v = []; // new Array(vsize);
			}
			for (i = 0; i < vsize; i++) {
				v[i] = 0;
			}
			for (i = 0; i < BMAX + 1; i++) {
				c[i] = 0;
			}
			for (i = 0; i < 3; i++) {
				r[i] = 0;
			}
			// for(int i=0; i<BMAX; i++){u[i]=0;}
			u.set(c.subarray(0, BMAX), 0);
			// for(int i=0; i<BMAX+1; i++){x[i]=0;}
			x.set(c.subarray(0, BMAX + 1), 0);
		}

		that.inflate_trees_bits = function(c, // 19 code lengths
		bb, // bits tree desired/actual depth
		tb, // bits tree result
		hp, // space for trees
		z // for messages
		) {
			var result;
			initWorkArea(19);
			hn[0] = 0;
			result = huft_build(c, 0, 19, 19, null, null, tb, bb, hp, hn, v);

			if (result == Z_DATA_ERROR) {
				z.msg = "oversubscribed dynamic bit lengths tree";
			} else if (result == Z_BUF_ERROR || bb[0] === 0) {
				z.msg = "incomplete dynamic bit lengths tree";
				result = Z_DATA_ERROR;
			}
			return result;
		};

		that.inflate_trees_dynamic = function(nl, // number of literal/length codes
		nd, // number of distance codes
		c, // that many (total) code lengths
		bl, // literal desired/actual bit depth
		bd, // distance desired/actual bit depth
		tl, // literal/length tree result
		td, // distance tree result
		hp, // space for trees
		z // for messages
		) {
			var result;

			// build literal/length tree
			initWorkArea(288);
			hn[0] = 0;
			result = huft_build(c, 0, nl, 257, cplens, cplext, tl, bl, hp, hn, v);
			if (result != Z_OK || bl[0] === 0) {
				if (result == Z_DATA_ERROR) {
					z.msg = "oversubscribed literal/length tree";
				} else if (result != Z_MEM_ERROR) {
					z.msg = "incomplete literal/length tree";
					result = Z_DATA_ERROR;
				}
				return result;
			}

			// build distance tree
			initWorkArea(288);
			result = huft_build(c, nl, nd, 0, cpdist, cpdext, td, bd, hp, hn, v);

			if (result != Z_OK || (bd[0] === 0 && nl > 257)) {
				if (result == Z_DATA_ERROR) {
					z.msg = "oversubscribed distance tree";
				} else if (result == Z_BUF_ERROR) {
					z.msg = "incomplete distance tree";
					result = Z_DATA_ERROR;
				} else if (result != Z_MEM_ERROR) {
					z.msg = "empty distance tree with lengths";
					result = Z_DATA_ERROR;
				}
				return result;
			}

			return Z_OK;
		};

	}

	InfTree.inflate_trees_fixed = function(bl, // literal desired/actual bit depth
	bd, // distance desired/actual bit depth
	tl,// literal/length tree result
	td// distance tree result
	) {
		bl[0] = fixed_bl;
		bd[0] = fixed_bd;
		tl[0] = fixed_tl;
		td[0] = fixed_td;
		return Z_OK;
	};

	// InfCodes

	// waiting for "i:"=input,
	// "o:"=output,
	// "x:"=nothing
	var START = 0; // x: set up for LEN
	var LEN = 1; // i: get length/literal/eob next
	var LENEXT = 2; // i: getting length extra (have base)
	var DIST = 3; // i: get distance next
	var DISTEXT = 4;// i: getting distance extra
	var COPY = 5; // o: copying bytes in window, waiting
	// for space
	var LIT = 6; // o: got literal, waiting for output
	// space
	var WASH = 7; // o: got eob, possibly still output
	// waiting
	var END = 8; // x: got eob and all data flushed
	var BADCODE = 9;// x: got error

	function InfCodes() {
		var that = this;

		var mode; // current inflate_codes mode

		// mode dependent information
		var len = 0;

		var tree; // pointer into tree
		var tree_index = 0;
		var need = 0; // bits needed

		var lit = 0;

		// if EXT or COPY, where and how much
		var get = 0; // bits to get for extra
		var dist = 0; // distance back to copy from

		var lbits = 0; // ltree bits decoded per branch
		var dbits = 0; // dtree bits decoder per branch
		var ltree; // literal/length/eob tree
		var ltree_index = 0; // literal/length/eob tree
		var dtree; // distance tree
		var dtree_index = 0; // distance tree

		// Called with number of bytes left to write in window at least 258
		// (the maximum string length) and number of input bytes available
		// at least ten. The ten bytes are six bytes for the longest length/
		// distance pair plus four bytes for overloading the bit buffer.

		function inflate_fast(bl, bd, tl, tl_index, td, td_index, s, z) {
			var t; // temporary pointer
			var tp; // temporary pointer
			var tp_index; // temporary pointer
			var e; // extra bits or operation
			var b; // bit buffer
			var k; // bits in bit buffer
			var p; // input data pointer
			var n; // bytes available there
			var q; // output window write pointer
			var m; // bytes to end of window or read pointer
			var ml; // mask for literal/length tree
			var md; // mask for distance tree
			var c; // bytes to copy
			var d; // distance back to copy from
			var r; // copy source pointer

			var tp_index_t_3; // (tp_index+t)*3

			// load input, output, bit values
			p = z.next_in_index;
			n = z.avail_in;
			b = s.bitb;
			k = s.bitk;
			q = s.write;
			m = q < s.read ? s.read - q - 1 : s.end - q;

			// initialize masks
			ml = inflate_mask[bl];
			md = inflate_mask[bd];

			// do until not enough input or output space for fast loop
			do { // assume called with m >= 258 && n >= 10
				// get literal/length code
				while (k < (20)) { // max bits for literal/length code
					n--;
					b |= (z.read_byte(p++) & 0xff) << k;
					k += 8;
				}

				t = b & ml;
				tp = tl;
				tp_index = tl_index;
				tp_index_t_3 = (tp_index + t) * 3;
				if ((e = tp[tp_index_t_3]) === 0) {
					b >>= (tp[tp_index_t_3 + 1]);
					k -= (tp[tp_index_t_3 + 1]);

					s.window[q++] = /* (byte) */tp[tp_index_t_3 + 2];
					m--;
					continue;
				}
				do {

					b >>= (tp[tp_index_t_3 + 1]);
					k -= (tp[tp_index_t_3 + 1]);

					if ((e & 16) !== 0) {
						e &= 15;
						c = tp[tp_index_t_3 + 2] + (/* (int) */b & inflate_mask[e]);

						b >>= e;
						k -= e;

						// decode distance base of block to copy
						while (k < (15)) { // max bits for distance code
							n--;
							b |= (z.read_byte(p++) & 0xff) << k;
							k += 8;
						}

						t = b & md;
						tp = td;
						tp_index = td_index;
						tp_index_t_3 = (tp_index + t) * 3;
						e = tp[tp_index_t_3];

						do {

							b >>= (tp[tp_index_t_3 + 1]);
							k -= (tp[tp_index_t_3 + 1]);

							if ((e & 16) !== 0) {
								// get extra bits to add to distance base
								e &= 15;
								while (k < (e)) { // get extra bits (up to 13)
									n--;
									b |= (z.read_byte(p++) & 0xff) << k;
									k += 8;
								}

								d = tp[tp_index_t_3 + 2] + (b & inflate_mask[e]);

								b >>= (e);
								k -= (e);

								// do the copy
								m -= c;
								if (q >= d) { // offset before dest
									// just copy
									r = q - d;
									if (q - r > 0 && 2 > (q - r)) {
										s.window[q++] = s.window[r++]; // minimum
										// count is
										// three,
										s.window[q++] = s.window[r++]; // so unroll
										// loop a
										// little
										c -= 2;
									} else {
										s.window.set(s.window.subarray(r, r + 2), q);
										q += 2;
										r += 2;
										c -= 2;
									}
								} else { // else offset after destination
									r = q - d;
									do {
										r += s.end; // force pointer in window
									} while (r < 0); // covers invalid distances
									e = s.end - r;
									if (c > e) { // if source crosses,
										c -= e; // wrapped copy
										if (q - r > 0 && e > (q - r)) {
											do {
												s.window[q++] = s.window[r++];
											} while (--e !== 0);
										} else {
											s.window.set(s.window.subarray(r, r + e), q);
											q += e;
											r += e;
											e = 0;
										}
										r = 0; // copy rest from start of window
									}

								}

								// copy all or what's left
								if (q - r > 0 && c > (q - r)) {
									do {
										s.window[q++] = s.window[r++];
									} while (--c !== 0);
								} else {
									s.window.set(s.window.subarray(r, r + c), q);
									q += c;
									r += c;
									c = 0;
								}
								break;
							} else if ((e & 64) === 0) {
								t += tp[tp_index_t_3 + 2];
								t += (b & inflate_mask[e]);
								tp_index_t_3 = (tp_index + t) * 3;
								e = tp[tp_index_t_3];
							} else {
								z.msg = "invalid distance code";

								c = z.avail_in - n;
								c = (k >> 3) < c ? k >> 3 : c;
								n += c;
								p -= c;
								k -= c << 3;

								s.bitb = b;
								s.bitk = k;
								z.avail_in = n;
								z.total_in += p - z.next_in_index;
								z.next_in_index = p;
								s.write = q;

								return Z_DATA_ERROR;
							}
						} while (true);
						break;
					}

					if ((e & 64) === 0) {
						t += tp[tp_index_t_3 + 2];
						t += (b & inflate_mask[e]);
						tp_index_t_3 = (tp_index + t) * 3;
						if ((e = tp[tp_index_t_3]) === 0) {

							b >>= (tp[tp_index_t_3 + 1]);
							k -= (tp[tp_index_t_3 + 1]);

							s.window[q++] = /* (byte) */tp[tp_index_t_3 + 2];
							m--;
							break;
						}
					} else if ((e & 32) !== 0) {

						c = z.avail_in - n;
						c = (k >> 3) < c ? k >> 3 : c;
						n += c;
						p -= c;
						k -= c << 3;

						s.bitb = b;
						s.bitk = k;
						z.avail_in = n;
						z.total_in += p - z.next_in_index;
						z.next_in_index = p;
						s.write = q;

						return Z_STREAM_END;
					} else {
						z.msg = "invalid literal/length code";

						c = z.avail_in - n;
						c = (k >> 3) < c ? k >> 3 : c;
						n += c;
						p -= c;
						k -= c << 3;

						s.bitb = b;
						s.bitk = k;
						z.avail_in = n;
						z.total_in += p - z.next_in_index;
						z.next_in_index = p;
						s.write = q;

						return Z_DATA_ERROR;
					}
				} while (true);
			} while (m >= 258 && n >= 10);

			// not enough input or output--restore pointers and return
			c = z.avail_in - n;
			c = (k >> 3) < c ? k >> 3 : c;
			n += c;
			p -= c;
			k -= c << 3;

			s.bitb = b;
			s.bitk = k;
			z.avail_in = n;
			z.total_in += p - z.next_in_index;
			z.next_in_index = p;
			s.write = q;

			return Z_OK;
		}

		that.init = function(bl, bd, tl, tl_index, td, td_index) {
			mode = START;
			lbits = /* (byte) */bl;
			dbits = /* (byte) */bd;
			ltree = tl;
			ltree_index = tl_index;
			dtree = td;
			dtree_index = td_index;
			tree = null;
		};

		that.proc = function(s, z, r) {
			var j; // temporary storage
			var tindex; // temporary pointer
			var e; // extra bits or operation
			var b = 0; // bit buffer
			var k = 0; // bits in bit buffer
			var p = 0; // input data pointer
			var n; // bytes available there
			var q; // output window write pointer
			var m; // bytes to end of window or read pointer
			var f; // pointer to copy strings from

			// copy input/output information to locals (UPDATE macro restores)
			p = z.next_in_index;
			n = z.avail_in;
			b = s.bitb;
			k = s.bitk;
			q = s.write;
			m = q < s.read ? s.read - q - 1 : s.end - q;

			// process input and output based on current state
			while (true) {
				switch (mode) {
				// waiting for "i:"=input, "o:"=output, "x:"=nothing
				case START: // x: set up for LEN
					if (m >= 258 && n >= 10) {

						s.bitb = b;
						s.bitk = k;
						z.avail_in = n;
						z.total_in += p - z.next_in_index;
						z.next_in_index = p;
						s.write = q;
						r = inflate_fast(lbits, dbits, ltree, ltree_index, dtree, dtree_index, s, z);

						p = z.next_in_index;
						n = z.avail_in;
						b = s.bitb;
						k = s.bitk;
						q = s.write;
						m = q < s.read ? s.read - q - 1 : s.end - q;

						if (r != Z_OK) {
							mode = r == Z_STREAM_END ? WASH : BADCODE;
							break;
						}
					}
					need = lbits;
					tree = ltree;
					tree_index = ltree_index;

					mode = LEN;
				case LEN: // i: get length/literal/eob next
					j = need;

					while (k < (j)) {
						if (n !== 0)
							r = Z_OK;
						else {

							s.bitb = b;
							s.bitk = k;
							z.avail_in = n;
							z.total_in += p - z.next_in_index;
							z.next_in_index = p;
							s.write = q;
							return s.inflate_flush(z, r);
						}
						n--;
						b |= (z.read_byte(p++) & 0xff) << k;
						k += 8;
					}

					tindex = (tree_index + (b & inflate_mask[j])) * 3;

					b >>>= (tree[tindex + 1]);
					k -= (tree[tindex + 1]);

					e = tree[tindex];

					if (e === 0) { // literal
						lit = tree[tindex + 2];
						mode = LIT;
						break;
					}
					if ((e & 16) !== 0) { // length
						get = e & 15;
						len = tree[tindex + 2];
						mode = LENEXT;
						break;
					}
					if ((e & 64) === 0) { // next table
						need = e;
						tree_index = tindex / 3 + tree[tindex + 2];
						break;
					}
					if ((e & 32) !== 0) { // end of block
						mode = WASH;
						break;
					}
					mode = BADCODE; // invalid code
					z.msg = "invalid literal/length code";
					r = Z_DATA_ERROR;

					s.bitb = b;
					s.bitk = k;
					z.avail_in = n;
					z.total_in += p - z.next_in_index;
					z.next_in_index = p;
					s.write = q;
					return s.inflate_flush(z, r);

				case LENEXT: // i: getting length extra (have base)
					j = get;

					while (k < (j)) {
						if (n !== 0)
							r = Z_OK;
						else {

							s.bitb = b;
							s.bitk = k;
							z.avail_in = n;
							z.total_in += p - z.next_in_index;
							z.next_in_index = p;
							s.write = q;
							return s.inflate_flush(z, r);
						}
						n--;
						b |= (z.read_byte(p++) & 0xff) << k;
						k += 8;
					}

					len += (b & inflate_mask[j]);

					b >>= j;
					k -= j;

					need = dbits;
					tree = dtree;
					tree_index = dtree_index;
					mode = DIST;
				case DIST: // i: get distance next
					j = need;

					while (k < (j)) {
						if (n !== 0)
							r = Z_OK;
						else {

							s.bitb = b;
							s.bitk = k;
							z.avail_in = n;
							z.total_in += p - z.next_in_index;
							z.next_in_index = p;
							s.write = q;
							return s.inflate_flush(z, r);
						}
						n--;
						b |= (z.read_byte(p++) & 0xff) << k;
						k += 8;
					}

					tindex = (tree_index + (b & inflate_mask[j])) * 3;

					b >>= tree[tindex + 1];
					k -= tree[tindex + 1];

					e = (tree[tindex]);
					if ((e & 16) !== 0) { // distance
						get = e & 15;
						dist = tree[tindex + 2];
						mode = DISTEXT;
						break;
					}
					if ((e & 64) === 0) { // next table
						need = e;
						tree_index = tindex / 3 + tree[tindex + 2];
						break;
					}
					mode = BADCODE; // invalid code
					z.msg = "invalid distance code";
					r = Z_DATA_ERROR;

					s.bitb = b;
					s.bitk = k;
					z.avail_in = n;
					z.total_in += p - z.next_in_index;
					z.next_in_index = p;
					s.write = q;
					return s.inflate_flush(z, r);

				case DISTEXT: // i: getting distance extra
					j = get;

					while (k < (j)) {
						if (n !== 0)
							r = Z_OK;
						else {

							s.bitb = b;
							s.bitk = k;
							z.avail_in = n;
							z.total_in += p - z.next_in_index;
							z.next_in_index = p;
							s.write = q;
							return s.inflate_flush(z, r);
						}
						n--;
						b |= (z.read_byte(p++) & 0xff) << k;
						k += 8;
					}

					dist += (b & inflate_mask[j]);

					b >>= j;
					k -= j;

					mode = COPY;
				case COPY: // o: copying bytes in window, waiting for space
					f = q - dist;
					while (f < 0) { // modulo window size-"while" instead
						f += s.end; // of "if" handles invalid distances
					}
					while (len !== 0) {

						if (m === 0) {
							if (q == s.end && s.read !== 0) {
								q = 0;
								m = q < s.read ? s.read - q - 1 : s.end - q;
							}
							if (m === 0) {
								s.write = q;
								r = s.inflate_flush(z, r);
								q = s.write;
								m = q < s.read ? s.read - q - 1 : s.end - q;

								if (q == s.end && s.read !== 0) {
									q = 0;
									m = q < s.read ? s.read - q - 1 : s.end - q;
								}

								if (m === 0) {
									s.bitb = b;
									s.bitk = k;
									z.avail_in = n;
									z.total_in += p - z.next_in_index;
									z.next_in_index = p;
									s.write = q;
									return s.inflate_flush(z, r);
								}
							}
						}

						s.window[q++] = s.window[f++];
						m--;

						if (f == s.end)
							f = 0;
						len--;
					}
					mode = START;
					break;
				case LIT: // o: got literal, waiting for output space
					if (m === 0) {
						if (q == s.end && s.read !== 0) {
							q = 0;
							m = q < s.read ? s.read - q - 1 : s.end - q;
						}
						if (m === 0) {
							s.write = q;
							r = s.inflate_flush(z, r);
							q = s.write;
							m = q < s.read ? s.read - q - 1 : s.end - q;

							if (q == s.end && s.read !== 0) {
								q = 0;
								m = q < s.read ? s.read - q - 1 : s.end - q;
							}
							if (m === 0) {
								s.bitb = b;
								s.bitk = k;
								z.avail_in = n;
								z.total_in += p - z.next_in_index;
								z.next_in_index = p;
								s.write = q;
								return s.inflate_flush(z, r);
							}
						}
					}
					r = Z_OK;

					s.window[q++] = /* (byte) */lit;
					m--;

					mode = START;
					break;
				case WASH: // o: got eob, possibly more output
					if (k > 7) { // return unused byte, if any
						k -= 8;
						n++;
						p--; // can always return one
					}

					s.write = q;
					r = s.inflate_flush(z, r);
					q = s.write;
					m = q < s.read ? s.read - q - 1 : s.end - q;

					if (s.read != s.write) {
						s.bitb = b;
						s.bitk = k;
						z.avail_in = n;
						z.total_in += p - z.next_in_index;
						z.next_in_index = p;
						s.write = q;
						return s.inflate_flush(z, r);
					}
					mode = END;
				case END:
					r = Z_STREAM_END;
					s.bitb = b;
					s.bitk = k;
					z.avail_in = n;
					z.total_in += p - z.next_in_index;
					z.next_in_index = p;
					s.write = q;
					return s.inflate_flush(z, r);

				case BADCODE: // x: got error

					r = Z_DATA_ERROR;

					s.bitb = b;
					s.bitk = k;
					z.avail_in = n;
					z.total_in += p - z.next_in_index;
					z.next_in_index = p;
					s.write = q;
					return s.inflate_flush(z, r);

				default:
					r = Z_STREAM_ERROR;

					s.bitb = b;
					s.bitk = k;
					z.avail_in = n;
					z.total_in += p - z.next_in_index;
					z.next_in_index = p;
					s.write = q;
					return s.inflate_flush(z, r);
				}
			}
		};

		that.free = function() {
			// ZFREE(z, c);
		};

	}

	// InfBlocks

	// Table for deflate from PKZIP's appnote.txt.
	var border = [ // Order of the bit length code lengths
	16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15 ];

	var TYPE = 0; // get type bits (3, including end bit)
	var LENS = 1; // get lengths for stored
	var STORED = 2;// processing stored block
	var TABLE = 3; // get table lengths
	var BTREE = 4; // get bit lengths tree for a dynamic
	// block
	var DTREE = 5; // get length, distance trees for a
	// dynamic block
	var CODES = 6; // processing fixed or dynamic block
	var DRY = 7; // output remaining window bytes
	var DONELOCKS = 8; // finished last block, done
	var BADBLOCKS = 9; // ot a data error--stuck here

	function InfBlocks(z, w) {
		var that = this;

		var mode = TYPE; // current inflate_block mode

		var left = 0; // if STORED, bytes left to copy

		var table = 0; // table lengths (14 bits)
		var index = 0; // index into blens (or border)
		var blens; // bit lengths of codes
		var bb = [ 0 ]; // bit length tree depth
		var tb = [ 0 ]; // bit length decoding tree

		var codes = new InfCodes(); // if CODES, current state

		var last = 0; // true if this block is the last block

		var hufts = new Int32Array(MANY * 3); // single malloc for tree space
		var check = 0; // check on output
		var inftree = new InfTree();

		that.bitk = 0; // bits in bit buffer
		that.bitb = 0; // bit buffer
		that.window = new Uint8Array(w); // sliding window
		that.end = w; // one byte after sliding window
		that.read = 0; // window read pointer
		that.write = 0; // window write pointer

		that.reset = function(z, c) {
			if (c)
				c[0] = check;
			// if (mode == BTREE || mode == DTREE) {
			// }
			if (mode == CODES) {
				codes.free(z);
			}
			mode = TYPE;
			that.bitk = 0;
			that.bitb = 0;
			that.read = that.write = 0;
		};

		that.reset(z, null);

		// copy as much as possible from the sliding window to the output area
		that.inflate_flush = function(z, r) {
			var n;
			var p;
			var q;

			// local copies of source and destination pointers
			p = z.next_out_index;
			q = that.read;

			// compute number of bytes to copy as far as end of window
			n = /* (int) */((q <= that.write ? that.write : that.end) - q);
			if (n > z.avail_out)
				n = z.avail_out;
			if (n !== 0 && r == Z_BUF_ERROR)
				r = Z_OK;

			// update counters
			z.avail_out -= n;
			z.total_out += n;

			// copy as far as end of window
			z.next_out.set(that.window.subarray(q, q + n), p);
			p += n;
			q += n;

			// see if more to copy at beginning of window
			if (q == that.end) {
				// wrap pointers
				q = 0;
				if (that.write == that.end)
					that.write = 0;

				// compute bytes to copy
				n = that.write - q;
				if (n > z.avail_out)
					n = z.avail_out;
				if (n !== 0 && r == Z_BUF_ERROR)
					r = Z_OK;

				// update counters
				z.avail_out -= n;
				z.total_out += n;

				// copy
				z.next_out.set(that.window.subarray(q, q + n), p);
				p += n;
				q += n;
			}

			// update pointers
			z.next_out_index = p;
			that.read = q;

			// done
			return r;
		};

		that.proc = function(z, r) {
			var t; // temporary storage
			var b; // bit buffer
			var k; // bits in bit buffer
			var p; // input data pointer
			var n; // bytes available there
			var q; // output window write pointer
			var m; // bytes to end of window or read pointer

			var i;

			// copy input/output information to locals (UPDATE macro restores)
			// {
			p = z.next_in_index;
			n = z.avail_in;
			b = that.bitb;
			k = that.bitk;
			// }
			// {
			q = that.write;
			m = /* (int) */(q < that.read ? that.read - q - 1 : that.end - q);
			// }

			// process input based on current state
			// DEBUG dtree
			while (true) {
				switch (mode) {
				case TYPE:

					while (k < (3)) {
						if (n !== 0) {
							r = Z_OK;
						} else {
							that.bitb = b;
							that.bitk = k;
							z.avail_in = n;
							z.total_in += p - z.next_in_index;
							z.next_in_index = p;
							that.write = q;
							return that.inflate_flush(z, r);
						}
						n--;
						b |= (z.read_byte(p++) & 0xff) << k;
						k += 8;
					}
					t = /* (int) */(b & 7);
					last = t & 1;

					switch (t >>> 1) {
					case 0: // stored
						// {
						b >>>= (3);
						k -= (3);
						// }
						t = k & 7; // go to byte boundary

						// {
						b >>>= (t);
						k -= (t);
						// }
						mode = LENS; // get length of stored block
						break;
					case 1: // fixed
						// {
						var bl = []; // new Array(1);
						var bd = []; // new Array(1);
						var tl = [ [] ]; // new Array(1);
						var td = [ [] ]; // new Array(1);

						InfTree.inflate_trees_fixed(bl, bd, tl, td);
						codes.init(bl[0], bd[0], tl[0], 0, td[0], 0);
						// }

						// {
						b >>>= (3);
						k -= (3);
						// }

						mode = CODES;
						break;
					case 2: // dynamic

						// {
						b >>>= (3);
						k -= (3);
						// }

						mode = TABLE;
						break;
					case 3: // illegal

						// {
						b >>>= (3);
						k -= (3);
						// }
						mode = BADBLOCKS;
						z.msg = "invalid block type";
						r = Z_DATA_ERROR;

						that.bitb = b;
						that.bitk = k;
						z.avail_in = n;
						z.total_in += p - z.next_in_index;
						z.next_in_index = p;
						that.write = q;
						return that.inflate_flush(z, r);
					}
					break;
				case LENS:

					while (k < (32)) {
						if (n !== 0) {
							r = Z_OK;
						} else {
							that.bitb = b;
							that.bitk = k;
							z.avail_in = n;
							z.total_in += p - z.next_in_index;
							z.next_in_index = p;
							that.write = q;
							return that.inflate_flush(z, r);
						}
						n--;
						b |= (z.read_byte(p++) & 0xff) << k;
						k += 8;
					}

					if ((((~b) >>> 16) & 0xffff) != (b & 0xffff)) {
						mode = BADBLOCKS;
						z.msg = "invalid stored block lengths";
						r = Z_DATA_ERROR;

						that.bitb = b;
						that.bitk = k;
						z.avail_in = n;
						z.total_in += p - z.next_in_index;
						z.next_in_index = p;
						that.write = q;
						return that.inflate_flush(z, r);
					}
					left = (b & 0xffff);
					b = k = 0; // dump bits
					mode = left !== 0 ? STORED : (last !== 0 ? DRY : TYPE);
					break;
				case STORED:
					if (n === 0) {
						that.bitb = b;
						that.bitk = k;
						z.avail_in = n;
						z.total_in += p - z.next_in_index;
						z.next_in_index = p;
						that.write = q;
						return that.inflate_flush(z, r);
					}

					if (m === 0) {
						if (q == that.end && that.read !== 0) {
							q = 0;
							m = /* (int) */(q < that.read ? that.read - q - 1 : that.end - q);
						}
						if (m === 0) {
							that.write = q;
							r = that.inflate_flush(z, r);
							q = that.write;
							m = /* (int) */(q < that.read ? that.read - q - 1 : that.end - q);
							if (q == that.end && that.read !== 0) {
								q = 0;
								m = /* (int) */(q < that.read ? that.read - q - 1 : that.end - q);
							}
							if (m === 0) {
								that.bitb = b;
								that.bitk = k;
								z.avail_in = n;
								z.total_in += p - z.next_in_index;
								z.next_in_index = p;
								that.write = q;
								return that.inflate_flush(z, r);
							}
						}
					}
					r = Z_OK;

					t = left;
					if (t > n)
						t = n;
					if (t > m)
						t = m;
					that.window.set(z.read_buf(p, t), q);
					p += t;
					n -= t;
					q += t;
					m -= t;
					if ((left -= t) !== 0)
						break;
					mode = last !== 0 ? DRY : TYPE;
					break;
				case TABLE:

					while (k < (14)) {
						if (n !== 0) {
							r = Z_OK;
						} else {
							that.bitb = b;
							that.bitk = k;
							z.avail_in = n;
							z.total_in += p - z.next_in_index;
							z.next_in_index = p;
							that.write = q;
							return that.inflate_flush(z, r);
						}

						n--;
						b |= (z.read_byte(p++) & 0xff) << k;
						k += 8;
					}

					table = t = (b & 0x3fff);
					if ((t & 0x1f) > 29 || ((t >> 5) & 0x1f) > 29) {
						mode = BADBLOCKS;
						z.msg = "too many length or distance symbols";
						r = Z_DATA_ERROR;

						that.bitb = b;
						that.bitk = k;
						z.avail_in = n;
						z.total_in += p - z.next_in_index;
						z.next_in_index = p;
						that.write = q;
						return that.inflate_flush(z, r);
					}
					t = 258 + (t & 0x1f) + ((t >> 5) & 0x1f);
					if (!blens || blens.length < t) {
						blens = []; // new Array(t);
					} else {
						for (i = 0; i < t; i++) {
							blens[i] = 0;
						}
					}

					// {
					b >>>= (14);
					k -= (14);
					// }

					index = 0;
					mode = BTREE;
				case BTREE:
					while (index < 4 + (table >>> 10)) {
						while (k < (3)) {
							if (n !== 0) {
								r = Z_OK;
							} else {
								that.bitb = b;
								that.bitk = k;
								z.avail_in = n;
								z.total_in += p - z.next_in_index;
								z.next_in_index = p;
								that.write = q;
								return that.inflate_flush(z, r);
							}
							n--;
							b |= (z.read_byte(p++) & 0xff) << k;
							k += 8;
						}

						blens[border[index++]] = b & 7;

						// {
						b >>>= (3);
						k -= (3);
						// }
					}

					while (index < 19) {
						blens[border[index++]] = 0;
					}

					bb[0] = 7;
					t = inftree.inflate_trees_bits(blens, bb, tb, hufts, z);
					if (t != Z_OK) {
						r = t;
						if (r == Z_DATA_ERROR) {
							blens = null;
							mode = BADBLOCKS;
						}

						that.bitb = b;
						that.bitk = k;
						z.avail_in = n;
						z.total_in += p - z.next_in_index;
						z.next_in_index = p;
						that.write = q;
						return that.inflate_flush(z, r);
					}

					index = 0;
					mode = DTREE;
				case DTREE:
					while (true) {
						t = table;
						if (!(index < 258 + (t & 0x1f) + ((t >> 5) & 0x1f))) {
							break;
						}

						var j, c;

						t = bb[0];

						while (k < (t)) {
							if (n !== 0) {
								r = Z_OK;
							} else {
								that.bitb = b;
								that.bitk = k;
								z.avail_in = n;
								z.total_in += p - z.next_in_index;
								z.next_in_index = p;
								that.write = q;
								return that.inflate_flush(z, r);
							}
							n--;
							b |= (z.read_byte(p++) & 0xff) << k;
							k += 8;
						}

						// if (tb[0] == -1) {
						// System.err.println("null...");
						// }

						t = hufts[(tb[0] + (b & inflate_mask[t])) * 3 + 1];
						c = hufts[(tb[0] + (b & inflate_mask[t])) * 3 + 2];

						if (c < 16) {
							b >>>= (t);
							k -= (t);
							blens[index++] = c;
						} else { // c == 16..18
							i = c == 18 ? 7 : c - 14;
							j = c == 18 ? 11 : 3;

							while (k < (t + i)) {
								if (n !== 0) {
									r = Z_OK;
								} else {
									that.bitb = b;
									that.bitk = k;
									z.avail_in = n;
									z.total_in += p - z.next_in_index;
									z.next_in_index = p;
									that.write = q;
									return that.inflate_flush(z, r);
								}
								n--;
								b |= (z.read_byte(p++) & 0xff) << k;
								k += 8;
							}

							b >>>= (t);
							k -= (t);

							j += (b & inflate_mask[i]);

							b >>>= (i);
							k -= (i);

							i = index;
							t = table;
							if (i + j > 258 + (t & 0x1f) + ((t >> 5) & 0x1f) || (c == 16 && i < 1)) {
								blens = null;
								mode = BADBLOCKS;
								z.msg = "invalid bit length repeat";
								r = Z_DATA_ERROR;

								that.bitb = b;
								that.bitk = k;
								z.avail_in = n;
								z.total_in += p - z.next_in_index;
								z.next_in_index = p;
								that.write = q;
								return that.inflate_flush(z, r);
							}

							c = c == 16 ? blens[i - 1] : 0;
							do {
								blens[i++] = c;
							} while (--j !== 0);
							index = i;
						}
					}

					tb[0] = -1;
					// {
					var bl_ = []; // new Array(1);
					var bd_ = []; // new Array(1);
					var tl_ = []; // new Array(1);
					var td_ = []; // new Array(1);
					bl_[0] = 9; // must be <= 9 for lookahead assumptions
					bd_[0] = 6; // must be <= 9 for lookahead assumptions

					t = table;
					t = inftree.inflate_trees_dynamic(257 + (t & 0x1f), 1 + ((t >> 5) & 0x1f), blens, bl_, bd_, tl_, td_, hufts, z);

					if (t != Z_OK) {
						if (t == Z_DATA_ERROR) {
							blens = null;
							mode = BADBLOCKS;
						}
						r = t;

						that.bitb = b;
						that.bitk = k;
						z.avail_in = n;
						z.total_in += p - z.next_in_index;
						z.next_in_index = p;
						that.write = q;
						return that.inflate_flush(z, r);
					}
					codes.init(bl_[0], bd_[0], hufts, tl_[0], hufts, td_[0]);
					// }
					mode = CODES;
				case CODES:
					that.bitb = b;
					that.bitk = k;
					z.avail_in = n;
					z.total_in += p - z.next_in_index;
					z.next_in_index = p;
					that.write = q;

					if ((r = codes.proc(that, z, r)) != Z_STREAM_END) {
						return that.inflate_flush(z, r);
					}
					r = Z_OK;
					codes.free(z);

					p = z.next_in_index;
					n = z.avail_in;
					b = that.bitb;
					k = that.bitk;
					q = that.write;
					m = /* (int) */(q < that.read ? that.read - q - 1 : that.end - q);

					if (last === 0) {
						mode = TYPE;
						break;
					}
					mode = DRY;
				case DRY:
					that.write = q;
					r = that.inflate_flush(z, r);
					q = that.write;
					m = /* (int) */(q < that.read ? that.read - q - 1 : that.end - q);
					if (that.read != that.write) {
						that.bitb = b;
						that.bitk = k;
						z.avail_in = n;
						z.total_in += p - z.next_in_index;
						z.next_in_index = p;
						that.write = q;
						return that.inflate_flush(z, r);
					}
					mode = DONELOCKS;
				case DONELOCKS:
					r = Z_STREAM_END;

					that.bitb = b;
					that.bitk = k;
					z.avail_in = n;
					z.total_in += p - z.next_in_index;
					z.next_in_index = p;
					that.write = q;
					return that.inflate_flush(z, r);
				case BADBLOCKS:
					r = Z_DATA_ERROR;

					that.bitb = b;
					that.bitk = k;
					z.avail_in = n;
					z.total_in += p - z.next_in_index;
					z.next_in_index = p;
					that.write = q;
					return that.inflate_flush(z, r);

				default:
					r = Z_STREAM_ERROR;

					that.bitb = b;
					that.bitk = k;
					z.avail_in = n;
					z.total_in += p - z.next_in_index;
					z.next_in_index = p;
					that.write = q;
					return that.inflate_flush(z, r);
				}
			}
		};

		that.free = function(z) {
			that.reset(z, null);
			that.window = null;
			hufts = null;
			// ZFREE(z, s);
		};

		that.set_dictionary = function(d, start, n) {
			that.window.set(d.subarray(start, start + n), 0);
			that.read = that.write = n;
		};

		// Returns true if inflate is currently at the end of a block generated
		// by Z_SYNC_FLUSH or Z_FULL_FLUSH.
		that.sync_point = function() {
			return mode == LENS ? 1 : 0;
		};

	}

	// Inflate

	// preset dictionary flag in zlib header
	var PRESET_DICT = 0x20;

	var Z_DEFLATED = 8;

	var METHOD = 0; // waiting for method byte
	var FLAG = 1; // waiting for flag byte
	var DICT4 = 2; // four dictionary check bytes to go
	var DICT3 = 3; // three dictionary check bytes to go
	var DICT2 = 4; // two dictionary check bytes to go
	var DICT1 = 5; // one dictionary check byte to go
	var DICT0 = 6; // waiting for inflateSetDictionary
	var BLOCKS = 7; // decompressing blocks
	var DONE = 12; // finished check, done
	var BAD = 13; // got an error--stay here

	var mark = [ 0, 0, 0xff, 0xff ];

	function Inflate() {
		var that = this;

		that.mode = 0; // current inflate mode

		// mode dependent information
		that.method = 0; // if FLAGS, method byte

		// if CHECK, check values to compare
		that.was = [ 0 ]; // new Array(1); // computed check value
		that.need = 0; // stream check value

		// if BAD, inflateSync's marker bytes count
		that.marker = 0;

		// mode independent information
		that.wbits = 0; // log2(window size) (8..15, defaults to 15)

		// this.blocks; // current inflate_blocks state

		function inflateReset(z) {
			if (!z || !z.istate)
				return Z_STREAM_ERROR;

			z.total_in = z.total_out = 0;
			z.msg = null;
			z.istate.mode = BLOCKS;
			z.istate.blocks.reset(z, null);
			return Z_OK;
		}

		that.inflateEnd = function(z) {
			if (that.blocks)
				that.blocks.free(z);
			that.blocks = null;
			// ZFREE(z, z->state);
			return Z_OK;
		};

		that.inflateInit = function(z, w) {
			z.msg = null;
			that.blocks = null;

			// set window size
			if (w < 8 || w > 15) {
				that.inflateEnd(z);
				return Z_STREAM_ERROR;
			}
			that.wbits = w;

			z.istate.blocks = new InfBlocks(z, 1 << w);

			// reset state
			inflateReset(z);
			return Z_OK;
		};

		that.inflate = function(z, f) {
			var r;
			var b;

			if (!z || !z.istate || !z.next_in)
				return Z_STREAM_ERROR;
			f = f == Z_FINISH ? Z_BUF_ERROR : Z_OK;
			r = Z_BUF_ERROR;
			while (true) {
				// System.out.println("mode: "+z.istate.mode);
				switch (z.istate.mode) {
				case METHOD:

					if (z.avail_in === 0)
						return r;
					r = f;

					z.avail_in--;
					z.total_in++;
					if (((z.istate.method = z.read_byte(z.next_in_index++)) & 0xf) != Z_DEFLATED) {
						z.istate.mode = BAD;
						z.msg = "unknown compression method";
						z.istate.marker = 5; // can't try inflateSync
						break;
					}
					if ((z.istate.method >> 4) + 8 > z.istate.wbits) {
						z.istate.mode = BAD;
						z.msg = "invalid window size";
						z.istate.marker = 5; // can't try inflateSync
						break;
					}
					z.istate.mode = FLAG;
				case FLAG:

					if (z.avail_in === 0)
						return r;
					r = f;

					z.avail_in--;
					z.total_in++;
					b = (z.read_byte(z.next_in_index++)) & 0xff;

					if ((((z.istate.method << 8) + b) % 31) !== 0) {
						z.istate.mode = BAD;
						z.msg = "incorrect header check";
						z.istate.marker = 5; // can't try inflateSync
						break;
					}

					if ((b & PRESET_DICT) === 0) {
						z.istate.mode = BLOCKS;
						break;
					}
					z.istate.mode = DICT4;
				case DICT4:

					if (z.avail_in === 0)
						return r;
					r = f;

					z.avail_in--;
					z.total_in++;
					z.istate.need = ((z.read_byte(z.next_in_index++) & 0xff) << 24) & 0xff000000;
					z.istate.mode = DICT3;
				case DICT3:

					if (z.avail_in === 0)
						return r;
					r = f;

					z.avail_in--;
					z.total_in++;
					z.istate.need += ((z.read_byte(z.next_in_index++) & 0xff) << 16) & 0xff0000;
					z.istate.mode = DICT2;
				case DICT2:

					if (z.avail_in === 0)
						return r;
					r = f;

					z.avail_in--;
					z.total_in++;
					z.istate.need += ((z.read_byte(z.next_in_index++) & 0xff) << 8) & 0xff00;
					z.istate.mode = DICT1;
				case DICT1:

					if (z.avail_in === 0)
						return r;
					r = f;

					z.avail_in--;
					z.total_in++;
					z.istate.need += (z.read_byte(z.next_in_index++) & 0xff);
					z.istate.mode = DICT0;
					return Z_NEED_DICT;
				case DICT0:
					z.istate.mode = BAD;
					z.msg = "need dictionary";
					z.istate.marker = 0; // can try inflateSync
					return Z_STREAM_ERROR;
				case BLOCKS:

					r = z.istate.blocks.proc(z, r);
					if (r == Z_DATA_ERROR) {
						z.istate.mode = BAD;
						z.istate.marker = 0; // can try inflateSync
						break;
					}
					if (r == Z_OK) {
						r = f;
					}
					if (r != Z_STREAM_END) {
						return r;
					}
					r = f;
					z.istate.blocks.reset(z, z.istate.was);
					z.istate.mode = DONE;
				case DONE:
					return Z_STREAM_END;
				case BAD:
					return Z_DATA_ERROR;
				default:
					return Z_STREAM_ERROR;
				}
			}
		};

		that.inflateSetDictionary = function(z, dictionary, dictLength) {
			var index = 0;
			var length = dictLength;
			if (!z || !z.istate || z.istate.mode != DICT0)
				return Z_STREAM_ERROR;

			if (length >= (1 << z.istate.wbits)) {
				length = (1 << z.istate.wbits) - 1;
				index = dictLength - length;
			}
			z.istate.blocks.set_dictionary(dictionary, index, length);
			z.istate.mode = BLOCKS;
			return Z_OK;
		};

		that.inflateSync = function(z) {
			var n; // number of bytes to look at
			var p; // pointer to bytes
			var m; // number of marker bytes found in a row
			var r, w; // temporaries to save total_in and total_out

			// set up
			if (!z || !z.istate)
				return Z_STREAM_ERROR;
			if (z.istate.mode != BAD) {
				z.istate.mode = BAD;
				z.istate.marker = 0;
			}
			if ((n = z.avail_in) === 0)
				return Z_BUF_ERROR;
			p = z.next_in_index;
			m = z.istate.marker;

			// search
			while (n !== 0 && m < 4) {
				if (z.read_byte(p) == mark[m]) {
					m++;
				} else if (z.read_byte(p) !== 0) {
					m = 0;
				} else {
					m = 4 - m;
				}
				p++;
				n--;
			}

			// restore
			z.total_in += p - z.next_in_index;
			z.next_in_index = p;
			z.avail_in = n;
			z.istate.marker = m;

			// return no joy or set up to restart on a new block
			if (m != 4) {
				return Z_DATA_ERROR;
			}
			r = z.total_in;
			w = z.total_out;
			inflateReset(z);
			z.total_in = r;
			z.total_out = w;
			z.istate.mode = BLOCKS;
			return Z_OK;
		};

		// Returns true if inflate is currently at the end of a block generated
		// by Z_SYNC_FLUSH or Z_FULL_FLUSH. This function is used by one PPP
		// implementation to provide an additional safety check. PPP uses
		// Z_SYNC_FLUSH
		// but removes the length bytes of the resulting empty stored block. When
		// decompressing, PPP checks that at the end of input packet, inflate is
		// waiting for these length bytes.
		that.inflateSyncPoint = function(z) {
			if (!z || !z.istate || !z.istate.blocks)
				return Z_STREAM_ERROR;
			return z.istate.blocks.sync_point();
		};
	}

	// ZStream

	function ZStream() {
	}

	ZStream.prototype = {
		inflateInit : function(bits) {
			var that = this;
			that.istate = new Inflate();
			if (!bits)
				bits = MAX_BITS;
			return that.istate.inflateInit(that, bits);
		},

		inflate : function(f) {
			var that = this;
			if (!that.istate)
				return Z_STREAM_ERROR;
			return that.istate.inflate(that, f);
		},

		inflateEnd : function() {
			var that = this;
			if (!that.istate)
				return Z_STREAM_ERROR;
			var ret = that.istate.inflateEnd(that);
			that.istate = null;
			return ret;
		},

		inflateSync : function() {
			var that = this;
			if (!that.istate)
				return Z_STREAM_ERROR;
			return that.istate.inflateSync(that);
		},
		inflateSetDictionary : function(dictionary, dictLength) {
			var that = this;
			if (!that.istate)
				return Z_STREAM_ERROR;
			return that.istate.inflateSetDictionary(that, dictionary, dictLength);
		},
		read_byte : function(start) {
			var that = this;
			return that.next_in.subarray(start, start + 1)[0];
		},
		read_buf : function(start, size) {
			var that = this;
			return that.next_in.subarray(start, start + size);
		}
	};

	// Inflater

	function Inflater() {
		var that = this;
		var z = new ZStream();
		var bufsize = 512;
		var flush = Z_NO_FLUSH;
		var buf = new Uint8Array(bufsize);
		var nomoreinput = false;

		z.inflateInit();
		z.next_out = buf;

		that.append = function(data, onprogress) {
			var err, buffers = [], lastIndex = 0, bufferIndex = 0, bufferSize = 0, array;
			if (data.length === 0)
				return;
			z.next_in_index = 0;
			z.next_in = data;
			z.avail_in = data.length;
			do {
				z.next_out_index = 0;
				z.avail_out = bufsize;
				if ((z.avail_in === 0) && (!nomoreinput)) { // if buffer is empty and more input is available, refill it
					z.next_in_index = 0;
					nomoreinput = true;
				}
				err = z.inflate(flush);
				if (nomoreinput && (err == Z_BUF_ERROR))
					return -1;
				if (err != Z_OK && err != Z_STREAM_END)
					throw "inflating: " + z.msg;
				if ((nomoreinput || err == Z_STREAM_END) && (z.avail_in == data.length))
					return -1;
				if (z.next_out_index)
					if (z.next_out_index == bufsize)
						buffers.push(new Uint8Array(buf));
					else
						buffers.push(new Uint8Array(buf.subarray(0, z.next_out_index)));
				bufferSize += z.next_out_index;
				if (onprogress && z.next_in_index > 0 && z.next_in_index != lastIndex) {
					onprogress(z.next_in_index);
					lastIndex = z.next_in_index;
				}
			} while (z.avail_in > 0 || z.avail_out === 0);
			array = new Uint8Array(bufferSize);
			buffers.forEach(function(chunk) {
				array.set(chunk, bufferIndex);
				bufferIndex += chunk.length;
			});
			return array;
		};
		that.flush = function() {
			z.inflateEnd();
		};
	}

	var inflater;

	if (obj.zip)
		obj.zip.Inflater = Inflater;
	else {
		inflater = new Inflater();
		obj.addEventListener("message", function(event) {
			var message = event.data;

			if (message.append)
				obj.postMessage({
					onappend : true,
					data : inflater.append(message.data, function(current) {
						obj.postMessage({
							progress : true,
							current : current
						});
					})
				});
			if (message.flush) {
				inflater.flush();
				obj.postMessage({
					onflush : true
				});
			}
		}, false);
	}

})(this);


;

// upstream: js/zip/zip-ext.js
/*
 Copyright (c) 2013 Gildas Lormeau. All rights reserved.

 Redistribution and use in source and binary forms, with or without
 modification, are permitted provided that the following conditions are met:

 1. Redistributions of source code must retain the above copyright notice,
 this list of conditions and the following disclaimer.

 2. Redistributions in binary form must reproduce the above copyright
 notice, this list of conditions and the following disclaimer in
 the documentation and/or other materials provided with the distribution.

 3. The names of the authors may not be used to endorse or promote products
 derived from this software without specific prior written permission.

 THIS SOFTWARE IS PROVIDED ``AS IS'' AND ANY EXPRESSED OR IMPLIED WARRANTIES,
 INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND
 FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL JCRAFT,
 INC. OR ANY CONTRIBUTORS TO THIS SOFTWARE BE LIABLE FOR ANY DIRECT, INDIRECT,
 INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA,
 OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
 LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
 NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE,
 EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

(function() {

	var ERR_HTTP_RANGE = "HTTP Range not supported.";

	var Reader = zip.Reader;
	var Writer = zip.Writer;
	
	var ZipDirectoryEntry;

	var appendABViewSupported;
	try {
		appendABViewSupported = new Blob([ new DataView(new ArrayBuffer(0)) ]).size === 0;
	} catch (e) {
	}

	function HttpReader(url) {
		var that = this;

		function getData(callback, onerror) {
			var request;
			if (!that.data) {
				request = new XMLHttpRequest();
				request.addEventListener("load", function() {
					if (!that.size)
						that.size = Number(request.getResponseHeader("Content-Length"));
					that.data = new Uint8Array(request.response);
					callback();
				}, false);
				request.addEventListener("error", onerror, false);
				request.open("GET", url);
				request.responseType = "arraybuffer";
				request.send();
			} else
				callback();
		}

		function init(callback, onerror) {
			var request = new XMLHttpRequest();
			request.addEventListener("load", function() {
				that.size = Number(request.getResponseHeader("Content-Length"));
				callback();
			}, false);
			request.addEventListener("error", onerror, false);
			request.open("HEAD", url);
			request.send();
		}

		function readUint8Array(index, length, callback, onerror) {
			getData(function() {
				callback(new Uint8Array(that.data.subarray(index, index + length)));
			}, onerror);
		}

		that.size = 0;
		that.init = init;
		that.readUint8Array = readUint8Array;
	}
	HttpReader.prototype = new Reader();
	HttpReader.prototype.constructor = HttpReader;

	function HttpRangeReader(url) {
		var that = this;

		function init(callback, onerror) {
			var request = new XMLHttpRequest();
			request.addEventListener("load", function() {
				that.size = Number(request.getResponseHeader("Content-Length"));
				if (request.getResponseHeader("Accept-Ranges") == "bytes")
					callback();
				else
					onerror(ERR_HTTP_RANGE);
			}, false);
			request.addEventListener("error", onerror, false);
			request.open("HEAD", url);
			request.send();
		}

		function readArrayBuffer(index, length, callback, onerror) {
			var request = new XMLHttpRequest();
			request.open("GET", url);
			request.responseType = "arraybuffer";
			request.setRequestHeader("Range", "bytes=" + index + "-" + (index + length - 1));
			request.addEventListener("load", function() {
				callback(request.response);
			}, false);
			request.addEventListener("error", onerror, false);
			request.send();
		}

		function readUint8Array(index, length, callback, onerror) {
			readArrayBuffer(index, length, function(arraybuffer) {
				callback(new Uint8Array(arraybuffer));
			}, onerror);
		}

		that.size = 0;
		that.init = init;
		that.readUint8Array = readUint8Array;
	}
	HttpRangeReader.prototype = new Reader();
	HttpRangeReader.prototype.constructor = HttpRangeReader;

	function ArrayBufferReader(arrayBuffer) {
		var that = this;

		function init(callback, onerror) {
			that.size = arrayBuffer.byteLength;
			callback();
		}

		function readUint8Array(index, length, callback, onerror) {
			callback(new Uint8Array(arrayBuffer.slice(index, index + length)));
		}

		that.size = 0;
		that.init = init;
		that.readUint8Array = readUint8Array;
	}
	ArrayBufferReader.prototype = new Reader();
	ArrayBufferReader.prototype.constructor = ArrayBufferReader;

	function ArrayBufferWriter() {
		var array, that = this;

		function init(callback, onerror) {
			array = new Uint8Array();
			callback();
		}

		function writeUint8Array(arr, callback, onerror) {
			var tmpArray = new Uint8Array(array.length + arr.length);
			tmpArray.set(array);
			tmpArray.set(arr, array.length);
			array = tmpArray;
			callback();
		}

		function getData(callback) {
			callback(array.buffer);
		}

		that.init = init;
		that.writeUint8Array = writeUint8Array;
		that.getData = getData;
	}
	ArrayBufferWriter.prototype = new Writer();
	ArrayBufferWriter.prototype.constructor = ArrayBufferWriter;

	function FileWriter(fileEntry, contentType) {
		var writer, that = this;

		function init(callback, onerror) {
			fileEntry.createWriter(function(fileWriter) {
				writer = fileWriter;
				callback();
			}, onerror);
		}

		function writeUint8Array(array, callback, onerror) {
			var blob = new Blob([ appendABViewSupported ? array : array.buffer ], {
				type : contentType
			});
			writer.onwrite = function() {
				writer.onwrite = null;
				callback();
			};
			writer.onerror = onerror;
			writer.write(blob);
		}

		function getData(callback) {
			fileEntry.file(callback);
		}

		that.init = init;
		that.writeUint8Array = writeUint8Array;
		that.getData = getData;
	}
	FileWriter.prototype = new Writer();
	FileWriter.prototype.constructor = FileWriter;

	zip.FileWriter = FileWriter;
	zip.HttpReader = HttpReader;
	zip.HttpRangeReader = HttpRangeReader;
	zip.ArrayBufferReader = ArrayBufferReader;
	zip.ArrayBufferWriter = ArrayBufferWriter;

	if (zip.fs) {
		ZipDirectoryEntry = zip.fs.ZipDirectoryEntry;
		ZipDirectoryEntry.prototype.addHttpContent = function(name, URL, useRangeHeader) {
			function addChild(parent, name, params, directory) {
				if (parent.directory)
					return directory ? new ZipDirectoryEntry(parent.fs, name, params, parent) : new zip.fs.ZipFileEntry(parent.fs, name, params, parent);
				else
					throw "Parent entry is not a directory.";
			}

			return addChild(this, name, {
				data : URL,
				Reader : useRangeHeader ? HttpRangeReader : HttpReader
			});
		};
		ZipDirectoryEntry.prototype.importHttpContent = function(URL, useRangeHeader, onend, onerror) {
			this.importZip(useRangeHeader ? new HttpRangeReader(URL) : new HttpReader(URL), onend, onerror);
		};
		zip.fs.FS.prototype.importHttpContent = function(URL, useRangeHeader, onend, onerror) {
			this.entries = [];
			this.root = new ZipDirectoryEntry(this);
			this.root.importHttpContent(URL, useRangeHeader, onend, onerror);
		};
	}

})();


;

// upstream: js/js2me.js
var js2me = {
	debug: false,
	stat: 0,
	calledMethods: {},
	profile: false,
	storageName: '',
	libraryPath: 'js/me',
	constantPools: [], //only for memory profiling
	config: {
		app: true,
		engine: 'zazu',
		selector: false,
		workers: false,
		midlet: 1,
		width: 240,
		height: 266,
		fullHeight: 320
	}
};


;

// upstream: js/bufferStream.js
js2me.BufferStream = function (buffer) {
	if (buffer.array) {
		this.array = buffer.array;
	} else {
		this.array = new Uint8Array(buffer);
	}
	this.index = 0;
};

js2me.BufferStream.prototype = {
	readUint8: function () {
		var byte = this.array[this.index];
		this.index++;
		return byte;
	},
	readUint16: function () {
		return this.readUint8() * 256 + this.readUint8();
	},
	readUint32: function () {
		return this.readUint16() * 65536 + this.readUint16();
	},
	readUint64: function () {
		return this.readUint32() * 65536 * 65536 + this.readUint32();
	},
	getSubstream: function (length) {
		return new js2me.BufferStream(this.array.subarray(this.index, this.index + length));
	},
	skip: function (length) {
		var pos = this.index;
		this.index += length;
		if (this.index > this.array.length) {
			this.index = this.array.length;
		}
		return this.index - pos;
	},
	getRemaining: function () {
		return this.array.length - this.index;
	},
	isEnd: function () {
		return this.index >= this.array.length;
	},
	seek: function (index) {
		this.index = index;
	},
	readInt16: function () {
		var value = this.readUint16();
		if (value > 32767) {
			value = value - 65536;
		}
		return value;
	},
	readInt8: function () {
		var value = this.readUint8();
		if (value > 127) {
			value = value - 256;
		}
		return value;
	},
	readInt32: function () {
		var value = this.readUint32();
		if (value > 2147483647) {
			value = value - 4294967296;
		}
		return value;
	},
	readInt64: function () {
		var value = this.readUint64();
		if (value > 9223372036854775807) {
			value = value - 18446744073709551616;
		}
		return value;
	},
	reset: function () {
		this.index = 0;
	}
};


;

// upstream: js/convert.js
(function () {
	lastFieldId = 1;
	
	function getNewClass() {
		return function () {
			if (this.construct) {
				this.construct();
			}
		};
	};
	
	/**
	 * Converts Java class definition into JavaScript.
	 * @param {BufferStream} stream The class file format compliant with JVM specifications.
	 * @return {constructor} JavaScript constructor of class.
	 */
	js2me.convertClass = function (stream) {
		var newClass = getNewClass();
		var constantPool = [];
		newClass.prototype.require = [];
		newClass.prototype.initialized = false;
		var TAG_UTF8 = 1;
		var TAG_INTEGER = 3;
		var TAG_FLOAT = 4;
		var TAG_LONG = 5;
		var TAG_DOUBLE = 6;
		var TAG_CLASS_INFO = 7;
		var TAG_STRING = 8;
		var TAG_FIELDREF = 9;
		var TAG_METHODREF = 10;
		var TAG_INTERFACEREF = 11;
		var TAG_NAME_AND_TYPE = 12;
		function checkHeader() {
			if (stream.readUint32() != 0xCAFEBABE) {
				throw new Error('Incorrect header');
			}
		}
		function checkVersion() {
			// Who cares...
			stream.readUint32();
		}
		function readConstantPool() {
			var count = stream.readUint16() - 1;
			for (var i = 1; i <= count; i++) {
				var tag = stream.readUint8();
				var constant = {
					tag: tag,
					implemented: false
				};
				if (tag == TAG_UTF8) {
					constant.implemented = true;
					var length = stream.readUint16();
					var bytes = [];
					for (var j = 0; j < length; j++) {
						bytes.push(stream.readUint8());
					}
					constant.value = js2me.UTF8ToString(bytes);
				}
				if (tag == TAG_INTEGER) {
					constant.implemented = true;
					constant.value = stream.readInt32();
				}
				if (tag == TAG_FLOAT) {
					constant.implemented = true;
					var value = stream.readUint32();
					constant.value = js2me.dataToFloat(value);
				}
				if (tag == TAG_LONG) {
					constant.implemented = true;
					constant.value = {hi: stream.readUint32(), lo: stream.readUint32()};
				}
				if (tag == TAG_DOUBLE) {
					constant.implemented = true;
					var hiData = stream.readUint32();
					var loData = stream.readUint32();
					constant.value = js2me.dataToDouble(hiData, loData);
				}
				if (tag == TAG_CLASS_INFO) {
					constant.implemented = true;
					constant.nameIndex = stream.readUint16();
				}
				if (tag == TAG_STRING) {
					constant.implemented = true;
					constant.stringIndex = stream.readUint16();
				}
				if (tag == TAG_FIELDREF || tag == TAG_METHODREF || tag == TAG_INTERFACEREF) {
					constant.implemented = true;
					constant.classIndex = stream.readUint16();
					constant.nameAndTypeIndex = stream.readUint16();
				}
				if (tag == TAG_NAME_AND_TYPE) {
					constant.implemented = true;
					constant.nameIndex = stream.readUint16();
					constant.descriptorIndex = stream.readUint16();
				}
				if (!constant.implemented) {
					throw new Error('Unimplemented tag ' + tag + ' at position ' + i);
				}
				constantPool[i] = constant;
				if (tag == TAG_LONG || tag == TAG_DOUBLE) {
					i++;
				}
			}
		}
		
		function escapeName(name) {
			name = '$' + name;
			if (name == '$<init>') {
				name = '_init';
			}
			if (name == '$<clinit>') {
				name = '_clinit';
			}
			return name;
		}
		
		var regExp = new RegExp('[\\[;/]', 'g')
		var regExpBrackets = new RegExp('[\\(\\)]', 'g')
		
		function escapeType(typeName) {
			typeName = typeName.replace(regExp, '_').replace(regExpBrackets, '$');
			return typeName;
		}
		
		function getArguments(typeName) {
			var args = typeName.slice(typeName.indexOf('(') + 1, typeName.indexOf(')'));
			var FIELD_TYPE = 0;
			var OBJECT_TYPE = 1;
			var ARRAY_TYPE = 2;
			var state = FIELD_TYPE;
			var argumentsTypes = [];
			var part = [];
			for (var i = 0; i < args.length; i++) {
				part.push(args[i]);
				if (state == FIELD_TYPE || state == ARRAY_TYPE) {
					if (args[i] == 'L') {
						state = OBJECT_TYPE;
					} else if (args[i] == '[') {
						state = ARRAY_TYPE;
					} else {
						argumentsTypes.push(part.join(''));
						part = [];
					}
				} else if (state == OBJECT_TYPE) {
					if (args[i] == ';') {
						state = FIELD_TYPE;
						argumentsTypes.push(part.join(''));
						part = [];
					}
				}
			}
			return argumentsTypes;
		}
		
		function resolveConstants() {
			function resolveConstant(index) {
				var constant = constantPool[index];
				var tag = constant.tag;
				if (tag == TAG_UTF8 || tag == TAG_INTEGER || tag == TAG_LONG || tag == TAG_FLOAT || tag == TAG_DOUBLE) {
					constantPool[index] = constant.value;
				}
				if (tag == TAG_CLASS_INFO) {
					var name = resolveConstant(constant.nameIndex);
					var isClass = true;
					var arrayPrefix = name.substr(0, name.lastIndexOf('[') + 1);
					name = name.substr(name.lastIndexOf('[') + 1);
					if (arrayPrefix.length > 0) {
						isClass = false;
					}
					if (name[0] === 'L' && name[name.length - 1] === ';') {
						isClass = true;
						name = name.substring(1, name.length - 1);
					}
					var nameElements = name.split('/');
					var className = ['javaRoot.'];
					for (var i in nameElements) {
						if (i > 0) {
							className.push('.');
						}
						className.push('$')
						className.push(nameElements[i]);
					}
					
					
					if (isClass) {
						//newClass.prototype.require.push(className.join(''));
					}
					className.unshift(arrayPrefix);
					constantPool[index] = {
						className: className.join('')
					};
				}
				if (tag == TAG_STRING) {
					var text = resolveConstant(constant.stringIndex);
					constantPool[index] = new javaRoot.$java.$lang.$String(text);
				}
				if (tag == TAG_FIELDREF || tag == TAG_METHODREF || tag == TAG_INTERFACEREF) {
					constantPool[index] = {
						className: resolveConstant(constant.classIndex).className,
						name: resolveConstant(constant.nameAndTypeIndex).name,
						type: resolveConstant(constant.nameAndTypeIndex).type
					};
					if (tag == TAG_METHODREF || tag == TAG_INTERFACEREF) {
						var constant = constantPool[index];
						var methodPath = [constant.className, '.prototype.', constant.name].join('');
						/*var methodPath = constant.className.replace('javaRoot.', '').replace('$', '');
						if (constant.name.indexOf('_init') === 0) {
							methodPath += '.<init>';
						} else {
							methodPath += '.' + constant.name.split('$')[1];
						}
						methodPath += '(';
						for (var t in constant.type.argumentsTypes) {
							var typeName = constant.type.argumentsTypes[t];
							var arrays = 0;
							while (typeName.indexOf('[') === 0) {
								arrays++;
								typeName = typeName.substring(1);
							}
							if (typeName === 'Z') {
								methodPath += 'boolean';
							} else if (typeName === 'I') {
								methodPath += 'int';
							} else if (typeName === 'B') {
								methodPath += 'byte';
							} else if (typeName === 'D') {
								methodPath += 'double';
							} else if (typeName === 'F') {
								methodPath += 'float';
							} else if (typeName === 'J') {
								methodPath += 'long';
							} else if (typeName === 'C') {
								methodPath += 'char';
							} else {
								methodPath += typeName.replace(/\//g, '.').substring(1, typeName.length - 1);
							}
							for (var tt = 0; tt < arrays; tt++) {
								methodPath += '[]';
							}
							if (t < constant.type.argumentsTypes.length - 1) {
								methodPath += ',';
							}
						}
						methodPath += ')';*/
						if (!js2me.config.app) {
							js2me.usedMethods[methodPath] = true;
						}
					}
				}
				if (tag == TAG_NAME_AND_TYPE) {
					var name = resolveConstant(constant.nameIndex);
					name = escapeName(name);
					var typeName = resolveConstant(constant.descriptorIndex);
					name += escapeType(typeName);
					
					constantPool[index] = {
						name: name,
						type: {
							argumentsTypes: getArguments(typeName),
							returnType: typeName.slice(typeName.indexOf(')') + 1)
						}
					};
				}
				return constantPool[index];
			}
			for (var i in constantPool) {
				resolveConstant(i);
			}
		}
		function readAccessFlags() {
			return stream.readUint16();
		}
		function readSuperClass() {
			newClass.prototype.superClass = constantPool[stream.readUint16()].className;
		}
		function readInterfaces() {
			newClass.prototype.interfaces = [];
			var count = stream.readUint16();
			for (var i = 0; i < count; i++) {
				newClass.prototype.interfaces.push(constantPool[stream.readUint16()].className);
			}
		}
		function readFields() {
			//TODO
			var count = stream.readUint16();
			for (var i = 0; i < count; i++) {
				var accessFlags = stream.readUint16();
				var name = constantPool[stream.readUint16()];
				var type = constantPool[stream.readUint16()];
				var attributes = readAttributes();
				var fieldName = escapeName(name) + escapeType(type);
				newClass.prototype[fieldName] = lastFieldId;
				newClass.prototype['$' + lastFieldId] = null;
				if (type == 'B' || type == 'S' || type == 'F' || type == 'I') {
					newClass.prototype['$' + lastFieldId] = 0;
				}
				if (type == 'D') {
					newClass.prototype['$' + lastFieldId] = js2me.dconst0;
				}
				if (type == 'J') {
					newClass.prototype['$' + lastFieldId] = {hi: 0, lo: 0}
				}
				if (type == 'C') {
					newClass.prototype['$' + lastFieldId] = 0;
				}
				if (type == 'Z') {
					newClass.prototype['$' + lastFieldId] = 0;
				}
				if (attributes['ConstantValue']) {
					newClass.prototype['$' + lastFieldId] = attributes['ConstantValue'];
				}
				js2me.statics['$' + lastFieldId] = newClass.prototype['$' + lastFieldId];
				lastFieldId++;
			}
		}
		function readAttributes(name, type, accessFlags) {
			var count = stream.readUint16();
			var attributes = {};
			for (var i = 0; i < count; i++) {
				var attributeName = constantPool[stream.readUint16()];
				var attributeLength = stream.readUint32();
				var value = null;
				if (attributeName == 'Code') {
					var maxStack = stream.readUint16();
					var maxLocals = stream.readUint16();
					var codeLength = stream.readUint32();
					var codeStream = stream.getSubstream(codeLength);
					stream.skip(codeLength);
					var exceptions = [];
					var exceptionTableLength = stream.readUint16();
					for (var j = 0; j < exceptionTableLength; j++) {
						exceptions[j] = {
							startPc: stream.readUint16(),
							endPc: stream.readUint16(),
							handler: stream.readUint16(),
							catchType: constantPool[stream.readUint16()]
						};
					}
					readAttributes(codeStream);
					var escapedName = escapeName(name) + escapeType(type);
					var argumentsTypes = getArguments(type);
					var methodName = thisClass.className + '.prototype.' + escapedName;
					//TODO: move it somewhere else
					value = js2me.generateMethodStub(newClass, codeStream, methodName, constantPool, exceptions, maxLocals, escapedName, argumentsTypes, accessFlags);
				}
				if (attributeName == 'Synthetic') {
					value = true;
				}
				if (attributeName == 'ConstantValue') {
					value = constantPool[stream.readUint16()];
				}
				if (attributeName == 'InnerClasses') {
					var classCount = stream.readUint16();
					value = [];
					for (var j = 0; j < classCount; j++) {
						var classInfo = {
							innerClass: constantPool[stream.readUint16()],
							outerClass: constantPool[stream.readUint16()],
							innerName: constantPool[stream.readUint16()],
							accessFlags: stream.readUint16()
						};
						value.push(classInfo);
					}
				}
				if (attributeName == 'Exceptions') {
					var exceptionsCount = stream.readUint16();
					value = [];
					for (var j = 0; j < exceptionsCount; j++) {
						value.push(constantPool[stream.readUint16()]);
					}
				}
				if (attributeName == 'StackMapTable' || attributeName == 'StackMap' || attributeName == 'LineNumberTable' || attributeName == 'SourceFile' ||
					attributeName == 'LocalVariableTable') {
					//TODO: maybe it's needed by something?
					stream.skip(attributeLength);
					value = true;
				}
				if (value == null) {
					throw new Error('Unimplemented attribute ' + attributeName);
				}
				attributes[attributeName] = value;
			}
			return attributes;
		}
		function readMethods() {
			//TODO
			var count = stream.readUint16();
			for (var i = 0; i < count; i++) {
				var accessFlags = stream.readUint16();
				var name = constantPool[stream.readUint16()];
				var type = constantPool[stream.readUint16()];
				var attributes = readAttributes(name, type, accessFlags);
				newClass.prototype[escapeName(name) + escapeType(type)] = attributes['Code'];
			}
		}
		
		checkHeader();
		checkVersion();
		readConstantPool();
		resolveConstants();
		var accessFlags = readAccessFlags();
		if ((accessFlags & 0x0200) == 0) {
			newClass.prototype.type = 'class';
		} else {
			newClass.prototype.type = 'interface';
		}
		var thisClass = constantPool[stream.readUint16()];
		//js2me.constantPools.push(constantPool);
		newClass.prototype.className = thisClass.className;
		console.log('Converting class ' + thisClass.className);
		readSuperClass();
		readInterfaces();
		readFields();
		readMethods();
		readAttributes();
		return newClass;
	};
})();


;

// upstream: js/classes.js
(function () {
	/**
	 * Load multiple classes.
	 * @param {Array} classes List of class names.
	 * @param {function} callback Call after loading all of the classes.
	 */
	function loadClasses(classes, callback) {
		var threadId = js2me.currentThread;
		if (classes.length === 0) {
			callback();
			return;
		}
		var className = classes.pop();
		js2me.loadClass(className, function () {
			js2me.currentThread = threadId;
			loadClasses(classes, callback);
		}, function () {
			js2me.currentThread = threadId;
			loadClasses(classes, callback);
		})
		/*var remain = classes.length;
		function done() {
			remain--;
			if (remain === 0) {
				js2me.currentThread = threadId;
				callback()
			}
		}
		for (var i = 0; i < classes.length; i++) {
			js2me.loadClass(classes[i], done, done);
		}*/
	}
	var classLock = {};
	var blacklist = {};
	/**
	 * Loads a class (native or Javaish).
	 * @param {string} className Name of the class.
	 * @param {function(class)} callback Call after loading the class.
	 */
	js2me.loadClass = function (className, callback, errorCallback) {
		if (blacklist[className]) {
			errorCallback();
			return;
		}
		var error = null;
		var threadId = js2me.currentThread;
		
		if (classLock[className] && threadId !== classLock[className].threadId) {
			js2me.isThreadSuspended = true;
			classLock[className].waiting.push({
				threadId: threadId,
				successCallback: callback,
				errorCallback: errorCallback
			});
			return;
		}
		
		var classObj = js2me.findClass(className);
		if (classObj && (!js2me.statics || js2me.statics[className])) {
			callback(classObj);
		} else {
			console.log('Loading ' + className);
			classLock[className] = {
				threadId: threadId,
				waiting: []
			};
			
			function done(classObj, isError) {
				if (classLock[className]) {
					for (var i in classLock[className].waiting) {
						var lock = classLock[className].waiting[i];
						(function (lock) {
							js2me.restoreStack[lock.threadId].unshift(function () {
								js2me.loadClass(className, lock.successCallback, lock.errorCallback);
							});
							setTimeout(function () {
								js2me.restoreThread(lock.threadId);
							}, 0);
						})(lock);
					}
					delete classLock[className];
				}
				js2me.switchVM(threadId);
				if (classObj) {
					callback(classObj);
				} else {
					errorCallback();
				}
			}
			
			function loadDependecies() {
				js2me.currentThread = threadId;
				package[className.substr(className.lastIndexOf('.') + 1)] = classObj;
				if (classObj.prototype.interfaces instanceof Array) {
					require = require.concat(classObj.prototype.interfaces);
				}
				if (classObj.prototype.require instanceof Array) {
					require = require.concat(classObj.prototype.require);
					//delete classObj.prototype.require;
				}
				if (classObj.prototype.superClass) {
					require.push(classObj.prototype.superClass);
				}
				loadClasses(require, function () {
					js2me.restoreStack[threadId].unshift(function () {
						initializeClass(classObj, done);
					});
					js2me.restoreThread(threadId);
				});
			}
			
			var resourceName = className.replace('javaRoot.$', '').replace(/\.\$/g, '/') + '.class';
			var package = js2me.findPackage(className.substr(0, className.lastIndexOf('.')));
			js2me.isThreadSuspended = true;
			var require = [];
			if (!classObj) {
				if (js2me.resources[resourceName]) {
					js2me.loadResource(resourceName, function (data) {
						classObj = js2me.convertClass(new js2me.BufferStream(data));
						// lesser memory usage
						delete js2me.resources[resourceName];
						loadDependecies();
					});
				} else {
					var classPath = className.replace('javaRoot', js2me.libraryPath).replace(/\$/g, '').replace(/\./g, '/') + '.js';
					js2me.loadScript(classPath, function () {
						if (js2me.classBucket == null) {
							throw new javaRoot.$java.$lang.$ClassNotFoundException(className + ' not found');
						}
						var proto = js2me.classBucket.prototype;
						proto.className = className;
						classObj = js2me.classBucket;
						
						js2me.classBucket = null;
						loadDependecies();
					}, function () {
						console.error('Error loading ' + className + ' class.');
						blacklist[className] = true;
						done();
					});
				}
			} else {
				if (!js2me.statics[classObj.prototype.className]) {
					js2me.statics[classObj.prototype.className] = 1;
					loadDependecies();
				} else {
					done();
				}
			}
			
			
		}
		if (error) {
			throw error;
		}
	}
	/**
	 * Finds a package by its name.
	 * @param {string} path Package name.
	 * @param {object} [current=window] Entry point to search
	 * @return {object} Package object.
	 */
	js2me.findPackage = function (path, current) {
		if (!current) {
			current = window;
		}
		if (!path) {
			return current;
		}
		var name = path.substr(0, path.indexOf('.')) || path;
		if (!current[name]) {
			current[name] = {};
		}
		if (path.indexOf('.') > 0) {
			return js2me.findPackage(path.substr(path.indexOf('.') + 1), current[name]);
		} else {
			return current[name];
		}
	};
	var classCache = {};
	/**
	 * Finds a class by its full name.
	 * @param {string} path Class name.
	 * @return {constructor} Class constructor.
	 */
	js2me.findClass = function (path) {
		if (classCache[path] != null) {
			return classCache[path];
		}
		var package = this.findPackage(path.substr(0, path.lastIndexOf('.')));
		var classObj = package[path.substr(path.lastIndexOf('.') + 1)];
		/*if (!classObj) {
			throw new javaRoot.$java.$lang.$ClassNotFoundException(path);
		}*/
		classCache[path] = classObj;
		return classObj;
	};
	/**
	 * Finds classes which implement given class (including that class).
	 * @param {string} path Class name.
	 * @return {[constructor]} Class constructors.
	 */
	js2me.findSubclasses = function (path) {
		var result = [];		
		iterateClasses(javaRoot, 'javaRoot', function (classObj) {
			if (classObj instanceof Function && classObj.prototype.isImplement(path)) {
				result.push(classObj);
			}
		});
		return result;
	};
	/**
	 * Creates a constructor from given prototype and put into class bucket (i. e. result of executing current js file).
	 * @param {object} proto Object which is used as prototype.
	 */
	js2me.createClass = function (proto) {
		var classObj = function () {
			if (proto.construct) {
				proto.construct.apply(this, arguments);
			}
		};
		classObj.prototype = proto;
		proto.type = 'class';
		proto.initialized = false;
		js2me.classBucket = classObj;
	};
	/**
	 * Same as createClass but also change type into "interface".
	 * @param {object} proto Object which is used as prototype.
	 */
	js2me.createInterface = function (proto) {
		js2me.createClass(proto);
		proto.type = 'interface';
	};
	/**
	 * Iterates over some classes and packages and call a given function for each.
	 * @param {object} obj Entry point for iteration (use javaRoot if you want to iterate over whole space).
	 * @param {string} name Global name of entry point.
	 * @param {function(obj, name)} action Function to be executed for each found class and package.
	 */
	function iterateClasses(obj, name, action) {
		action(obj, name);
		for (var i in obj) {
			if (i[0] == '$') {
				iterateClasses(obj[i], name + '.' + i, action);
			}
		}
	};
	/**
	 * Initializes given class.
	 * @param {constructor} classObj Class constructor.
	 * @param {function(class)} callback Function to execute when class is ready to use.
	 */
	function initializeClass(classObj, callback) {
		console.log('Initializing ' + classObj.prototype.className);
		
		function markAsInitialized() {
			classObj.prototype.initialized = true;
			if (js2me.statics) {
				js2me.statics[classObj.prototype.className] = 2;
			}
		}
		
		if (classObj.prototype._clinit$$V && classObj.prototype.initialized && js2me.statics[classObj.prototype.className] !== 2) {
			classObj.prototype._clinit$$V(function () {
				markAsInitialized()
				callback(classObj);
			});
			return;
		}
		
		if (classObj === javaRoot.$java.$lang.$Object || classObj.prototype.initialized) {
			markAsInitialized()
			callback(classObj);
			return;
		}
		
		if (!classObj.prototype.superClass) {
			classObj.prototype.superClass = 'javaRoot.$java.$lang.$Object';
		}
		var superClass = js2me.findClass(classObj.prototype.superClass);
		//classObj.prototype.__proto__ = superClass.prototype;
		for (var i in superClass.prototype) {
			if (!classObj.prototype.hasOwnProperty(i)) {
				classObj.prototype[i] = superClass.prototype[i];
			}
		}
		
		if (classObj.prototype._clinit$$V) {
			markAsInitialized()
			classObj.prototype._clinit$$V(function () {
				callback(classObj);
			});
		} else {
			markAsInitialized()
			callback(classObj);
		}
	};
	
	/**
	 * Check if all used methods are implemented. Quite useless with lazy loading...
	 */
	js2me.checkMethods = function () {
		for (var methodPath in js2me.usedMethods) {
			// yeah, yeah, I know...
			var ref = eval(methodPath.replace('->', '.prototype.'));
			if (ref == null) {
				console.log('Method not found: ' + methodPath);
			}
		}
	};
	
	/**
	 * Prepares a JVM to usage. Basicaly loads some basic classes and sets initial state.
	 * @param {function} callback Function to execute when machine is ready.
	 */
	js2me.setupJVM = function (callback) {
		js2me.resources = {};
		js2me.threads = [];
		js2me.currentThread = 0;
		js2me.restoreStack = [[]];
		js2me.kill = false;
		js2me.usedMethods = {};
		js2me.usedByteCodes = {};
		javaRoot = {};
		var standardClasses = [
			'javaRoot.$java.$lang.$String',
			'javaRoot.$java.$lang.$Class',
			'javaRoot.$java.$lang.$Thread',
			'javaRoot.$java.$lang.$ClassNotFoundException',
			'javaRoot.$java.$lang.$ClassCastException',
			'javaRoot.$java.$lang.$ArrayIndexOutOfBoundsException',
			'javaRoot.$java.$lang.$NegativeArraySizeException',
			'javaRoot.$java.$lang.$ArrayObject',
			'javaRoot.$java.$lang.$ArithmeticException',
			'javaRoot.$java.$lang.$ArrayStoreException',
			'javaRoot.$java.$lang.$NullPointerException'
		];
		js2me.loadClass('javaRoot.$java.$lang.$Object', function () {
			loadClasses(standardClasses, callback);
		});
	};
})();


;

// upstream: js/execute.js
/**
 * Executes given program.
 * program An object returned by js2me.generateProgram
 * locals An array of local variables
 * constantPool 
 * exceptions
 * restoreInfo
 * callback
 */
js2me.execute = function (program, locals, constantPool, exceptions, restoreInfo, callback) {
	var context = {
		stack: [],
		result: null,
		locals: locals,
		position: 0,
		finish: false,
		saveResult: false,
		constantPool: constantPool,
		parameters: program.parameters
	};
	js2me.isThreadSuspended = false;
	if (restoreInfo) {
		context = restoreInfo.context;
		context.finish = false;
		callback = restoreInfo.callback;
		try {
			var result = js2me.restoreThread(js2me.currentThread);
			if (js2me.isThreadSuspended) {
				suspendCall();
			} else {
				if (context.saveResult) {
					context.stack.push(result);
					context.saveResult = false;
				}
			}
		} catch (exception) {
			tryCatchException(exception);
		}
		
	}
	
	function suspendCall() {
		if (js2me.restoreStack[js2me.currentThread] == null) {
			js2me.restoreStack[js2me.currentThread] = [];
		}
		var restoreStack = js2me.restoreStack[js2me.currentThread];
		restoreStack.push([program, locals, constantPool, exceptions, { 
			context: context,
			callback: callback
		}]);
		context.finish = true;
	}
	function tryCatchException(exception) {
		var handler = -1;
		for (var i = 0; i < exceptions.length && handler == -1; i++) {
			if (exceptions[i].startPc <= context.position - 1 && exceptions[i].endPc >= context.position - 1) {
				var obj = exception;
				var run = true;
				while (run) {
					if (exceptions[i].catchType == null || exceptions[i].catchType.className == obj.className) {
						handler = exceptions[i].handler;
						run = false;
					}
					if (obj.superClass) {
						obj = js2me.findClass(obj.superClass).prototype;
					} else {
						run = false;
					}
				}
			}
		}
		if (handler >= 0) {
			context.stack.push(exception);
			context.position = handler;
		} else {
			if (callback != null) {
				callback(exception);
			}
			throw exception;
		}
	}

	var length = program.content.length;
	while (context.position < length && !context.finish) {
		try {
			var func = program.content[context.position];
			context.position++;
			func(context);
		} catch (exception) {
			tryCatchException(exception);
		}
		
		if (js2me.isThreadSuspended) {
			suspendCall();
		}
		
	}
	if (context.regenerate) {
		program.regenerate = true;
	}
	if (callback != null && !js2me.isThreadSuspended) {
		callback(context.result);
	}
	
	return context.result;
};


;

// upstream: js/events.js
js2me.listeners = {
	keypress: [],
	keyreleased: []
};
js2me.sendEvent = function (eventName, data) {
	for (var i = 0; i < this.listeners[eventName].length; i++) {
		(function (listener) {
			js2me.currentVM = 1;
			js2me.launchThread(function () {
				listener(data);
			});
		})(js2me.listeners[eventName][i]);
	}
};
js2me.addEventListener = function (eventName, listener) {
	this.listeners[eventName].push(listener);
};
js2me.removeEventListener = function (eventName, listener) {
	var pos = this.listeners[eventName].indexOf(listener);
	if (pos != -1) {
		this.listeners[eventName].splice(pos, 1);
	}
};
js2me.sendKeyPressEvent = function (keyCode) {
	this.sendEvent('keypress', keyCode);
};
js2me.sendKeyReleasedEvent = function (keyCode) {
	this.sendEvent('keyreleased', keyCode);
};


;

// upstream: js/manifest.js
/**
 * Creates manifest object from given content.
 * @param {string} content Manifest file's content.
 * @return {object} Manifest object.
 */
js2me.parseManifest = function (content) {
	var manifest = {};
	var lines = content.split('\n');
	var lastSection;
	for (var i in lines) {
		var parts = lines[i].split(':');
		if (parts.length > 1) {
			lastSection = parts[0].toLowerCase();
			manifest[lastSection] = parts[1].trim();
		} else {
			manifest[lastSection] += parts[0].trim();
		}
	}
	return manifest;
}


;

// upstream: js/methodStub.js
js2me.generateMethodStub = function(newClass, stream, methodName, constantPool, exceptions, maxLocals, escapedName, argumentsTypes, accessFlags) {
	var data = {
		stream: new js2me.BufferStream(stream), 
		methodName: methodName,
		constantPool: constantPool,
		exceptions: exceptions,
		parent: newClass,
		name: escapedName,
		maxLocals: maxLocals,
		argumentsTypes: argumentsTypes,
		isStatic: (accessFlags & 8) !== 0,
		isSynchronized: (accessFlags & 0x20) !== 0
	};
	constantPool = undefined;
	stream = undefined;
	var stub = function (arg0, arg1, arg2, arg3, arg4, arg5, arg6, arg7, arg8, arg9, guard) {
		
		var locals = [];
		if (!data.isStatic) {
			locals.push(this);
		}
		if (guard !== undefined) {
			console.error('Too many arguments');
		}
		if (js2me.currentThread === -10) {
			console.debug(data.methodName);
		}
		var args = [arg0, arg1, arg2, arg3, arg4, arg5, arg6, arg7, arg8, arg9];
		for (var i = 0; i < argumentsTypes.length; i++) {
			locals.push(args[i]);
			if (args[i] && (args[i].double != null || args[i].hi != null)) {
				locals.push(args[i]);
			}
		}
		var callback = null;
		if (args[argumentsTypes.length] && args[argumentsTypes.length].constructor === Function) {
			callback = args[argumentsTypes.length];
		}
		var result;
		if (data.content == null || data.regenerate) {
			js2me.generateProgram(data);
		}
		if (data.isSynchronized) {
			var l = this.monitorQueue ? this.monitorQueue.length : 0;
			var callee = this;
			
			js2me.enterMonitor(callee);
			var oldCallback = callback || function () {};
			callback = function () {
				js2me.exitMonitor(callee);
				oldCallback();
			}
			if (js2me.isThreadSuspended) {
				js2me.suspendThread(function () {
					return js2me.execute(data, locals, data.constantPool, exceptions, null, callback);
				});
				return;
			}	
		}
		if (data.nativeMethod) {
			return data.nativeMethod.apply(this, args);
		} else {
			return js2me.execute(data, locals, data.constantPool, exceptions, null, callback);
		}
	};
	stub.isUnsafe = !js2me.codeCache.getItem(js2me.storageName + methodName);
	stub.data = data;
	return stub;
};
js2me.generateAllMethods = function (force) {
	var generated = 0;
	for (var i in js2me.usedMethods) {
		var separator = i.indexOf('.prototype.');
		var className = i.substr(0, separator);
		try {
			var classObj = js2me.findClass(className);
		} catch (e) {}
		var methodName = i.substr(separator + 11);
		var data;
		if (classObj && classObj.prototype[methodName] && (data = classObj.prototype[methodName].data)) {
			if (data.content == null || data.regenerate || force) {
				js2me.generateProgram(classObj.prototype[methodName].data);
				generated++;
			}
		}
	}
	console.log(generated + ' methods have been generated.');
	return generated;
};


;

// upstream: js/launcher.js
/**
 * Launches a midlet with given id.
 * @param {number} id Midlet's id.
 */
js2me.launchMidlet = function (id) {
	var mainMidlet = js2me.manifest['midlet-' + id];
	js2me['statics' + id] = {};
	var mainClassName = 'javaRoot.$' + mainMidlet.split(',')[2].trim().replace(/\./g, '.$');
	js2me.currentVM = id;
	var mainThread = new javaRoot.$java.$lang.$Thread(function () {
		js2me.loadClass(mainClassName, function (mainClass) {
			var midlet = new mainClass();
			midlet._init$$V(function () {
				midlet.$startApp$$V();
			});
		});
	});
	setTimeout(function () {
		js2me.currentVM = id;
		mainThread.$start$$V();
	}, 100);
};
js2me.launchJAR = function (blob) {
	if (js2me.config.workers) {
		js2me.worker.postMessage(['launchJAR', blob]);
	} else {
		js2me.loadScript(js2me.engine, function () {
			js2me.loadJAR(blob, function () {
				js2me.launchMidlet(js2me.config.midlet);
				if (js2me.manifest['nokia-midlet-bg-server']) {
					setTimeout(function () {
						js2me.launchMidlet(js2me.manifest['nokia-midlet-bg-server']);
					}, 0);
				}
			});
		});
	}
};


;

// upstream: js/loader.js
/**
 * Loads classes and resources from a given JAR file. This function purges state of JVM.
 * @param {string} filename Path to JAR file.
 * @param {function} callback Function to execute when loading is over.
 */
js2me.loadJAR = function (file, callback) {
	function loadReader(reader) {
		zip.useWebWorkers = false;
		zip.workerScriptsPath = 'js/zip/';
		zip.createReader(reader, function(zipReader) {
			zipReader.getEntries(function (entries) {
				js2me.addResources(entries)
				js2me.loadResource('META-INF/MANIFEST.MF', function (data) {
					var content = js2me.UTF8ToString(data);
					js2me.manifest = js2me.parseManifest(content);
					js2me.storageName = js2me.manifest['midlet-vendor'] + '/' +js2me.manifest['midlet-name'] + '//' + file.size + '/';
					callback();
				});
			});
		}, function (message) {
			js2me.showError(message);
		});
	}
	
	js2me.setupJVM(function () {
		loadReader(new zip.BlobReader(file));
	});
}
js2me.loadScript = function (filename, successCallback, errorCallback) {
	var element = document.createElement('script');
	element.src = filename;
	element.onload = function () {
		document.head.removeChild(element);
		//delete element.onload;
		//delete element.onerror;
		//element = undefined;
		successCallback();
	};
	element.onerror = function () {
		document.head.removeChild(element);
		//delete element.onload;
		//delete element.onerror;
		//element = undefined;
		errorCallback();
	};
	document.head.appendChild(element);
};


;

// upstream: js/numbers.js
"use strict";
js2me.longToString = function (a) {
	var digits = [];
	var sign = false;
	for (var i = 0; i < 22; i++) {
		digits[i] = 0;
	}
	if (a.hi < 2147483648) {

		var hi = a.hi;
		var i = 0;
		while (hi > 0) {
			digits[i] = hi % 10;
			hi = Math.floor(hi / 10);
			i++;
		}
		for (var i = 0; i < 32; i++) {
			var rest = 0;
			for (var j = 0; j < digits.length; j++) {
				digits[j] *= 2;
				digits[j] += rest;
				rest = Math.floor(digits[j] / 10);
				digits[j] = digits[j] % 10;
			}
		}
		var lo = a.lo;
		var rest = 0;
		for (var i = 0; i < digits.length; i++) {
			digits[i] += lo % 10 + rest;
			rest = Math.floor(digits[i] / 10);
			digits[i] = digits[i] % 10;
			lo = Math.floor(lo / 10);
		}
	} else {
		sign = true;
		var hi = -(a.hi - 4294967296);
		var i = 0;
		while (hi > 0) {
			digits[i] = hi % 10;
			hi = Math.floor(hi / 10);
			i++;
		}
		for (var i = 0; i < 32; i++) {
			var rest = 0;
			for (var j = 0; j < digits.length; j++) {
				digits[j] *= 2;
				digits[j] += rest;
				rest = Math.floor(digits[j] / 10);
				digits[j] = digits[j] % 10;
			}
		}
		var lo = a.lo;
		var rest = 0;
		for (var i = 0; i < digits.length; i++) {
			digits[i] -= lo % 10 + rest;
			rest = 0
			while (digits[i] < 0) {
				digits[i] += 10;
				rest++;
			}
			lo = Math.floor(lo / 10);
		}
	}
	var last = 0;
	for (var i = 0; i < digits.length; i++) {
		if (digits[i] > 0) {
			last = i;
		}
		digits[i] += 48;
	}
	digits = digits.slice(0, last + 1);
	if (sign) {
		digits.push(45);
	}
	return digits.reverse();
};
js2me.ladd = function (a, b) {
	var result = {hi: 0, lo: 0};
	result.lo = a.lo + b.lo;
	result.hi = Math.floor(result.lo / 0x100000000)
	result.lo = result.lo % 0x100000000;
	result.hi += a.hi + b.hi;
	result.hi = result.hi % 0x100000000;
	return result;
};
js2me.lcmp = function (a, b) {
	function normalize(x) {
		if (x >= 0x80000000) {
			return x -= 0x100000000;
		} else {
			return x;
		}
	}
	if (a.hi === b.hi && a.lo === b.lo) {
		return 0;
	}
	if (normalize(a.hi) > normalize(b.hi)) {
		return 1;
	}
	if (normalize(a.hi) === normalize(b.hi) && normalize(a.lo) > normalize(b.lo)) {
		return 1;
	}
	return -1;
};
js2me.ldiv = function (t, b) {
	var result = {hi: 0, lo: 0};
	var sign = false;
	var a = {hi: t.hi, lo: t.lo};
	if (t.hi >= 2147483648) {
		sign = !sign;
		a = js2me.lneg(t);
	}
	if (t.hi >= 2147483648) {
		sign = !sign;
		b = js2me.lneg(b);
	}
	var c = b;
	var base = {hi: 0, lo: 1};
	while (js2me.lcmp(c, a) != 1 && c.hi < 0x80000000) {
		c = js2me.lshl(c, 1);
		base = js2me.lshl(base, 1);
	}
	while (js2me.lcmp(a, b) != -1) {
		c.lo = Math.floor(c.lo / 2);
		if (c.hi % 2 === 1) {
			c.lo += 0x80000000;
		}
		c.hi = Math.floor(c.hi / 2);
		base = js2me.lshr(base, 1);
		if (js2me.lcmp(c, a) != 1) {
			a = js2me.lsub(a, c);
			result = js2me.ladd(result, base);
		}
	}
	if (sign) {
		result = js2me.lneg(result);
	}
	if (t.hi >= 2147483648) {
		a = js2me.lneg(a);
	}
	return {
		div: result,
		rem: a
	};
};
js2me.lmul = function (a, b) {
	var result = {hi: 0, lo: 0};
	var sign = false;
	var c = {hi: a.hi, lo: a.lo};
	if (a.hi >= 2147483648) {
		sign = !sign;
		c = js2me.lneg(a);
	}
	if (b.hi >= 2147483648) {
		sign = !sign;
		b = js2me.lneg(b);
	}
	result.hi = (c.hi * b.lo + c.lo * b.hi);
	result.lo = c.lo * b.lo;
	var rest = Math.floor(result.lo / 0x100000000);
	result.hi = (result.hi + rest) % 0x100000000;
	result.lo = result.lo % 0x100000000;
	if (sign) {
		result = js2me.lneg(result);
	}
	return result;
};
js2me.lneg = function (a) {
	var result = {hi: 0, lo: 0};
	if (a.hi == 0 && a.lo == 0) {
		return result;
	}
	result.hi = 0xFFFFFFFF - a.hi;
	result.lo = 0xFFFFFFFF - a.lo;
	result.lo++;
	if (result.lo >= 0x100000000) {
		result.hi += Math.floor(result.lo / 0x100000000);
		result.lo = result.lo % 0x100000000;
	}
	return result;
};
js2me.lshl = function (a, shift) {
	var lo = a.lo;
	var hi = a.hi;
	for (var i = 0; i < shift; i++) {
		lo *= 2;
		hi *= 2;
	}
	var rest = Math.floor(lo / 0x100000000);
	lo = lo % 0x100000000;
	hi = hi % 0x100000000 + rest;
	return {hi: hi, lo: lo};
};
js2me.lshr = function (a, shift, isArithmetic) {
	if (shift === 0) {
		return a;
	}
	var lo = a.lo;
	var hi = a.hi;
	var base = Math.pow(2, shift);
	var fillWithOnes = false;
	
	if (isArithmetic && hi >= 0x80000000) {
		fillWithOnes = true;
	}
	
	hi = Math.floor(hi / base);
	if (fillWithOnes) {
		hi += 0xFFFFFFFF - Math.pow(2, 32 - shift) + 1;
	}
	lo = Math.floor(lo / base);
	var rest = a.hi % base;
	rest *= Math.pow(2, 32 - shift);
	lo += rest;
	return {hi: hi, lo: lo};
};
js2me.lsub = function (a, b) {
	var x = a.hi;
	if (x >= 0x80000000) {
		x -= 0x100000000;
	}
	var y = b.hi;
	if (y >= 0x80000000) {
		y -= 0x100000000;
	}
	var hi = (x - y);
	var lo = a.lo - b.lo;
	while (lo < 0) {
		lo += 0x100000000;
		hi--;
	}
	while (hi < 0) {
		hi += 0x100000000;
	}
	
	return {hi: hi, lo: lo};
};
js2me.lxor = function (a, b) {
	var hi = 0;
	var hi1 = a.hi;
	var hi2 = b.hi;
	var lo = 0;
	var lo1 = a.lo;
	var lo2 = b.lo;
	var base = 1;
	for (var i = 0; i < 32; i++) {
		if (hi1 %2 !== hi2 % 2) {
			hi += base;
		}
		if (lo1 %2 !== lo2 % 2) {
			lo += base;
		}
		base  *= 2;
		hi1 = Math.floor(hi1 / 2);
		hi2 = Math.floor(hi2 / 2);
		lo1 = Math.floor(lo1 / 2);
		lo2 = Math.floor(lo2 / 2);
	}
	return {
		hi: hi,
		lo: lo
	};
};
js2me.dataToFloat = function (value) {
	var sign = (value & 0x80000000) != 0;
	var exponent = ((value & 0x7f800000) >> 23) - 127;
	var fraction = (value & 0x007fffff);
	for (var j = 0; j < 23; j++) {
		fraction /= 2;
	}
	fraction += 1;
	while (exponent != 0) {
		if (exponent > 0) {
			fraction *= 2;
			exponent--;
		} else {
			fraction /= 2;
			exponent++;
		}
	}
	if (sign) {
		fraction *= -1;
	}
	return fraction;
};
js2me.dataToDouble = function (hiData, loData) {
	var sign = (hiData & 0x80000000) != 0;
	var exponent = ((hiData & 0x7ff00000) >> 20) - 1023;
	hiData = (hiData & 0x000fffff) * 0x100000000;
	var fraction = 1;
	for (var j = 0; j < 52; j++) {
		hiData /= 2;
		loData /= 2;
	}
	fraction += hiData;
	fraction += loData;
	while (exponent != 0) {
		if (exponent > 0) {
			fraction *= 2;
			exponent--;
		} else {
			fraction /= 2;
			exponent++;
		}
	}
	if (sign) {
		fraction *= -1;
	}
	return {double: fraction};
};
js2me.FPToBytes = function (value, exponentLength, fractionLength) {
	var bytes = [];
	bytes[0] = 0;
	if (value < 0) {
		bytes[0] += 128;
		value =  -value;
	}
	var exp = 0;
	while (value < 1) {
		value *= 2;
		exp--;
	}
	while (value >= 2) {
		value /= 2;
		exp++;
	}
	exp += Math.pow(2, exponentLength - 1) - 1;
	bytes[1] = exp % Math.pow(2, exponentLength - 7);
	bytes[0] += Math.floor(exp / Math.pow(2, exponentLength - 7));
	value -= 1;
	value *= Math.pow(2, 8 - ((1 + exponentLength) % 8));
	bytes[1] += Math.floor(value);
	value = value % 1;
	var length = Math.floor((exponentLength  + fractionLength + 1) / 8)
	for (var i = 2; i < length; i++) {
		value *= 256;
		bytes[i] = Math.floor(value);
		value = value % 1;
	}
	return bytes;
};
js2me.dconst0 = {double: 0};
js2me.dconst1 = {double: 1};


;

// upstream: js/resources.js
/**
 * Loads resources from given list of zip entries to local cache.
 * @param {array} entries Array of zip.Entry elements.
 * @param {function} callback Function to execute when all resources are loaded.
 */
js2me.loadResources = function (entries, callback) {
	var remain = entries.length;
	function finish() {
		remain--;
		if (remain == 0) {
			callback();
		}
	}
	var i = 0;
	function addResource(entry) {
		entry.getData(new zip.ArrayBufferWriter(), function (content) {
			document.getElementById('screen').innerHTML = 'Loading ' + entry.filename + ' (' + (i + 1) + '/' + entries.length + ')';
			js2me.resources[entry.filename] = new Uint8Array(content);
			finish();
			if (remain > 0) {
				addResource(entries[i]);
			}
		});
	}
	js2me.resources = {};
	addResource(entries[i]);
};
js2me.addResources = function (entries) {
	js2me.resources = {};
	for (var i in entries) {
		js2me.resources[entries[i].filename] = entries[i];
	}
};
js2me.loadResource = function (name, callback) {
	if (name.indexOf('/') === 0) {
		name = name.substring(1);
	}
	if (js2me.resources[name] instanceof Uint8Array) {
		callback(js2me.resources[name]);
	} else {
		if (js2me.resources[name] == null) {
			callback(null);
		} else {
			js2me.resources[name].getData(new zip.ArrayBufferWriter(), function (content) {
				js2me.resources[name] = new Uint8Array(content);
				callback(js2me.resources[name]);
			});
		}
	}
};


;

// upstream: js/threads.js
/**
 * Restores suspended thread with given id.
 * @param {number} threadId Id of some thread which is currently suspended.
 */
js2me.restoreThread = function (threadId) {
	js2me.lastStop = +new Date;
	if (js2me.kill) {
		return;
	}
	if (js2me.restoreStack[threadId] == undefined) {
		return;
	}
	js2me.isThreadSuspended = false;
	var restoreStack = js2me.restoreStack[threadId].pop();
	if (restoreStack) {
		js2me.switchVM(threadId);
		if (typeof restoreStack == 'function') {
			return restoreStack();
		} else {
			return js2me.execute.apply(js2me, restoreStack);
		}
	}
};
/**
 * Launch new thread.
 * @param {function} func Action to be executed.
 */
js2me.launchThread = function (func) {
	var threadId = -js2me.lastThread;
	js2me.VMMapping[threadId] = js2me.currentVM;
	js2me.lastThread++;
	if (!js2me.restoreStack[threadId]) {
		js2me.restoreStack[threadId] = [];
	}
	setZeroTimeout(function () {
		js2me.switchVM(threadId);
		try {
			js2me.isThreadSuspended = false;
			js2me.currentThread = threadId;
			func();
			js2me.isThreadSuspended = false;
		} catch (e) {
			console.error(e.stack);
			js2me.showError(e.message);
		}
	}, 1);
};
js2me.lastThread = 1;
js2me.enterMonitor = function (obj) {
	if (obj.monitorQueue == null) {
		obj.monitorQueue = [];
	}
	if (obj.monitorQueue.length === 0 || obj.monitorQueue[0] === js2me.currentThread) {
		obj.monitorQueue.unshift(js2me.currentThread)
	} else {
		obj.monitorQueue.push(js2me.currentThread)
		js2me.isThreadSuspended = true;
	}
};
js2me.exitMonitor = function (obj) {
	if (this.monitorQueue == null) {
		this.monitorQueue = [];
	}
	obj.monitorQueue.shift();
	if (obj.monitorQueue.length !== 0 && obj.monitorQueue[0] !== js2me.currentThread) {
		var threadId = obj.monitorQueue[0];
		if (threadId != null) {
			setTimeout(function () {
				js2me.restoreThread(threadId);
			}, 1);
		}
	}
};
js2me.suspendThread = function (func) {
	js2me.isThreadSuspended = true;
	if (func) {
		if (js2me.restoreStack[js2me.currentThread].length > 0) {
			console.error('Trying to overwrite a thread!');
		}
		js2me.restoreStack[js2me.currentThread] = [func];
	}
	return js2me.currentThread;
};
js2me.switchVM = function (threadId) {
	js2me.currentThread = threadId;
	js2me.currentVM = js2me.VMMapping[threadId];
	js2me.statics = js2me['statics' + js2me.currentVM];
};
js2me.currentVM;
js2me.VMMapping = {};


;

// upstream: js/utils.js
/**
 * Converts given array into string.
 * @param {array} array Array of bytes which is correct UTF8 content.
 */
js2me.UTF8ToString = function (sourceArray, offset, length) {
	if (offset == null) {
		offset = 0;
	}
	var i = 0;
	if (length == null) {
		length = sourceArray.length;
	}
	var array = [];
	for (var j = 0; j < length; j++) {
		var code = sourceArray[offset + j];
		if (code < 0) {
			code += 256;
		}
		array[j] = code;
	}
	var result = [];
	while(i < length) {
		if (array[i] < 0x80) {
			var code = array[i];
			i++;
		} else if ((array[i] & 0xE0) == 0xC0) {
			var code = ((array[i] & 0x1F) << 6) | (array[i + 1] & 0x3F);
			i += 2;
		} else if ((array[i] & 0xF0) == 0xE0) {
			var code = (((array[i] & 0x0F) << 12) | ((array[i + 1] & 0x3F) << 6) | (array[i + 2] & 0x3F));
			i += 3;
		} else {
			return null;
		}
		
		var char = String.fromCharCode(code);
		if (char != '') {
			result.push(char);
		} else {
			return null;
		}
	}
	return result.join('');
};
js2me.stringToUTF8 = function (text) {
	var result = [];
	for (var i = 0; i < text.length; i++) {
		var char = text.charCodeAt(i);
		if (char >= 0x01 && char <= 0x007F) {
			result.push(char);
		}
		if (char == 0 || (char >= 0x0080 && char <= 0x07FF)) {
			result.push(0xC0 | (0x1F & (char >> 6)));
			result.push(0x80 | (0x3F & char));
		}
		if (char >= 0x0800 && char <= 0xFFFF) {
			result.push(0xE0 | (0x0F & (char >> 12)));
			result.push(0x80 | (0x3F & (char >>  6)));
			result.push(0x80 | (0x3F & char));
		}
	}
	return result;
};
js2me.bytesToDataURI = function (bytes, offset, length, mime) {
	var dataURI = 'data:' + mime + ',';
	for (var j = offset; j < offset + length; j++) {
		dataURI += '%';
		var code = bytes[j];
		if (code < 0) {
			code += 256;
		}
		code = code.toString(16)
		if (code.length == 1) {
			dataURI += '0';
		}
		dataURI += code;
	}
	return dataURI;
};

js2me.markUnsafe = function (func) {
	func.isUnsafe = true;
	return func;
};

// setZeroTimeout - L. David Baron <dbaron@dbaron.org>
var setZeroTimeout = (function() {
	var timeouts = [];
	var messageName = "zero-timeout-message";

	// Like setTimeout, but only takes a function argument.  There's
	// no time argument (always zero) and no arguments (you have to
	// use a closure).
	function setZeroTimeout(fn) {
	  timeouts.push(fn);
	  window.postMessage(messageName, "*");
	}

	function handleMessage(event) {
	  if (event.source == window && event.data == messageName) {
		event.stopPropagation();
		if (timeouts.length > 0) {
		  var fn = timeouts.shift();
		  fn();
		}
	  }
	}

	window.addEventListener("message", handleMessage, true);

	setZeroTimeout.removeListener = function () {
	  window.removeEventListener('message', handleMessage, true);  
	}

	// Add the one thing we want added to the window object.
	return setZeroTimeout;
})();


;

// upstream: js/program_zazu.js
"use strict";
(function () {
	var generators = [];
	var executors = [];
	/*function checkOverflow(value, bits) {
		var base = 1;
		for (var i = 0; i < bits - 1; i++) {
			base *= 2;
		}
		while (value >= base) {
			value -= (base * 2);
		}
		while (value < -base) {
			value += (base * 2);
		}
		return value;
	};*/
	
	function generateArrayLoad() {
		return function (context) {
			var index = context.stack.pop();
			var array = context.stack.pop();
			if (array == null) {
				throw new javaRoot.$java.$lang.$NullPointerException();
			}
			if (index < 0 || index >= array.length) {
				throw new javaRoot.$java.$lang.$ArrayIndexOutOfBoundsException(index + "/" + array.length);
			}
			context.stack.push(array[index]);
		};
	}
	function generateArrayStore(isObject) {
		return function (context) {
			var value = context.stack.pop();
			var index = context.stack.pop();
			var array = context.stack.pop();
			if (array == null) {
				throw new javaRoot.$java.$lang.$NullPointerException();
			}
			if (index < 0 || index >= array.length) {
				throw new javaRoot.$java.$lang.$ArrayIndexOutOfBoundsException(index + "/" + array.length);
			}
			if (isObject && value && value.constructor !== Array && !value.isImplement(array.className)) {
				throw new javaRoot.$java.$lang.$ArrayStoreException();
			}
			array[index] = value;
		};
	}
	function doReturn(context) {
		var functionResult = context.stack.pop();
		context.result = functionResult;
		context.finish = true;
		return functionResult;
	}
	function generateLoad(index) {
		return function (context) {
			context.stack.push(context.locals[index]);
		};
	}
	// aaload
	executors[0x32] = function (context) {
		var index = context.stack.pop();
		var array = context.stack.pop();
		if (array == null) {
			throw new javaRoot.$java.$lang.$NullPointerException();
		}
		if (index < 0 || index >= array.length) {
			throw new javaRoot.$java.$lang.$ArrayIndexOutOfBoundsException(index + "/" + array.length);
		}
		context.stack.push(array[index]);
	};
	// aastore
	executors[0x53] = function (context) {
		var value = context.stack.pop();
		var index = context.stack.pop();
		var array = context.stack.pop();
		if (array == null) {
			throw new javaRoot.$java.$lang.$NullPointerException();
		}
		if (index < 0 || index >= array.length) {
			throw new javaRoot.$java.$lang.$ArrayIndexOutOfBoundsException(index + "/" + array.length);
		}
		if (value && value.constructor !== Array && !value.isImplement(array.className)) {
			throw new javaRoot.$java.$lang.$ArrayStoreException();
		}
		array[index] = value;
	};
	// aconst_null
	executors[0x01] = function (context) {
		context.stack.push(null);
	}
	// aload
	generators[0x19] = function (stream) {
		return stream.readUint8();
	};
	executors[0x19] = function (context) {
		context.stack.push(context.locals[context.parameters[context.position - 1]]);
	};
	// aload_0
	executors[0x2a] = function (context) {
		context.stack.push(context.locals[0]);
	}
	// aload_1
	executors[0x2b] = function (context) {
		context.stack.push(context.locals[1]);
	}
	// aload_2
	executors[0x2c] = generateLoad(2);
	// aload_3
	executors[0x2d] = generateLoad(3);
	// anewarray
	generators[0xbd] = function (stream, data) {
		return {
			className: data.constantPool[stream.readUint16()].className
		};
	};
	executors[0xbd] = function (context) {
		var length = context.stack.pop();
		if (length < 0) {
			throw new javaRoot.$java.$lang.$NegativeArraySizeException();
		}
		var array = new Array(length);
		array.className = context.parameters[context.position - 1].className;
		for (var i = 0; i < array.length; i++) array[i] = null;
		context.stack.push(array);
	};
	// areturn
	executors[0xb0] = doReturn;
	// arraylength
	executors[0xbe] = function (context) {
		var array = context.stack.pop();
		if (array == null) {
			throw new javaRoot.$java.$lang.$NullPointerException();
		}
		context.stack.push(array.length);
	};
	// astore
	generators[0x3a] = function (stream) {
		return stream.readUint8();
	};
	executors[0x3a] = function (context) {
		context.locals[context.parameters[context.position - 1]] = context.stack.pop();
	};
	// astore_0
	executors[0x4b] = generateStore(0);
	// astore_1
	executors[0x4c] = function (context) {
		context.locals[1] = context.stack.pop();
	};
	// astore_2
	executors[0x4d] = function (context) {
		context.locals[2] = context.stack.pop();
	};
	// astore_3
	executors[0x4e] = generateStore(3);
	// athrow
	executors[0xbf] = function (context) {
		throw context.stack.pop();
	};
	// baload
	executors[0x33] = generateArrayLoad();
	// bastore
	executors[0x54] = generateArrayStore();
	// bipush
	generators[0x10] = function (stream) {
		return stream.readInt8();
	};
	executors[0x10] = function (context) {
		context.stack.push(context.parameters[context.position - 1]);
	};
	// caload
	executors[0x34] = generateArrayLoad();
	// castore
	executors[0x55] = generateArrayStore();
	// checkcast
	generators[0xc0] = function (stream, data) {
		return data.constantPool[stream.readUint16()].className;
	};
	executors[0xc0] = function (context) {
		var className = context.parameters[context.position - 1]
		var ref = context.stack.pop();
		if (ref != null) {
			if (ref.constructor == Array) {
				context.stack.push(ref);
				return;
			}
			var refClass = js2me.findClass(ref.className).prototype;
			var cmpClass = js2me.findClass(className).prototype;
			if (refClass.isImplement(cmpClass.className)) {
				context.stack.push(ref);
			} else {
				throw new javaRoot.$java.$lang.$ClassCastException();
			}
		} else {
			context.stack.push(ref);
		}
	};
	// d2f
	executors[0x90] = function (context) {
		var value = context.stack.pop();
		context.stack.push(value.double);
	};
	// d2i
	executors[0x8e] = function (context) {
		var value = context.stack.pop();
		if (isNaN(value)) {
			context.stack.push(0);
			return;
		}
		if (value < -0x80000000) {
			context.stack.push(-0x80000000);
			return;
		}
		if (value > 0x7fffffff) {
			context.stack.push(0x7fffffff);
			return;
		}
		context.stack.push(value);
	};
	// d2l
	executors[0x8f] = function (context) {
		var value = context.stack.pop();
		if (isNaN(value)) {
			context.stack.push(new js2me.Long(0, 0));
			return;
		}
		if (value < -0x8000000000000000) {
			context.stack.push(new js2me.Long(0x80000000, 0));
			return;
		}
		if (value >= 0x8000000000000000) {
			context.stack.push(new js2me.Long(0x7fffffff, 0xffffffff));
			return;
		}
		if (value < 0) {
			value = Math.abs(value);
			var result = new js2me.Long(Math.floor(value / 0x100000000), Math.floor(value % 0x100000000));
			context.stack.push(result.neg());
		} else {
			value = Math.abs(value);
			var result = new js2me.Long(Math.floor(value / 0x100000000), Math.floor(value % 0x100000000));
			context.stack.push(result);
		}
	};
	// dadd
	executors[0x63] = function (context) {
		var b = context.stack.pop();
		var a = context.stack.pop();
		context.stack.push({double: a.double + b.double});
	};
	// daload
	executors[0x31] = generateArrayLoad();
	// dastore
	executors[0x52] = function (context) {
		var value = context.stack.pop();
		var index = context.stack.pop();
		var array = context.stack.pop();
		if (array == null) {
			throw new javaRoot.$java.$lang.$NullPointerException();
		}
		if (index < 0 || index >= array.length) {
			throw new javaRoot.$java.$lang.$ArrayIndexOutOfBoundsException(index + "/" + array.length);
		}
		array[index] = value;
	};
	function generateCompareFloats(isDouble, onNaN) {
		return function (context) {
			var b = context.stack.pop();
			if (isDouble) {
				b = b.double;
			}
			var a = context.stack.pop();
			if (isDouble) {
				a = a.double;
			}
			var result;
			if (isNaN(a) || isNaN(b)) {
				result = onNaN;
			}
			if (a > b) {
				result = 1;
			}
			if (a === b) {
				result = 0;
			}
			if (a < b) {
				result = -1;
			}
			context.stack.push(result);
		};
	}
	// dcmpg
	executors[0x98] = generateCompareFloats(true, 1);
	// dcmpl
	executors[0x97] = generateCompareFloats(true, -1);
	// dconst_0
	executors[0x0e] = function (context) {
		context.stack.push(js2me.dconst0);
	};
	// dconst_1
	executors[0x0f] =  function (context) {
		context.stack.push(js2me.dconst1);
	};
	// ddiv
	executors[0x6f] = function (context) {
		var b = context.stack.pop();
		var a = context.stack.pop();
		context.stack.push({double: a.double / b.double});
	};
	// dload
	generators[0x18] = function (stream) {
		return stream.readUint8();
	};
	executors[0x18] = function (context) {
		context.stack.push(context.locals[context.parameters[context.position - 1]]);
	};
	// dload_0
	executors[0x26] = generateLoad(0);
	// dload_1
	executors[0x27] = generateLoad(1);
	// dload_2
	executors[0x28] = generateLoad(2);
	// dload_3
	executors[0x29] = generateLoad(3);
	// dmul
	executors[0x6b] = function (context) {
		var b = context.stack.pop();
		var a = context.stack.pop();
		context.stack.push({double: a.double * b.double});
	};
	// dneg
	executors[0x77] = function (context) {
		var value = context.stack.pop();
		context.stack.push({double: -value.double});
	};
	// drem
	executors[0x73] = function (context) {
		var b = context.stack.pop();
		var a = context.stack.pop();
		context.stack.push({double: a.double % b.double});
	};
	// dreturn
	executors[0xaf] = doReturn;
	// dstore
	generators[0x39] = function (stream) {
		return stream.readUint8();
	};
	executors[0x39] = function (context) {
		context.locals[context.parameters[context.position - 1]] = context.stack.pop();
	};
	// dstore_0
	executors[0x47] = generateStore(0);
	// dstore_1
	executors[0x48] = generateStore(1);
	// dstore_2
	executors[0x49] = generateStore(2);
	// dstore_3
	executors[0x4a] = generateStore(3);
	// dsub
	executors[0x67] = function (context) {
		var b = context.stack.pop();
		var a = context.stack.pop();
		context.stack.push({double: a.double - b.double});
	};
	// dup
	executors[0x59] = function (context) {
		var tmp = context.stack.pop();
		context.stack.push(tmp);
		context.stack.push(tmp);
	};
	// dup_x1
	executors[0x5a] = function (context) {
		var a = context.stack.pop();
		var b = context.stack.pop();
		context.stack.push(a);
		context.stack.push(b);
		context.stack.push(a);
	};
	// dup_x2
	executors[0x5b] = function (context) {
		var a = context.stack.pop();
		var b = context.stack.pop();
		var c = context.stack.pop();
		if (a.hi == null && a.double == null) {
			var stack0 = a;
			var stack1 = c;
			var stack2 = b;
			var stack3 = a;
		} else {
			var stack0 = c;
			var stack1 = a;
			var stack2 = b;
			var stack3 = a;
		}
		context.stack.push(stack0);
		context.stack.push(stack1);
		context.stack.push(stack2);
		context.stack.push(stack3);
	};
	// dup2
	executors[0x5c] = function (context) {
		var a = context.stack.pop();
		if (a.hi == null && a.double == null) {
			var b = context.stack.pop();
			context.stack.push(b);
			context.stack.push(a);
			context.stack.push(b);
			context.stack.push(a);
		} else {
			context.stack.push(a);
			context.stack.push(a);
		}
	};
	// dup2_x1
	executors[0x5d] = function (context) {
		var a = context.stack.pop();
		var b = context.stack.pop();
		if (a.hi == null && a.double == null) {
			var c = context.stack.pop();
			context.stack.push(b);
			context.stack.push(a);
			context.stack.push(c);
			context.stack.push(b);
			context.stack.push(a);
		} else {
			context.stack.push(a);
			context.stack.push(b);
			context.stack.push(a);
		}
	};
	// dup2_x2
	// who the hell came up with this op!?
	executors[0x5e] = function (context) {
		var a = context.stack.pop();
		var b = context.stack.pop();
		if (a.hi == null && a.double == null) {
			if (b.hi == null && b.double == null) {
				context.stack.push(a);
				context.stack.push(b);
				context.stack.push(a);
			} else {
				var c = context.stack.pop();
				context.stack.push(a);
				context.stack.push(c);
				context.stack.push(b);
				context.stack.push(a);
			}
		} else {
			var c = context.stack.pop();
			if (c.hi == null && c.double == null) {
				context.stack.push(b);
				context.stack.push(a);
				context.stack.push(c);
				context.stack.push(b);
				context.stack.push(a);
			} else {
				var d = context.stack.pop();
				context.stack.push(b);
				context.stack.push(a);
				context.stack.push(d);
				context.stack.push(c);
				context.stack.push(b);
				context.stack.push(a);
			}
		}
	};
	// fadd
	executors[0x62] = function (context) {
		var b = context.stack.pop();
		var a = context.stack.pop();
		context.stack.push(a + b);
	};
	// faload
	executors[0x30] = generateArrayLoad();
	// fastore
	executors[0x51] = generateArrayStore();
	// fcmpg
	executors[0x96] = generateCompareFloats(false, 1);
	// fcmpl
	executors[0x95] = generateCompareFloats(false, -1);
	// fconst_0
	executors[0x0b] = function (context) {
		context.stack.push(0);
	};
	// fconst_1
	executors[0x0c] = function (context) {
		context.stack.push(1);
	};
	// fconst_2
	executors[0x0d] = function (context) {
		context.stack.push(2);
	};
	// fdiv
	executors[0x6e] = function (context) {
		var b = context.stack.pop();
		var a = context.stack.pop();
		context.stack.push(a / b);
	};
	// fload
	generators[0x17] = function (stream) {
		return stream.readUint8();
	};
	executors[0x17] = function (context) {
		context.stack.push(context.locals[context.parameters[context.position - 1]]);
	};
	// fload_0
	executors[0x22] = generateLoad(0);
	// fload_1
	executors[0x23] = generateLoad(1)
	// fload_2
	executors[0x24] = generateLoad(2)
	// fload_3
	executors[0x25] = generateLoad(3);
	// fmul
	executors[0x6a] = function (context) {
		var b = context.stack.pop();
		var a = context.stack.pop();
		context.stack.push(a * b);
	};
	// fneg
	executors[0x76] = function (context) {
		var value = context.stack.pop();
		context.stack.push(-value);
	};
	// frem
	executors[0x72] = function (context) {
		var b = context.stack.pop();
		var a = context.stack.pop();
		context.stack.push(a % b);
	};
	// freturn
	executors[0xae] = doReturn;
	// fstore
	generators[0x38] = function (stream) {
		return stream.readUint8();
	};
	executors[0x38] = function (context) {
		context.locals[context.parameters[context.position - 1]] = context.stack.pop();
	};
	// fstore_0
	executors[0x43] = generateStore(0);
	// fstore_1
	executors[0x44] = generateStore(1);
	// fstore_2
	executors[0x45] = generateStore(2);
	// fstore_3
	executors[0x46] = generateStore(3);
	// fsub
	executors[0x66] = function (context) {
		var b = context.stack.pop();
		var a = context.stack.pop();
		context.stack.push(a - b);
	};
	// getfield
	generators[0xb4] = function (stream, data) {
		return data.constantPool[stream.readUint16()];
	};
	executors[0xb4] = function (context) {
		var obj = context.stack.pop();
		if (obj == null) {
			throw new javaRoot.$java.$lang.$NullPointerException();
		}
		var field = context.parameters[context.position - 1];
		if (field.constructor === String) {
			context.stack.push(obj[field]);
		} else {
			var classObj = js2me.findClass(field.className);
			var fieldId = classObj.prototype[field.name];
			context.stack.push(obj['$' + fieldId]);
			context.parameters[context.position - 1] = '$' + fieldId;
		}
	};
	// getstatic
	generators[0xb2] = function (stream, data) {
		return data.constantPool[stream.readUint16()];
	};
	executors[0xb2] = function (context) {
		var position = context.position - 1;
		var field = context.parameters[position];
		if (field.constructor === String) {
			context.stack.push(js2me.statics[field]);
		} else {
			loadClass(field.className, function (classObj) {
				var fieldId = '$' + classObj.prototype[field.name];
				//context.parameters[position] = fieldId;
				context.stack.push(js2me.statics[fieldId]);
			}, function () {
			});
		}
	};/*
	function generateGoto(func) {
		return function () {
			var index = stream.index + stream.readInt16() - 1;
			return function (context) {
				if (func(context)) {
					context.position = positionMapping[index];
				}
			}
		}
	}*/
	// goto
	for (var i = 0x99; i <= 0xa7; i++) {
		generators[i] = function (stream) {
			return {
				index: stream.index + stream.readInt16() - 1
			};
		};
	}
	executors[0xa7] = function (context) {
		var index = context.parameters[context.position - 1].index;
		context.position = index;
	}
	// i2l
	executors[0x85] = function (context) {
		var value = context.stack.pop();
		var result;
		if (value >= 0) {
			result = {hi: 0, lo: value};
		} else {
			result = {hi: 0xffffffff, lo: value + 4294967296};
		}
		context.stack.push(result);
	};
	// i2f
	executors[0x86] = function () {};
	// i2d
	executors[0x87] = function (context) {
		var value = context.stack.pop();
		context.stack.push({double: value});
	};
	// f2i
	executors[0x8b] = function (context) {
		var value = context.stack.pop();
		context.stack.push(~~value);
	};
	// f2d
	executors[0x8d] = function (context) {
		var value = context.stack.pop();
		context.stack.push({double: value});
	};
	// i2b
	executors[0x91] = function (context) {
		var value = context.stack.pop();
		value = (value + 2147483648) % 256;
		var result;
		if (value > 127) {
			result = value - 256;
		} else {
			result = value;
		}
		context.stack.push(result);
	};
	// i2c
	executors[0x92] = function (context) {
		var value = context.stack.pop();
		while (value < 0) {
			value += 0x100000000;
		}
		context.stack.push(value % 65536);
	};
	// i2s
	executors[0x93] = function (context) {
		var value = context.stack.pop();
		value = (value + 2147483648) % 65536;
		var result;
		if (value > 32767) {
			result = value - 65536;
		} else {
			result = value;
		}
		context.stack.push(result)
	};
	// iadd
	executors[0x60] = function (context) {
		var b = context.stack.pop();
		var a = context.stack.pop();
		context.stack.push((a + b) | 0);
	};
	// iand
	executors[0x7e] = function (context) {
		var b = context.stack.pop();
		var a = context.stack.pop();
		context.stack.push(a & b);
	};
	// iaload
	executors[0x2e] = function (context) {
		var b = context.stack.pop();
		var a = context.stack.pop();
		context.stack.push(a[b]);
	};
	// iastore
	executors[0x4f] = function (context) {
		var value = context.stack.pop();
		var index = context.stack.pop();
		var array = context.stack.pop();
		array[index] = value;
	};
	function generateConst(constant) {
		return function (context) {
			context.stack.push(constant);
		};
	}
	// iconst_m1
	executors[0x02] = generateConst(-1);
	// iconst_0
	executors[0x03] = function (context) {
		context.stack.push(0);
	};
	// iconst_1
	executors[0x04] = function (context) {
		context.stack.push(1);
	};
	// iconst_2
	executors[0x05] = function (context) {
		context.stack.push(2);
	};
	// iconst_3
	executors[0x06] = function (context) {
		context.stack.push(3);
	};
	// iconst_4
	executors[0x07] = function (context) {
		context.stack.push(4);
	};
	// iconst_5
	executors[0x08] = function (context) {
		context.stack.push(5);
	};
	// idiv
	executors[0x6c] = function (context) {
		var b = context.stack.pop();
		var a = context.stack.pop();
		if (b === 0) throw new javaRoot.$java.$lang.$ArithmeticException("/ by zero");
		var value = (~~(a / b)) | 0;
		context.stack.push(value);
	};
	// if_acmpeq
	executors[0xa5] = function (context) {
		if (context.stack.pop() === context.stack.pop()) {
			var index = context.parameters[context.position - 1].index;
			context.position = index;
		}
	};
	// if_acmpne
	executors[0xa6] = function (context) {
		if (context.stack.pop() !== context.stack.pop()) {
			var index = context.parameters[context.position - 1].index;
			context.position = index;
		}
	};
	// if_icmpeq
	executors[0x9f] = function (context) {
		if (context.stack.pop() === context.stack.pop()) {
			var index = context.parameters[context.position - 1].index;
			context.position = index;
		}
	};
	// if_icmpne
	executors[0xa0] = function (context) {
		if (context.stack.pop() !== context.stack.pop()) {
			var index = context.parameters[context.position - 1].index;
			context.position = index;
		}
	};
	// if_icmplt
	executors[0xa1] = function (context) {
		if (context.stack.pop() > context.stack.pop()) {
			var index = context.parameters[context.position - 1].index;
			context.position = index;
		}
	};
	// if_icmpge
	executors[0xa2] = function (context) {
		if (context.stack.pop() <= context.stack.pop()) {
			var index = context.parameters[context.position - 1].index;
			context.position = index;
		}
	};
	// if_icmpgt
	executors[0xa3] = function (context) {
		if (context.stack.pop() < context.stack.pop()) {
			var index = context.parameters[context.position - 1].index;
			context.position = index;
		}
	};
	// if_icmple
	executors[0xa4] = function (context) {
		if (context.stack.pop() >= context.stack.pop()) {
			var index = context.parameters[context.position - 1].index;
			context.position = index;
		}
	};
	// ifeq
	executors[0x99] = function (context) {
		if (context.stack.pop() === 0) {
			var index = context.parameters[context.position - 1].index;
			context.position = index;
		}
	};
	// ifne
	executors[0x9a] = function (context) {
		if (context.stack.pop() !== 0) {
			var index = context.parameters[context.position - 1].index;
			context.position = index;
		}
	};
	// iflt
	executors[0x9b] = function (context) {
		if (context.stack.pop() < 0) {
			var index = context.parameters[context.position - 1].index;
			context.position = index;
		}
	};
	// ifge
	executors[0x9c] = function (context) {
		if (context.stack.pop() >= 0) {
			var index = context.parameters[context.position - 1].index;
			context.position = index;
		}
	};
	// ifgt
	executors[0x9d] = function (context) {
		if (context.stack.pop() > 0) {
			var index = context.parameters[context.position - 1].index;
			context.position = index;
		}
	};
	// ifle
	executors[0x9e] = function (context) {
		if (context.stack.pop() <= 0) {
			var index = context.parameters[context.position - 1].index;
			context.position = index;
		}
	};
	// ifnonnull
	executors[0xc7] = function (context) {
		if (context.stack.pop() != null) {
			var index = context.parameters[context.position - 1].index;
			context.position = index;
		}
	};
	// ifnull
	generators[0xc7] = generators[0xc6] = function (stream) {
		return {
			index: stream.index + stream.readInt16() - 1
		};
	};
	executors[0xc6] = function (context) {
		if (context.stack.pop() == null) {
			var index = context.parameters[context.position - 1].index;
			context.position = index;
		}
	};
	// iinc
	generators[0x84] = function (stream) {
		return {
			local: stream.readUint8(),
			value: stream.readInt8()
		};
	};
	executors[0x84] = function (context) {
		var parameters = context.parameters[context.position - 1];
		context.locals[parameters.local] = (context.locals[parameters.local] + parameters.value) | 0;
	};
	// iload
	generators[0x15] = function (stream) {
		return stream.readUint8();
	};
	executors[0x15] = function (context) {
		context.stack.push(context.locals[context.parameters[context.position - 1]]);
	};
	// iload_0
	executors[0x1a] = function (context) {
		context.stack.push(context.locals[0]);
	};
	// iload_1
	executors[0x1b] = function (context) {
		context.stack.push(context.locals[1]);
	};
	// iload_2
	executors[0x1c] = function (context) {
		context.stack.push(context.locals[2]);
	};
	// iload_3
	executors[0x1d] = function (context) {
		context.stack.push(context.locals[3]);
	};
	// imul
	executors[0x68] = function (context) {
		var b = context.stack.pop();
		var a = context.stack.pop();
		var value = (a * b) | 0;
		context.stack.push(value);
	};
	// ineg
	executors[0x74] = function (context) {
		var value = (-context.stack.pop()) | 0;
		context.stack.push(value);
	};
	// instanceof
	generators[0xc1] = function (stream, data) {
		return data.constantPool[stream.readUint16()].className;
	};
	executors[0xc1] = function (context) {
		try {
			var ref = context.stack.pop();
			var className = context.parameters[context.position - 1];
			if (ref != null) {
				if (ref.constructor == Array) {
					context.stack.push(ref);
					return;
				}
				var refClass = js2me.findClass(ref.className).prototype;
				if (refClass.isImplement(className)) {
					context.stack.push(1);
				} else {
					context.stack.push(0);
				}
			} else {
				context.stack.push(0);
			}
		} catch (e) {
			debugger;
		}
	};
	function loadClass(className, callback, afterCallback) {
		var threadId = js2me.currentThread;
		var loaded = false;
		js2me.loadClass(className, function (classObj) {
			loaded = true;
			callback(classObj);
			if (!js2me.restoreStack[threadId]) {
				js2me.restoreStack[threadId] = [];
			}
			js2me.restoreStack[threadId].unshift(afterCallback);
			js2me.restoreThread(threadId);
		});
		if (!loaded) {
			js2me.isThreadSuspended = true;
		}
	}
	function generateInvocationGenerator(isGarbage) {
		return function (stream, data) {
			var methodInfo = data.constantPool[stream.readUint16()];
			if (isGarbage) {
				stream.readUint16();
			}
			var cache;/* = js2me.findClass(methodInfo.className);
			if (cache && !cache.prototype.initialized) {
				cache = undefined;
			}*/
			if (methodInfo.className === data.parent.prototype.className) {
				cache = data.parent;
			}
			return {
				methodInfo: methodInfo,
				cache: cache
			};
		}
	}
	function generateInvocationExecutor(isStatic, isVirtual) {
		function invoke (context, methodInfo, classObj) {
			var argumentsCount = methodInfo.type.argumentsTypes.length;
			var args = [];
			for (var i = argumentsCount - 1; i >= 0; i--) {
				args[i] = context.stack.pop();
			}
		
			if (!isStatic) {
				var obj = context.stack.pop();
				if (obj == null) {
					throw new javaRoot.$java.$lang.$NullPointerException();
				}
				if (obj.constructor == Array) {
					obj = new javaRoot.$java.$lang.$ArrayObject(obj);
				}
			}
		
			context.saveResult = (methodInfo.type.returnType != 'V');
			var result;
			if (isVirtual) {
				result = obj[methodInfo.name].apply(obj, args);
			} else {
				if (isStatic) {
					result = classObj.prototype[methodInfo.name].apply(classObj.prototype, args);
				} else {
					result = classObj.prototype[methodInfo.name].apply(obj, args);
				}
			}
			
			if (context.saveResult && !js2me.isThreadSuspended) {
				context.stack.push(result);
				context.saveResult = false;
			}
		}
		return function (context) {
			var parameters = context.parameters[context.position - 1];
			var methodInfo = parameters.methodInfo;
			if (parameters.cache) {
				invoke(context, methodInfo, parameters.cache)
			} else {
				var cache;
				loadClass(methodInfo.className, function (classObj) {
					//parameters.cache = classObj;
					cache = classObj;
				}, function () {
					invoke(context, methodInfo, cache);
				});
				}
			};
		
	}
	// invokeinterface
	generators[0xb9] = generateInvocationGenerator(true);
	executors[0xb9] = generateInvocationExecutor(false, true);
	// invokespecial
	generators[0xb7] = generateInvocationGenerator(false);
	executors[0xb7] = generateInvocationExecutor(false, false);
	// invokestatic
	generators[0xb8] = generateInvocationGenerator(false);
	executors[0xb8] = generateInvocationExecutor(true, false);
	// invokevirtual
	generators[0xb6] = generateInvocationGenerator(false);
	executors[0xb6] = generateInvocationExecutor(false, true);
	// ior
	executors[0x80] = function (context) {
		var b = context.stack.pop();
		var a = context.stack.pop();
		context.stack.push(a | b);
	};
	// irem
	executors[0x70] = function (context) {
		var b = context.stack.pop();
		var a = context.stack.pop();
		if (b === 0) throw new javaRoot.$java.$lang.$ArithmeticException("/ by zero");
		context.stack.push(a % b);
	};
	// ireturn
	executors[0xac] = doReturn;
	// ishl
	executors[0x78] = function (context) {
		var b = context.stack.pop();
		var a = context.stack.pop();
		context.stack.push(a << (b % 32));
	};
	// ishr
	executors[0x7a] = function (context) {
		var b = context.stack.pop();
		var a = context.stack.pop();
		context.stack.push(a >> (b % 32));
	};
	function generateStore(index) {
		return function (context) {
			context.locals[index] = context.stack.pop();
		};
	}
	// istore
	generators[0x36] = function (stream) {
		return stream.readUint8();
	};
	executors[0x36] = function (context) {
		context.locals[context.parameters[context.position - 1]] = context.stack.pop();
	};
	// istore_0
	executors[0x3b] = generateStore(0);
	// istore_1
	executors[0x3c] = generateStore(1);
	// istore_2
	executors[0x3d] = function (context) {
		context.locals[2] = context.stack.pop();
	};
	// istore_3
	executors[0x3e] = function (context) {
		context.locals[3] = context.stack.pop();
	};
	// isub
	executors[0x64] = function (context) {
		var b = context.stack.pop();
		var a = context.stack.pop();
		context.stack.push(a - b);
	};
	// iushr
	executors[0x7c] = function (context) {
		var shift = context.stack.pop() % 32;
		var value = context.stack.pop();
		var result;
		if (value >= 0) {
			result = value >> shift;
		} else {
			result = (value >> shift) + (2 << ~shift);
		}
		context.stack.push(result);
	};
	// ixor
	executors[0x82] = function (context) {
		var b = context.stack.pop();
		var a = context.stack.pop();
		context.stack.push(a ^ b);
	};
	// l2d
	executors[0x8a] = function (context) {
		var value = context.stack.pop();
		var double = value.hi;
		if (double >= 0x80000000) {
			double -= 0x100000000;
		}
		double *= 0x100000000;
		double += value.lo;
		context.stack.push({double: double});
	};
	// l2i
	executors[0x88] = function (context) {
		var value = context.stack.pop();
		var int = value.lo;
		if (int >= 0x80000000) {
			int -= 0x100000000;
		}
		context.stack.push(int);
	};
	// ladd
	executors[0x61] = function (context) {
		var b = context.stack.pop();
		var a = context.stack.pop();
		context.stack.push(js2me.ladd(a, b));
	};
	// laload
	executors[0x2f] = function (context) {
		var index = context.stack.pop();
		var array = context.stack.pop();
		context.stack.push(array[index]);
	};
	// land
	executors[0x7f] = function (context) {
		var b = context.stack.pop();
		var a = context.stack.pop();
		context.stack.push({hi: a.hi & b.hi, lo: a.lo & b.lo});
	};
	// lastore
	executors[0x50] = function (context) {
		var value = context.stack.pop();
		var index = context.stack.pop();
		var array = context.stack.pop();
		array[index] = value;
	};
	// lcmp
	executors[0x94] = function (context) {
		var b = context.stack.pop();
		var a = context.stack.pop();
		context.stack.push(js2me.lcmp(a, b));
	};
	// lconst_0
	executors[0x09] = function (context) {
		context.stack.push({hi: 0, lo: 0});
	};
	// lconst_1
	executors[0x0a] = function (context) {
		context.stack.push({hi: 0, lo: 1});
	};
	// ldc
	generators[0x12] = function (stream, data) {
		return data.constantPool[stream.readUint8()];
	};
	executors[0x12] = function (context) {
		context.stack.push(context.parameters[context.position - 1]);
	};
	// ldc_w, ldc2_w
	generators[0x14] = generators[0x13] = function (stream, data) {
		return data.constantPool[stream.readUint16()];
	};
	executors[0x14] = executors[0x13] = function (context) {
		context.stack.push(context.parameters[context.position - 1]);
	};
	// ldiv
	executors[0x6d] = function (context) {
		var b = context.stack.pop();
		var a = context.stack.pop();
		if (b.hi === 0 && b.lo ===0) throw new javaRoot.$java.$lang.$ArithmeticException("/ by zero");
		context.stack.push(js2me.ldiv(a, b).div);
	};
	// lload
	generators[0x16] = function (stream) {
		return stream.readUint8();
	};
	executors[0x16] = function (context) {
		context.stack.push(context.locals[context.parameters[context.position - 1]]);
	};
	// lload_0
	executors[0x1e] = function (context) {
		context.stack.push(context.locals[0]);
	};
	// lload_1
	executors[0x1f] = function (context) {
		context.stack.push(context.locals[1]);
	};
	// lload_2
	executors[0x20] = function (context) {
		context.stack.push(context.locals[2]);
	};
	// lload_3
	executors[0x21] = function (context) {
		context.stack.push(context.locals[3]);
	};
	// lmul
	executors[0x69] = function (context)  {
		var b = context.stack.pop();
		var a = context.stack.pop();
		context.stack.push(js2me.lmul(a, b));
	};
	// lneg
	executors[0x75] = function (context) {
		var a = context.stack.pop();
		context.stack.push(js2me.lneg(a));
	};
	// lookupswitch
	generators[0xab] = function (stream) {
		var start = stream.index - 1;
		while (stream.index % 4 != 0) {
			stream.readUint8();
		}
		var def = start + stream.readInt32();
		var count = stream.readInt32();
		var table = [];
		for (var i = 0; i < count; i++) {
			var match = stream.readInt32();
			var value = start + stream.readInt32();
			table[match] = value;
		}
		return {
			table: table,
			index: def
		};
	};	
	executors[0xab] = function (context) {
		var parameters = context.parameters[context.position - 1];
		var index = context.stack.pop();
		var position = parameters.table[index];
		if (position === undefined) {
			position = parameters.index;
		}
		context.position = position;
	}
	// lor
	executors[0x81] = function (context) {
		var b = context.stack.pop();
		var a = context.stack.pop();
		context.stack.push({hi: a.hi | b.hi, lo: a.lo | b.lo});
	};
	// lrem
	executors[0x71] = function (context) {
		var b = context.stack.pop();
		var a = context.stack.pop();
		if (b.hi === 0 && b.lo ===0) throw new javaRoot.$java.$lang.$ArithmeticException("/ by zero");
		context.stack.push(js2me.ldiv(a, b).rem);
	};
	// lreturn
	executors[0xad] = doReturn;
	// lshl
	executors[0x79] = function (context) {
		var shift = context.stack.pop() % 64;
		var value = context.stack.pop();
		context.stack.push(js2me.lshl(value, shift));
	};
	// lshr
	executors[0x7b] = function (context) {
		var shift = context.stack.pop() % 64;
		var value = context.stack.pop();
		var result = js2me.lshr(value, shift, true);
		context.stack.push(result);
	};
	// lstore
	generators[0x37] = function (stream) {
		return stream.readUint8();
	};
	executors[0x37] = function (context) {
		context.locals[context.parameters[context.position - 1]] = context.stack.pop();
	};
	// lstore_0
	executors[0x3f] = generateStore(0);
	// lstore_1
	executors[0x40] = function (context) {
		context.locals[1] = context.stack.pop();
	};
	// lstore_2
	executors[0x41] = function (context) {
		context.locals[2] = context.stack.pop();
	};
	// lstore_3
	executors[0x42] = function (context) {
		context.locals[3] = context.stack.pop();
	};
	// lsub
	executors[0x65] = function (context) {
		var b = context.stack.pop();
		var a = context.stack.pop();
		context.stack.push(js2me.lsub(a, b));
	};
	// lxor
	executors[0x83] = function (context) {
		var b = context.stack.pop();
		var a = context.stack.pop();
		context.stack.push(js2me.lxor(a, b));
	};
	// lushr
	executors[0x7d] = function (context) {
		var shift = context.stack.pop() % 64;
		var value = context.stack.pop();
		var result = js2me.lshr(value, shift, false);
		context.stack.push(result);
	};
	// monitorenter
	executors[0xc2] = function (context) {
		var obj = context.stack.pop();
		js2me.enterMonitor(obj, context);
	};
	// monitorexit
	executors[0xc3] = function (context) {
		var obj = context.stack.pop();
		js2me.exitMonitor(obj);
	};
	// multinewarray
	generators[0xc5] = function (stream, data) {
		return {
			className: data.constantPool[stream.readUint16()].className,
			dimensions: stream.readUint8()
		};
	};
	executors[0xc5] = function (context) {
		var counts = [];
		var parameters = context.parameters[context.position - 1];
		var dimensions = parameters.dimensions;
		for (var i = 0; i < dimensions; i++) {
			counts[i] = context.stack.pop();
		}
		var type = parameters.className;
		var className = type.substr(1);
		counts.reverse();
		function setLength(element, depth, className) {
			className = className.substr(1);
			if (depth + 1 == dimensions) {
				for (var i = 0; i < counts[depth]; i++) {
					if (type.indexOf('L') == -1) {
						if (type.indexOf('J') != -1) {
							element[i] = {hi: 0, lo: 0};
						} else if (type.indexOf('D') != -1) {
							element[i] = js2me.dconst0;
						} else {
							element[i] = 0;
						}
					} else {
						element[i] = null;
					}
						
				}
				return;
			}
			for (var i = 0; i < counts[depth]; i++) {
				element[i] = [];
				element[i].className = className;
				setLength(element[i], depth + 1, className);
			}
		}
		var array = [];
		array.className = className;
		setLength(array, 0, className);
		context.stack.push(array);
	};
	// new
	generators[0xbb] = function (stream, data) {
		return data.constantPool[stream.readUint16()].className
	};
	executors[0xbb] = function (context) {
		var position = context.position - 1;
		var className = context.parameters[position];
		if (className.constructor !== String) {
			var instance = new className();
			context.stack.push(instance);
		} else {
			loadClass(className, function (classObj) {
				//context.parameters[position] = classObj;
				var instance = new classObj();
				context.stack.push(instance);
			}, function () {
			});
		}
	};
	// newarray
	generators[0xbc] = function (stream) {
		var type = stream.readUint8();
		var def;
		if (type == 7) {
			def = js2me.dconst0;
		} else if (type == 11) {
			def = {hi: 0, lo: 0};
		} else {
			def = 0;
		}
		return def;
	};
	executors[0xbc] = function (context) {
		var length = context.stack.pop();
		var array = [];
		while (length--) {
			array.push(context.parameters[context.position - 1]);
		}
		context.stack.push(array);
	}
	// noop
	executors[0x00] = function () {};
	// pop
	executors[0x57] = function (context) {
		context.stack.pop();
	};
	// pop2
	executors[0x58] = function (context) {
		context.stack.pop();
		context.stack.pop();
	};
	// putfield
	generators[0xb5] = function (stream, data) {
		return data.constantPool[stream.readUint16()];
	};
	executors[0xb5] = function (context) {
		var field = context.parameters[context.position - 1];
		var value = context.stack.pop();
		var obj = context.stack.pop();
		if (field.constructor === String) {
			obj[field] = value;
		} else {
			var classObj = js2me.findClass(field.className);
			var fieldId = classObj.prototype[field.name];
			obj['$' + fieldId] = value;
			context.parameters[context.position - 1] = '$' + fieldId;
		}
	};
	js2me.statics = {};
	// putstatic
	generators[0xb3] = function (stream, data) {
		return data.constantPool[stream.readUint16()];
	};
	executors[0xb3] = function (context) {
		var position = context.position - 1;
		var field = context.parameters[position];
		var value = context.stack.pop();
		if (field.constructor === String) {
			js2me.statics[field] = value;
		} else {
			loadClass(field.className, function (classObj) {
				var fieldId = '$' + classObj.prototype[field.name];
				js2me.statics[fieldId] = value;
				//context.parameters[position] = fieldId;
			}, function () {
			});
		}
	};
	// return
	executors[0xb1] = function (context) {
		context.finish = true;
	};
	// saload
	executors[0x35] = function (context) {
		var index = context.stack.pop();
		var array = context.stack.pop();
		if (array == null) {
			throw new javaRoot.$java.$lang.$NullPointerException();
		}
		if (index > array.length) {
			throw new javaRoot.$java.$lang.$ArrayIndexOutOfBoundsException();
		}
		context.stack.push(array[index]);
	};
	// sastore
	executors[0x56] = function (context) {
		var value = context.stack.pop();
		var index = context.stack.pop();
		var array = context.stack.pop();
		array[index] = value;
	};
	// sipush
	generators[0x11] = function (stream) {
		return stream.readInt16();
	};
	executors[0x11] = function (context) {
		context.stack.push(context.parameters[context.position - 1]);
	};
	// swap
	executors[0x5f] = function (context) {
		var b = context.stack.pop();
		var a = context.stack.pop();
		context.stack.push(a);
		context.stack.push(b);
	};
	// tableswitch
	generators[0xaa] = function (stream) {
		var start = stream.index - 1;
		while (stream.index % 4 != 0) {
			stream.readUint8();
		}
		var def = start + stream.readInt32();
		var low = stream.readInt32();
		var high = stream.readInt32();
		var count = high - low + 1;
		var table = {};
		for (var i = 0; i < count; i++) {
			table[low + i] = start + stream.readInt32();
		}
		return {
			table: table,
			index: def
		};
	};
	executors[0xaa] = function (context) {
		var parameters = context.parameters[context.position - 1];
		var index = context.stack.pop();
		var position = parameters.table[index];
		if (position === undefined) {
			position = parameters.index;
		}
		context.position = position;
	};
	// wide
	generators[0xc4] = function (stream) {
		var op = stream.readUint8();
		var pointer = stream.readUint16();
		if (op == 0x84) {
			var value = stream.readInt16();
		}
		return {
			op: op,
			pointer: pointer,
			value: value
		};
	};
	executors[0xc4] = function () {
		var parameters = context.parameters[context.position - 1];
		var op = parameters.op;
		var index = parameters.pointer;
		if (op >= 21 && op <= 25) {
			context.push(context.locals[index]); 
		}
		if (op >= 54 && op <= 58) {
			context.locals[index] = context.pop();
		}
		if (op == 0x84) {
			context.locals[index] += parameters.value;
		}
		throw new Error('wide: unkown op ' + index);
	}
	
	
	js2me.generateProgram = function (data) {
		var stream = data.stream;
		var methodName = data.methodName;
		var constantPool = data.constantPool;
		var exceptions = data.exceptions;
		
		data.regenerate = false;
		
		if (data.content == null) {
			console.log('Generating method ' + methodName);
		} else {
			console.log('Regenerating method ' + methodName);
		}
		var program = [];
		var positionMapping = new Array(stream.getRemaining());
		var reversedMapping = [];
		var parameters = {};
		
		/*for (var i = 0; i < exceptions.length; i++) {
			jumpTo[exceptions[i].startPc]++;
			jumpFrom[exceptions[i].endPc]++;
			jumpTo[exceptions[i].handler]++;
		}*/
		
		var isSubfunctionSafe;
		var onlyCode = true;
		while (!stream.isEnd()) {
			reversedMapping[program.length] = stream.index;
			var op = stream.readUint8();
			if (executors[op]) {
				isSubfunctionSafe = true;
				var func = null;
				if (generators[op]) {
					parameters[program.length] = generators[op](stream, data);
				}
				program.push(executors[op]);
			} else {
				throw new Error('Op ' + op.toString(16) + ' not supported');
			}
		}
		
		for (var i = 0; i < reversedMapping.length; i++) {
			positionMapping[reversedMapping[i]] = i;
		}
		
		for (var i = 0; i < exceptions.length; i++) {
			exceptions[i].startPc = positionMapping[exceptions[i].startPc];
			exceptions[i].endPc = positionMapping[exceptions[i].endPc];
			exceptions[i].handler = positionMapping[exceptions[i].handler];
		}
		
		for (var i in parameters) {
			if (parameters[i] && parameters[i].index) {
				parameters[i].index = positionMapping[parameters[i].index];
			}
			if (parameters[i] && parameters[i].table) {
				for (var j in parameters[i].table) {
					parameters[i].table[j] = positionMapping[parameters[i].table[j]];
				}
			}
		}
		
		delete data.stream;
		delete data.constantPool;
		data.content = program;
		data.parameters = parameters;
		data.parent.prototype[data.name].data = data;
		
	};
})();


;

var JS2ME_CLASS_SOURCES = Object.create(null);

// upstream: js/me/com/nokia/mid/impl/jms/core/Launcher.js
JS2ME_CLASS_SOURCES['js/me/com/nokia/mid/impl/jms/core/Launcher.js'] = function() {
js2me.createClass({
	
});


};

// upstream: js/me/com/nokia/mid/sound/Sound.js
JS2ME_CLASS_SOURCES['js/me/com/nokia/mid/sound/Sound.js'] = function() {
js2me.createClass({
	$SOUND_PLAYINGI: 0,
	$SOUND_STOPPEDI: 1,
	$SOUND_UNINITIALIZEDI: 3,
	/*
	 * 
	 */
	_init$_BI$V: function (data, type) {
		console.log(type);
		this.state = this.$SOUND_STOPPEDI;
	},
	/*
	 * 
	 */
	$getState$$I: function () {
		return this.state;
	},
	/*
	 * 
	 */
	$init$_BI$V: function () {
	},
	/*
	 * 
	 */
	$play$I$V: function () {
		this.state = this.$SOUND_PLAYINGI;
	},
	/*
	 * 
	 */
	$setGain$I$V: function () {
	},
	/*
	 * 
	 */
	$stop$$V: function () {
		this.state = this.$SOUND_STOPPEDI;
	}
});



};

// upstream: js/me/com/nokia/mid/ui/CanvasItem.js
JS2ME_CLASS_SOURCES['js/me/com/nokia/mid/ui/CanvasItem.js'] = function() {
js2me.createClass({
	
});



};

// upstream: js/me/com/nokia/mid/ui/DeviceControl.js
JS2ME_CLASS_SOURCES['js/me/com/nokia/mid/ui/DeviceControl.js'] = function() {
js2me.createClass({
	/*
	 * public static void setLights(int num, int level)
	 */
	$setLights$II$V: function (num, level) {
		// Yeah, turning lights on!
	}
});



};

// upstream: js/me/com/nokia/mid/ui/DirectGraphics.js
JS2ME_CLASS_SOURCES['js/me/com/nokia/mid/ui/DirectGraphics.js'] = function() {
js2me.createClass({
	construct: function (graphics) {
		this.graphics = graphics;
	},
	/*
	 * int getAlphaComponent()
	 */
	$getAlphaComponent$$I: function () {
		return this.graphics.alpha;
	},
	/*
	 * void setARGBColor(int argbColor)
	 */
	$setARGBColor$I$V: function (color) {
		if (color < 0) {
			color += 0x100000000;
		}
		this.graphics.alpha = Math.floor(color / Math.pow(2, 24));
		var alpha = Math.floor(this.graphics.alpha / 255 * 255) / 100;
		var red = (color & 0xff0000) >> 16;
		var green = (color & 0x00ff00) >> 8;
		var blue = (color & 0x0000ff);
		this.graphics.color = 'rgba(' + red + ', ' + green + ', ' + blue + ', ' + alpha + ')';
		this.graphics.colorValue = color;
	}
});



};

// upstream: js/me/com/nokia/mid/ui/DirectUtils.js
JS2ME_CLASS_SOURCES['js/me/com/nokia/mid/ui/DirectUtils.js'] = function() {
js2me.createClass({
	/*
	 * public static javax.microedition.lcdui.Image createImage(int width, int height, int color)
	 */
    $createImage$III$Ljavax_microedition_lcdui_Image_: function (width, height, color) {
		var image = javaRoot.$javax.$microedition.$lcdui.$Image.prototype.$createImage$II$Ljavax_microedition_lcdui_Image_(width, height);
		var graphics = new javaRoot.$javax.$microedition.$lcdui.$Graphics(image.element);
		var directGraphics = this.$getDirectGraphics$Ljavax_microedition_lcdui_Graphics_$Lcom_nokia_mid_ui_DirectGraphics_(graphics);
		directGraphics.$setARGBColor$I$V(color);
		graphics.$fillRect$IIII$V(0, 0, width, height);
		return image;
	},
	/*
	 * public static DirectGraphics getDirectGraphics(javax.microedition.lcdui.Graphics g)
	 */
	$getDirectGraphics$Ljavax_microedition_lcdui_Graphics_$Lcom_nokia_mid_ui_DirectGraphics_: function (graphics) {
		return new javaRoot.$com.$nokia.$mid.$ui.$DirectGraphics(graphics);
	},
	require: ['javaRoot.$com.$nokia.$mid.$ui.$DirectGraphics', 'javaRoot.$javax.$microedition.$lcdui.$Image']
});



};

// upstream: js/me/com/nokia/mid/ui/FullCanvas.js
JS2ME_CLASS_SOURCES['js/me/com/nokia/mid/ui/FullCanvas.js'] = function() {
js2me.createClass({
	superClass: 'javaRoot.$javax.$microedition.$lcdui.$Canvas'
});



};

// upstream: js/me/com/nokia/mid/ui/TextEditor.js
JS2ME_CLASS_SOURCES['js/me/com/nokia/mid/ui/TextEditor.js'] = function() {
js2me.createClass({
	/*
	 * public static TextEditor createTextEditor(int maxSize, int constraints, int width, int rows)
	 */
	$createTextEditor$IIII$Lcom_nokia_mid_ui_TextEditor_: function (maxSize, constraints, width, rows) {
		var editor = new javaRoot.$com.$nokia.$mid.$ui.$TextEditor();
		editor.maxSize = maxSize;
		editor.constraints = constraints;
		editor.width = width;
		editor.rows = rows;
		var element = document.createElement('input');
		var observer = new MutationObserver(function (data) {
			if (!this.parent) {
				return;
			}
			//TODO: do something smarter
			if (data[1].addedNodes.indexOf(this.parent.element) !== -1 || data[1].removedNodes.indexOf(this.parent.element) !== -1) {
				editor.refreshState();
			}
		});
		observer.observe(document.getElementById('screen'), {childList: true});
		element.className = 'TextEditor';
		element.maxLength = maxSize;
		element.style.width = width + "px";
		document.body.appendChild(element);
		editor.element = element;
		editor.margin = document.getElementById('screen').offsetLeft;
		editor.$setPosition$II$V(0, 0);
		
		return editor;
	},
	/*
	 * public java.lang.String getContent()
	 */
	$getContent$$Ljava_lang_String_: function () {
		return new javaRoot.$java.$lang.$String(this.element.value);
	},
	/*
	 * public int getContentHeight()
	 */
	$getContentHeight$$I: function () {
		return 50;
	},
	/*
	 * public boolean hasFocus()
	 */
	$hasFocus$$Z: function () {
		if (this.element === document.activeElement) {
			return 1;
		} else {
			return 0;
		}
	},
	/*
	 * public javax.microedition.lcdui.Font getFont()
	 */
	$getFont$$Ljavax_microedition_lcdui_Font_: function () {
		return javaRoot.$javax.$microedition.$lcdui.$Font.prototype.$getDefaultFont$$Ljavax_microedition_lcdui_Font_();
	},
	/*
	 * public int getForegroundColor()
	 */
	$getForegroundColor$$I: function () {
		return this.fgColor;
	},
	/*
	 * public int getHeight()
	 */
	$getHeight$$I: function () {
		return this.height;
	},
	/*
	 * public int getLineMarginHeight()
	 */
	$getLineMarginHeight$$I: function () {
		if (this.height) {
			return this.height;
		} else {
			return 0;
		}
	},
	/*
	 * public int getVisibleContentPosition()
	 */
	$getVisibleContentPosition$$I: function () {
		return 0;
	},
	/*
	 * public int getMaxSize()
	 */
	$getMaxSize$$I: function () {
		return this.maxSize;
	},
	/*
	 * public int getWidth()
	 */
	$getWidth$$I: function () {
		return this.width;
	},
	/*
	 * public void insert(java.lang.String text, int position)
	 */
	$insert$Ljava_lang_String_I$V: function (str, position) {
		this.element.value = this.element.value.substring(0, position) + str.text + this.element.value.substring(position);
	},
	/*
	 * public boolean isMultiline()
	 */
	$isMultiline$$Z: function () {
		return this.isMultiline;
	},
	/*
	 * public bool isVisible()
	 */
	$isVisible$$Z: function () {
		return this.isVisible;
	},
	/*
	 * public void setBackgroundColor(int color)
	 */
	$setBackgroundColor$I$V: function (color) {
		this.bgColor = color;
	},
	/*
	 * public void setCaret(int index)
	 */
	$setCaret$I$V: function (position) {
		this.element.selectionStart = position;
		this.element.selectionEnd = position;
	},
	/*
	 * public void setContent(java.lang.String content)
	 */
	$setContent$Ljava_lang_String_$V: function (str) {
		this.element.value = str.text;
	},
	/*
	 * public void setFocus(boolean focused)
	 */
	$setFocus$Z$V: function (value) {
		this.element.focus();
	},
	/*
	 * public void setFont(javax.microedition.lcdui.Font font)
	 */
	$setFont$Ljavax_microedition_lcdui_Font_$V: function () {
		// don't care about font
	},
	/*
	 * public void setForegroundColor(int color)
	 */
	$setForegroundColor$I$V: function (color) {
		this.fgColor = color;
		this.element.style.color = '#' + color.toString(16);
	},
	/*
	 * public int setMaxSize(int maxSize)
	 */
	$setMaxSize$I$I: function (maxSize) {
		this.maxSize = maxSize;
		this.element.maxLength = maxSize;
	},
	/*
	 * public void setMultiline(boolean aMultiline)
	 */
	$setMultiline$Z$V: function (value) {
		this.isMultiline = value;
		if (value) {
			console.error('TextEditor: multiple lines?');
		}
	},
	/*
	 * public void setParent(java.lang.Object theParent)
	 */
	$setParent$Ljava_lang_Object_$V: function (parent) {
		this.parent = parent;
		this.refreshState();
	},
	/*
	 * public void setPosition(int x, int y)
	 */
	$setPosition$II$V: function (x, y) {
		this.x = x;
		this.y = y;
		this.refreshState();
	},
	/*
	 * public void setSize(int width, int height)
	 */
	$setSize$II$V: function (width, height) {
		this.width = width;
		this.height = height;
		this.refreshState();
	},
	/*
	 * public void setTextEditorListener(TextEditorListener listener)
	 */
	$setTextEditorListener$Lcom_nokia_mid_ui_TextEditorListener_$V: function (listener) {
		this.listener = listener;
	},
	/*
	 * public void setVisible(boolean visible)
	 */
	$setVisible$Z$V: function (value) {
		this.isVisible = value;
		this.refreshState();
	},
	/*
	 * public int size()
	 */
	$size$$I: function () {
		return this.element.value.length;
	},
	refreshState: function () {
		if (this.parent) {
			this.element.style.left = (this.parent.element.offsetLeft + this.margin + this.x * this.parent.getScale()) + 'px';
			this.element.style.top = (this.y * this.parent.getScale()) + 'px';
			this.element.style.width = (this.width * this.parent.getScale()) + 'px';
			this.element.style.height = (this.height * this.parent.getScale()) + 'px';
			if (this.isVisible && this.parent.active) {
				this.element.style.display = 'inline';
			} else {
				this.element.style.display = '';
			}
		}
	},
	superClass: 'javaRoot.$com.$nokia.$mid.$ui.$CanvasItem'
});



};

// upstream: js/me/com/nokia/mid/ui/TextEditorListener.js
JS2ME_CLASS_SOURCES['js/me/com/nokia/mid/ui/TextEditorListener.js'] = function() {
js2me.createInterface({
});



};

// upstream: js/me/com/nokia/mid/ui/frameanimator/FrameAnimator.js
JS2ME_CLASS_SOURCES['js/me/com/nokia/mid/ui/frameanimator/FrameAnimator.js'] = function() {
js2me.createClass({
	/*
	 * public boolean isRegistered()
	 */
	$isRegistered$$Z: function () {
		if (this.listener) {
			return 1;
		}
		return 0;
	},
	/*
	 * public boolean register(int x, int y, short maxFps, short maxPps, FrameAnimatorListener listener)
	 */
	$register$IISSLcom_nokia_mid_ui_frameanimator_FrameAnimatorListener_$Z: function (x, y, maxFPS, maxPPS, listener) {
		if (this.listener) {
			throw new javaRoot.$java.$lang.$IllegalStateException();
		}
		this.listener = listener;
		return 1;
	},
	$stop$$V: function () {
	},
	$unregister$$V: function () {
	},
	require: ['javaRoot.$java.$lang.$IllegalStateException']
});



};

// upstream: js/me/com/nokia/mid/ui/frameanimator/FrameAnimatorListener.js
JS2ME_CLASS_SOURCES['js/me/com/nokia/mid/ui/frameanimator/FrameAnimatorListener.js'] = function() {
js2me.createInterface({
});



};

// upstream: js/me/com/nokia/mid/ui/gestures/GestureEvent.js
JS2ME_CLASS_SOURCES['js/me/com/nokia/mid/ui/gestures/GestureEvent.js'] = function() {
js2me.createClass({
	/*
	 * int getStartX()
	 */
	$getStartX$$I: function () {
		return this.x;
	},
	/*
	 * int getStartY()
	 */
	$getStartY$$I: function () {
		return this.y;
	},
	/*
	 * int getType()
	 */
	$getType$$I: function () {
		return this.type;
	}
});



};

// upstream: js/me/com/nokia/mid/ui/gestures/GestureInteractiveZone.js
JS2ME_CLASS_SOURCES['js/me/com/nokia/mid/ui/gestures/GestureInteractiveZone.js'] = function() {
js2me.createClass({
	$GESTURE_TAPI: 0x1,
	/*
	 * public GestureInteractiveZone(int gestures)
	 */
	_init$I$V: function (gestures) {
		this.gestures = gestures;
	},
	/*
	 * public static boolean isSupported(int gestureEventIdentity)
	 */
	$isSupported$I$Z: function () {
		// everything is supported! (liar)
		return 1;
	}
});



};

// upstream: js/me/com/nokia/mid/ui/gestures/GestureListener.js
JS2ME_CLASS_SOURCES['js/me/com/nokia/mid/ui/gestures/GestureListener.js'] = function() {
js2me.createInterface({
});



};

// upstream: js/me/com/nokia/mid/ui/gestures/GestureRegistrationManager.js
JS2ME_CLASS_SOURCES['js/me/com/nokia/mid/ui/gestures/GestureRegistrationManager.js'] = function() {
js2me.createClass({
	/*
	 * public static boolean register(java.lang.Object container, GestureInteractiveZone gestureInteractiveZone)
	 */
	$register$Ljava_lang_Object_Lcom_nokia_mid_ui_gestures_GestureInteractiveZone_$Z: function (container, zone) {
		if (!container.gestureZone) {
			container.gestureZone = zone;
			return 1;
		} else {
			console.debug('No more zones');
			return 0;
		}
	},
	/*
	 * public static void setListener(java.lang.Object container, GestureListener listener)
	 */
	$setListener$Ljava_lang_Object_Lcom_nokia_mid_ui_gestures_GestureListener_$V: function (container, listener) {
		var zone = javaRoot.$com.$nokia.$mid.$ui.$gestures.$GestureInteractiveZone.prototype;
		if (!container.gestureListener) {
			container.gestureListener = listener;
			container.element.addEventListener('click', function (event) {
				if (container.gestureZone.gestures & zone.$GESTURE_TAPI) {
					var gestureEvent = new javaRoot.$com.$nokia.$mid.$ui.$gestures.$GestureEvent();
					gestureEvent.x = Math.floor((event.layerX / container.element.clientWidth) * container.element.width);
					gestureEvent.y = Math.floor((event.layerY / container.element.clientHeight) * container.element.height);
					gestureEvent.type = zone.$GESTURE_TAPI;
					listener.$gestureAction$Ljava_lang_Object_Lcom_nokia_mid_ui_gestures_GestureInteractiveZone_Lcom_nokia_mid_ui_gestures_GestureEvent_$V(container, container.gestureZone, gestureEvent);
				}
			});
		}
	},
	$unregister$Ljava_lang_Object_Lcom_nokia_mid_ui_gestures_GestureInteractiveZone_$V: function (container, zone) {
		if (container.gestureZone === zone) {
			delete container.gestureZone;
		}
	},
	require: ['javaRoot.$com.$nokia.$mid.$ui.$gestures.$GestureInteractiveZone', 'javaRoot.$com.$nokia.$mid.$ui.$gestures.$GestureEvent']
});



};

// upstream: js/me/com/nokia/mid/ui/lcdui/DisplayStateListener.js
JS2ME_CLASS_SOURCES['js/me/com/nokia/mid/ui/lcdui/DisplayStateListener.js'] = function() {
js2me.createInterface({});



};

// upstream: js/me/com/nokia/mid/ui/lcdui/Indicator.js
JS2ME_CLASS_SOURCES['js/me/com/nokia/mid/ui/lcdui/Indicator.js'] = function() {
js2me.createClass({
	_init$ILjavax_microedition_lcdui_Image_$V: function () {
	},
	$setActive$Z$V: function () {
	}
});



};

// upstream: js/me/com/nokia/mid/ui/lcdui/IndicatorManager.js
JS2ME_CLASS_SOURCES['js/me/com/nokia/mid/ui/lcdui/IndicatorManager.js'] = function() {
js2me.createClass({
	$appendIndicator$Lcom_nokia_mid_ui_lcdui_Indicator_Z$I: function () {
	},
	$getIndicatorManager$$Lcom_nokia_mid_ui_lcdui_IndicatorManager_: function () {
		return new javaRoot.$com.$nokia.$mid.$ui.$lcdui.$IndicatorManager();
	}
});



};

// upstream: js/me/com/samsung/util/AudioClip.js
JS2ME_CLASS_SOURCES['js/me/com/samsung/util/AudioClip.js'] = function() {
js2me.createClass({
	/*
	 * 
	 */
	_init$ILjava_lang_String_$V: function(type, name) {
		console.log('Samsung: you want to play a ' + name.text +'?');
	},
	/*
	 * 
	 */
	$play$II$V: function (loop, volume) {
		console.log('Samsung: sure, play :>');
	},
	/*
	 * 
	 */
	$stop$$V: function () {
		console.log('Samsung: stahp');
	},
	package: 'javaRoot.$com.$samsung.$util',
	name: '$AudioClip'
});


};

// upstream: js/me/com/samsung/util/SM.js
JS2ME_CLASS_SOURCES['js/me/com/samsung/util/SM.js'] = function() {
js2me.createClass({
	package: 'javaRoot.$com.$samsung.$util',
	name: '$SM'
});


};

// upstream: js/me/com/samsung/util/SMS.js
JS2ME_CLASS_SOURCES['js/me/com/samsung/util/SMS.js'] = function() {
js2me.createClass({
	package: 'javaRoot.$com.$samsung.$util',
	name: '$SMS'
});


};

// upstream: js/me/java/io/BufferStream.js
JS2ME_CLASS_SOURCES['js/me/java/io/BufferStream.js'] = function() {
js2me.createClass({
	construct: function (bufferStream) {
		this.stream = bufferStream;
	},
	/*
	 * 
	 */
	$read$$I: function () {
		if (this.stream.isEnd()) {
			return -1;
		}
		return this.stream.readUint8();
	},
	/*
	 * 
	 */
	$skip$J$J: function (n) {
		if (n.hi > 0) {
			console.log('Too large skip value');
		}
		return {hi: 0, lo: this.stream.skip(n.lo)};
	},
	/*
	 * 
	 */
	$available$$I: function () {
		return this.stream.getRemaining();
	},
	/*
	 * public void mark(int readlimit)
	 */
	$mark$I$V: function () {
		this.$markI = this.stream.index;
	},
	/*
	 * public void reset()
	 */
	$reset$$V: function () {
		this.stream.seek = this.$markI;
	},
	superClass: 'javaRoot.$java.$io.$InputStream'
});



};

// upstream: js/me/java/io/ByteArrayInputStream.js
JS2ME_CLASS_SOURCES['js/me/java/io/ByteArrayInputStream.js'] = function() {
js2me.createClass({
	/*
	 * public ByteArrayInputStream(byte[] buf)
	 */
	_init$_B$V: function (buffer) {
		if (buffer == null) {
			throw new javaRoot.$java.$lang.$NullPointerException();
		}
		this._init$_BII$V(buffer, 0, buffer.length);
	},
	/*
	 * public ByteArrayInputStream(byte[] buf)
	 */
	_init$_BII$V: function (buffer, offset, length) {
		this.$buf_B = buffer;
		this.$posI = offset;
		this.$countI = offset + length;
		this.$markI = 0;
	},
	/*
	 * public int available()
	 */
	$available$$I: function () {
		return this.$buf_B.length - this.$posI;
	},
	/*
	 * public void close() throws IOException
	 */
	$close$$V: function () {
		delete this.$buf_B;
		this.closed = true;
	},
	/*
	 * public boolean markSupported()
	 */
	$mark$I$V: function () {
		this.$markI = this.$posI;
	},
	/*
	 * public boolean markSupported()
	 */
	$markSupported$$Z: function () {
		return 1;
	},
	/*
	 * public int read()
	 */
	$read$$I: function () {
		if (this.$posI >= this.$countI) {
			return -1;
		}
		var value = this.$buf_B[this.$posI];
		if (value < 0) {
			value += 256;
		}
		this.$posI++;
		return value;
	},
	/*
	 * public void reset()
	 */
	$reset$$V: function () {
		this.$posI = this.$markI;
	},
	/*
	 * public long skip(long n)
	 */
	$skip$J$J: function (skip) {
		if (this.$posI + skip.lo < this.$buf_B.length) {
			var result = skip.lo;
			this.$posI += skip.lo;
		} else {
			var result = this.$buf_B.length - this.$posI;
			this.$posI = this.$buf_B.length;
		}
		return {hi: 0, lo: result};
	},
	superClass: 'javaRoot.$java.$io.$InputStream'
});
	



};

// upstream: js/me/java/io/ByteArrayOutputStream.js
JS2ME_CLASS_SOURCES['js/me/java/io/ByteArrayOutputStream.js'] = function() {
js2me.createClass({
	construct: function () {
		this.$buf_B = [];
		this.$countI = 0;
	},
	/*
	 * public ByteArrayOutputStream()
	 */
	_init$$V: function () {
	},
	/*
	 * public ByteArrayOutputStream()
	 */
	_init$I$V: function (size) {
		if (size < 0) {
			throw new javaRoot.$java.$lang.$IllegalArgumentException();
		}
	},
	/*
	 * public void reset()
	 */
	$reset$$V: function () {
		this.$buf_B = [];
		this.$countI = 0;
	},
	/*
	 * public ByteArrayOutputStream(int size)
	 */
	$size$$I: function () {
		return this.$countI;
	},
	/*
	 * public byte[] toByteArray()
	 */
	$toByteArray$$_B: function () {
		return this.$buf_B.slice(0);
	},
	/*
	 * public String toString()
	 */
	$toString$$Ljava_lang_String_: function () {
		var text = js2me.UTF8ToString(this.$buf_B);
		return new javaRoot.$java.$lang.$String(text);
	},
	/*
	 * public void write(int b)
	 */
	$write$I$V: function (b) {
		while (b > 127) {
			b -= 256;
		}
		while (b < -128) {
			b += 256;
		}
		this.$buf_B.push(b);
		this.$countI = this.$buf_B.length;
	},
	superClass: 'javaRoot.$java.$io.$OutputStream'
});



};

// upstream: js/me/java/io/DataInput.js
JS2ME_CLASS_SOURCES['js/me/java/io/DataInput.js'] = function() {
js2me.createInterface({
});



};

// upstream: js/me/java/io/DataInputStream.js
JS2ME_CLASS_SOURCES['js/me/java/io/DataInputStream.js'] = function() {
js2me.createClass({
	/*
	 * public DataInputStream(InputStream in)
	 */
	_init$Ljava_io_InputStream_$V: function (stream) {
		this.stream = stream;
	},
	/*
	 * 
	 */
	$available$$I: function () {
		return this.stream.$available$$I();
	},
	/*
	 * public void mark(int readlimit)
	 */
	$mark$I$V: function (n) {
		this.stream.$mark$I$V(n);
	},
	/*
	 * public boolean markSupported()
	 */
	$markSupported$$Z: function () {
		return this.stream.$markSupported$$Z();
	},
	/*
	 * public void mark(int readlimit)
	 */
	$read$$I: function () {
		return this.stream.$read$$I();
	},
	/*
	 * 
	 */
	$readBoolean$$Z: function () {
		var byte = this.stream.$read$$I();
		if (byte == 0) {
			return 0;
		}
		if (byte > 0) {
			return 1;
		}
		if (byte < 0) {
			throw new javaRoot.$java.$io.$EOFException();
		}
	},
	/*
	 * 
	 */
	$readByte$$B: function () {
		var value = this.stream.$read$$I();
		if (value == -1) {
			throw new javaRoot.$java.$io.$EOFException();
		}
		if (value >= 128) {
			value -= 256;
		}
		return value;
	},
	/*
	 * 
	 */
	$readChar$$C: function () {
		return this.$readUnsignedShort$$I();
	},
	/*
	 * 
	 */
	$readDouble$$D: function () {
		var hiData = this.readUnsignedInt();
		var loData = this.readUnsignedInt();
		return js2me.dataToDouble(hiData, loData);
	},
	/*
	 * 
	 */
	$readFloat$$F: function () {
		var data = this.readUnsignedInt();
		return js2me.dataToFloat(data);
	},
	/*
	 * 
	 */
	$readFully$_B$V: function (buffer) {
		if (buffer == null) {
			throw new javaRoot.$java.$lang.$NullPointerException();
		}
		this.$readFully$_BII$V(buffer, 0, buffer.length);
	},
	/*
	 * 
	 */
	$readFully$_BII$V: function (buffer, offset, length) {
		if (buffer == null) {
			throw new javaRoot.$java.$lang.$NullPointerException();
		}
		if (offset + length > buffer.length) {
			length = buffer.length - offset;
		}
		if (this.stream.$read$_BII$I(buffer, offset, length) < length) {
			throw new javaRoot.$java.$io.$EOFException();
		}
	},
	/*
	 * 
	 */
	$readInt$$I: function () {
		var value = 0;
		for (var i = 0; i < 4; i++) {
			value = value << 8;
			var byte = this.stream.$read$$I();
			if (byte == -1) {
				throw new javaRoot.$java.$io.$EOFException();
			} 
			value += byte;
		}
		if (value >= 0x80000000) {
			value -= 0x100000000;
		}
		return value;
	},
	/*
	 * 
	 */
	$readLong$$J: function () {
		return {hi: this.readUnsignedInt(), lo: this.readUnsignedInt()};
	},
	/*
	 * 
	 */
	$readShort$$S: function () {
		var a = this.stream.$read$$I() 
		var b = this.stream.$read$$I();
		if (a == -1 || b == -1) {
			throw new javaRoot.$java.$io.$EOFException();
		}
		var value = (a << 8) + b;
		if (value >= 0x8000) {
			value -= 0x10000;
		}
		return value;
	},
	readUnsignedInt: function () {
		var value = this.$readInt$$I();
		if (value < 0) {
			value += 0x100000000;
		}
		return value;
	},
	/*
	 * 
	 */
	$readUnsignedByte$$I: function () {
		var value = this.stream.$read$$I();
		if (value == -1) {
			throw new javaRoot.$java.$io.$EOFException();
		}
		return value;
	},
	/*
	 * 
	 */
	$readUnsignedShort$$I: function () {
		var a = this.stream.$read$$I();
		var b = this.stream.$read$$I();
		if (a == -1 || b == -1) {
			throw new javaRoot.$java.$io.$EOFException();
		}
		return (a << 8) + b;
	},
	/*
	 * 
	 */
	$readUTF$$Ljava_lang_String_: function () {
		var length = this.$readUnsignedShort$$I();
		var buffer = [];
		if (this.stream.$read$_BII$I(buffer, 0, length) < length) {
			throw new javaRoot.$java.$io.$EOFException();
		}
		var result = js2me.UTF8ToString(buffer);
		if (result == null) {
			throw new javaRoot.$java.$io.$UTFDataFormatException();
		}
		return new javaRoot.$java.$lang.$String(result);
	},
	/*
	 * 
	 */
	$reset$$V: function () {
		this.stream.$reset$$V();
	},
	/*
	 * 
	 */
	$skip$J$J: function (n) {
		return this.stream.$skip$J$J(n);
	},
	/*
	 * 
	 */
	$skipBytes$I$I: function (n) {
		return this.$skip$J$J({hi: 0, lo: n}).lo;
	},
	superClass: 'javaRoot.$java.$io.$InputStream',
	interfaces: ['javaRoot.$java.$io.$DataInput'],
	require: ['javaRoot.$java.$io.$EOFException']
});



};

// upstream: js/me/java/io/DataOutputStream.js
JS2ME_CLASS_SOURCES['js/me/java/io/DataOutputStream.js'] = function() {
js2me.createClass({
	/*
	 * public DataOutputStream(OutputStream out)
	 */
	_init$Ljava_io_OutputStream_$V: function (out) {
		this.out = out;
	},
	/*
	 * 
	 */
	$close$$V: function () {
		this.out.$close$$V();
	},
	/*
	 * 
	 */
	$flush$$V: function () {
		this.out.$flush$$V();
	},
	/*
	 * 
	 */
	$write$I$V: function (value) {
		this.out.$write$I$V(value);
	},
	/*
	 * 
	 */
	$write$_B$V: function (data) {
		this.out.$write$_B$V(data);
	},
	/*
	 * 
	 */
	$write$_BII$V: function (data, offset, length) {
		this.out.$write$_BII$V(data, offset, length);
	},
	/*
	 * 
	 */
	$writeBoolean$Z$V: function (v) {
		if (v) {
			this.out.$write$I$V(1);
		} else {
			this.out.$write$I$V(0);
		}
	},
	/*
	 * 
	 */
	$writeByte$I$V: function (value) {
		if (value < 0) {
			value += 0x100;
		}
		this.out.$write$I$V(value);
	},
	/*
	 * 
	 */
	$writeChar$I$V: function (char) {
		if (char < 0) {
			char += 0x100000000;
		}
		this.$write$I$V(Math.floor(char / 256));
		this.$write$I$V(char % 256);
	},
	/*
	 * 
	 */
	$writeChars$Ljava_lang_String_$V: function (str) {
		for (var i = 0; i < str.text.length; i++) {
			this.$writeChar$I$V(str.text.charCodeAt(i));
		}
	},
	/*
	 * 
	 */
	$writeDouble$D$V: function (value) {
		this.$write$_B$V(js2me.FPToBytes(value.double, 11, 52));
	},
	/*
	 * 
	 */
	$writeFloat$F$V: function (value) {
		this.$write$_B$V(js2me.FPToBytes(value, 8, 23));
	},
	/*
	 * 
	 */
	$writeInt$I$V: function (value) {
		if (value < 0) {
			value += 0x100000000;
		}
		var buffer = [];
		for (var i = 0; i < 4; i++) {
			buffer[i] = value & 0xFF;
			value = value >> 8;
		}
		buffer.reverse();
		this.out.$write$_B$V(buffer);
	},
	/*
	 * 
	 */
	$writeLong$J$V: function (value) {
		this.$writeInt$I$V(value.hi);
		this.$writeInt$I$V(value.lo);
	},
	/*
	 * 
	 */
	$writeShort$I$V: function (value) {
		if (value < 0) {
			value += 0x10000;
		}
		this.out.$write$I$V(Math.floor(value / 256));
		this.out.$write$I$V(value % 256);
	},
	/*
	 * 
	 */
	$writeUTF$Ljava_lang_String_$V: function (str) {
		if (str == null) {
			throw new javaRoot.$java.$lang.$NullPointerException();
		}
		var bytes = str.$getBytes$$_B();
		this.out.$write$I$V((bytes.length & 0xFF00) >> 8);
		this.out.$write$I$V(bytes.length & 0xFF);
		this.out.$write$_B$V(bytes);
	},
	superClass: 'javaRoot.$java.$io.$OutputStream'
});



};

// upstream: js/me/java/io/DynamicOutputStream.js
JS2ME_CLASS_SOURCES['js/me/java/io/DynamicOutputStream.js'] = function() {
js2me.createClass({
	construct: function (array, start) {
		this.array = array;
		this.position = start || 0;
	},
	/*
	 * public abstract void write(int b) throws IOException
	 */
	$write$I$V: function (byte) {
		this.array[this.position] = byte;
		this.position++;
	},
	superClass: 'javaRoot.$java.$io.$OutputStream'
});



};

// upstream: js/me/java/io/EOFException.js
JS2ME_CLASS_SOURCES['js/me/java/io/EOFException.js'] = function() {
js2me.createClass({
	superClass: 'javaRoot.$java.$io.$IOException',
	name: '$EOFException',
	package: 'javaRoot.$java.$io'
});
	



};

// upstream: js/me/java/io/IOException.js
JS2ME_CLASS_SOURCES['js/me/java/io/IOException.js'] = function() {
js2me.createClass({
	superClass: 'javaRoot.$java.$lang.$Exception'
});
	



};

// upstream: js/me/java/io/InputStream.js
JS2ME_CLASS_SOURCES['js/me/java/io/InputStream.js'] = function() {
js2me.createClass({
	closed: false,
	/*
	 * public void close() throws IOException
	 */
	$close$$V: function () {
		this.closed = true;
	},
	/*
	 * public boolean markSupported()
	 */
	$markSupported$$Z: function () {
		
	},
	/*
	 * public void mark(int readlimit)
	 */
	$read$_BII$I: function (buffer, offset, length) {
		if (this.$available$$I() === 0) {
			return -1;
		}
		for (var i = 0; i < length; i++) {
			var value = this.$read$$I();
			if (value != -1) {
				if (value >= 128) {
					value -= 256;
				}
				buffer[offset + i] = value;
			} else {
				if (i === 0) {
					return -1;
				}
				return i;
			}
		}
		return length;
	},
	/*
	 * public void mark(int readlimit)
	 */
	$read$_B$I: function (buffer) {
		return this.$read$_BII$I(buffer, 0, buffer.length);
	},
	getBytes: function () {
		var bytes =  [];
		var byte = -1;
		while ((byte = this.$read$$I()) != -1) {
			if (byte >= 128) {
				byte -= 256;
			}
			bytes.push(byte);
		}
		return bytes;
	}
});



};

// upstream: js/me/java/io/InputStreamReader.js
JS2ME_CLASS_SOURCES['js/me/java/io/InputStreamReader.js'] = function() {
js2me.createClass({
	superClass: 'javaRoot.$java.$io.$Reader',
	/*
	 * public InputStreamReader(InputStream is)
	 */
	_init$Ljava_io_InputStream_$V: function(stream) {
		this.stream = stream;
	},
	/*
	 * public InputStreamReader(InputStream is, String enc) throws UnsupportedEncodingException
	 */
	_init$Ljava_io_InputStream_Ljava_lang_String_$V: function (stream) {
		// I don't care about your encoding
		this.stream = stream;
	},
	/*
	 * public void close() throws IOException
	 */
	$close$$V: function () {
		this.stream.$close$$V();
	},
	/*
	 * public int read(char[] cbuf) throws IOException
	 */
	$read$_C$I: function (output) {
		var buffer = new Array(this.stream.$available$$I());
		var length = this.stream.$read$_BII$I(buffer, 0, buffer.length);
		if (length === -1) {
			return -1;
		}
		var str = js2me.UTF8ToString(buffer, 0, length);
		for (var i = 0; i < str.length; i++) {
			output[i] = str.charCodeAt(i);
		}
		return str.length;
	},
	/*
	 * public int read()
	 */
	$read$$I: function() {
		return this.stream.$read$$I();
	}
});



};

// upstream: js/me/java/io/InterruptedIOException.js
JS2ME_CLASS_SOURCES['js/me/java/io/InterruptedIOException.js'] = function() {
js2me.createClass({
	superClass: 'javaRoot.$java.$io.$IOException'
});
	



};

// upstream: js/me/java/io/OutputStream.js
JS2ME_CLASS_SOURCES['js/me/java/io/OutputStream.js'] = function() {
js2me.createClass({
	/*
	 * 
	 */
	$write$_BII$V: function (buffer, offset, length) {
		if (offset + length > buffer.length) {
			length = buffer.length - offset;
		}
		for (var i = offset; i < offset + length; i++) {
			this.$write$I$V(buffer[i]);
		}
	},
	/*
	 * 
	 */
	$write$_B$V: function (buffer) {
		this.$write$_BII$V(buffer, 0, buffer.length);
	},
	/*
	 * 
	 */
	$flush$$V: function () {
	},
	/*
	 * 
	 */
	$close$$V: function () {
	},
	package: 'javaRoot.$java.$io',
	name: '$OutputStream'
});



};

// upstream: js/me/java/io/PrintStream.js
JS2ME_CLASS_SOURCES['js/me/java/io/PrintStream.js'] = function() {
js2me.createClass({
	construct: function (output) {
		this.output = output;
	},
	/*
	 * public PrintStream(OutputStream out)
	 */
	_init$Ljava_io_OutputStream_$V: function (output) {
		this.output = output;
	},
	/*
	 * public boolean checkError()
	 */
	$checkError$$Z: function () {
		return 0;
	},
	/*
	 * public void print(boolean b)
	 */
	$print$_C$V: function (chars) {
		for (var i = 0; i < chars.length; i++) {
			this.$print$C$V(chars[i]);
		}
	},
	/*
	 * public void print(boolean b)
	 */
	$print$C$V: function (char) {
		this.print(String.fromCharCode(char));
	},
	/*
	 * public void print(boolean b)
	 */
	$print$D$V: function (value) {
		this.print(value.double.toString());
	},
	/*
	 * public void print(boolean b)
	 */
	$print$F$V: function (value) {
		this.print(value.toString());
	},
	/*
	 * public void print(boolean b)
	 */
	$print$I$V: function (x) {
		this.print(x.toString());
	},
	/*
	 * public void print(boolean b)
	 */
	$print$J$V: function (value) {
		this.output.$write$_B$V(js2me.longToString(value));
	},
	/*
	 * public void print(boolean b)
	 */
	$print$Ljava_lang_Object_$V: function (obj) {
		this.$print$Ljava_lang_String_$V(obj.$toString$$Ljava_lang_String_());
	},
	/*
	 * public void print(boolean b)
	 */
	$print$Ljava_lang_String_$V: function (str) {
		this.print(str.text);
	},
	/*
	 * public void print(boolean b)
	 */
	$print$Z$V: function (value) {
		if (value == 0) {
			this.print("false");
		} else {
			this.print("true");
		}
	},
	/*
	 * public void println()
	 */
	$println$$V: function () {
		this.output.$write$I$V(10);
	},
	/*
	 * public void println()
	 */
	$println$_C$V: function (chars) {
		this.$print$_C$V(chars);
		this.$println$$V();
	},
	/*
	 * public void println()
	 */
	$println$C$V: function (char) {
		this.$print$C$V(char);
		this.$println$$V();
	},
	/*
	 * public void println()
	 */
	$println$D$V: function (value) {
		this.$print$D$V(value);
		this.$println$$V();
	},
	/*
	 * public void println()
	 */
	$println$F$V: function (value) {
		this.$print$F$V(value);
		this.$println$$V();
	},
	/*
	 * public void println()
	 */
	$println$I$V: function (x) {
		this.$print$I$V(x);
		this.output.$write$I$V(10);
	},
	/*
	 * public void println()
	 */
	$println$J$V: function (x) {
		this.$print$J$V(x);
		this.output.$write$I$V(10);
	},
	/*
	 * public void println()
	 */
	$println$Ljava_lang_String_$V: function (x) {
		this.$print$Ljava_lang_String_$V(x);
		this.output.$write$I$V(10);
	},
	/*
	 * public void println()
	 */
	$println$Ljava_lang_Object_$V: function (obj) {
		this.$println$Ljava_lang_String_$V(obj.$toString$$Ljava_lang_String_());
	},
	/*
	 * public void println()
	 */
	$println$Z$V: function (value) {
		this.$print$Z$V(value);
		this.$println$$V();
	},
	/*
	 * public void write(int b)
	 */
	$write$I$V: function (byte) {
		this.output.$write$I$V(byte);
	},
	print: function (text) {
		var bytes = js2me.stringToUTF8(text);
		this.output.$write$_B$V(bytes);
	},
	superClass: 'javaRoot.$java.$io.$OutputStream'
});



};

// upstream: js/me/java/io/Reader.js
JS2ME_CLASS_SOURCES['js/me/java/io/Reader.js'] = function() {
js2me.createClass({
	package: 'javaRoot.$java.$io',
	name: '$Reader'
});



};

// upstream: js/me/java/io/UTFDataFormatException.js
JS2ME_CLASS_SOURCES['js/me/java/io/UTFDataFormatException.js'] = function() {
js2me.createClass({
	superClass: 'javaRoot.$java.$io.$IOException'
});


};

// upstream: js/me/java/io/UnsupportedEncodingException.js
JS2ME_CLASS_SOURCES['js/me/java/io/UnsupportedEncodingException.js'] = function() {
js2me.createClass({
	superClass: 'javaRoot.$java.$io.$IOException'
});


};

// upstream: js/me/java/io/Writer.js
JS2ME_CLASS_SOURCES['js/me/java/io/Writer.js'] = function() {
js2me.createClass({
});



};

// upstream: js/me/java/lang/ArithmeticException.js
JS2ME_CLASS_SOURCES['js/me/java/lang/ArithmeticException.js'] = function() {
js2me.createClass({
	superClass: 'javaRoot.$java.$lang.$RuntimeException'
});


};

// upstream: js/me/java/lang/ArrayIndexOutOfBoundsException.js
JS2ME_CLASS_SOURCES['js/me/java/lang/ArrayIndexOutOfBoundsException.js'] = function() {
js2me.createClass({
	superClass: 'javaRoot.$java.$lang.$IndexOutOfBoundsException'
});
	



};

// upstream: js/me/java/lang/ArrayObject.js
JS2ME_CLASS_SOURCES['js/me/java/lang/ArrayObject.js'] = function() {
js2me.createClass({
	construct: function (array) {
		this.className = '[' + array.className;
		this.monitorQueue = array.monitorQueue;
		if (!array.waitingThreads) {
			array.waitingThreads = [];
		}
		this.waitingThreads = array.waitingThreads;
		this.array = array;
		if (this.className == null) {
			throw new Error('unknown array');
		}
	},
	$length$$I: function () {
		return this.array.length;
	}
});


};

// upstream: js/me/java/lang/ArrayStoreException.js
JS2ME_CLASS_SOURCES['js/me/java/lang/ArrayStoreException.js'] = function() {
js2me.createClass({
	superClass: 'javaRoot.$java.$lang.$RuntimeException'
});
	



};

// upstream: js/me/java/lang/Boolean.js
JS2ME_CLASS_SOURCES['js/me/java/lang/Boolean.js'] = function() {
js2me.createClass({
	$TRUELjava_lang_Boolean_: 'true',
	$FALSELjava_lang_Boolean_: 'false',
	_clinit$$V: function (callback) {
		js2me.statics.$true = new javaRoot.$java.$lang.$Boolean();
		js2me.statics.$true.value = 1;
		js2me.statics.$false = new javaRoot.$java.$lang.$Boolean();
		js2me.statics.$false.value = 0;
		callback();
	},
	/*
	 * public Boolean(boolean value)
	 */
	_init$Z$V: function (value) {
		this.value = value;
	},
	/*
	 * public boolean booleanValue()
	 */
	$booleanValue$$Z: function () {
		return this.value;
	},
	/*
	 * public boolean equals(Object obj)
	 */
	$equals$Ljava_lang_Object_$Z: function (obj) {
		if (obj && obj.className === 'javaRoot.$java.$lang.$Boolean' && obj.value === this.value) {
			return 1;
		} else {
			return 0;
		}
	},
	/*
	 * public int hashCode()
	 */
	$hashCode$$I: function () {
		if (this.value === 1) {
			return 1231;
		} else {
			return 1237;
		}
	},
	$toString$$Ljava_lang_String_: function () {
		if (this.value === 1) {
			return new javaRoot.$java.$lang.$String('true');
		} else {
			return new javaRoot.$java.$lang.$String('false');
		}
	}
});


};

// upstream: js/me/java/lang/Byte.js
JS2ME_CLASS_SOURCES['js/me/java/lang/Byte.js'] = function() {
js2me.createClass({
	/*
	 * public Byte(byte value)
	 */
	_init$B$V: function (value) {
		this.value = value;
	},
	$byteValue$$B: function () {
		return this.value;
	}
});


};

// upstream: js/me/java/lang/Character.js
JS2ME_CLASS_SOURCES['js/me/java/lang/Character.js'] = function() {
js2me.createClass({
	/*
	 * public Character(char value)
	 */
	_init$C$V: function (value) {
		this.value = value;
	},
	/*
	 * public char charValue()
	 */
	$charValue$$C: function () {
		return this.value;
	},
	/*
	 * public static int digit(char ch, int radix)
	 */
	$digit$CI$I: function (char, radix) {
		if (radix < 2 || radix > 36) {
			return -1;
		}
		var value = -1;
		if (char >= 48 && char <= 57) {
			value = char - 48;
		}
		if (char >= 97 && char <= 122) {
			value = char - 87;
		}
		if (char >= 65 && char <= 90) {
			value = char - 55;
		}
		if (value >= 0 && value < radix) {
			return value;
		}
		return -1;
	},
	/*
	 * public static boolean isDigit(char ch)
	 */
	$isDigit$C$Z: function (char) {
		if (char >= 48 && char <= 57) {
			return 1;
		} else {
			return 0;
		}
	},
	/*
	 * public String toString()
	 */
	$toString$$Ljava_lang_String_: function () {
		var text = String.fromCharCode(this.value);
		return new javaRoot.$java.$lang.$String(text);
	},
	/*
	 * public static char toUpperCase(char ch)
	 */
	$toUpperCase$C$C: function (char) {
		return String.fromCharCode(char).toUpperCase().charCodeAt(0);
	}
});


};

// upstream: js/me/java/lang/Class.js
JS2ME_CLASS_SOURCES['js/me/java/lang/Class.js'] = function() {
js2me.createClass({
	construct: function (classObj) {
		this.classObj = classObj;
	},
	/*
	 * 
	 */
	$forName$Ljava_lang_String_$Ljava_lang_Class_: js2me.markUnsafe(function (name) {
		var innerName = ('javaRoot.' + name.text).replace(/\./g, '.$');
		var result;
		var async = true;
		var threadId = js2me.currentThread;
		js2me.loadClass(innerName, function (classObj) {
			async = false;
			result = new javaRoot.$java.$lang.$Class(classObj);
			js2me.restoreStack[threadId] = [function () {
				return result;
			}];
			js2me.isThreadSuspended = true;
			setTimeout(function () {
				js2me.restoreThread(threadId);
			}, 1);
		}, function () {
			js2me.restoreStack[threadId].unshift(function () {
				throw new javaRoot.$java.$lang.$ClassNotFoundException();
			});
			js2me.isThreadSuspended = true;
			setTimeout(function () {
				js2me.restoreThread(threadId);
			}, 1);
		});
		if (async) {
			js2me.isThreadSuspended = true;
		} else {
			return result;
		}
	}),
	/*
	 * public InputStream getResourceAsStream(String name)
	 */
	$getResourceAsStream$Ljava_lang_String_$Ljava_io_InputStream_: js2me.markUnsafe(function (name) {
		var resourceName = name.text;
		if (resourceName.charAt(0) == '/') {
			resourceName = resourceName.substr(1);
		}
		var stream;
		var async = true;
		js2me.loadResource(name.text, function (resource) {
			async = false;
			if (resource == null) {
				stream = null;
				return;
			}
			stream = new javaRoot.$java.$io.$BufferStream(new js2me.BufferStream(resource));
			js2me.restoreThread(threadId);
		});
		if (async) {
			js2me.isThreadSuspended = true;
			var threadId = js2me.currentThread;
			js2me.restoreStack[threadId] = [function () {
				return stream;
			}];
		} else {
			return stream;
		}
	}),
	/*
	 * public String getName()
	 */
	$getName$$Ljava_lang_String_: function () {
		var className = this.classObj.prototype.className.replace(/\$/g, '').replace('javaRoot.', '');
		return new javaRoot.$java.$lang.$String(className);
	},
	/*
	 * public boolean isArray()
	 */
	$isArray$$Z: function () {
		if (this.className.indexOf('[') != -1) {
			return 1;
		} else {
			return 0;
		}
	},
	/*
	 * public boolean isAssignableFrom(Class cls)
	 */
	$isAssignableFrom$Ljava_lang_Class_$Z: function (cls) {
		if (cls.classObj.prototype.isImplement(this.classObj.prototype.className)) {
			return 1;
		} else {
			return 0;
		}
	},
	/*
	 * public boolean isInstance(Object obj)
	 */
	$isInstance$Ljava_lang_Object_$Z: function (obj) {
		if (obj.isImplement(this.classObj.prototype.className)) {
			return 1;
		} else {
			return 0;
		}
	},
	/*
	 * public boolean isInterface()
	 */
	$isInterface$$Z: function (obj) {
		if (this.classObj.prototype.type == 'interface') {
			return 1;
		} else {
			return 0;
		}
	},
	/*
	 * 
	 */
	$newInstance$$Ljava_lang_Object_: function () {
		var obj = new this.classObj();
		obj._init$$V();
		return obj;
	},
	/*
	 * public String toString()
	 */
	$toString$$Ljava_lang_String_: function () {
		var text = 'class ' + this.$getName$$Ljava_lang_String_().text;
		return new javaRoot.$java.$lang.$String(text);
	},
	require: ['javaRoot.$java.$io.$BufferStream']
});


};

// upstream: js/me/java/lang/ClassCastException.js
JS2ME_CLASS_SOURCES['js/me/java/lang/ClassCastException.js'] = function() {
js2me.createClass({
	superClass: 'javaRoot.$java.$lang.$RuntimeException',
	name: '$ClassCastException',
	package: 'javaRoot.$java.$lang'
});


};

// upstream: js/me/java/lang/ClassNotFoundException.js
JS2ME_CLASS_SOURCES['js/me/java/lang/ClassNotFoundException.js'] = function() {
js2me.createClass({
	superClass: 'javaRoot.$java.$lang.$Exception'
});


};

// upstream: js/me/java/lang/Double.js
JS2ME_CLASS_SOURCES['js/me/java/lang/Double.js'] = function() {
js2me.createClass({
	construct: function (double) {
		this.double = double;
	},
	/*
	 * public Double(double value)
	 */
	_init$D$V: function (double) {
		this.double = double;
	},
	/*
	 * public double doubleValue()
	 */
	$doubleValue$$D: function () {
		return this.double;
	},
	/*
	 * public static double parseDouble(String s) throws NumberFormatException
	 */
	$parseDouble$Ljava_lang_String_$D: function (str) {
		if (str == null) {
			throw new javaRoot.$java.$lang.$NullPointerException();
		}
		//TODO: hex
		if (str.text.indexOf('0x') != -1) {
			throw new Error('Hex double!');
		}
		var value = parseFloat(str.text);
		if (isNaN(value)) {
			throw new javaRoot.$java.$lang.$NumberFormatException();
		}
		return {double: value};
	},
	/*
	 * public static Double valueOf(String s) throws NumberFormatException
	 */
	$valueOf$Ljava_lang_String_$Ljava_lang_Double_: function (str) {
		var double = this.$parseDouble$Ljava_lang_String_$D(str);
		return new javaRoot.$java.$lang.$Double(double);
	}
});


};

// upstream: js/me/java/lang/Error.js
JS2ME_CLASS_SOURCES['js/me/java/lang/Error.js'] = function() {
js2me.createClass({
	superClass: 'javaRoot.$java.$lang.$Throwable',
	package: 'javaRoot.$java.$lang',
	name: '$Error'
});



};

// upstream: js/me/java/lang/Exception.js
JS2ME_CLASS_SOURCES['js/me/java/lang/Exception.js'] = function() {
js2me.createClass({
	superClass: 'javaRoot.$java.$lang.$Throwable'
});



};

// upstream: js/me/java/lang/Float.js
JS2ME_CLASS_SOURCES['js/me/java/lang/Float.js'] = function() {
js2me.createClass({
	/*
	 * public Float(float value)
	 */
	_init$F$V: function (value) {
		this.value = value;
	}
});


};

// upstream: js/me/java/lang/IOException.js
JS2ME_CLASS_SOURCES['js/me/java/lang/IOException.js'] = function() {
js2me.createClass({
	superClass: 'javaRoot.$java.$lang.$RuntimeException'
});


};

// upstream: js/me/java/lang/IllegalAccessException.js
JS2ME_CLASS_SOURCES['js/me/java/lang/IllegalAccessException.js'] = function() {
js2me.createClass({
	superClass: 'javaRoot.$java.$lang.$Exception'
});


};

// upstream: js/me/java/lang/IllegalArgumentException.js
JS2ME_CLASS_SOURCES['js/me/java/lang/IllegalArgumentException.js'] = function() {
js2me.createClass({
	superClass: 'javaRoot.$java.$lang.$RuntimeException',
	name: '$IllegalArgumentException',
	package: 'javaRoot.$java.$lang'
});
	



};

// upstream: js/me/java/lang/IllegalMonitorStateException.js
JS2ME_CLASS_SOURCES['js/me/java/lang/IllegalMonitorStateException.js'] = function() {
js2me.createClass({
	superClass: 'javaRoot.$java.$lang.$RuntimeException'
});


};

// upstream: js/me/java/lang/IllegalStateException.js
JS2ME_CLASS_SOURCES['js/me/java/lang/IllegalStateException.js'] = function() {
js2me.createClass({
	superClass: 'javaRoot.$java.$lang.$RuntimeException'
});


};

// upstream: js/me/java/lang/IndexOutOfBoundsException.js
JS2ME_CLASS_SOURCES['js/me/java/lang/IndexOutOfBoundsException.js'] = function() {
js2me.createClass({
	superClass: 'javaRoot.$java.$lang.$Exception',
	name: '$IndexOutOfBoundsException',
	package: 'javaRoot.$java.$lang'
});
	



};

// upstream: js/me/java/lang/InstantiationException.js
JS2ME_CLASS_SOURCES['js/me/java/lang/InstantiationException.js'] = function() {
js2me.createClass({
	superClass: 'javaRoot.$java.$lang.$Exception'
});


};

// upstream: js/me/java/lang/Integer.js
JS2ME_CLASS_SOURCES['js/me/java/lang/Integer.js'] = function() {
js2me.createClass({
	$MIN_VALUEI: -2147483648,
	$MAX_VALUEI: 2147483647,
	construct: function (value) {
		this.value = value;
	},
	/*
	 * public Integer(int value)
	 */
	_init$I$V: function (value) {
		this.value = value;
	},
	/*
	 * public byte byteValue()
	 */
	$byteValue$$B: function () {
		var value = this.value;
		while (value > 127) {
			value -= 256;
		}
		while (value < -128) {
			value += 256;
		}
		return value;
	},
	/*
	 * public double doubleValue()
	 */
	$doubleValue$$D: function () {
		return {double: this.value};
	},
	/*
	 * public boolean equals(Object obj)
	 */
	$equals$Ljava_lang_Object_$Z: function (obj) {
		if (obj != null && obj.value == this.value) {
			return 1;
		} else {
			return 0;
		}
	},
	/*
	 * public float floatValue()
	 */
	$floatValue$$F: function () {
		return this.value;
	},
	/*
	 * public int hashCode()
	 */
	$hashCode$$I: function () {
		return this.value;
	},
	/*
	 * public int intValue()
	 */
	$intValue$$I: function () {
		return this.value;
	},
	/*
	 * public long longValue()
	 */
	$longValue$$J: function () {
		if (this.value >= 0) {
			return {hi: 0, lo: this.value};
		} else {
			return {hi: 4294967295, lo: 4294967296 + this.value};
		}
	},
	/*
	 * 
	 */
	$parseInt$Ljava_lang_String_$I: function (str) {
		return javaRoot.$java.$lang.$Integer.prototype.$parseInt$Ljava_lang_String_I$I(str, 10);
	},
	/*
	 * 
	 */
	$parseInt$Ljava_lang_String_I$I: function (str, radix) {
		if (str == null || radix < 2 || radix > 36 || (str != null && str.text == '')) {
			throw new javaRoot.$java.$lang.$NumberFormatException();
		}
		var value = parseInt(str.text, radix);
		if (isNaN(value)) {
			throw new javaRoot.$java.$lang.$NumberFormatException();
		}
		if (value < -0x80000000 || value >= 0x80000000) {
			throw new javaRoot.$java.$lang.$NumberFormatException();
		}
		return value;
	},
	/*
	 * public short shortValue()
	 */
	$shortValue$$S: function () {
		var value = this.value;
		while (value > 32767) {
			value -= 65536;
		}
		while (value < -32768) {
			value += 65536;
		}
		return value;
	},
	/*
	 * public static String toBinaryString(int i)
	 */
	$toBinaryString$I$Ljava_lang_String_: function (value) {
		if (value < 0) {
			value += 0x100000000;
		}
		return new javaRoot.$java.$lang.$String(value.toString(2));
	},
	/*
	 * public static String toHexString(int i)
	 */
	$toHexString$I$Ljava_lang_String_: function (value) {
		if (value < 0) {
			value += 0x100000000;
		}
		return new javaRoot.$java.$lang.$String(value.toString(16));
	},
	/*
	 * public static String toOctalString(int i)
	 */
	$toOctalString$I$Ljava_lang_String_: function (value) {
		if (value < 0) {
			value += 0x100000000;
		}
		return new javaRoot.$java.$lang.$String(value.toString(8));
	},
	/*
	 * public static String toString(int i, int radix)
	 */
	$toString$$Ljava_lang_String_: function () {
		return this.$toString$I$Ljava_lang_String_(this.value);
	},
	/*
	 * public static String toString(int i, int radix)
	 */
	$toString$I$Ljava_lang_String_: function (i) {
		return new javaRoot.$java.$lang.$String(i.toString());
	},
	/*
	 * public static String toString(int i, int radix)
	 */
	$toString$II$Ljava_lang_String_: function (i, radix) {
		if (radix < 2 || radix > 36) {
			radix = 10;
		}
		return new javaRoot.$java.$lang.$String(i.toString(radix));
	},
	/*
	 * 
	 */
	$valueOf$Ljava_lang_String_$Ljava_lang_Integer_: function (str) {
		return this.$valueOf$Ljava_lang_String_I$Ljava_lang_Integer_(str, 10);
	},
	/*
	 * 
	 */
	$valueOf$Ljava_lang_String_I$Ljava_lang_Integer_: function (str, radix) {
		var value = javaRoot.$java.$lang.$Integer.prototype.$parseInt$Ljava_lang_String_I$I(str, radix);
		return new javaRoot.$java.$lang.$Integer(value);
	},
	require: ['javaRoot.$java.$lang.$NumberFormatException']
});


};

// upstream: js/me/java/lang/InterruptedException.js
JS2ME_CLASS_SOURCES['js/me/java/lang/InterruptedException.js'] = function() {
js2me.createClass({
	superClass: 'javaRoot.$java.$lang.$Exception',
	name: '$InterruptedException',
	package: 'javaRoot.$java.$lang'
});


};

// upstream: js/me/java/lang/Long.js
JS2ME_CLASS_SOURCES['js/me/java/lang/Long.js'] = function() {
js2me.createClass({
	_init$J$V: function (value) {
		this.value = value;
	},
	$longValue$$J: function () {
		return this.value;
	}
});


};

// upstream: js/me/java/lang/Math.js
JS2ME_CLASS_SOURCES['js/me/java/lang/Math.js'] = function() {
js2me.createClass({
	/*
	 * public static int abs(int a)
	 */
	$abs$D$D: function (value) {
		return {double: Math.abs(value.double)};
	},
	$abs$F$F: function (value) {
		return Math.abs(value);
	},
	/*
	 * public static int abs(int a)
	 */
	$abs$I$I: function (value) {
		if (value >= 0 || value === -2147483648) {
			return value;
		} else {
			return -value;
		}
	},
	/*
	 * public static long abs(long a)
	 */
	$abs$J$J: function (value) {
		if (js2me.lcmp(value, {hi:0, lo:0}) === 1 || js2me.lcmp(value, {hi: 0x80000000, lo: 0}) === 0) {
			return value;
		} else {
			return js2me.lneg(value);
		}
	},
	$cos$D$D: function (value) {
		return {double: Math.cos(value.double)};
	},
	$min$II$I: Math.min,
	$max$II$I: Math.max,
	/*
	 * public static int max(int a, int b)
	 */
	$max$JJ$J: function (a, b) {
		if (js2me.lcmp(a, b) == 1) {
			return a;
		} else {
			return b;
		}
	},
	
	$min$JJ$J: function (a, b) {
		if (js2me.lcmp(a, b) == 1) {
			return b;
		} else {
			return a;
		}
	},
	
	/*
	 * public static double sin(double a)
	 */
	$sin$D$D: function (value) {
		return {double: Math.sin(value.double)};
	},
	/*
	 * public static double sqrt(double a)
	 */
	$sqrt$D$D: function (value) {
		return {double: Math.sqrt(value.double)};
	},
	/*
	 * public static double toRadians(double angdeg)
	 */
	$toRadians$D$D: function (angle) {
		return {double: (angle.double / 180) * Math.PI};
	}
});


};

// upstream: js/me/java/lang/NegativeArraySizeException.js
JS2ME_CLASS_SOURCES['js/me/java/lang/NegativeArraySizeException.js'] = function() {
js2me.createClass({
	superClass: 'javaRoot.$java.$lang.$RuntimeException'
});


};

// upstream: js/me/java/lang/NoClassDefFoundError.js
JS2ME_CLASS_SOURCES['js/me/java/lang/NoClassDefFoundError.js'] = function() {
js2me.createClass({
	superClass: 'javaRoot.$java.$lang.$Error'
});


};

// upstream: js/me/java/lang/NullPointerException.js
JS2ME_CLASS_SOURCES['js/me/java/lang/NullPointerException.js'] = function() {
js2me.createClass({
	superClass: 'javaRoot.$java.$lang.$RuntimeException',
	name: '$NullPointerException',
	package: 'javaRoot.$java.$lang'
});


};

// upstream: js/me/java/lang/NumberFormatException.js
JS2ME_CLASS_SOURCES['js/me/java/lang/NumberFormatException.js'] = function() {
js2me.createClass({
	superClass: 'javaRoot.$java.$lang.$Exception'
});



};

// upstream: js/me/java/lang/Object.js
JS2ME_CLASS_SOURCES['js/me/java/lang/Object.js'] = function() {
js2me.createClass({
	/*
	 * public Object()
	 */
	_init$$V: function () {
	},
	classCache: [],
	/*
	 * public final Class getClass()
	 */
	$getClass$$Ljava_lang_Class_: function () {
		var cls = this.classCache[this.className];
		if (cls == null) {
			cls = new javaRoot.$java.$lang.$Class(js2me.findClass(this.className));
			this.classCache[this.className] = cls;
		}
		return cls;
	},
	/*
	 * public String toString()
	 */
	$toString$$Ljava_lang_String_: function () {
		var text = this.className + ':' + this.$hashCode$$I();
		return new javaRoot.$java.$lang.$String(text);
	},
	/*
	 * 
	 */
	$wait$J$V: js2me.markUnsafe(function (timeout) {
		var threadId = js2me.currentThread;
		this.checkOwnership();
		if (this.waitingThreads == null) {
			this.waitingThreads = [];
		}
		this.releaseOwnership();
		var data = {
			threadId: threadId,
			timeoutId: 0
		};
		this.waitingThreads.push(data);
		var waitingThreads = this.waitingThreads;
		var callee = this;
		js2me.restoreStack[threadId] = [function () {
			js2me.enterMonitor(callee);
		}];
		js2me.isThreadSuspended = true;
		if (timeout.lo > 0) {
			data.timeoutId = setTimeout(function () {
				var i = waitingThreads.indexOf(data);
				if (i !== -1) {
					waitingThreads[i] = waitingThreads[waitingThreads.length - 1];
					waitingThreads.pop();
					js2me.restoreThread(threadId);
				} else {
					console.error('This should not happen!');
				}
			}, timeout.lo);
		}
	}),
	/*
	 * 
	 */
	$wait$$V: js2me.markUnsafe(function () {
		this.$wait$J$V({hi: 0, lo: 0});
	}),
	/*
	 * public int hashCode()
	 */
	$hashCode$$I: function () {
		
		if (js2me.lastHash == null) {
			js2me.lastHash = 1;
		}
		if (this.hashCode == null) {
			this.hashCode = js2me.lastHash;
			js2me.lastHash++;
		}
		return this.hashCode;
	},
	/*
	 * public final void notify()
	 */
	$notify$$V: function () {
		this.checkOwnership();
		if (this.waitingThreads) {
			var data = this.waitingThreads.pop();
			if (data) {
				clearTimeout(data.timeoutId);
				setTimeout(function () {
					js2me.restoreThread(data.threadId);
				}, 1);
			}
		}
	},
	/*
	 * public final void notifyAll()
	 */
	$notifyAll$$V: function () {
		this.checkOwnership();
		if (this.waitingThreads) {
			var threadId;
			while (data = this.waitingThreads.pop()) {
				clearTimeout(data.timeoutId);
				(function (data) {
					setTimeout(function () {
						js2me.restoreThread(data.threadId);
					}, 1);
				})(data);
			}
		}
	},
	/*
	 * public boolean equals(Object obj)
	 */
	$equals$Ljava_lang_Object_$Z: function (obj) {
		if (this == obj) {
			return 1;
		} else {
			return 0;
		}
	},
	isImplement: function (className) {
		if (this.className == className) {
			return true;
		}
		try{
		for (var i = 0; this.interfaces && i < this.interfaces.length; i++) {
			var interface = js2me.findClass(this.interfaces[i]).prototype;
			if (interface.isImplement(className)) {
				return true;
			}
		}
		if (this.superClass) {
			var superClass = js2me.findClass(this.superClass).prototype;
			if (superClass.isImplement(className)) {
				return true;
			}
		}
	}catch(e) {
		debugger;
	}
		return false;
	},
	checkOwnership: function () {
		if (!this.monitorQueue || this.monitorQueue[0] !== js2me.currentThread) {
			throw new javaRoot.$java.$lang.$IllegalMonitorStateException();
		}
	},
	releaseOwnership: function () {
		if (this.monitorQueue) {
			while (this.monitorQueue[0] === js2me.currentThread) {
				this.monitorQueue.shift();
			}
			if (this.monitorQueue.length !== 0) {
				var threadId = this.monitorQueue[0];
				if (threadId != null) {
					setTimeout(function () {
						js2me.restoreThread(threadId);
					}, 1);
				}
			}
		}
	},
	require: ['javaRoot.$java.$lang.$IllegalMonitorStateException']
});


};

// upstream: js/me/java/lang/OutOfMemoryError.js
JS2ME_CLASS_SOURCES['js/me/java/lang/OutOfMemoryError.js'] = function() {
js2me.createClass({
	superClass: 'javaRoot.$java.$lang.$VirtualMachineError',
	package: 'javaRoot.$java.$lang',
	name: '$OutOfMemoryError'
});



};

// upstream: js/me/java/lang/Runnable.js
JS2ME_CLASS_SOURCES['js/me/java/lang/Runnable.js'] = function() {
js2me.createInterface({
	name: '$Runnable',
	package: 'javaRoot.$java.$lang'
});
	



};

// upstream: js/me/java/lang/Runtime.js
JS2ME_CLASS_SOURCES['js/me/java/lang/Runtime.js'] = function() {
js2me.createClass({
	/*
	 * public void exit(int status)
	 */
	$exit$I$V: function (status) {
		console.log('EXIT ' + status);
		js2me.kill = true;
	},
	/*
	 * public long freeMemory()
	 */
	$freeMemory$$J: function () {
		return {hi: 0, lo: 500000};
	},
	/*
	 * public void gc()
	 */
	$gc$$V: function () {
		// Calling the gc method suggests that the Java Virtual Machine expend effort toward recycling unused objects (...)
		// Ignore the suggestion...
	},
	/*
	 * public static Runtime getRuntime()
	 */
	$getRuntime$$Ljava_lang_Runtime_: function () {
		return new javaRoot.$java.$lang.$Runtime();
	},
	/*
	 * public long totalMemory()
	 */
	$totalMemory$$J: function () {
		// the total amount of memory currently available for current and future objects, measured in bytes.
		// here you are...
		return {hi: 0, lo: 1000000};
	}
});


};

// upstream: js/me/java/lang/RuntimeException.js
JS2ME_CLASS_SOURCES['js/me/java/lang/RuntimeException.js'] = function() {
js2me.createClass({
	superClass: 'javaRoot.$java.$lang.$Exception'
});


};

// upstream: js/me/java/lang/SecurityException.js
JS2ME_CLASS_SOURCES['js/me/java/lang/SecurityException.js'] = function() {
js2me.createClass({
	superClass: 'javaRoot.$java.$lang.$RuntimeException'
});


};

// upstream: js/me/java/lang/Short.js
JS2ME_CLASS_SOURCES['js/me/java/lang/Short.js'] = function() {
js2me.createClass({
	/*
	 * public Short(short value)
	 */
	_init$S$V: function (value) {
		this.value = value;
	},
	/*
	 * public int hashCode()
	 */
	$hashCode$$I: function () {
		return this.value;
	},
	/*
	 * public short shortValue()
	 */
	$shortValue$$S: function () {
		return this.value;
	}
});


};

// upstream: js/me/java/lang/String.js
JS2ME_CLASS_SOURCES['js/me/java/lang/String.js'] = function() {
js2me.createClass({
	// yes, it's shared between all String instances
	pool: {},
	construct: function (text) {
		this.text = text || '';
		if (!this.pool[this.text]) {
			this.pool[this.text] = this;
		}
	},
	/*
	 * public String()
	 */
	_init$Ljava_lang_String_$V: function (value) {
		this.text = value.text;
	},
	/*
	 * public String(byte[] bytes, String enc)
	 */
	_init$_BLjava_lang_String_$V: function (data, enc) {
		if (!enc || enc.text.toLowerCase() === 'utf-8') {
			this.text = js2me.UTF8ToString(data);
			return;
		}
		if (enc.text.toLowerCase() === 'iso-8859-1') {
			this.text = '';
			for (var i = 0; i < data.length; i++) {
				this.text += String.fromCharCode(data[i]);
			}
			return;
		}
		throw new javaRoot.$java.$io.$UnsupportedEncodingException(enc.text);
	},
	/*
	 * public String()
	 */
	_init$_B$V: function (data) {
		this._init$_BLjava_lang_String_$V(data);
	},
	/*
	 * public String()
	 */
	_init$_BII$V: function (data, offset, length) {
		this.text = js2me.UTF8ToString(data, offset, length);
	},
	/*
	 * public String()
	 */
	_init$_BIILjava_lang_String_$V: function (data, offset, length) {
		this._init$_BII$V(data, offset, length);
	},
	/*
	 * public String()
	 */
	_init$_C$V: function (data) {
		if (data == null) {
			throw new javaRoot.$java.$lang.$NullPointerException();
		}
		this.text = '';
		for (var i = 0; i < data.length; i++) {
			this.text += String.fromCharCode(data[i]);
		}
	},
	/*
	 * public String()
	 */
	_init$_CII$V: function (data, offset, length) {
		this._init$_C$V(data.slice(offset, offset + length));
	},
	/*
	 * public String(StringBuffer buffer)
	 */
	_init$Ljava_lang_StringBuffer_$V: function (buffer) {
		if (buffer == null) {
			throw new javaRoot.$java.$lang.$NullPointerException();
		}
		return buffer.$toString$$Ljava_lang_String_();
	},
	/*
	 * public char charAt(int index)
	 */
	$charAt$I$C: function (index) {
		if (index < 0 || index >= this.text.length) {
			throw new javaRoot.$java.$lang.$IndexOutOfBoundsException();
		}
		return this.text.charCodeAt(index);
	},
	/*
	 * public int compareTo(String anotherString)
	 */
	$compareTo$Ljava_lang_String_$I: function (str) {
		if (str == null) {
			throw new javaRoot.$java.$lang.$NullPointerException();
		}
		if (this.text == str.text) {
			return 0;
		}
		if (this.text.length != str.text.length) {
			return this.text.length - str.text.length;
		}
		for (var i = 0; i < this.text.length; i++) {
			if (this.text.charAt(i) != str.text.charAt(i)) {
				return this.text.charCodeAt(i) - str.text.charCodeAt(i);
			}
		}
	},
	/*
	 * public String concat(String str)
	 */
	$concat$Ljava_lang_String_$Ljava_lang_String_: function (str) {
		if (str == null) {
			throw new javaRoot.$java.$lang.$NullPointerException();
		}
		return new javaRoot.$java.$lang.$String(this.text + str.text);
	},
	/*
	 * public boolean endsWith(String suffix)
	 */
	$endsWith$Ljava_lang_String_$Z: function (str) {
		if (str == null) {
			throw new javaRoot.$java.$lang.$NullPointerException();
		}
		if (this.text.indexOf(str.text) == this.text.length - str.text.length) {
			return 1;
		} else {
			return 0;
		}
	},
	/*
	 * public boolean equals(Object anObject)
	 */
	$equals$Ljava_lang_Object_$Z: function (obj) {
		if (obj == null) {
			return 0;
		}
		if (this.className == obj.className && this.text == obj.text) {
			return 1;
		} else {
			return 0;
		}
	},
	/*
	 * public boolean equalsIgnoreCase(String anotherString)
	 */
	$equalsIgnoreCase$Ljava_lang_String_$Z: function (str) {
		if (str == null) {
			return 0;
		}
		if (this.text.toLowerCase() == str.text.toLowerCase()) {
			return 1;
		} else {
			return 0;
		}
	},
	/*
	 * public byte[] getBytes()
	 */
	$getBytes$$_B: function () {
		var bytes = js2me.stringToUTF8(this.text);
		for (var i = 0; i < bytes.length; i++) {
			if (bytes[i] >= 128) {
				bytes[i] -= 256;
			}
		}
		return bytes;
	},
	/*
	 * public byte[] getBytes(String enc) throws UnsupportedEncodingException
	 */
	$getBytes$Ljava_lang_String_$_B: function (enc) {
		if (!enc || enc.text.toLowerCase() === 'utf-8') {
			return this.$getBytes$$_B();
		}
		throw new javaRoot.$java.$io.$UnsupportedEncodingException(enc.text);
	},
	/*
	 * public void getChars(int srcBegin, int srcEnd, char[] dst, int dstBegin)
	 */
	$getChars$II_CI$V: function (srcBegin, srcEnd, dst, dstBegin) {
		var length = srcEnd - srcBegin;
		if (dst == null) {
			throw new javaRoot.$java.$lang.$NullPointerException();
		}
		if (srcBegin < 0 || srcBegin > srcEnd || srcEnd > this.text.length ||
			dstBegin < 0 || dstBegin + length > dst.length) {
			throw new javaRoot.$java.$lang.$IndexOutOfBoundsException();
		}
		for (var i = 0; i < length; i++) {
			dst[dstBegin + i] = this.text.charCodeAt(srcBegin + i);
		}
	},
	/*
	 * public int hashCode()
	 */
	$hashCode$$I: function () {
		var hashCode = 0;
		for (var i = 0; i < this.text.length; i++) {
			var value = this.text.charCodeAt(i);
			var n = this.text.length - i - 1;
			for (var j = 0; j < n; j++) {
				value = (value * 31) % 0x100000000;
			}
			hashCode = (hashCode + value) % 0x100000000;
		}
		if (hashCode >= 0x80000000) {
			hashCode -= 0x80000000;
		}
		return hashCode;
	},
	/*
	 * public int indexOf(int ch)
	 */
	$indexOf$I$I: function (charCode) {
		return this.$indexOf$II$I(charCode, 0);
	},
	/*
	 * public int indexOf(int ch)
	 */
	$indexOf$II$I: function (charCode, index) {
		if (index < 0) {
			index = 0;
		}
		for (var i = index; i < this.text.length; i++) {
			if (this.text.charCodeAt(i) == charCode) {
				return i;
			}
		}
		return -1;
	},
	/*
	 * public int indexOf(int ch)
	 */
	$indexOf$Ljava_lang_String_$I: function (str) {
		return this.$indexOf$Ljava_lang_String_I$I(str, 0);
	},
	/*
	 * public int indexOf(int ch, int fromIndex)
	 */
	$indexOf$Ljava_lang_String_I$I: function (str, start) {
		if (str == null) {
			throw new javaRoot.$java.$lang.$NullPointerException();
		}
		return this.text.indexOf(str.text, start);
	},
	/*
	 * public String intern()
	 */
	$intern$$Ljava_lang_String_: function () {
		return this.pool[this.text];
	},
	/*
	 * public int lastIndexOf(int ch)
	 */
	$lastIndexOf$I$I: function (charCode) {
		return this.$lastIndexOf$II$I(charCode, this.text.length - 1);
	},
	/*
	 * public int lastIndexOf(int ch, int fromIndex)
	 */
	$lastIndexOf$II$I: function (charCode, fromIndex) {
		if (fromIndex > this.text.length - 1) {
			fromIndex = this.text.length - 1;
		}
		for (var i = fromIndex; i >= 0; i--) {
			if (this.text.charCodeAt(i) == charCode) {
				return i;
			}
		}
		return -1;
	},
	/*
	 * public int length()
	 */
	$length$$I: function () {
		return this.text.length;
	},
	/*
	 * public boolean regionMatches(boolean ignoreCase, int toffset, String other, int ooffset, int len)
     */
	$regionMatches$ZILjava_lang_String_II$Z: function (ignoreCase, toffset, other, ooffset, len) {
		if (toffset < 0 || ooffset < 0) {
			return 0;
		}
		if (toffset+len > this.text.length || ooffset+len > other.text.length) {
			return 0;
		}
		if (ignoreCase && this.text.toLowerCase().substr(toffset, len) === other.text.toLowerCase().substr(ooffset, len)) {
			return 1;
		}
		if (this.text.substr(toffset, len) === other.text.substr(ooffset, len)) {
			return 1;
		}
		return 0;
	},
	/*
	 * public String replace(char oldChar, char newChar)
	 */
	$replace$CC$Ljava_lang_String_: function (oldChar, newChar) {
		var char = String.fromCharCode(oldChar);
		if (char === '[') {
			char = '\\' + char;
		}
		var regexp = new RegExp(char, 'g');
		return new javaRoot.$java.$lang.$String(this.text.replace(regexp, String.fromCharCode(newChar)));
	},
	/*
	 * public boolean startsWith(String prefix)
	 */
	$startsWith$Ljava_lang_String_$Z: function (str) {
		return this.$startsWith$Ljava_lang_String_I$Z(str, 0);
	},
	/*
	 * public boolean startsWith(String prefix, int toffset)
	 */
	$startsWith$Ljava_lang_String_I$Z: function (str, offset) {
		if (str == null) {
			throw new javaRoot.$java.$lang.$NullPointerException();
		}
		if (this.text.indexOf(str.text, offset) == offset) {
			return 1;
		} else {
			return 0;
		}
	},
	/*
	 * public String substring(int beginIndex)
	 */
	$substring$II$Ljava_lang_String_: function (beginIndex, endIndex) {
		if (beginIndex < 0 || endIndex > this.text.length || beginIndex > endIndex) {
			throw new javaRoot.$java.$lang.$IndexOutOfBoundsException();
		}
		return new javaRoot.$java.$lang.$String(this.text.substring(beginIndex, endIndex));
	},
	/*
	 * public String substring(int beginIndex)
	 */
	$substring$I$Ljava_lang_String_: function (index) {
		return this.$substring$II$Ljava_lang_String_(index, this.text.length);
	},
	/*
	 * public char[] toCharArray()
	 */
	$toCharArray$$_C: function () {
		var result = [];
		for (var i = 0; i < this.text.length; i++) {
			result.push(this.text.charCodeAt(i));
		}
		return result;
	},
	/*
	 * public String toLowerCase()
	 */
	$toLowerCase$$Ljava_lang_String_: function () {
		return new javaRoot.$java.$lang.$String(this.text.toLowerCase());
	},
	/*
	 * public String toString()
	 */
	$toString$$Ljava_lang_String_: function () {
		return this;
	},
	/*
	 * public String toUpperCase()
	 */
	$toUpperCase$$Ljava_lang_String_: function () {
		return new javaRoot.$java.$lang.$String(this.text.toUpperCase());
	},
	/*
	 * public String trim()
	 */
	$trim$$Ljava_lang_String_: function () {
		for (var i = 0; i < this.text.length && this.text.charCodeAt(i) <= 32; i++);
		var start = i;
		for (var i = this.text.length - 1; i >= 0 && this.text.charCodeAt(i) <= 32; i--);
		var end = i + 1;
		var result;
		if (end <= start) {
			result = '';
		} else {
			result = this.text.substring(start, end);
		}
		return new javaRoot.$java.$lang.$String(result);
	},
	/*
	 * public static String valueOf(char[] data)
	 */
	$valueOf$_C$Ljava_lang_String_: function (data) {
		if (data == null) {
			throw new javaRoot.$java.$lang.$NullPointerException();
		}
		return this.$valueOf$_CII$Ljava_lang_String_(data, 0, data.length);
	},
	/*
	 * public static String valueOf(char[] data, int offset, int count)
	 */
	$valueOf$_CII$Ljava_lang_String_: function (data, offset, length) {
		if (data == null) {
			throw new javaRoot.$java.$lang.$NullPointerException();
		}
		var text = '';
		for (var i = 0; i < length; i++) {
			text += String.fromCharCode(data[offset + i]);
		}
		return new javaRoot.$java.$lang.$String(text);
	},
	/*
	 * public static String valueOf(Object obj)
	 */
	$valueOf$I$Ljava_lang_String_: function (value) {
		return new javaRoot.$java.$lang.$String(value.toString());
	},
	/*
	 * public static String valueOf(Object obj)
	 */
	$valueOf$C$Ljava_lang_String_: function (char) {
		return new javaRoot.$java.$lang.$String(String.fromCharCode(char));
	},
	/*
	 * public static String valueOf(double d)
	 */
	$valueOf$D$Ljava_lang_String_: function (value) {
		return new javaRoot.$java.$lang.$String(value.double.toString());
	},
	/*
	 * public static String valueOf(float f)
	 */
	$valueOf$F$Ljava_lang_String_: function (value) {
		return new javaRoot.$java.$lang.$String(value.toString());
	},
	/*
	 * public static String valueOf(long l)
	 */
	$valueOf$J$Ljava_lang_String_: function (value) {
		return new javaRoot.$java.$lang.$String(js2me.UTF8ToString(js2me.longToString(value)));
	},
	/*
	 * public static String valueOf(Object obj)
	 */
	$valueOf$Ljava_lang_Object_$Ljava_lang_String_: function (obj) {
		if (obj == null) {
			return new javaRoot.$java.$lang.$String('null');
		}
		if (obj.constructor === Array) {
			return new javaRoot.$java.$lang.$String('[');
		}
		return obj.$toString$$Ljava_lang_String_();
	},
	/*
	 * public static String valueOf(boolean b)
	 */
	$valueOf$Z$Ljava_lang_String_: function (value) {
		if (value == 1) {
			return new javaRoot.$java.$lang.$String('true');
		} else {
			return new javaRoot.$java.$lang.$String('false');
		}
	}
});



};

// upstream: js/me/java/lang/StringBuffer.js
JS2ME_CLASS_SOURCES['js/me/java/lang/StringBuffer.js'] = function() {
js2me.createClass({
	/*
	 * public StringBuffer()
	 */
	_init$$V: function () {
		this.capacity = 256;
		this.string = '';
	},
	/*
	 * public StringBuffer()
	 */
	_init$I$V: function (length) {
		this._init$$V();
		this.capacity = length;
	},
	/*
	 * public StringBuffer()
	 */
	_init$Ljava_lang_String_$V: function (str) {
		this.string = str.text;
	},
	insert: function (offset, value) {
		if (offset < 0 || offset > this.string.length) {
			throw new javaRoot.$java.$lang.$StringIndexOutOfBoundsException('String index out of range: ' + offset);
		}
		this.string = this.string.substr(0, offset) + value + this.string.substr(offset);
		return this;
	},
	/*
	 * public StringBuffer append(Object obj)
	 */
	$append$Ljava_lang_String_$Ljava_lang_StringBuffer_: function (str) {
		if (str !=  null) {
			this.string += str.text;
		} else {
			this.string += 'null';
		}
		return this;
	},
	/*
	 * public StringBuffer append(Object obj)
	 */
	$append$J$Ljava_lang_StringBuffer_: function (l) {
		this.string += js2me.UTF8ToString(js2me.longToString(l));
		return this;
	},
	/*
	 * public StringBuffer append(Object obj)
	 */
	$append$I$Ljava_lang_StringBuffer_: function (i) {
		this.string += i.toString();
		return this;
	},
	/*
	 * public String toString()
	 */
	$toString$$Ljava_lang_String_: function () {
		return new javaRoot.$java.$lang.$String(this.string);
	},
	/*
	 * public StringBuffer append(Object obj)
	 */
	$append$C$Ljava_lang_StringBuffer_: function (char) {
		this.string += String.fromCharCode(char);
		return this;
	},
	/*
	 * public StringBuffer append(Object obj)
	 */
	$append$Ljava_lang_Object_$Ljava_lang_StringBuffer_: function (obj) {
		return this.$append$Ljava_lang_String_$Ljava_lang_StringBuffer_(obj.$toString$$Ljava_lang_String_());
	},
	/*
	 * public StringBuffer append(Object obj)
	 */
	$append$D$Ljava_lang_StringBuffer_: function (value) {
		this.string += value.double.toString();
		return this;
	},
	/*
	 * public StringBuffer append(Object obj)
	 */
	$append$Z$Ljava_lang_StringBuffer_: function (value) {
		if (value != 1) {
			this.strings += 'true';
		} else {
			this.strings += 'false';
		}
		return this;
	},
	/*
	 * public StringBuffer(int length)
	 */
	$length$$I: function () {
		return this.string.length;
	},
	/*
	 * public StringBuffer delete(int start, int end)
	 */
	$delete$II$Ljava_lang_StringBuffer_: function (start, end) {
		if (start < 0 || start > this.string.length || start > end) {
			throw new javaRoot.$java.$lang.$StringIndexOutOfBoundsException();
		}
		this.string = this.string.substring(0, start) + this.string.substring(end);
		return this;
	},
	/*
	 * public StringBuffer deleteCharAt(int index)
	 */
	$deleteCharAt$I$Ljava_lang_StringBuffer_: function (index) {
		return this.$delete$II$Ljava_lang_StringBuffer_(index, index + 1);
	},
	/*
	 * public char charAt(int index)
	 */
	$charAt$I$C: function (index) {
		if (index < 0 || index >= this.string.length) {
			throw new javaRoot.$java.$lang.$StringIndexOutOfBoundsException('String index out of range: ' + index);
		}
		return this.string.charCodeAt(index);
	},
	/*
	 * public void ensureCapacity(int minimumCapacity)
	 */
	$ensureCapacity$I$V: function (capacity) {
		this.capacity = capacity;
	},
	/*
	 * public void getChars(int srcBegin, int srcEnd, char[] dst, int dstBegin)
	 */
	$getChars$II_CI$V: function (srcBegin, srcEnd, dst, dstBegin) {
		if (dst == null) {
			throw new javaRoot.$java.$lang.$NullPointerException();
		}
		if (srcBegin < 0 || dstBegin < 0 || srcBegin > srcEnd || srcEnd > this.string.length || dstBegin + srcEnd - srcBegin > dst.length) {
			throw new javaRoot.$java.$lang.$IndexOutOfBoundsException();
		}
		for (var i = 0; i < srcEnd - srcBegin; i++) {
			dst[dstBegin + i] = this.string.charCodeAt(srcBegin + i);
		}
	},
	/*
	 * public StringBuffer insert(int offset, char c)
	 */
	$insert$IC$Ljava_lang_StringBuffer_: function (offset, value) {
		return this.insert(offset, String.fromCharCode(value));
	},
	/*
	 * public StringBuffer insert(int offset, int i)
	 */
	$insert$II$Ljava_lang_StringBuffer_: function (offset, value) {
		return this.insert(offset, value);
	},
	/*
	 * public StringBuffer insert(int offset, String str)
	 */
	$insert$ILjava_lang_String_$Ljava_lang_StringBuffer_: function (offset, str) {
		return this.insert(offset, str.text);
	},
	/*
	 * public void setCharAt(int index, char ch)
	 */
	$setCharAt$IC$V: function (index, char) {
		if (index < 0 || index >= this.string.length) {
			throw new javaRoot.$java.$lang.$StringIndexOutOfBoundsException('String index out of range: ' + index);
		}
		this.string = this.string.substr(0, index) + String.fromCharCode(char) + this.string.substr(index + 1);
	},
	/*
	 * public void setLength(int newLength)
	 */
	$setLength$I$V: function (newLength) {
		if (newLength < 0) {
			throw new javaRoot.$java.$lang.$StringIndexOutOfBoundsException('String index out of range: ' + newLength);
		}
		if (newLength > this.string.length) {
			throw new Error('setLength: not supported yet');
		}
		this.string = this.string.substr(0, newLength);
	}
});



};

// upstream: js/me/java/lang/StringIndexOutOfBoundsException.js
JS2ME_CLASS_SOURCES['js/me/java/lang/StringIndexOutOfBoundsException.js'] = function() {
js2me.createClass({
	superClass: 'javaRoot.$java.$lang.$IndexOutOfBoundsException'
});


};

// upstream: js/me/java/lang/System.js
JS2ME_CLASS_SOURCES['js/me/java/lang/System.js'] = function() {
js2me.createClass({
	properties: {
		'microedition.configuration': 'cdc',
		'microedition.encoding': 'UTF-8',
		'microedition.locale': 'en-US',
		'microedition.platform': 'js2me/1.1',
		'file.separator': '/',
		'fileconn.dir.memorycard': 'file:///sdcard/'
	},
	$outLjava_io_PrintStream_: 'out',
	/*
	 * public static long currentTimeMillis()
	 */
	$currentTimeMillis$$J: function () {
		var time = Date.now();
		return {hi: ~~(time / 0x100000000), lo: time % 0x100000000};
	},
	_clinit$$V: function (callback) {
		// disable output in app
		js2me.statics['$out'] = new javaRoot.$java.$io.$PrintStream({
			buffer: '',
			$write$_B$V: function (b) {
				if (!js2me.config.app) {
					for (var i in b) {
						this.$write$I$V(b[i]);
					}
				}
			},
			$write$I$V: function (b) {
				if (!js2me.config.app) {
					if (b == 10) {
						console.log(this.buffer);
						this.buffer = '';
					} else {
						if (typeof b == 'number') {
							this.buffer += String.fromCharCode(b);
						} else {
							this.buffer += b;
						}
					}
				}
			}
			
		});
		callback();
	},
	/*
	 * public static void gc()
	 */
	$gc$$V: function () {
		javaRoot.$java.$lang.$Runtime.prototype.$getRuntime$$Ljava_lang_Runtime_().$gc$$V();
	},
	/*
	 * public static void arraycopy(Object src, int src_position, Object dst, int dst_position, int length)
	 */
	$arraycopy$Ljava_lang_Object_ILjava_lang_Object_II$V: function (src, srcPosition, dst, dstPosition, length) {
		if (src == null || dst == null) {
			throw new javaRoot.$java.$lang.$NullPointerException;
		}
		var buffer = [];
		for (var i = 0; i < length; i++) {
			buffer[i] = src[srcPosition + i];
		}
		for (var i = 0; i < length; i++) {
			dst[dstPosition + i] = buffer[i];
		}
	},
	/*
	 * public static String getProperty(String key)
	 */
	$getProperty$Ljava_lang_String_$Ljava_lang_String_: function (key) {
		console.log('Asking for property ' + key.text);
		if (key.text === 'fileconn.dir.private') {
			return new javaRoot.$java.$lang.$String('file:///dirs/' + js2me.manifest['midlet-name'] + '/');
		}
		if (this.properties[key.text]) {
			return new javaRoot.$java.$lang.$String(this.properties[key.text]);
		} else {
			return null;
		}
	},
	require: ['javaRoot.$java.$io.$PrintStream', 'javaRoot.$java.$lang.$Runtime']
});



};

// upstream: js/me/java/lang/Thread.js
JS2ME_CLASS_SOURCES['js/me/java/lang/Thread.js'] = function() {
js2me.createClass({
	construct: function (action) {
		if (action instanceof Function) {
			this.$run$$V = action;
		}
	},
	/*
	 * public Thread()
	 */
	_init$Ljava_lang_Runnable_Ljava_lang_String_$V: function (runnable, name) {
		this.runnable = runnable;
		this.name = name;
	},
	/*
	 * public Thread()
	 */
	_init$Ljava_lang_Runnable_$V: function (runnable) {
		this._init$Ljava_lang_Runnable_Ljava_lang_String_$V(runnable);
	},
	/*
	 * public void start()
	 */
	$start$$V: function () {
		var thread = this;
		var runnable = this.runnable || thread;
		thread.id = js2me.threads.length;
		js2me.threads.push(thread);
		js2me.restoreStack[thread.id] = [];
		js2me.VMMapping[thread.id] = js2me.currentVM;
		setTimeout(function () {
			js2me.switchVM(thread.id);
			runnable.$run$$V();
		}, 1);
	},
	/*
	 * 
	 */
	$sleep$J$V: js2me.markUnsafe(function (miliseconds) {
		js2me.isThreadSuspended = true;
		var threadId = js2me.currentThread;
		setTimeout(function () {
			js2me.restoreThread(threadId);
		}, miliseconds.lo);
		/*var time = Date.now();
		var count = 0;
		while (Date.now() - time < miliseconds.lo) {count++};
		console.log(count);*/
	}),
	/*
	 * public static void yield()
	 */
	$yield$$V: js2me.markUnsafe(function () {
		js2me.isThreadSuspended = true;
		var threadId = js2me.currentThread;
		setTimeout(function () {
			js2me.restoreThread(threadId);
		}, 10);
	}),
	/*
	 * public static Thread currentThread()
	 */
	$currentThread$$Ljava_lang_Thread_: function () {
		return js2me.threads[js2me.currentThread];
	},
	/*
	 * public void interrupt()
	 */
	$interrupt$$V: function () {
		//TODO
	},
	/*
	 * public final boolean isAlive()
	 */
	$isAlive$$Z: function () {
		if (this.id === js2me.currentThread || js2me.restoreStack[this.id]) {
			return 1;
		} else {
			return 0;
		}
	},
	/*
	 * public final void setPriority(int newPriority)
	 */
	$setPriority$I$V: function (priority) {
		this.priority = priority;
	},
	/*
	 * public static int activeCount()
	 */
	$activeCount$$I: function () {
		return js2me.threads.length;
	}
});



};

// upstream: js/me/java/lang/Throwable.js
JS2ME_CLASS_SOURCES['js/me/java/lang/Throwable.js'] = function() {
js2me.createClass({	
	construct: function (message) {
		if (!js2me.config.app) {
			try {
				throw new Error();
			} catch (e) {
				this.stack = e.stack;
			}
		}
		if (message) {
			this.message = new javaRoot.$java.$lang.$String(message);
		}
	},
	/*
	 * public Throwable()
	 */
	_init$Ljava_lang_String_$V: function (message) {
		this.message = message;
	},
	/*
	 * public String getMessage()
	 */
	$getMessage$$Ljava_lang_String_: function () {
		return this.message;
	},
	/*
	 * public void printStackTrace()
	 */
	$printStackTrace$$V: function () {
		console.log(this.stack);
	},
	/*
	 * public String toString()
	 */
	$toString$$Ljava_lang_String_: function () {
		var str = this.$getClass$$Ljava_lang_Class_().$getName$$Ljava_lang_String_();
		if (this.message) {
			str.text += ': ' + this.message.text;
		}
		return str;
	},
	toString: function () {
		return this.$toString$$Ljava_lang_String_().text + '\n' + this.stack;
	}
});



};

// upstream: js/me/java/lang/UnsupportedOperationException.js
JS2ME_CLASS_SOURCES['js/me/java/lang/UnsupportedOperationException.js'] = function() {
js2me.createClass({
	superClass: 'javaRoot.$java.$lang.$IndexOutOfBoundsException'
});
	



};

// upstream: js/me/java/lang/VirtualMachineError.js
JS2ME_CLASS_SOURCES['js/me/java/lang/VirtualMachineError.js'] = function() {
js2me.createClass({
	superClass: 'javaRoot.$java.$lang.$Error',
	package: 'javaRoot.$java.$lang',
	name: '$VirtualMachineError'
});



};

// upstream: js/me/java/lang/ref/WeakReference.js
JS2ME_CLASS_SOURCES['js/me/java/lang/ref/WeakReference.js'] = function() {
js2me.createClass({
	/*
	 * public WeakReference(Object referent)
	 */
	_init$Ljava_lang_Object_$V: function (referent) {
		this.referent = referent;
	},
	/*
	 * public Object get()
	 */
	$get$$Ljava_lang_Object_: function () {
		return this.referent;
	}
});


};

// upstream: js/me/java/security/DigestException.js
JS2ME_CLASS_SOURCES['js/me/java/security/DigestException.js'] = function() {
js2me.createClass({});



};

// upstream: js/me/java/security/MessageDigest.js
JS2ME_CLASS_SOURCES['js/me/java/security/MessageDigest.js'] = function() {
js2me.createClass({});



};

// upstream: js/me/java/security/NoSuchAlgorithmException.js
JS2ME_CLASS_SOURCES['js/me/java/security/NoSuchAlgorithmException.js'] = function() {
js2me.createClass({});



};

// upstream: js/me/java/util/ArrayEnumeration.js
JS2ME_CLASS_SOURCES['js/me/java/util/ArrayEnumeration.js'] = function() {
js2me.createClass({
	construct: function (array) {
		this.keys = [];
		for (var i in array) {
			this.keys.push(i);
		}
		this.array = array;
		this.index = 0;
	},
	/*
	 * 
	 */
	$hasMoreElements$$Z: function () {
		if (this.index < this.keys.length) {
			return 1;
		} else {
			return 0;
		}
	},
	/*
	 * 
	 */
	$nextElement$$Ljava_lang_Object_: function () {
		var key = this.keys[this.index++];
		return this.array[key];
	},
	interfaces: ['javaRoot.$java.$util.$Enumeration']
});


};

// upstream: js/me/java/util/Calendar.js
JS2ME_CLASS_SOURCES['js/me/java/util/Calendar.js'] = function() {
js2me.createClass({
	$YEARI: 1,
	$MONTHI: 2,
	$DATEI: 5,
	$DAY_OF_MONTHI: 5,
	$DAY_OF_WEEKI: 7,
	$HOURI: 10,
	$HOUR_OF_DAYI: 11,
	$AM_PMI: 9,
	$MINUTEI: 12,
	$SECONDI: 13,
	$MILLISECONDI: 14,
	construct: function () {
		this.date = new Date();
	},
	/*
	 * public static Calendar getInstance()
	 */
	$getInstance$$Ljava_util_Calendar_: function () {
		return new javaRoot.$java.$util.$Calendar();
	},
	/*
	 * public static Calendar getInstance(TimeZone zone)
	 */
	$getInstance$Ljava_util_TimeZone_$Ljava_util_Calendar_: function () {
		return new javaRoot.$java.$util.$Calendar();
	},
	/*
	 * public final Date getTime()
	 */
	$get$I$I: function (field) {
		if (field == this.$YEARI) {
			return this.date.getFullYear();
		}
		if (field == this.$HOURI) {
			return this.date.getHours() % 12;
		}
		if (field == this.$HOUR_OF_DAYI) {
			return this.date.getHours();
		}
		if (field == this.$MINUTEI) {
			return this.date.getMinutes();
		}
		if (field == this.$SECONDI) {
			return this.date.getSeconds();
		}
		if (field == this.$DAY_OF_WEEKI) {
			return this.date.getDay() + 1;
		}
		if (field == this.$DAY_OF_MONTHI) {
			return this.date.getDate();
		}
		if (field == this.$MONTHI) {
			return this.date.getMonth();
		}
		if (field == this.$MILLISECONDI) {
			return this.date.getMilliseconds();
		}
		throw new javaRoot.$java.$lang.$ArrayIndexOutOfBoundsException('Calendar: field not supported ' + field);
	},
	/*
	 * public final Date getTime()
	 */
	$getTime$$Ljava_util_Date_: function () {
		return new javaRoot.$java.$util.$Date(new Date(this.date.getTime()));
	},
	/*
	 * set(int field, int value) 
	 */
	$set$II$V: function (field, value) {
		if (field == this.$YEARI) {
			return this.date.setFullYear(value);
		}
		if (field == this.$HOURI) {
			return this.date.setHours(value);
		}
		if (field == this.$HOUR_OF_DAYI) {
			return this.date.setHours(value);
		}
		if (field == this.$MINUTEI) {
			return this.date.setMinutes(value);
		}
		if (field == this.$SECONDI) {
			return this.date.setSeconds(value);
		}
		if (field == this.$DAY_OF_MONTHI) {
			return this.date.setDate(value);
		}
		if (field == this.$MONTHI) {
			return this.date.setMonth(value);
		}
		if (field == this.$MILLISECONDI) {
			return this.date.getMilliseconds(value);
		}
		throw new javaRoot.$java.$lang.$ArrayIndexOutOfBoundsException('Calendar: field not supported ' + field);
	},
	/*
	 * public final void setTime(Date date)
	 */
	$setTime$Ljava_util_Date_$V: function (date) {
		this.date = date.date;
	},
});


};

// upstream: js/me/java/util/Date.js
JS2ME_CLASS_SOURCES['js/me/java/util/Date.js'] = function() {
js2me.createClass({
	construct: function (date) {
		this.date = date || new Date();
	},
	/*
	 * public Date()
	 */
	_init$$V: function () {
		this.date = new Date();
	},
	/*
	 * public Date(long date)
	 */
	_init$J$V: function (date) {
		this.date = new Date(date.hi * 0x100000000 + date.lo);
	},
	/*
	 * public boolean equals(Object obj)
	 */
	$equals$Ljava_lang_Object_$Z: function (obj) {
		if (!obj  || obj.className != this.className || obj.date.getTime() != this.date.getTime()) {
			return 0;
		} else {
			return 1;
		}
	},
	/*
	 * public long getTime()
	 */
	$getTime$$J: function () {
		var hi = Math.floor(this.date.getTime() / 0x100000000);
		var lo = this.date.getTime() % 0x100000000;
		return {hi: hi, lo: lo};
	},
	/*
	 * public int hashCode()
	 */
	$hashCode$$I: function () {
		var time = this.$getTime$$J();
		return time.hi ^ time.lo;
	},
	/*
	 * public void setTime(long time)
	 */
	$setTime$J$V: function (date) {
		this._init$J$V(date);
	},
	/*
	 * public String toString()
	 */
	$toString$$Ljava_lang_String_: function () {
		return new javaRoot.$java.$lang.$String(this.date.toString());
	},
});


};

// upstream: js/me/java/util/Enumeration.js
JS2ME_CLASS_SOURCES['js/me/java/util/Enumeration.js'] = function() {
js2me.createInterface({
});


};

// upstream: js/me/java/util/Hashtable.js
JS2ME_CLASS_SOURCES['js/me/java/util/Hashtable.js'] = function() {
js2me.createClass({
	/*
	 * public Hashtable()
	 */
	_init$$V: function () {
		this.array = [];
		this.keys = [];
	},
	/*
	 * public Hashtable(int initialCapacity)
	 */
	_init$I$V: function () {
		this.array = [];
		this.keys = [];
	},
	/*
	 * public Object get(Object key)
	 */
	$get$Ljava_lang_Object_$Ljava_lang_Object_: function (key) {
		return this.array[key.$hashCode$$I()];
	},
	/*
	 * public Object put(Object key, Object value)
	 */
	$put$Ljava_lang_Object_Ljava_lang_Object_$Ljava_lang_Object_: function (key, obj) {
		if (key == null) {
			throw new javaRoot.$java.$lang.$NullPointerException();
		}
		var value = this.array[key.$hashCode$$I()];
		this.array[key.$hashCode$$I()] = obj;
		this.keys.push(key);
		return value;
	},
	/*
	 * public void clear()
	 */
	$clear$$V: function () {
		this.array = [];
		this.keys = [];
	},
	/*
	 * public boolean contains(Object value)
	 */
	$contains$Ljava_lang_Object_$Z: function (obj) {
		for (var i in this.array) {
			if (this.array[i] == obj) {
				return 1;
			}
		}
		return 0;
	},
	/*
	 * public boolean containsKey(Object key)
	 */
	$containsKey$Ljava_lang_Object_$Z: function (key) {
		for (var i in this.array) {
			if (i == key.$hashCode$$I()) {
				return 1;
			}
		}
		return 0;
	},
	/*
	 * public Enumeration elements()
	 */
	$elements$$Ljava_util_Enumeration_: function () {
		var enumeration = new javaRoot.$java.$util.$ArrayEnumeration(this.array);
		return enumeration;
	},
	/*
	 * public boolean isEmpty()
	 */
	$isEmpty$$Z: function () {
		if (this.keys === 0) {
			return 0;
		} else {
			return 1;
		}
	},
	/*
	 * public int size()
	 */
	$size$$I: function () {
		return this.keys.length;
	},
	/*
	 * public Enumeration keys()
	 */
	$keys$$Ljava_util_Enumeration_: function () {
		var enumeration = new javaRoot.$java.$util.$ArrayEnumeration(this.keys);
		return enumeration;
	},
	/*
	 * public Object remove(Object key)
	 */
	$remove$Ljava_lang_Object_$Ljava_lang_Object_: function (key) {
		delete this.array[key.$hashCode$$I()];
		this.keys.splice(this.keys.indexOf(key), 1);
	},
	require: ['javaRoot.$java.$util.$ArrayEnumeration']
});



};

// upstream: js/me/java/util/NoSuchElementException.js
JS2ME_CLASS_SOURCES['js/me/java/util/NoSuchElementException.js'] = function() {
js2me.createClass({
	superClass: 'javaRoot.$java.$lang.$RuntimeException',
	name: '$NoSuchElementException',
	package: 'javaRoot.$java.$util'
});


};

// upstream: js/me/java/util/Properties.js
JS2ME_CLASS_SOURCES['js/me/java/util/Properties.js'] = function() {
js2me.createClass({
	
});



};

// upstream: js/me/java/util/Random.js
JS2ME_CLASS_SOURCES['js/me/java/util/Random.js'] = function() {
js2me.createClass({
	/*
	 * public Random()
	 */
	_init$$V: function () {
	},
	/*
	 * public Random()
	 */
	_init$J$V: function (seed) {
		// is it needed?
		//console.log(seed.lo);
	},
	/*
	 * public int nextInt()
	 */
	$nextInt$I$I: function (n) {
		return Math.floor(Math.random() * n)
	},
	/*
	 * public int nextInt()
	 */
	$nextInt$$I: function () {
		return this.$nextInt$I$I(4294967296) - 2147483648;
	},
	/*
	 * public long nextLong()
	 */
	$nextLong$$J: function () {
		return {hi: Math.floor(Math.random() * 0x100000000), lo: Math.floor(Math.random() * 0x100000000)};
	},
	/*
	 * public void setSeed(long seed)
	 */
	$setSeed$J$V: function () {
		// no
	}
});


};

// upstream: js/me/java/util/Stack.js
JS2ME_CLASS_SOURCES['js/me/java/util/Stack.js'] = function() {
js2me.createClass({
	/*
	 * public boolean empty()
	 */
	$empty$$Z: function () {
		return this.$isEmpty$$Z();
	},
	/*
	 * public Object peek()
	 */
	$peek$$Ljava_lang_Object_: function () {
		return this.$lastElement$$Ljava_lang_Object_();
	},
	/*
	 * public Object pop()
	 */
	$pop$$Ljava_lang_Object_: function () {
		var obj = this.$lastElement$$Ljava_lang_Object_();
		this.$removeElement$Ljava_lang_Object_$Z(obj);
		return obj;
	},
	/*
	 * public Object push(Object item)
	 */
	$push$Ljava_lang_Object_$Ljava_lang_Object_: function (obj) {
		this.$addElement$Ljava_lang_Object_$V(obj);
		return obj;
	},
	superClass: 'javaRoot.$java.$util.$Vector'
});


};

// upstream: js/me/java/util/TimeZone.js
JS2ME_CLASS_SOURCES['js/me/java/util/TimeZone.js'] = function() {
js2me.createClass({
	construct: function () {
		this.date = new Date();
	},
	/*
	 * public static TimeZone getDefault()
	 */
	$getDefault$$Ljava_util_TimeZone_: function () {
		return new javaRoot.$java.$util.$TimeZone();
	},
	/*
	 * public static TimeZone getTimeZone(String ID)
	 */
	$getTimeZone$Ljava_lang_String_$Ljava_util_TimeZone_: function (id) {
		return new javaRoot.$java.$util.$TimeZone();
	}
});


};

// upstream: js/me/java/util/Timer.js
JS2ME_CLASS_SOURCES['js/me/java/util/Timer.js'] = function() {
js2me.createClass({
	/*
	 * public Timer()
	 */
	_init$$V: function () {
		this.threadId = js2me.threads.length;
		js2me.threads.push(this);
		this.timers = [];
	},
	/*
	 * public void schedule(TimerTask task, long delay)
	 */
	$schedule$Ljava_util_TimerTask_J$V: function (task, delay) {
		task.executing = true;
		var timer = this;
		task.timer = setTimeout(function () {
			task.executing = false;
			task.$run$$V();
		}, delay.lo);
		this.timers.push(task.timer);
	},
	/*
	 * public void schedule(TimerTask task, long delay)
	 */
	$schedule$Ljava_util_TimerTask_JJ$V: function (task, delay, interval) {
		task.executing = true;
		var timer = this;
		task.timer = setInterval(function () {
			js2me.currentThread = timer.threadId;
			if (js2me.restoreStack[timer.threadId] && js2me.restoreStack[timer.threadId].length > 0) {
				return;
			}
			clearTimeout(task.timer);
			if (interval) {
				task.timer = setInterval(function () {
					js2me.currentThread = timer.threadId;
					if (js2me.restoreStack[timer.threadId] && js2me.restoreStack[timer.threadId].length > 0) {
						return;
					}
					task.$run$$V();
				}, interval.lo);
				timer.timers.push(task.timer);
			}
			task.$run$$V();
		}, delay.lo);
		this.timers.push(task.timer);
	},
	/*
	 * public void scheduleAtFixedRate(TimerTask task, long delay, long period)
	 */
	$scheduleAtFixedRate$Ljava_util_TimerTask_JJ$V: function (task, delay, interval) {
		task.executing = true;
		var timer = this;
		task.timer = setTimeout(function () {
			if (interval) {
				task.timer = setInterval(function () {
					task.$run$$V();
				}, interval.lo);
				timer.timers.push(task.timer);
			}
			task.$run$$V();
		}, delay.lo);
		this.timers.push(task.timer);
	},
	/*
	 * public void cancel()
	 */
	$cancel$$V: function () {
		for (var i = 0; i < this.timers.length; i++) {
			clearTimeout(this.timers[i]);
		}
	}
});



};

// upstream: js/me/java/util/TimerTask.js
JS2ME_CLASS_SOURCES['js/me/java/util/TimerTask.js'] = function() {
js2me.createClass({
	/*
	 * public boolean cancel()
	 */
	$cancel$$Z: function () {
		clearTimeout(this.timer);
		return this.executing;
	},
	name: '$TimerTask',
	package: 'javaRoot.$java.$util'
});


};

// upstream: js/me/java/util/Vector.js
JS2ME_CLASS_SOURCES['js/me/java/util/Vector.js'] = function() {
js2me.createClass({
	/*
	 * public Vector()
	 */
	_init$$V: function () {
		this.array = [];
	},
	/*
	 * public Vector(int initialCapacity)
	 */
	_init$I$V: function () {
		this._init$$V();
	},
	/*
	 * public Vector(int initialCapacity, int capacityIncrement)
	 */
	_init$II$V: function () {
		this._init$$V();
	},
	/*
	 * public void addElement(Object obj)
	 */
	$addElement$Ljava_lang_Object_$V: function (obj) {
		this.array.push(obj);
	},
	/*
	 * public boolean contains(Object elem)
	 */
	$contains$Ljava_lang_Object_$Z: function (obj) {
		for (var i in this.array) {
			if (this.array[i] == obj) {
				return 1;
			}
		}
		return 0;
	},
	/*
	 * public void copyInto(Object[] anArray)
	 */
	$copyInto$_Ljava_lang_Object_$V: function (array) {
		var index = 0;
		for (var i in this.array) {
			array[index] = this.array[i];
			index++;
		}
	},
	/*
	 * public Object elementAt(int index)
	 */
	$elementAt$I$Ljava_lang_Object_: function (index) {
		if (index >= this.array.length) {
			throw new javaRoot.$java.$util.$NoSuchElementException();
		}
		return this.array[index];
	},
	/*
	 * public Enumeration elements()
	 */
	$elements$$Ljava_util_Enumeration_: function () {
		var enumeration = new javaRoot.$java.$util.$ArrayEnumeration(this.array);
		return enumeration;
	},
	/*
	 * public Object firstElement()
	 */
	$firstElement$$Ljava_lang_Object_: function () {
		return this.$elementAt$I$Ljava_lang_Object_(0);
	},
	/*
	 * public void insertElementAt(Object obj, int index)
	 */
	$insertElementAt$Ljava_lang_Object_I$V: function (obj, index) {
		if (index < 0 || index > this.array.length) {
			throw new javaRoot.$java.$lang.$ArrayIndexOutOfBoundsException();
		}
		for (var i = this.array.length - 1; i >= index; i--) {
			this.array[i + 1] = this.array[i];
		}
		this.array[index] = obj;
	},
	/*
	 * public int indexOf(Object elem)
	 */
	$indexOf$Ljava_lang_Object_$I: function (obj) {
		for (var i = 0; i < this.array.length; i++) {
			if (this.array[i] === obj) {
				return i;
			}
		}
		return -1;
	},
	/*
	 * public boolean isEmpty()
	 */
	$isEmpty$$Z: function () {
		if (this.array.length > 0) {
			return 0;
		} else {
			return 1;
		}
	},
	/*
	 * public Object lastElement()
	 */
	$lastElement$$Ljava_lang_Object_: function () {
		if (this.array.length == 0) {
			throw new javaRoot.$java.$util.$NoSuchElementException();
		}
		return this.array[this.array.length - 1];
	},
	/*
	 * public void removeAllElements()
	 */
	$removeAllElements$$V: function () {
		this.array = [];
	},
	/*
	 * public boolean removeElement(Object obj)
	 */
	$removeElement$Ljava_lang_Object_$Z: function (obj) {
		for (var i = 0; i < this.array.length; i++) {
			if (this.array[i] === obj) {
				this.$removeElementAt$I$V(i);
				return 1;
			}
		}
		return 0;
	},
	/*
	 * public void removeElementAt(int index)
	 */
	$removeElementAt$I$V: function (index) {
		if (index < 0 || index >= this.array.length) {
			throw new javaRoot.$java.$lang.$ArrayIndexOutOfBoundsException();
		}
		for (var i = index; i < this.array.length; i++) {
			this.array[i] = this.array[i + 1];
		}
		this.array.pop();
	},
	/*
	 * public void setElementAt(Object obj, int index)
	 */
	$setElementAt$Ljava_lang_Object_I$V: function (obj, index) {
		if (index < 0 || index >= this.array.length) {
			throw new javaRoot.$java.$lang.$ArrayIndexOutOfBoundsException();
		}
		this.array[index] = obj;
	},
	$setSize$I$V: function () {
	},
	/*
	 * public int size()
	 */
	$size$$I: function () {
		return this.array.length;
	},
	require: ['javaRoot.$java.$util.$NoSuchElementException']
});



};

// upstream: js/me/javax/crypto/Cipher.js
JS2ME_CLASS_SOURCES['js/me/javax/crypto/Cipher.js'] = function() {
js2me.createClass({});



};

// upstream: js/me/javax/crypto/spec/IvParameterSpec.js
JS2ME_CLASS_SOURCES['js/me/javax/crypto/spec/IvParameterSpec.js'] = function() {
js2me.createClass({});



};

// upstream: js/me/javax/crypto/spec/SecretKeySpec.js
JS2ME_CLASS_SOURCES['js/me/javax/crypto/spec/SecretKeySpec.js'] = function() {
js2me.createClass({});



};

// upstream: js/me/javax/microedition/io/Connection.js
JS2ME_CLASS_SOURCES['js/me/javax/microedition/io/Connection.js'] = function() {
js2me.createInterface({
	package: 'javaRoot.$javax.$microedition.$io',
	name: '$Connection'
});



};

// upstream: js/me/javax/microedition/io/ConnectionNotFoundException.js
JS2ME_CLASS_SOURCES['js/me/javax/microedition/io/ConnectionNotFoundException.js'] = function() {
js2me.createClass({
	superClass: 'javaRoot.$java.$io.$IOException',
	name: '$ConnectionNotFoundException',
	package: 'javaRoot.$javax.$microedition.$io'
});
	



};

// upstream: js/me/javax/microedition/io/Connector.js
JS2ME_CLASS_SOURCES['js/me/javax/microedition/io/Connector.js'] = function() {
js2me.createClass({
	/*
	 * public static Connection open(String name) throws IOException
	 */
	$open$Ljava_lang_String_$Ljavax_microedition_io_Connection_: function (url) {
		var parts = url.text.split(':');
		/*if (parts[0] === 'socket') {
			return new javaRoot.$javax.$microedition.$io.$SocketConnectionImpl(parts[1], parseInt(parts[2]));
		}*/
		if (parts[0] === 'localmsg') {
			return new javaRoot.$com.$nokia.$mid.$s40.$io.$LocalMessageProtocolConnection(parts[1]);
		}
		if (parts[0] === 'file') {
			return new javaRoot.$javax.$microedition.$io.$file.$FileConnectionImpl(parts[1], parts[2]);
		}
		throw new Error('Unsupported protocol: ' + url.text);
	},
	$open$Ljava_lang_String_I$Ljavax_microedition_io_Connection_: function (url) {
		return this.$open$Ljava_lang_String_$Ljavax_microedition_io_Connection_(url);
	},
	$open$Ljava_lang_String_IZ$Ljavax_microedition_io_Connection_: function (url) {
		return this.$open$Ljava_lang_String_$Ljavax_microedition_io_Connection_(url);
	},
	require: ['javaRoot.$javax.$microedition.$io.$file.$FileConnectionImpl', 'javaRoot.$com.$nokia.$mid.$s40.$io.$LocalMessageProtocolConnection']
});
	



};

// upstream: js/me/javax/microedition/io/ContentConnection.js
JS2ME_CLASS_SOURCES['js/me/javax/microedition/io/ContentConnection.js'] = function() {
js2me.createInterface({
	package: 'javaRoot.$javax.$microedition.$io',
	name: '$ContentConnection'
});



};

// upstream: js/me/javax/microedition/io/HttpConnection.js
JS2ME_CLASS_SOURCES['js/me/javax/microedition/io/HttpConnection.js'] = function() {
js2me.createClass({
	name: '$HttpConnection',
	package: 'javaRoot.$javax.$microedition.$io'
});
	



};

// upstream: js/me/javax/microedition/io/InputConnection.js
JS2ME_CLASS_SOURCES['js/me/javax/microedition/io/InputConnection.js'] = function() {
js2me.createInterface({
	superClass: 'javaRoot.$javax.$microedition.$io.$Connection',
	package: 'javaRoot.$javax.$microedition.$io',
	name: '$InputConnection'
});



};

// upstream: js/me/javax/microedition/io/OutputConnection.js
JS2ME_CLASS_SOURCES['js/me/javax/microedition/io/OutputConnection.js'] = function() {
js2me.createInterface({
	package: 'javaRoot.$javax.$microedition.$io',
	name: '$OutputConnection'
});



};

// upstream: js/me/javax/microedition/io/SecureConnection.js
JS2ME_CLASS_SOURCES['js/me/javax/microedition/io/SecureConnection.js'] = function() {
js2me.createClass({});



};

// upstream: js/me/javax/microedition/io/SecurityInfo.js
JS2ME_CLASS_SOURCES['js/me/javax/microedition/io/SecurityInfo.js'] = function() {
js2me.createClass({});



};

// upstream: js/me/javax/microedition/io/SocketConnection.js
JS2ME_CLASS_SOURCES['js/me/javax/microedition/io/SocketConnection.js'] = function() {
js2me.createClass({
});


};

// upstream: js/me/javax/microedition/io/SocketConnectionImpl.js
JS2ME_CLASS_SOURCES['js/me/javax/microedition/io/SocketConnectionImpl.js'] = function() {
js2me.createClass({
	construct: function (host, port) {
		this.socket = navigator.mozTCPSocket.open(host, port, {binaryType: 'arraybuffer'});
		var parent = this;
		this.socket.ondata = function (event) {
			parent.inputStream.buffer.push(event.data);
		};
		this.inputStream = new javaRoot.$java.$io.$InputStream();
		this.inputStream.buffer = [];
		this.inputStream.position = 0;
		this.inputStream.$read$$I = function () {
			if (this.buffer.length === 0) {
				return -1;
			}
			if (this.position >= this.buffer[0].length) {
				this.buffer.shift();
				this.position = 0;
			}
			if (this.buffer.length === 0) {
				return -1;
			}
			return this.buffer[0][this.position++];
		};
		this.outputStream = new javaRoot.$java.$io.$OutputStream();
		this.outputStream.buffer = new Uint8Array(1);
		this.outputStream.$write$I$V = function (byte) {
			this.buffer[0] = byte;
			parent.socket.send(this.buffer);
		};
	},
	/*
	 * public InputStream openInputStream() throws IOException
	 */
	
	interfaces: ['javaRoot.$javax.$microedition.$io.$SocketConnection']
});


};

// upstream: js/me/javax/microedition/io/StreamConnection.js
JS2ME_CLASS_SOURCES['js/me/javax/microedition/io/StreamConnection.js'] = function() {
js2me.createInterface({
	interfaces: ['javaRoot.$javax.$microedition.$io.$InputConnection', 'javaRoot.$javax.$microedition.$io.$OutputConnection']
});



};

// upstream: js/me/javax/microedition/io/file/ConnectionClosedException.js
JS2ME_CLASS_SOURCES['js/me/javax/microedition/io/file/ConnectionClosedException.js'] = function() {
js2me.createClass({});



};

// upstream: js/me/javax/microedition/io/file/FileConnection.js
JS2ME_CLASS_SOURCES['js/me/javax/microedition/io/file/FileConnection.js'] = function() {
js2me.createInterface({});



};

// upstream: js/me/javax/microedition/io/file/FileConnectionImpl.js
JS2ME_CLASS_SOURCES['js/me/javax/microedition/io/file/FileConnectionImpl.js'] = function() {
js2me.createClass({
	construct: function (filename) {
		this.filename = filename.replace(/\/+/g, '/').replace(/\/$|^\//g, '');
		var request = indexedDB.open('js2me', 13);
		var connection = this;
		request.onsuccess = function () {
			connection.db = request.result;
			var fileRequest = connection.getStore().get(connection.filename);
			fileRequest.onsuccess = function () {
				if (fileRequest.result) {
					connection.file = fileRequest.result;
				}
				js2me.restoreThread(threadId);
			};
			var privateDir = 'dirs/' + js2me.manifest['midlet-name'];
			var privateDirRequest = connection.getStore().get(privateDir);
			privateDirRequest.onsuccess = function () {
				if (!privateDirRequest.result) {
					connection.getStore().add({
						files: [],
						isDirectory: true
					}, privateDir);
				}	
			};
			fileRequest.onerror = function () {
				console.debug('Error opening "file" ' + connection.filename);
			};
		};
		request.onupgradeneeded = function () {
			var store;
			if (request.result.objectStoreNames.contains('files')) {
				request.result.deleteObjectStore('files');
			}
			store = request.result.createObjectStore('files');
			store.add({
				files: [],
				isDirectory: true
			}, 'sdcard');
			store.add({
				files: [],
				isDirectory: true
			}, 'dirs');
			store.add({
				files: ['sdcard', 'dirs'],
				isDirectory: true
			}, '');
		};
		js2me.isThreadSuspended = true;
		var threadId = js2me.currentThread;
		js2me.restoreStack[threadId] = [function () {
			return connection;
		}];
	},
	$close$$V: function () {
		var store = this.getStore();
		var request = store.put(this.file, this.filename);
		js2me.isThreadSuspended = true;
		var threadId = js2me.currentThread;
		request.onsuccess = function () {
			js2me.restoreThread(threadId);
		};
	},
	/*
	 * public void create() throws java.io.IOException
	 */
	$create$$V: js2me.markUnsafe(function () {
		this.create({
			data: []
		});		
	}),
	/*
	 * public boolean exists()
	 */
	$exists$$Z: function () {
		if (this.file) {
			return 1;
		} else {
			return 0;
		}
	},
	/*
	 * public long fileSize() throws java.io.IOException
	 */
	$fileSize$$J: js2me.markUnsafe(function () {
		if (this.file) {
			if (this.file.data) {
				return {hi: 0, lo: this.file.data.length};
			} else {
				return {hi: 0, lo: 4096};
			}
		} else {
			return js2me.lneg({hi: 0, lo: 1});
		}
	}),
	/*
	 * public java.util.Enumeration list() throws java.io.IOException
	 */
	$list$$Ljava_util_Enumeration_: function () {
		return this.$list$Ljava_lang_String_Z$Ljava_util_Enumeration_('*', false);
	},
	/*
	 * public java.util.Enumeration list(java.lang.String filter, boolean includeHidden) throws java.io.IOException
	 */
	$list$Ljava_lang_String_Z$Ljava_util_Enumeration_: function (filter, includeHidden) {
		//TODO: support for includeHidden
		if (filter.text) {
			filter = filter.text;
		}
		filter = new RegExp('^' + filter.replace(/\\/g, '\\\\').replace('*', '.*') + '$');
		var list = [];
		for (var i in this.file.files) {
			var filename = this.file.files[i];
			if (filter.test(filename)) {
				list.push(new javaRoot.$java.$lang.$String(filename));
			}
		}
		return new javaRoot.$javax.$microedition.$io.$file.$FileEnumeration(list);
	},
	/*
	 * public void mkdir() throws java.io.IOException
	 */
	$mkdir$$V: js2me.markUnsafe(function () {
		this.create({
			files: [],
			isDirectory: true
		});	
	}),
	/*
	 * public java.io.DataOutputStream openDataOutputStream() throws java.io.IOException
	 */
	$openDataOutputStream$$Ljava_io_DataOutputStream_: function () {
		var stream = new javaRoot.$java.$io.DataOutputStream();
		stream._init$Ljava_io_OutputStream_$V(this.$openOutputStream$$Ljava_io_OutputStream_());
		return stream;
	},
	/*
	 * public java.io.OutputStream openOutputStream() throws java.io.IOException
	 */
	$openOutputStream$$Ljava_io_OutputStream_: function () {
		return this.$openOutputStream$J$Ljava_io_OutputStream_({hi: 0, lo: 0});
	},
	/*
	 * public java.io.OutputStream openOutputStream(long byteOffset) throws java.io.IOException
	 */
	$openOutputStream$J$Ljava_io_OutputStream_: function (offset) {
		//FIXME
		if (offset < 0) {
			throw new javaRoot.$java.$lang.$IllegalArgumentException();
		}
		if (!this.file || !this.file.data) {
			throw new javaRoot.$java.$lang.$IOException();
		}
		return new javaRoot.$java.$io.$DynamicOutputStream(this.file.data, offset.lo);
	},
	/*
	 * public void truncate(long byteOffset) throws java.io.IOException
	 */
	$truncate$J$V: function (offset) {
		//FIXME
		if (offset < 0) {
			throw new javaRoot.$java.$lang.$IllegalArgumentException();
		}
		if (!this.file || !this.file.data) {
			throw new javaRoot.$java.$lang.$IOException();
		}
		this.file.data = this.file.data.slice(offset.lo);
	},
	create: function (pattern) {
		var parentName = '';
		console.debug('Create ' + this.filename);
		if (this.filename.lastIndexOf('/') !== -1) {
			parentName = this.filename.substring(0, this.filename.lastIndexOf('/'));
		}
		var connection = this;
		var store = connection.getStore();
		var request = store.get(parentName);
		js2me.isThreadSuspended = true;
		var threadId = js2me.currentThread;
		request.onsuccess = function () {
			console.debug('Created ' + connection.filename);
			connection.file = pattern;
			var filename = connection.filename;
			if (connection.file.isDirectory) {
				filename += '/';
			}
			request.result.files.push(filename);
			var store = connection.getStore();
			store.put(request.result, parentName);
			store.add(connection.file, connection.filename);
			js2me.restoreThread(threadId);
		};
	},
	getStore: function () {
		return this.db.transaction(['files'], 'readwrite').objectStore('files');
	},
	interfaces: ['javaRoot.$javax.$microedition.$io.$file.$FileConnection'],
	require: ['javaRoot.$java.$io.$DynamicOutputStream', 'javaRoot.$javax.$microedition.$io.$file.$FileEnumeration', 'javaRoot.$java.$io.DataOutputStream']
});



};

// upstream: js/me/javax/microedition/io/file/FileEnumeration.js
JS2ME_CLASS_SOURCES['js/me/javax/microedition/io/file/FileEnumeration.js'] = function() {
js2me.createClass({
	construct: function (list) {
		this.list = list;
	},
	/*
	 * boolean	hasMoreElements()
	 */
	$hasMoreElements$$Z: function () {
		if (this.list.length > 0) {
			return 1;
		} else {
			return 0;
		}
	},
	interfaces: ['javaRoot.$java.$util.$Enumeration']
});


};

// upstream: js/me/javax/microedition/lcdui/Alert.js
JS2ME_CLASS_SOURCES['js/me/javax/microedition/lcdui/Alert.js'] = function() {
js2me.createClass({
	construct: function () {
		var alert = this;
		this.commandListener = {
			$commandAction$Ljavax_microedition_lcdui_Command_Ljavax_microedition_lcdui_Displayable_$V: function () {
				alert.display.$setCurrent$Ljavax_microedition_lcdui_Displayable_$V(alert.display.lastDisplayable);
			}
		};
	},
	/*
	 * public Alert(String title)
	 */
	_init$Ljava_lang_String_$V: function (str) {
		this.$setTitle$Ljava_lang_String_$V(str);
		this.init();
	},
	/*
	 * public Alert(String title)
	 */
	_init$Ljava_lang_String_Ljava_lang_String_Ljavax_microedition_lcdui_Image_Ljavax_microedition_lcdui_AlertType_$V: function (title, text, image, type) {
		this.$setTitle$Ljava_lang_String_$V(title);
		this.text = text;
		this.image = image;
		this.type = type;
		this.element = document.createElement('div');
		this.element.innerHTML = text.text;
		this.init();
	},
	/*
	 * public String getString()
	 */
	$getString$$Ljava_lang_String_: function () {
		return this.text;
	},
	/*
	 * public void setString(String str)
	 */
	$setString$Ljava_lang_String_$V: function (text) {
		this.text = text;
		this.element.innerHTML = text.text;
	},
	/*
	 * public void setTimeout(int time)
	 */
	$setTimeout$I$V: function (time) {
		setTimeout(function () {
			console.log('show?');
		}, time);
	},
	refreshCommands: function () {
		if (this.commands.length === 0) {
			var dismissCommand = new javaRoot.$javax.$microedition.$lcdui.$Command();
			dismissCommand._init$Ljava_lang_String_II$V(new javaRoot.$java.$lang.$String('OK'), javaRoot.$javax.$microedition.$lcdui.$Command.prototype.$OKI, 0);
			this.commands = [dismissCommand];
			javaRoot.$javax.$microedition.$lcdui.$Screen.prototype.refreshCommands.apply(this, arguments);
			this.commands = [];
		} else {
			javaRoot.$javax.$microedition.$lcdui.$Screen.prototype.refreshCommands.apply(this, arguments);
		}
	},
	superClass: 'javaRoot.$javax.$microedition.$lcdui.$Screen',
	require: ['javaRoot.$javax.$microedition.$lcdui.$Command']
});
	



};

// upstream: js/me/javax/microedition/lcdui/AlertType.js
JS2ME_CLASS_SOURCES['js/me/javax/microedition/lcdui/AlertType.js'] = function() {
js2me.createClass({
	name: '$AlertType',
	package: 'javaRoot.$javax.$microedition.$lcdui'
});
	



};

// upstream: js/me/javax/microedition/lcdui/Canvas.js
JS2ME_CLASS_SOURCES['js/me/javax/microedition/lcdui/Canvas.js'] = function() {
js2me.createClass({
	gameActionMapping: {
		'-1': 1,
		'-2': 6,
		'-3': 2,
		'-4': 5,
		'-5': 8,
		'49': 9,
		'50': 1,
		'51': 10,
		'52': 2,
		'53': 8,
		'54': 5,
		'55': 11,
		'56': 6,
		'57': 12
	},
	$UPI: 1,
	$DOWNI: 6,
	$LEFTI: 2,
	$RIGHTI: 5,
	$FIREI: 8,
	$GAME_AI: 9,
	$GAME_BI: 10,
	$GAME_CI: 11,
	$GAME_DI: 12,
	$KEY_NUM0I: 48,
	$KEY_NUM1I: 49,
	$KEY_NUM2I: 50,
	$KEY_NUM3I: 51,
	$KEY_NUM4I: 52,
	$KEY_NUM5I: 53,
	$KEY_NUM6I: 54,
	$KEY_NUM7I: 55,
	$KEY_NUM8I: 56,
	$KEY_NUM9I: 57,
	$KEY_STARI: 42,
	$KEY_POUNDI: 35,
	/*
	 * protected Canvas()
	 */
	_init$$V: function () {
		this.element = document.createElement('canvas');
		this.element.width = js2me.config.width;
		this.element.height = js2me.config.height;
		//this.element.setAttribute('moz-opaque', '');
		var canvas = this;
		this.element.addEventListener('spb-attached', function () {
			js2me.addEventListener('keypress', canvas.keyPressListener);
			js2me.addEventListener('keyreleased', canvas.keyReleasedListener);
			js2me.launchThread(function () {
				canvas.$repaint$$V();
				canvas.$showNotify$$V();
			});
		});
		this.element.addEventListener('spb-detached', function () {
			js2me.removeEventListener('keypress', canvas.keyPressListener);
			js2me.removeEventListener('keyreleased', canvas.keyReleasedListener);
			js2me.launchThread(function () {
				canvas.$hideNotify$$V();
			});
		});
		this.keyPressListener = function (keyCode) {
			var gameCode = canvas.gameActionMapping[keyCode];
			if (gameCode != null) {
				canvas.gameState = canvas.gameState | (1 << gameCode);
			}
			canvas.keysState[keyCode] = true;
			js2me.launchThread(function () {
				canvas.$keyPressed$I$V(keyCode);
			});
		};
		this.keyReleasedListener = function (keyCode) {
			if (keyCode != null) {
				canvas.keysState[keyCode] = false;
				js2me.launchThread(function () {
					canvas.$keyReleased$I$V(keyCode);
				});
			} else {
				for (var i in canvas.keysState) {
					if (canvas.keysState[i]) {
						canvas.keysState[i] = false;
						(function (j) {
							js2me.launchThread(function () {
								canvas.$keyReleased$I$V(j);
							});
						})(i);
					}
				}
			}
		};
		this.keyPressListener.spbCanvas = this;
		function mouseHandler(event) {
			js2me.launchThread(function () {
				var x = canvas.translateX(event.layerX);
				var y = canvas.translateY(event.layerY);
				if (event.type === 'mousemove') {
					canvas.$pointerDragged$II$V(x, y);
				}
				if (event.type === 'mouseup') {
					canvas.$pointerReleased$II$V(x, y);
				}
				if (event.type === 'mousedown') {
					canvas.$pointerPressed$II$V(x, y);
				}
			});
		}
		this.element.addEventListener('mousedown', mouseHandler);
		this.element.addEventListener('mouseup', mouseHandler);
		this.element.addEventListener('mousemove', mouseHandler);
		this.keysState = [];
		this.gameState = 0;
		this.init();
	},
	/*
	 * protected void keyPressed(int keyCode)
	 */
	$keyPressed$I$V: function () {
	},
	/*
	 * protected void keyReleased(int keyCode)
	 */
	$keyReleased$I$V: function () {
	},
	/*
	 * public final void repaint(int x, int y, int width, int height)
	 */
	$paint$Ljavax_microedition_lcdui_Graphics_$V: function () {
	},
	time: 0,
	/*
	 * public final void repaint()
	 */
	$repaint$$V: function () {
		//if (js2me.profile) {
			this.calls++;
			var time = Date.now();
			if (time - this.time > 1000) {
				document.getElementById('title').innerHTML = this.calls;
				this.time = time;
				this.calls = 0;
			}
		//}
		var graphics = new javaRoot.$javax.$microedition.$lcdui.$Graphics(this.element);
		var canvas = this;
		js2me.launchThread(function () {
			canvas.$paint$Ljavax_microedition_lcdui_Graphics_$V(graphics);
		});
	},
	/*
	 * public final void repaint(int x, int y, int width, int height)
	 */
	$repaint$IIII$V: function () {
		//TODO: there's some constraints...
		this.$repaint$$V();
	},
	/*
	 * public int getKeyCode(int gameAction)
	 */
	$getKeyCode$I$I: function (gameAction) {
		for (var i in this.gameActionMapping) {
			if (this.gameActionMapping[i] == gameAction) {
				return parseInt(i);
			}
		}
	},
	/*
	 * public int getGameAction(int keyCode)
	 */
	$getGameAction$I$I: function (keyCode) {
		var gameAction = this.gameActionMapping[keyCode];
		if (gameAction != null) {
			return gameAction;
		} else {
			return keyCode;
		}
	},
	/*
	 * public final void serviceRepaints()
	 */
	$serviceRepaints$$V: function () {
		//TODO: is it ok?
		//this.$repaint__V();
	},
	/*
	 * protected void sizeChanged(int w, int h)
	 */
	$sizeChanged$II$V: function () {
		
	},
	/*
	 * protected void showNotify()
	 */
	$showNotify$$V: function () {
		
	},
	/*
	 * protected void hideNotify()
	 */
	$hideNotify$$V: function () {
		
	},
	/*
	 * protected void pointerDragged(int x, int y)
	 */
	$pointerDragged$II$V: function () {
	},
	/*
	 * protected void pointerPressed(int x, int y)
	 */
	$pointerPressed$II$V: function () {
	},
	/*
	 * protected void pointerReleased(int x, int y)
	 */
	$pointerReleased$II$V: function () {
	},
	/*
	 * public void setFullScreenMode(boolean mode)
	 */
	$setFullScreenMode$Z$V: function (mode) {
		if (mode == 0) {
			this.element.height = js2me.config.height;
		} else {
			this.element.height = js2me.config.fullHeight;
		}
		this.fullscreen = (mode != 0);
		if (this.active) {
			js2me.setFullscreen(this.fullscreen);
			
		}
		var canvas = this;
		js2me.launchThread(function () {
			canvas.$sizeChanged$II$V(canvas.element.width, canvas.element.height);
			canvas.$repaint$$V();
		});
	},
	/*
	 * 
	 */
	$getWidth$$I: function () {
		return this.element.width;
	},
	/*
	 * 
	 */
	$getHeight$$I: function () {
		return this.element.height;
	},
	/*
	 * public boolean isDoubleBuffered()
	 */
	$isDoubleBuffered$$Z: function () {
		//TODO: let's think about this...
		return 0;
	},
	/*
	 * public boolean hasPointerEvents()
	 */
	$hasPointerEvents$$Z: function () {
		return 1;
	},
	/*
	 * public boolean hasPointerMotionEvents()
	 */
	$hasPointerMotionEvents$$Z: function () {
		return 1;
	},
	/*
	 * public String getKeyName(int keyCode)
	 */
	$getKeyName$I$Ljava_lang_String_: function () {
		//TODO
		return new javaRoot.$java.$lang.$String('pomidor');
	},
	getScale: function () {
		return this.element.clientWidth / this.element.width;
	},
	translateX: function (x) {
		return Math.floor(x / this.getScale());
				
	},
	translateY: function (y) {
		return Math.floor(y / this.getScale());
	},
	superClass: 'javaRoot.$javax.$microedition.$lcdui.$Displayable',
	require: ['javaRoot.$javax.$microedition.$lcdui.$Graphics']
});


};

// upstream: js/me/javax/microedition/lcdui/ChoiceGroup.js
JS2ME_CLASS_SOURCES['js/me/javax/microedition/lcdui/ChoiceGroup.js'] = function() {
js2me.createClass({
	/*
	 * public ChoiceGroup(String label, int choiceType)
	 */
	_init$Ljava_lang_String_I_Ljava_lang_String__Ljavax_microedition_lcdui_Image_$V: function (label, type, strings, images) {
		//TODO
	},
	_init$Ljava_lang_String_I$V: function () {
	},
	$append$Ljava_lang_String_Ljavax_microedition_lcdui_Image_$I: function () {
	},
	/*
	 * public void setSelectedIndex(int elementNum, boolean selected)
	 */
	$setSelectedIndex$IZ$V: function (index) {
		//TODO
		/*if (index < 0 || index >= this.items.length) {
			throw new javaRoot.$java.$lang.$IndexOutOfBoundsException();
		}
		this.selectedItem = index;*/
	},
	superClass: 'javaRoot.$javax.$microedition.$lcdui.$Item'
});


};

// upstream: js/me/javax/microedition/lcdui/Command.js
JS2ME_CLASS_SOURCES['js/me/javax/microedition/lcdui/Command.js'] = function() {
js2me.createClass({
	$SCREENI: 1,
	$BACKI: 2,
	$CANCELI: 3,
	$OKI: 4,
	$HELPI: 5,
	$STOPI: 6,
	$EXITI: 7,
	$ITEMI: 8,
	/*
	 * public Command(String label, int commandType, int priority)
	 */
	_init$Ljava_lang_String_II$V: function (label, commandType, priority) {
		this.label = label;
		this.commandType = commandType;
		this.priority = priority;
	},
	/*
	 * public String getLabel()
	 */
	$getLabel$$Ljava_lang_String_: function () {
		return this.label;
	},
	/*
	 * public int getPriority()
	 */
	$getPriority$$I: function () {
		return this.priority;
	}
});



};

// upstream: js/me/javax/microedition/lcdui/CommandListener.js
JS2ME_CLASS_SOURCES['js/me/javax/microedition/lcdui/CommandListener.js'] = function() {
js2me.createInterface({
});
	



};

// upstream: js/me/javax/microedition/lcdui/Display.js
JS2ME_CLASS_SOURCES['js/me/javax/microedition/lcdui/Display.js'] = function() {
js2me.createClass({
	/*
	 * public static Display getDisplay(MIDlet m)
	 */
	$getDisplay$Ljavax_microedition_midlet_MIDlet_$Ljavax_microedition_lcdui_Display_: function (midlet) {
		if (!midlet.display) {
			midlet.display = new javaRoot.$javax.$microedition.$lcdui.$Display();
			var element = document.getElementById('screen');
			midlet.display.element = element;
			this.choiceButton = document.getElementById('choice');
			this.backButton = document.getElementById('back');
			this.choiceButton.addEventListener('mousedown', function () {
				var displayable = midlet.display.current;
				function getItem(i) {
					var item = document.createElement('div');
					item.innerHTML = displayable.currentCommands[i].label.text;
					item.className = 'item';
					item.onclick = function () {
						var command = displayable.currentCommands[i];
						displayable.display.$setCurrent$Ljavax_microedition_lcdui_Displayable_$V(displayable);
						displayable.commandListener.$commandAction$Ljavax_microedition_lcdui_Command_Ljavax_microedition_lcdui_Displayable_$V(command, displayable);
					}
					return item;
				};
				if (displayable && displayable.commandListener) {
					displayable.currentCommands = displayable.choiceCommands;
					if (displayable.choiceCommands.length == 1) {
						displayable.commandListener.$commandAction$Ljavax_microedition_lcdui_Command_Ljavax_microedition_lcdui_Displayable_$V(displayable.choiceCommands[0], displayable);
					}
					if (displayable.choiceCommands.length > 1) {
						element.innerHTML = '';
						for (var i = 0; i < displayable.currentCommands.length; i++) {
							element.appendChild(getItem(i));
						}
					}
				}
			});
			this.backButton.addEventListener('mousedown', function () {
				var displayable = midlet.display.current;
				if (displayable && displayable.backCommands.length == 1 && displayable.commandListener) {
					displayable.commandListener.$commandAction$Ljavax_microedition_lcdui_Command_Ljavax_microedition_lcdui_Displayable_$V(displayable.backCommands[0], displayable);
				}
			});
		}
		return midlet.display;
	},
	/*
	 * public int numAlphaLevels()
	 */
	$numAlphaLevels$$I: function () {
		return 256;
	},
	/*
	 * public int numColors()
	 */
	$numColors$$I: function () {
		return 65536;
	},
	/*
	 * public void setCurrent(Displayable nextDisplayable)
	 */
	$setCurrent$Ljavax_microedition_lcdui_Displayable_$V: function (displayable) {
		clearTimeout(this.timeout);
		var screen = this.element;
		if (this.current) {
			this.current.active = false;
		}
		this.lastDisplayable = this.current;
		this.current = displayable;
		if (displayable != null) {
			displayable.display = this;
		}
		this.timeout = setTimeout(function () {
			document.getElementById('title').innerHTML = '';
			Array.prototype.forEach.call(screen.children, function(n) { n.dispatchEvent(new Event('spb-detached')); }); screen.innerHTML = '';
			if (displayable != null) {
				if (displayable.title) {
					document.getElementById('title').innerHTML = displayable.title.text;
				}
				screen.appendChild(displayable.element); displayable.element.dispatchEvent(new Event('spb-attached'));
				displayable.active = true;
				displayable.refreshCommands();
				js2me.setFullscreen(displayable.fullscreen);
			}
		}, 1);
	},
	/*
	 * public void callSerially(Runnable r)
	 */
	$callSerially$Ljava_lang_Runnable_$V: function (r) {
		a = 1;
		js2me.launchThread(function () {
			r.$run$$V();
		});
	},
	/*
	 * public Displayable getCurrent()
	 */
	$getCurrent$$Ljavax_microedition_lcdui_Displayable_: function () {
		return this.current;
	},
	/*
	 * public boolean isColor()
	 */
	$isColor$$Z: function () {
		return 1;
	},
	/*
	 * public boolean vibrate(int duration)
	 */
	$vibrate$I$Z: function () {
		console.log('*vibration*');
		return 0;
	}
});


};

// upstream: js/me/javax/microedition/lcdui/Displayable.js
JS2ME_CLASS_SOURCES['js/me/javax/microedition/lcdui/Displayable.js'] = function() {
js2me.createClass({
	init: function (noMoreLists) {
		this.choiceButton = document.getElementById('choice');
		this.backButton = document.getElementById('back');
		this.commands = [];
		this.choiceCommands = [];
		this.backCommands = [];
		var displayable = this;
		displayable.currentCommands = [];
	},
	/*
	 * public void setTitle(String s)
	 */
	$setTitle$Ljava_lang_String_$V: function (s) {
		this.title = s;
	},
	/*
	 * public String getTitle()
	 */
	$getTitle$$Ljava_lang_String_: function () {
		return this.title;
	},
	/*
	 * public int getWidth()
	 */
	$getWidth$$I: function () {
		return js2me.config.width;
	},
	/*
	 * public int getHeight()
	 */
	$getHeight$$I: function () {
		return js2me.config.height;
	},
	/*
	 * public void addCommand(Command cmd)
	 */
	$addCommand$Ljavax_microedition_lcdui_Command_$V: function (command) {
		if (this.commands.indexOf(command) == -1) {
			this.commands.push(command);
			this.refreshCommands();
		}
	},
	/*
	 * public void removeCommand(Command cmd)
	 */
	$removeCommand$Ljavax_microedition_lcdui_Command_$V: function (command) {
		var index = this.commands.indexOf(command);
		if (index != -1) {
			var lastCommand = this.commands.pop();
			if (command != lastCommand) {
				this.commands[index] = lastCommand;
			}
			this.refreshCommands();
		}
	},
	/*
	 * public void setCommandListener(CommandListener l)
	 */
	$setCommandListener$Ljavax_microedition_lcdui_CommandListener_$V: function (commandListener) {
		this.commandListener = commandListener;
	},
	/*
	 * public boolean isShown()
	 */
	$isShown$$Z: function () {
		if (this.element.parentNode != null) {
			return 1;
		} else {
			return 0;
		}
	},
	refreshCommands: function () {
		//TODO: no multicommands
		if (!this.active) {
			return;
		}
		this.choiceCommands = [];
		this.backCommands = [];
		this.choiceButton.innerHTML = '&nbsp;';
		this.backButton.innerHTML = '&nbsp;';
		for (var i in this.commands) {
			var command = this.commands[i];
			if (command.commandType == command.$BACKI || command.commandType == command.$EXITI ||
				command.commandType == command.$CANCELI || command.commandType == command.$STOPI) {
				this.backCommands.push(command);
			} else {
				this.choiceCommands.push(command);
			}
			
		}
		if (this.choiceCommands.length == 1) {
			this.choiceButton.innerHTML = this.choiceCommands[0].label.text;
		}
		if (this.choiceCommands.length > 1) {
			this.choiceButton.innerHTML = 'More...';
		}
		if (this.backCommands.length == 1) {
			this.backButton.innerHTML = this.backCommands[0].label.text;
		}
		if (this.backCommands.length > 1) {
			this.backButton.innerHTML = 'More...';
		}
	}
});


};

// upstream: js/me/javax/microedition/lcdui/Font.js
JS2ME_CLASS_SOURCES['js/me/javax/microedition/lcdui/Font.js'] = function() {
js2me.createClass({
	$STYLE_PLAINI: 0,
	$STYLE_BOLDI: 1,
	$STYLE_ITALICI: 2,
	$STYLE_UNDERLINED: 4,
	$FACE_SYSTEMI: 0,
	$FACE_MONOSPACEI: 32,
	$FACE_PROPORTIONALI: 64,
	$SIZE_SMALLI: 8,
	$SIZE_MEDIUMI: 0,
	$SIZE_LARGEI: 16,
	/*
	 * public static Font getDefaultFont()
	 */
	$getDefaultFont$$Ljavax_microedition_lcdui_Font_: function () {
		return this.$getFont$III$Ljavax_microedition_lcdui_Font_.apply(this, [0, 0, 0]);
	},
	/*
	 * public int getFace()
	 */
	$getFace$$I: function () {
		return this.javaFace;
	},
	/*
	 * public static Font getFont(int fontSpecifier)
	 */
	$getFont$III$Ljavax_microedition_lcdui_Font_: function (face, style, size) {
		if (this.context == null) {
			var canvas = document.createElement('canvas');
			javaRoot.$javax.$microedition.$lcdui.$Font.prototype.context = canvas.getContext('2d');
		}
		var font = new javaRoot.$javax.$microedition.$lcdui.$Font();
		font.face = 'arial';
		font.height = 16;
		font.style = '';
		font.javaFace = face;
		font.javaStyle = style;
		font.javaSize = size;
		if (size & this.$SIZE_SMALLI) {
			font.height = 12;
		}
		if (size & this.$SIZE_LARGEI) {
			font.height = 20;
		}
		if (size & this.$FACE_MONOSPACEI) {
			font.face = 'monospace';
		}
		if (size & this.$FACE_MONOSPACEI) {
			font.face = 'monospace';
		}
		if (style & this.$SIZE_BOLDI) {
			font.style += 'bold ';
		}
		if (style & this.$SIZE_ITALICI) {
			font.style += 'italic ';
		}
		if (style & this.$SIZE_UNDERLINEDI) {
			//TODO
			console.log('underline unsupported');
		}
		return font;
	},
	/*
	 * public static Font getFont(int fontSpecifier)
	 */
	$getFont$I$Ljavax_microedition_lcdui_Font_: function () {
		return this.prototype.$getDefaultFont$$Ljavax_microedition_lcdui_Font_.apply(this);
	},
	/*
	 * public int getBaselinePosition()
	 */
	$getBaselinePosition$$I: function () {
		return Math.floor(this.height * 0.75);
	},
	/*
	 * public int getHeight()
	 */
	$getHeight$$I: function () {
		return this.height;
	},
	/*
	 * public int getSize()
	 */
	$getSize$$I: function () {
		return this.javaSize;
	},
	/*
	 * public int getStyle()
	 */
	$getStyle$$I: function () {
		return this.javaStyle;
	},
	/*
	 * public int stringWidth(String str)
	 */
	$stringWidth$Ljava_lang_String_$I: function (str) {
		if (str == null) {
			throw new javaRoot.$java.$lang.$NullPointerException();
		}
		this.context.font = this.getCSS();
		return Math.ceil(this.context.measureText(str.text).width);
	},
	/*
	 * public int substringWidth(String str, int offset, int len)
	 */
	$substringWidth$Ljava_lang_String_II$I: function (str, offset, length) {
		if (str == null) {
			throw new javaRoot.$java.$lang.$NullPointerException();
		}
		this.context.font = this.getCSS();
		return Math.ceil(this.context.measureText(str.text.substr(offset, length)).width);
	},
	/*
	 * public int charWidth(char ch)
	 */
	$charWidth$C$I: function (char) {
		this.context.font = this.getCSS();
		return Math.ceil(this.context.measureText(String.fromCharCode(char)).width);
	},
	/*
	 * public int charsWidth(char[] ch, int offset, int length)
	 */
	$charsWidth$_CII$I: function (data, offset, length) {
		var str = javaRoot.$java.$lang.$String.prototype.$valueOf$_CII$Ljava_lang_String_(data, offset, length)
		return this.$stringWidth$Ljava_lang_String_$I(str);
	},
	getCSS: function () {
		return this.style + ' ' + Math.floor(this.height * 0.75) + 'px ' + this.face;
	}
});


};

// upstream: js/me/javax/microedition/lcdui/Form.js
JS2ME_CLASS_SOURCES['js/me/javax/microedition/lcdui/Form.js'] = function() {
js2me.createClass({
	/*
	 * public Form(String title)
	 */
	_init$Ljava_lang_String_$V: function (title) {
		this.element = document.createElement('div');
		this.element.className = 'form';
		this.$setTitle$Ljava_lang_String_$V(title);
		this.items = [];
		this.init();
	},
	/*
	 * public Form(String title, Item[] items)
	 */
	_init$Ljava_lang_String__Ljavax_microedition_lcdui_Item_$V: function(title, items) {
		this._init$Ljava_lang_String_$V(title);
		if (items == null) {
			return;
		}
		try {
			for (var i = 0; i < items.length; i++) {
				if (items[i] == null) {
					throw new javaRoot.$java.$lang.$NullPointerException();
				}
				this.$append$Ljavax_microedition_lcdui_Item_$I(items[i]);
			}
		} catch (e) {
			throw new javaRoot.$java.$lang.$IllegalStateException ();
		}
	},
	/*
	 * public int append(Item item)
	 */
	$append$Ljava_lang_String_$I: function (str) {
		var item = new javaRoot.$javax.$microedition.$lcdui.$StringItem();
		item._init$Ljava_lang_String_Ljava_lang_String_$V(null, str);
	},
	/*
	 * public int append(Item item)
	 */
	$append$Ljavax_microedition_lcdui_Item_$I: function (item) {
		this.element.appendChild(item.element);
		this.items.push(item);
	},
	/*
	 * public int append(Item item)
	 */
	$append$Ljavax_microedition_lcdui_Image_$I: function (image) {
		var item = new javaRoot.$javax.$microedition.$lcdui.$ImageItem();
		item._init$Ljava_lang_String_Ljavax_microedition_lcdui_Image_ILjava_lang_String_$V(null, image, 0, null);
		this.$append$Ljavax_microedition_lcdui_Item_$I(item);
	},
	/*
	 * public int size()
	 */
	$size$$I: function () {
		return this.items.length;
	},
	/*
	 * public void delete(int itemNum)
	 */
	$delete$I$V: function (index) {
		if (index < 0 || index >= this.items.length) {
			throw new javaRoot.$java.$lang.$IndexOutOfBoundsException();
		}
		this.element.removeChild(this.items[index].element);
		for (var i = index; i < this.items.length - 1; i++) {
			this.items[i] = this.items[i + 1];
		}
		this.items.pop();
	},
	superClass: 'javaRoot.$javax.$microedition.$lcdui.$Screen',
	require: ['javaRoot.$javax.$microedition.$lcdui.$StringItem']
});


};

// upstream: js/me/javax/microedition/lcdui/Gauge.js
JS2ME_CLASS_SOURCES['js/me/javax/microedition/lcdui/Gauge.js'] = function() {
js2me.createClass({
	/*
	 * public Gauge(String label, boolean interactive, int maxValue, int initialValue)
	 */
	_init$Ljava_lang_String_ZII$V: function (label, interactive, maxValue, initialValue) {
		if (maxValue < 0 && maxValue != -1) {
			throw new javaRoot.$java.$lang.IllegalArgumentException();
		}
		this.gauge = document.createElement('input');
		this.gauge.type = 'range';
		this.gauge.min = 0;
		this.gauge.max = maxValue;
		if (interactive == 0) {
			this.gauge.disabled = true;
		}
		this.$setValue$I$V(initialValue);
		this.content.appendChild(this.gauge);
	},
	/*
	 * public void setValue(int value)
	 */
	$setValue$I$V: function (value) {
		this.gauge.value = value;
	},
	superClass: 'javaRoot.$javax.$microedition.$lcdui.$Item',
	require: ['javaRoot.$java.$lang.IllegalArgumentException']
});


};

// upstream: js/me/javax/microedition/lcdui/Graphics.js
JS2ME_CLASS_SOURCES['js/me/javax/microedition/lcdui/Graphics.js'] = function() {
js2me.createClass({
	construct: function (canvas) {
		this.element = canvas;
		this.context = canvas.getContext('2d');
		this.context.textBaseline = 'top';
		this.$setColor$III$V(0, 0, 0);
		this.$setClip$IIII$V(0, 0, this.element.width, this.element.height);
		this.translateX = 0;
		this.translateY = 0;
		this.alpha = 255;
	},
	$HCENTERI: 1,
	$VCENTERI: 2,
	$LEFTI: 4,
	$RIGHTI: 8,
	$TOPI: 16,
	$BOTTOMI: 32,
	$BASELINEI: 64,
	$SOLIDI: 0,
	$DOTTEDI: 1,
	/*
	 * public int getColor()
	 */
	$getColor$$I: function () {
		return this.colorValue;
	},
	/*
	 * public void setColor(int red, int green, int blue)
	 */
	$setColor$III$V: function (r, g, b) {
		this.color = 'rgb(' + r + ', ' + g + ', ' + b + ')';
		this.colorValue = r * 0x10000 + g * 0x100 + b;
	},
	/*
	 * public void setColor(int red, int green, int blue)
	 */
	$setColor$I$V: function (rgb) {
		var red = (rgb & 0xff0000) >> 16;
		var green = (rgb & 0x00ff00) >> 8;
		var blue = (rgb & 0x0000ff);
		this.$setColor$III$V(red, green, blue);
	},
	$setGrayScale$I$V: function (color) {
			this.$setColor$III$V(color, color, color);
	},
	/*
	 * public void fillRect(int x, int y, int width, int height)
	 */
	$fillRect$IIII$V: function (x, y, width, height) {
		this.loadContext();
		if (width == 0) {
			width = 1;
		}
		if (height == 0) {
			height = 1;
		}
		this.context.fillRect(x, y, width, height);
		this.context.restore();
	},
	/*
	 * public void fillTriangle(int x1, int y1, int x2, int y2, int x3, int y3)
	 */
	$fillTriangle$IIIIII$V: function (x1, y1, x2, y2, x3, y3) {
		this.loadContext();
		this.context.beginPath();
		this.context.moveTo(x1, y1);
		this.context.lineTo(x2, y2);
		this.context.lineTo(x3, y3);
		this.context.lineTo(x1, y1);
		this.context.fill();
		this.context.closePath();
		this.context.restore();
	},
	/*
	 * public void drawRect(int x, int y, int width, int height)
	 */
	$drawRect$IIII$V: function (x, y, width, height) {
		this.loadContext();
		if (width == 0) {
			width = 1;
		}
		if (height == 0) {
			height = 1;
		}
		this.context.strokeRect(x, y, width, height);
		this.context.restore();
	},
	/*
	 * public void drawRGB(int[] rgbData, int offset, int scanlength, int x, int y, int width, int height, boolean processAlpha)
	 */
	$drawRGB$_IIIIIIIZ$V: function (data, offset, length, x, y, width, height, processAlpha) {
			//TODO: maybe little faster...
			var oldColor = this.$getColor$$I();
			for (var i = 0; i < height; i++) {
				for (var j = 0; j < width; j++) {
					var pixel = data[offset + i * length + j];
					var red = (pixel & 0xff0000) >> 16;
					var green = (pixel & 0x00ff00) >> 8;
					var blue = (pixel & 0x0000ff);
					var alpha = 1;
					if (processAlpha) {
							alpha = pixel / 0x100000000;
					}
					var color = 'rgba(' + red + ', ' + green + ', ' + blue + ', ' + alpha + ')';
					this.context.fillStyle = color;
					this.context.fillRect(x + j, y + i, 1, 1);
				}
			}
			this.$setColor$I$V(oldColor);
	},
	/*
	 * public void drawRoundRect(int x, int y, int width, int height, int arcWidth, int arcHeight)
	 */
	$drawRoundRect$IIIIII$V: function (x, y, width, height, arcWidth, arcHeight) {
		this.loadContext();
		this.drawRoundRectPath(x, y, width, height, arcWidth, arcHeight);
		this.context.stroke();
		this.context.closePath();
		this.context.restore();
	},
	/*
	 * public void fillRoundRect(int x, int y, int width, int height, int arcWidth, int arcHeight)
	 */
	$fillRoundRect$IIIIII$V: function (x, y, width, height, arcWidth, arcHeight) {
		this.loadContext();
		this.drawRoundRectPath(x, y, width, height, arcWidth, arcHeight);
		this.context.fill();
		this.context.closePath();
		this.context.restore();
	},
	/*
	 * public void drawLine(int x1, int y1, int x2, int y2)
	 */
	$drawLine$IIII$V: function (x1, y1, x2, y2) {
		this.loadContext();
		this.context.beginPath();
		if (x1 > x2) {
			x1++;
		}
		if (x2 > x1) {
			x2++;
		}
		if (y1 > y2) {
			y1++;
		}
		if (y2 > y1) {
			y1++;
		}
		if (y2 == y1 && x1 == x2) {
			x2++;
			y2++;
		}
		this.context.moveTo(x1, y1);
		this.context.lineTo(x2, y2);
		this.context.stroke();
		this.context.closePath();
		this.context.restore();
	},
	/*
	 * public void drawChar(char character, int x, int y, int anchor)
	 */
	$drawChar$CIII$V: function (char, x, y, anchor) {
		var str = new javaRoot.$java.$lang.$String(String.fromCharCode(char));
		this.$drawString$Ljava_lang_String_III$V(str, x, y, anchor);
	},
	/*
	 * public void drawChars(char[] data, int offset, int length, int x, int y, int anchor)
	 */
	$drawChars$_CIIIII$V: function (data, offset, length, x, y, anchor) {
		var str = javaRoot.$java.$lang.$String.prototype.$valueOf$_CII$Ljava_lang_String_(data, offset, length);
		this.$drawString$Ljava_lang_String_III$V(str, x, y, anchor);
	},
	/*
	 * public void drawArc(int x, int y, int width, int height, int startAngle, int arcAngle)
	 */
	$drawArc$IIIIII$V: function (x, y, width, height, startAngle, arcAngle) {
		this.loadContext();
		this.drawArcPath(x, y, width, height, startAngle, arcAngle);
		this.context.stroke();
		this.context.closePath();
		this.context.restore();
	},
	/*
	 * public void fillArc(int x, int y, int width, int height, int startAngle, int arcAngle)
	 */
	$fillArc$IIIIII$V: function (x, y, width, height, startAngle, arcAngle) {
		this.loadContext();
		this.drawArcPath(x, y, width, height, startAngle, arcAngle);
		this.context.fill();
		this.context.closePath();
		this.context.restore();
	},
	/*
	 * public void setFont(Font font)
	 */
	$setFont$Ljavax_microedition_lcdui_Font_$V: function (font) {
		this.font = font;
	},
	/*
	 * public void drawString(String str, int x, int y, int anchor)
	 */
	$drawString$Ljava_lang_String_III$V: function (str, x, y, anchor) {
		console.debug(js2me.currentThread);
		//this.context.save();
		if (this.font) {
			this.context.font = this.font.getCSS();
		}
		this.context.fillStyle = this.color;
		//this.context.translate(this.translateX, this.translateY);
		if (anchor == 0) {
			anchor = this.$TOPI | this.$LEFTI;
		}
		if (anchor & this.$TOPI) {
			this.context.textBaseline = 'top';
		}
		if (anchor & this.$VCENTERI) {
			this.context.textBaseline = 'middle';
		}
		if (anchor & this.$BASELINEI) {
			this.context.textBaseline = 'alphabetic';
		}
		if (anchor & this.$BOTTOMI) {
			this.context.textBaseline = 'bottom';
		}
		if (anchor & this.$HCENTERI) {
			x -= this.context.measureText(str.text).width / 2;
		}
		if (anchor & this.$RIGHTI) {
			x -= this.context.measureText(str.text).width;
		}
		this.context.fillText(str.text, x, y);
		//this.context.restore();
	},
	/*
	 * public void drawImage(Image img, int x, int y, int anchor)
	 */
	$drawImage$Ljavax_microedition_lcdui_Image_III$V: function (img, x, y, anchor) {
		if (anchor == 0) {
			anchor = this.$TOPI | this.$LEFTI;
		}
		if (anchor & this.$VCENTERI) {
			y -= img.element.height / 2;
		}
		if (anchor & this.$BASELINEI) {
			console.log('baseline,  what to do?');
		}
		if (anchor & this.$RIGHTI) {
			x -= img.element.width;
		}
		if (anchor & this.$HCENTERI) {
			x -= img.element.width / 2;
		}
		if (anchor & this.$BOTTOMI) {
			y -= img.element.height;
		}
		this.context.drawImage(img.element, x, y);
	},
	/*
	 * public void clipRect(int x, int y, int width, int height)
	 */
	$clipRect$IIII$V: function (x, y, width, height) {
		var clipX = Math.max(x, this.clipX);
		var clipY = Math.max(y, this.clipY);
		var clipWidth = Math.min(x + width, this.clipX + this.clipWidth) - clipX;
		var clipHeight = Math.min(y + height, this.clipY + this.clipHeight) - clipY;
		this.$setClip$IIII$V(clipX, clipY, clipWidth, clipHeight);
	},
	/*
	 * public void setClip(int x, int y, int width, int height)
	 */
	$setClip$IIII$V: function (x, y, width, height) {
		if (width < 0) {
			width = 0;
		}
		if (height < 0) {
			height = 0;
		}
		this.clipX = x;
		this.clipY = y;
		this.clipWidth = width;
		this.clipHeight = height;
		this.context.restore();
		this.context.save();
		this.context.translate(this.translateX, this.translateY);
		this.context.beginPath();
		this.context.rect(x, y, width, height);
		this.context.clip();
		this.context.closePath();
		//this.context.translate(-this.translateX, -this.translateY);
	},
	/*
	 * public int getClipX()
	 */
	$getClipX$$I: function () {
		return this.clipX + this.translateX;
	},
	/*
	 * public int getClipY()
	 */
	$getClipY$$I: function () {
		return this.clipY + this.translateY;
	},
	/*
	 * public int getClipWidth()
	 */
	$getClipWidth$$I: function () {
		return this.clipWidth;
	},
	/*
	 * public int getClipHeight()
	 */
	$getClipHeight$$I: function () {
		return this.clipHeight;
	},
	/*
	 * public Font getFont()
	 */
	$getFont$$Ljavax_microedition_lcdui_Font_: function () {
		return this.font;
	},
	/*
	 * public void drawSubstring(String str, int offset, int len, int x, int y, int anchor)
	 */
	$drawSubstring$Ljava_lang_String_IIIII$V: function (str, offset, length, x, y, anchor) {
		var substring = str.$substring$II$Ljava_lang_String_(offset, offset + length);
		this.$drawString$Ljava_lang_String_III$V(substring, x, y, anchor);
	},
	/*
	 * public void drawRegion(Image src, int x_src, int y_src, int width, int height, int transform, int x_dest, int y_dest, int anchor)
	 */
	$drawRegion$Ljavax_microedition_lcdui_Image_IIIIIIII$V: function(src, sx, sy, width, height, transform, dx, dy, anchor) {
		this.context.save();
		var dw = width;
		var dh = height;
		if (transform >= 4) {
			var dh = width;
			var dw = height;
		}
		if (anchor & this.$VCENTERI) {
			dy -= dh / 2;
		}
		if (anchor & this.$BASELINEI) {
			console.log('baseline,  what to do?');
		}
		if (anchor & this.$RIGHTI) {
			dx -= dw;
		}
		if (anchor & this.$HCENTERI) {
			dx -= dw / 2;
		}
		if (anchor & this.$BOTTOMI) {
			dy -= dh;
		}
		this.context.translate(dx + width / 2, dy + height / 2);
		var sprite = javaRoot.$javax.$microedition.$lcdui.$game.$Sprite.prototype;
		if (transform == sprite.$TRANS_MIRRORI || transform == sprite.$TRANS_MIRROR_ROT180I) {
			this.context.scale(-1, 1);
		}
		if (transform == sprite.$TRANS_MIRROR_ROT90I || transform == sprite.$TRANS_MIRROR_ROT270I) {
			this.context.scale(1, -1);
		}
		if (transform == sprite.$TRANS_ROT90I || transform == sprite.$TRANS_MIRROR_ROT90I) {
			this.context.rotate(Math.PI / 2);
		}
		if (transform == sprite.$TRANS_ROT180I || transform == sprite.$TRANS_MIRROR_ROT180I) {
			this.context.rotate(Math.PI);
		}
		if (transform == sprite.$TRANS_ROT270I || transform == sprite.$TRANS_MIRROR_ROT270I) {
			this.context.rotate(3 * Math.PI / 2);
		}
		this.context.drawImage(src.element, sx, sy, width, height, -dw / 2, -dh / 2, width, height);
		this.context.restore();
	},
	/*
	 * public int getTranslateX()
	 */
	$getTranslateX$$I: function () {
		return this.translateX;
	},
	/*
	 * public int getTranslateY()
	 */
	$getTranslateY$$I: function () {
		return this.translateY;
	},
	/*
	 * public void translate(int x, int y)
	 */
	$translate$II$V: function (x, y) {
		this.translateX += x;
		this.translateY += y;
		this.context.translate(x, y);
	},
	/*
	 * public void setStrokeStyle(int style)
	 */
	$setStrokeStyle$I$V: function (style) {
		this.style = style;
	},
	// FML, it only exists because of stupid canvas clip
	loadContext: function () {
		this.context.save();
		if (this.style == this.$DOTTEDI) {
			this.context.mozDash = [2];
		} else {
			this.context.mozDash = null;
		}
		this.context.fillStyle = this.color;
		this.context.strokeStyle = this.color;
		//this.context.translate(this.translateX, this.translateY);
	},
	drawArcPath: function (x, y, width, height, startAngle, arcAngle) {
        this.context.beginPath();
        this.context.translate(x - width / 2, y - height / 2);
        if (width != 0 && height != 0) {
			this.context.scale(width, height);
		}
        this.context.arc(1, 1, 1, (startAngle / 180) * Math.PI, ((startAngle + arcAngle) / 180) * Math.PI, true);
	},
	drawRoundRectPath: function (x, y, width, height, arcWidth, arcHeight) {
		this.context.beginPath();
		this.context.moveTo(x + arcWidth, y);
		this.context.lineTo(x + width - arcWidth, y);
		this.context.quadraticCurveTo(x + width, y, x + width, y + arcHeight);
		this.context.lineTo(x +  width, y + height - arcHeight);
		this.context.quadraticCurveTo(x + width, y + height, x + width - arcWidth, y + height);
		this.context.lineTo(x + arcWidth, y + height);
		this.context.quadraticCurveTo(x, y + height, x, y + height - arcHeight);
		this.context.lineTo(x, y + arcHeight);
		this.context.quadraticCurveTo(x, y, x + arcWidth, y);
	},
	require: ['javaRoot.$javax.$microedition.$lcdui.$game.$Sprite']
});


};

// upstream: js/me/javax/microedition/lcdui/Image.js
JS2ME_CLASS_SOURCES['js/me/javax/microedition/lcdui/Image.js'] = function() {
js2me.createClass({
	/*
	 * public static Image createImage(InputStream stream)
	 */
	$createImage$Ljava_io_InputStream_$Ljavax_microedition_lcdui_Image_: js2me.markUnsafe(function (stream) {
		if (stream == null) {
			throw new javaRoot.$java.$lang.$NullPointerException();
		}
		var data = [];
		var byte;
		while ((byte = stream.$read$$I()) != -1) {
			if (byte >= 128) {
				byte -= 256;
			}
			data.push(byte);
		}
		return this.$createImage$_BII$Ljavax_microedition_lcdui_Image_(data, 0, data.length);
	}),
	/*
	 * public static Image createImage(int width, int height)
	 */
	$createImage$II$Ljavax_microedition_lcdui_Image_: function (width, height) {
		var image = new javaRoot.$javax.$microedition.$lcdui.$Image();
		image.element = document.createElement('canvas');
		image.element.width = width;
		image.element.height = height;
		image.mutable = true;
		return image;
	},
	/*
	 * public static Image createImage(int width, int height)
	 */
	$createImage$Ljava_lang_String_$Ljavax_microedition_lcdui_Image_: js2me.markUnsafe(function (name) {
		if (name == null) {
			throw new javaRoot.$java.$lang.$NullPointerException();
		}
		var resourceName = name.text;
		if (resourceName.charAt(0) == '/') {
			resourceName = resourceName.substr(1);
		}
		var data;
		var async = true;
		js2me.loadResource(name.text, function (resource) {
			async = false;
			if (resource == null) {
				data = null;
				return;
			}
			data = new Int8Array(resource);
			js2me.restoreThread(threadId);
		});
		if (async) {
			js2me.isThreadSuspended = true;
			var threadId = js2me.currentThread;
			js2me.restoreStack[threadId] = [function () {
				if (data == null) {
					throw new javaRoot.$java.$io.$IOException();
				}
				javaRoot.$javax.$microedition.$lcdui.$Image.prototype.$createImage$_BII$Ljavax_microedition_lcdui_Image_(data, 0, data.length);
			}];
		} else {
			if (data == null) {
				throw new javaRoot.$java.$io.$IOException();
			}
			javaRoot.$javax.$microedition.$lcdui.$Image.prototype.$createImage$_BII$Ljavax_microedition_lcdui_Image_(data, 0, data.length);
		}
		
	}),
	/*
	 * public static Image createImage(int width, int height)
	 */
	$createImage$Ljavax_microedition_lcdui_Image_$Ljavax_microedition_lcdui_Image_: function (source) {
		if (source == null) {
			throw new javaRoot.$java.$lang.$NullPointerException();
		}
		var image = javaRoot.$javax.$microedition.$lcdui.$Image.prototype.$createImage$II$Ljavax_microedition_lcdui_Image_(source.$getWidth$$I(), source.$getHeight$$I());
		var graphics = image.$getGraphics$$Ljavax_microedition_lcdui_Graphics_();
		graphics.$drawImage$Ljavax_microedition_lcdui_Image_III$V(source, 0, 0, 0);
		image.mutable = false;
		return image;
	},
	/*
	 * public static Image createImage(int width, int height)
	 */
	$createImage$Ljavax_microedition_lcdui_Image_IIIII$Ljavax_microedition_lcdui_Image_ : function (source, x, y, width, height, transform) {
		var image = javaRoot.$javax.$microedition.$lcdui.$Image.prototype.$createImage$II$Ljavax_microedition_lcdui_Image_(width, height);
		var graphics = image.$getGraphics$$Ljavax_microedition_lcdui_Graphics_();
		graphics.$drawRegion$Ljavax_microedition_lcdui_Image_IIIIIIII$V(source, x, y, width, height, transform, 0, 0, 0);
		image.mutable = false;
		return image;
	},
	/*
	 * public static Image createImage(int width, int height)
	 */
	$createImage$_BII$Ljavax_microedition_lcdui_Image_: js2me.markUnsafe(function (data, offset, length) {
		if (data == null) {
			throw new javaRoot.$java.$lang.$NullPointerException();
		}
		if (length < 0 || offset >= data.length || offset + length > data.length) {
			throw new javaRoot.$java.$lang.$ArrayIndexOutOfBoundsException();
		}
		var headers = {
			'image/png': [-119, 80, 78, 71, 13, 10, 26, 10]
		};
		var mime = null;
		for (var i in headers) {
			var good = true;
			for (var j = 0; j < headers[i].length; j++) {
				if (data[offset + j] != headers[i][j]) {
					good = false;
				}
			}
			if (good) {
				mime = i;
			}
		}
		if (mime == null) {
			throw new Error('Unsupported image format');
		}
		var image = new javaRoot.$javax.$microedition.$lcdui.$Image.prototype.$createImage$II$Ljavax_microedition_lcdui_Image_(100, 100);
		var imageElement = document.createElement('img');
		imageElement.addEventListener('load', function () {
			image.element.width = imageElement.width;
			image.element.height = imageElement.height;
			image.element.getContext('2d').drawImage(imageElement, 0, 0);
			js2me.restoreThread(threadId);
		});
		var isError = false;
		imageElement.addEventListener('error', function () {
			isError = true;
			js2me.restoreThread(threadId);
		});
		var url = js2me.bytesToDataURI(data, offset, length, mime);
		imageElement.setAttribute('src', url);
		js2me.isThreadSuspended = true;
		var threadId = js2me.currentThread;
		js2me.restoreStack[threadId] = [function () {
			if (isError) {
				throw new javaRoot.$java.$io.$IOException('Cannot load image');
			}
			return image;
		}];
		image.mutable = false;
		return image;
	}),
	/*
	 * public static Image createRGBImage(int[] rgb, int width, int height, boolean processAlpha)
	 */
	$createRGBImage$_IIIZ$Ljavax_microedition_lcdui_Image_: function (rgb, width, height, alphaProcessing) {
		var image = this.$createImage$II$Ljavax_microedition_lcdui_Image_(width, height);
		var context = image.element.getContext('2d');
		var imageData = context.getImageData(0, 0, width, height);
		for (var i = 0; i < width * height; i++) {
			var value = rgb[i];
			if (value < 0) {
				value += 0x100000000;
			}
			var blue = value % 256;
			value = Math.floor(value / 256);
			var green = value % 256;
			value = Math.floor(value / 256);
			var red = value % 256;
			value = Math.floor(value / 256);
			var alpha = value % 256;
			imageData.data[i * 4] = red;
			imageData.data[i * 4 + 1] = green;
			imageData.data[i * 4 + 2] = blue;
			if (alphaProcessing) {
				imageData.data[i * 4 + 3] = alpha;
			} else {
				imageData.data[i * 4 + 3] = 255;
			}
		}
		context.putImageData(imageData, 0, 0);
		image.mutable = false;
		return image;
	},
	/*
	 * public Graphics getGraphics()
	 */
	$getGraphics$$Ljavax_microedition_lcdui_Graphics_: function () {
		return new javaRoot.$javax.$microedition.$lcdui.$Graphics(this.element);
	},
	/*
	 * public void getRGB(int[] rgbData, int offset, int scanlength, int x, int y, int width, int height)
	 */
	$getRGB$_IIIIIII$V: function (rgbData, offset, scanlength, x, y, width, height) {
		var context = this.element.getContext('2d');
		var imageData = context.getImageData(x, y, width, height);
		for (var i = 0; i < width * height; i++) {
			var value = imageData.data[i * 4] << 24;
			value += imageData.data[i * 4 + 1] << 16;
			value += imageData.data[i * 4 + 2] << 8;
			value += imageData.data[i * 4 + 3];
			if (value >= 0x100000000) {
				value -= 0x100000000;
			}
			rgbData[offset + (i % width - x) + (Math.floor(i / width) - y) * scanlength] = value;
		}
	},
	/*
	 * public int getWidth()
	 */
	$getWidth$$I: function () {
		return this.element.width;
	},
	/*
	 * public int getHeight()
	 */
	$getHeight$$I: function () {
		return this.element.height;
	},
	/*
	 * public boolean isMutable()
	 */
	$isMutable$$Z: function () {
		if (this.mutable) {
			return 1;
		} else {
			return 0;
		}
	}
});


};

// upstream: js/me/javax/microedition/lcdui/ImageItem.js
JS2ME_CLASS_SOURCES['js/me/javax/microedition/lcdui/ImageItem.js'] = function() {
js2me.createClass({
	/*
	 * public ImageItem(String label, Image img, int layout, String altText)
	 */
	_init$Ljava_lang_String_Ljavax_microedition_lcdui_Image_ILjava_lang_String_$V: function (label, image, layout, altText) {
		this.$setLabel$Ljava_lang_String_$V(label);
		this.$setImage$Ljavax_microedition_lcdui_Image_$V(image);
		this.$setLayout$I$V(layout);
	},
	/*
	 * public void setImage(Image img)
	 */
	$setImage$Ljavax_microedition_lcdui_Image_$V: function (image) {
		this.image = image;
		var imageCopy = javaRoot.$javax.$microedition.$lcdui.$Image.prototype.$createImage$Ljavax_microedition_lcdui_Image_$Ljavax_microedition_lcdui_Image_(image);
		this.content.appendChild(imageCopy.element);
	},
	superClass: 'javaRoot.$javax.$microedition.$lcdui.$Item'
});
	



};

// upstream: js/me/javax/microedition/lcdui/Item.js
JS2ME_CLASS_SOURCES['js/me/javax/microedition/lcdui/Item.js'] = function() {
js2me.createClass({
	$LAYOUT_DEFAULTI: 0,
	$LAYOUT_LEFTI: 1,
	$LAYOUT_RIGHTI: 2,
	$LAYOUT_CENTERI: 3,
	$LAYOUT_NEWLINE_BEFOREI: 0x100,
	$LAYOUT_NEWLINE_AFTERI: 0x200,
	construct: function () {
		this.element = document.createElement('div');
		this.element.className = 'item';
		this.label = document.createElement('div');
		this.label.className = 'label';
		this.content = document.createElement('div');
		this.content.className = 'content';
		this.element.appendChild(this.label);
		this.element.appendChild(this.content);
	},
	/*
	 * public void addCommand(Command cmd)
	 */
	$addCommand$Ljavax_microedition_lcdui_Command_$V: function (command) {
		this.command = command;
	},
	/*
	 * public String getLabel()
	 */
	$getLabel$$Ljava_lang_String_: function (str) {
		return new javaRoot.$java.$lang.$String(this.label.innerHTML);
	},
	$setDefaultCommand$Ljavax_microedition_lcdui_Command_$V: function (command) {
		this.command = command;
	},
	/*
	 * public void setItemCommandListener(ItemCommandListener l)
	 */
	$setItemCommandListener$Ljavax_microedition_lcdui_ItemCommandListener_$V: function (listener) {
		this.itemListener = listener;
	},
	/*
	 * public void setLayout(int layout)
	 */
	$setLayout$I$V: function (layout) {
		if (layout == this.$LAYOUT_RIGHTI) {
			this.content.style.textAlign = 'right';
		}
		if (layout == this.$LAYOUT_CENTERI) {
			this.content.style.textAlign = 'center';
		}
	},
	/*
	 * public void setLabel(String label)
	 */
	$setLabel$Ljava_lang_String_$V: function (str) {
		if (str != null) {
			this.label.innerHTML = str.text;
		} else {
			this.label.innerHTML = '';
		}
	}
});
	



};

// upstream: js/me/javax/microedition/lcdui/ItemCommandListener.js
JS2ME_CLASS_SOURCES['js/me/javax/microedition/lcdui/ItemCommandListener.js'] = function() {
js2me.createInterface({
});
	



};

// upstream: js/me/javax/microedition/lcdui/List.js
JS2ME_CLASS_SOURCES['js/me/javax/microedition/lcdui/List.js'] = function() {
js2me.createClass({
	construct: function () {
		this.element = document.createElement('div');
		this.element.className = 'list';
		this.items = [];
		this.init();
	},
	/*
	 * public List(String title, int listType)
	 */
	_init$Ljava_lang_String_I$V: function (title, listType) {
		this.$setTitle$Ljava_lang_String_$V(title);
		if (listType != 3) {
			throw new Error('List: only IMPLICIT type');
		}
	},
	/*
	 * public List(String title, int listType)
	 */
	_init$Ljava_lang_String_I_Ljava_lang_String__Ljavax_microedition_lcdui_Image_$V: function (title, listType, strings, images) {
		if (strings == null) {
			throw new javaRoot.$java.$lang.$NullPointerException();
		}
		if (images != null && images.length != strings.length) {
			throw new javaRoot.$java.$lang.$IllegalArgumentException();
		}
		for (var i = 0; i < strings.length; i++) {
			var image = null;
			if (images != null) {
				image = images[i];
			}
			this.$append$Ljava_lang_String_Ljavax_microedition_lcdui_Image_$I(strings[i], image);
		}
	},
	/*
	 * public int append(String stringPart, Image imagePart)
	 */
	$append$Ljava_lang_String_Ljavax_microedition_lcdui_Image_$I: function (stringPart, imagePart) {
		if (stringPart == null) {
			throw new javaRoot.$java.$lang.$NullPointerException();
		}
		var newItem = { 
			element: document.createElement('div'),
			stringPart: stringPart,
			imagePart: imagePart
		}
		newItem.element.className = 'item';
		this.element.appendChild(newItem.element);
		var list = this;
		newItem.element.addEventListener('mousedown', function () {
			for (var i = 0; i < list.element.childNodes.length; i++) {
				if (list.element.childNodes[i] == newItem.element) {
					list.selectedItem = i;
				}
			}
			var command = list.command || list.choiceCommands[0];
			list.commandListener.$commandAction$Ljavax_microedition_lcdui_Command_Ljavax_microedition_lcdui_Displayable_$V(command, list);
		});
		this.refreshItem(newItem);
		this.items.push(newItem);
	},
	/*
	 * public void deleteAll()
	 */
	$deleteAll$$V: function () {
		this.element.innerHTML = '';
	},
	/*
	 * public int getSelectedIndex()
	 */
	$getSelectedIndex$$I: function () {
		return this.selectedItem;
	},
	/*
	 * public String getString(int elementNum)
	 */
	$getString$I$Ljava_lang_String_: function (index) {
		if (index < 0 || index >= this.items.length) {
			throw new javaRoot.$java.$lang.$IndexOutOfBoundsException();
		}
		return this.items[index].stringPart;
	},
	/*
	 * public void setTicker(Ticker ticker)
	 */
	$set$ILjava_lang_String_Ljavax_microedition_lcdui_Image_$V: function (index, stringPart, imagePart) {
		if (stringPart == null) {
			throw new javaRoot.$java.$lang.$NullPointerException();
		}
		if (index < 0 || index >= this.items.length) {
			throw new javaRoot.$java.$lang.$IndexOutOfBoundsException();
		}
		var item = this.items[index];
		item.stringPart = stringPart;
		item.imagePart = imagePart;
		this.refreshItem(item);
	},
	/*
	 * public void setSelectCommand(Command command)
	 */
	$setSelectCommand$Ljavax_microedition_lcdui_Command_$V: function (command) {
		this.command = command;
	},
	/*
	 * public void setSelectedIndex(int elementNum, boolean selected)
	 */
	$setSelectedIndex$IZ$V: function (index) {
		//TODO
		if (index < 0 || index >= this.items.length) {
			throw new javaRoot.$java.$lang.$IndexOutOfBoundsException();
		}
		this.selectedItem = index;
	},
	/*
	 * public void setFitPolicy(int fitPolicy)
	 */
	$setFitPolicy$I$V: function () {
		//TODO
	},
	/*
	 * public int size()
	 */
	$size$$I: function () {
		return this.items.length;
	},
	refreshItem: function (item) {
		item.element.innerHTML = '';
		if (item.imagePart) {
			item.element.appendChild(item.imagePart.element);
		}
		item.element.innerHTML += item.stringPart.text;
	},
	superClass: 'javaRoot.$javax.$microedition.$lcdui.$Displayable'
});


};

// upstream: js/me/javax/microedition/lcdui/Screen.js
JS2ME_CLASS_SOURCES['js/me/javax/microedition/lcdui/Screen.js'] = function() {
js2me.createClass({
	/*
	 * 
	 */
	$setTicker$Ljavax_microedition_lcdui_Ticker_$V: function () {
		//TODO
	},
	superClass: 'javaRoot.$javax.$microedition.$lcdui.$Displayable'
});


};

// upstream: js/me/javax/microedition/lcdui/Spacer.js
JS2ME_CLASS_SOURCES['js/me/javax/microedition/lcdui/Spacer.js'] = function() {
js2me.createClass({
});


};

// upstream: js/me/javax/microedition/lcdui/StringItem.js
JS2ME_CLASS_SOURCES['js/me/javax/microedition/lcdui/StringItem.js'] = function() {
js2me.createClass({
	/*
	 * public StringItem(String label, String text)
	 */
	_init$Ljava_lang_String_Ljava_lang_String_$V: function (label, content) {
		this._init$Ljava_lang_String_Ljava_lang_String_I$V(label, content);
	},
	/*
	 * public StringItem(String label, String text, int appearanceMode)
	 */
	_init$Ljava_lang_String_Ljava_lang_String_I$V: function (label, content) {
		this.$setLabel$Ljava_lang_String_$V(label);
		this.content.innerHTML = content.text;
	},
	/*
	 * public void setFont(Font font)
	 */
	$setFont$Ljavax_microedition_lcdui_Font_$V: function (font) {
		this.font = font;
		this.element.style.font = font.getCSS();
	},
	superClass: 'javaRoot.$javax.$microedition.$lcdui.$Item'
});


};

// upstream: js/me/javax/microedition/lcdui/TextBox.js
JS2ME_CLASS_SOURCES['js/me/javax/microedition/lcdui/TextBox.js'] = function() {
js2me.createClass({
	/*
	 * public TextBox(String title, String text, int maxSize, int constraints)
	 */
	_init$Ljava_lang_String_Ljava_lang_String_II$V: function (title, text, maxSize, constraints) {
		//TODO: constraints are ignored
		if (maxSize <= 0) {
			throw new javaRoot.$java.$lang.$IllegalArgumentException('maxSize <= 0');
		}
		this.element = document.createElement('textarea');
		if (text) {
			if (text.text.length > maxSize) {
				throw new javaRoot.$java.$lang.$IllegalArgumentException('text longer than maxSize');
			}
			this.element.value = text.text;
		}
		this.element.maxLength = maxSize;
		this.$setTitle$Ljava_lang_String_$V(title);
		this.init();
	},
	/*
	 * public String getString()
	 */
	$getString$$Ljava_lang_String_: function () {
		return new javaRoot.$java.$lang.$String(this.element.value);
	},
	/*
	 * public int setMaxSize(int maxSize)
	 */
	$setMaxSize$I$I: function (maxSize) {
		//TODO: constraints are ignored
	},
	/*
	 * public void setString(String text)
	 */
	$setString$Ljava_lang_String_$V: function (text) {
		this.element.value = text;
	},
	superClass: 'javaRoot.$javax.$microedition.$lcdui.$Screen'
});



};

// upstream: js/me/javax/microedition/lcdui/TextField.js
JS2ME_CLASS_SOURCES['js/me/javax/microedition/lcdui/TextField.js'] = function() {
js2me.createClass({
	/*
	 * public TextField(String label, String text, int maxSize, int constraints)
	 */
	_init$Ljava_lang_String_Ljava_lang_String_II$V: function (label, text, maxSize, constraints) {
		//TODO: constraints
		this.$setLabel$Ljava_lang_String_$V(label);
		this.input = document.createElement('input');
		this.input.maxLength = maxSize;
		this.input.value = text.text;
		this.content.appendChild(this.input);
	},
	/*
	 * public String getString()
	 */
	$getString$$Ljava_lang_String_: function () {
		return new javaRoot.$java.$lang.$String(this.input.value);
	},
	/*
	 * public void setString(String text)
	 */
	$setString$Ljava_lang_String_$V: function (str) {
		this.input.value = str.text;
	},
	superClass: 'javaRoot.$javax.$microedition.$lcdui.$Item'
});
	



};

// upstream: js/me/javax/microedition/lcdui/Ticker.js
JS2ME_CLASS_SOURCES['js/me/javax/microedition/lcdui/Ticker.js'] = function() {
js2me.createClass({
	/*
	 * public Ticker(String str)
	 */
	_init$Ljava_lang_String_$V: function () {
		//TODO
	}
});


};

// upstream: js/me/javax/microedition/lcdui/game/GameCanvas.js
JS2ME_CLASS_SOURCES['js/me/javax/microedition/lcdui/game/GameCanvas.js'] = function() {
js2me.createClass({
	/*
	 * protected GameCanvas(boolean suppressKeyEvents)
	 */
	_init$Z$V : function (suppressKeyEvents) {
		javaRoot.$javax.$microedition.$lcdui.$Canvas.prototype._init$$V.apply(this);
	},
	/*
	 * protected Graphics getGraphics()
	 */
	$getGraphics$$Ljavax_microedition_lcdui_Graphics_: function () {
		var graphics = new javaRoot.$javax.$microedition.$lcdui.$Graphics(this.element);
		return graphics;
	},
	/*
	 * public void flushGraphics(int x, int y, int width, int height)
	 */
	$flushGraphics$$V: function () {
		//TODO: later...
	},
	/*
	 * public int getKeyStates()
	 */
	$getKeyStates$$I: function () {
		var gameState = this.gameState;
		this.gameState = 0;
		return gameState;
	},
	superClass: 'javaRoot.$javax.$microedition.$lcdui.$Canvas'
});



};

// upstream: js/me/javax/microedition/lcdui/game/Layer.js
JS2ME_CLASS_SOURCES['js/me/javax/microedition/lcdui/game/Layer.js'] = function() {
js2me.createClass({
	x: 0,
	y: 0,
	/*
	 * public void setPosition(int x, int y)
	 */
	$setPosition$II$V: function (x, y) {
		this.x = x;
		this.y = y;
	}
});



};

// upstream: js/me/javax/microedition/lcdui/game/Sprite.js
JS2ME_CLASS_SOURCES['js/me/javax/microedition/lcdui/game/Sprite.js'] = function() {
js2me.createClass({
	$TRANS_NONEI: 0,
	$TRANS_ROT90I: 5,
	$TRANS_ROT180I: 3,
	$TRANS_ROT270I: 6,
	$TRANS_MIRRORI: 2,
	$TRANS_MIRROR_ROT90I: 7,
	$TRANS_MIRROR_ROT180I: 1,
	$TRANS_MIRROR_ROT270I:  4,
	/*
	 * public Sprite(Image image)
	 */
	_init$Ljavax_microedition_lcdui_Image_$V: function (image) {
		this.image = image;
		this.width = image.element.width;
		this.height = image.element.height;
		this.transform = 0;
	},
	/*
	 * public void setTransform(int transform)
	 */
	$setTransform$I$V: function (transform) {
		this.transform = transform;
	},
	/*
	 * 
	 */
	$getWidth$$I: function () {
		if (this.transform != this.$TRANS_ROT90I && this.transform != this.$TRANS_ROT270I &&
			this.transform != this.$TRANS_MIRROR_ROT90I && this.transform != this.$TRANS_MIRROR_ROT270I) {
			return this.width;
		} else {
			return this.height;
		}
	},
	/*
	 * public final void paint(Graphics g)
	 */
	$paint$Ljavax_microedition_lcdui_Graphics_$V: function (graphics) {
		//TODO: animation and stuff
		if (graphics == null) {
			throw new javaRoot.$java.$lang.$NullPointerException();
		}
		graphics.$drawRegion$Ljavax_microedition_lcdui_Image_IIIIIIII$V(this.image, 0, 0, this.width, this.height,
			this.transform, this.x, this.y, 0);
	},
	superClass: 'javaRoot.$javax.$microedition.$lcdui.$game.$Layer'
});



};

// upstream: js/me/javax/microedition/lcdui/game/TiledLayer.js
JS2ME_CLASS_SOURCES['js/me/javax/microedition/lcdui/game/TiledLayer.js'] = function() {
js2me.createClass({
	/*
	 * public TiledLayer(int columns, int rows, Image image, int tileWidth, int tileHeight)
	 */
	_init$IILjavax_microedition_lcdui_Image_II$V: function (columns, rows, image, tileWidth, tileHeight) {
		if (image == null) {
			throw new javaRoot.$java.$lang.$NullPointerException();
		}
		if (columns < 1 || rows < 1 || tileWidth < 1 || tileHeight < 1 || (image.element.width / tileWidth) % 1 != 0 ||
			(image.element.height / tileHeight) % 1 != 0) {
			throw new javaRoot.$java.$lang.$IllegalArgumentException();
		}
		this.columns = columns;
		this.rows = rows;
		this.image = image;
		this.tileWidth = tileWidth;
		this.tileHeight = tileHeight;
		this.tileColumns = (image.element.width / tileWidth);
		this.tilesCount = (image.element.width / tileWidth) * (image.element.height / tileHeight);
		this.map = [];
		for (var i = 0; i < columns; i++) {
			this.map[i] = [];
			for (var j = 0; j < rows; j++) {
				this.map[i][j] = 0;
			}
		}
	},
	/*
	 * public void setCell(int col, int row, int tileIndex)
	 */
	$setCell$III$V: function (column, row, index) {
		if (column >= this.columns || row >= this.rows || index > this.tilesCount) {
			throw new javaRoot.$java.$lang.$IndexOutOfBoundsException();
		}
		this.map[column][row] = index;
	},
	/*
	 * public final void paint(Graphics g)
	 */
	$paint$Ljavax_microedition_lcdui_Graphics_$V: function (graphics) {
		for (var i = 0; i < this.columns; i++) {
			for (var j = 0; j < this.rows; j++) {
				var index = this.map[i][j];
				if (index > 0) {
					index--;
					var sx = (index % this.tileColumns) * this.tileWidth;
					var sy = Math.floor(index / this.tileColumns) * this.tileHeight;
					var dx = this.x + i * this.tileWidth;
					var dy = this.y + j * this.tileHeight;
					graphics.$drawRegion$Ljavax_microedition_lcdui_Image_IIIIIIII$V(this.image, sx, sy, this.tileWidth,
						this.tileHeight, 0, dx, dy, 0);
				}
			}
		}
	},
	superClass: 'javaRoot.$javax.$microedition.$lcdui.$game.$Layer'
});



};

// upstream: js/me/javax/microedition/m3g/Appearance.js
JS2ME_CLASS_SOURCES['js/me/javax/microedition/m3g/Appearance.js'] = function() {
js2me.createClass({
});


};

// upstream: js/me/javax/microedition/m3g/Background.js
JS2ME_CLASS_SOURCES['js/me/javax/microedition/m3g/Background.js'] = function() {
js2me.createClass({
});


};

// upstream: js/me/javax/microedition/m3g/Camera.js
JS2ME_CLASS_SOURCES['js/me/javax/microedition/m3g/Camera.js'] = function() {
js2me.createClass({
});


};

// upstream: js/me/javax/microedition/m3g/Graphics3D.js
JS2ME_CLASS_SOURCES['js/me/javax/microedition/m3g/Graphics3D.js'] = function() {
js2me.createClass({
	/*
	 * 
	 */
	$getProperties$$Ljava_util_Hashtable_: function () {
		return new javaRoot.$java.$util.$Hashtable();
	},
	require: ['javaRoot.$java.$util.$Hashtable']
});


};

// upstream: js/me/javax/microedition/m3g/Image2D.js
JS2ME_CLASS_SOURCES['js/me/javax/microedition/m3g/Image2D.js'] = function() {
js2me.createClass({
});


};

// upstream: js/me/javax/microedition/m3g/Light.js
JS2ME_CLASS_SOURCES['js/me/javax/microedition/m3g/Light.js'] = function() {
js2me.createClass({
});


};

// upstream: js/me/javax/microedition/m3g/Loader.js
JS2ME_CLASS_SOURCES['js/me/javax/microedition/m3g/Loader.js'] = function() {
js2me.createClass({
});


};

// upstream: js/me/javax/microedition/m3g/Material.js
JS2ME_CLASS_SOURCES['js/me/javax/microedition/m3g/Material.js'] = function() {
js2me.createClass({
});


};

// upstream: js/me/javax/microedition/m3g/Mesh.js
JS2ME_CLASS_SOURCES['js/me/javax/microedition/m3g/Mesh.js'] = function() {
js2me.createClass({
});


};

// upstream: js/me/javax/microedition/m3g/Texture2D.js
JS2ME_CLASS_SOURCES['js/me/javax/microedition/m3g/Texture2D.js'] = function() {
js2me.createClass({
});


};

// upstream: js/me/javax/microedition/m3g/Transform.js
JS2ME_CLASS_SOURCES['js/me/javax/microedition/m3g/Transform.js'] = function() {
js2me.createClass({
});


};

// upstream: js/me/javax/microedition/m3g/TriangleStripArray.js
JS2ME_CLASS_SOURCES['js/me/javax/microedition/m3g/TriangleStripArray.js'] = function() {
js2me.createClass({
});


};

// upstream: js/me/javax/microedition/m3g/VertexArray.js
JS2ME_CLASS_SOURCES['js/me/javax/microedition/m3g/VertexArray.js'] = function() {
js2me.createClass({
});


};

// upstream: js/me/javax/microedition/m3g/VertexBuffer.js
JS2ME_CLASS_SOURCES['js/me/javax/microedition/m3g/VertexBuffer.js'] = function() {
js2me.createClass({
});


};

// upstream: js/me/javax/microedition/m3g/World.js
JS2ME_CLASS_SOURCES['js/me/javax/microedition/m3g/World.js'] = function() {
js2me.createClass({
});


};

// upstream: js/me/javax/microedition/media/Control.js
JS2ME_CLASS_SOURCES['js/me/javax/microedition/media/Control.js'] = function() {
js2me.createInterface({
	package: 'javaRoot.$javax.$microedition.$media',
	name: '$Control'
});



};

// upstream: js/me/javax/microedition/media/Controllable.js
JS2ME_CLASS_SOURCES['js/me/javax/microedition/media/Controllable.js'] = function() {
js2me.createInterface({
	package: 'javaRoot.$javax.$microedition.$media',
	name: '$Controllable'
});



};

// upstream: js/me/javax/microedition/media/Manager.js
JS2ME_CLASS_SOURCES['js/me/javax/microedition/media/Manager.js'] = function() {
js2me.createClass({
	/*
	 * 
	 */
	$createPlayer$Ljava_io_InputStream_Ljava_lang_String_$Ljavax_microedition_media_Player_: js2me.markUnsafe(function(stream, mime) {
		if (stream == null) {
			throw new javaRoot.$java.$lang.$IllegalArgumentException();
		}
		return new javaRoot.$javax.$microedition.$media.$PlayerImpl(stream, mime.text);
	}),
	require: ['javaRoot.$javax.$microedition.$media.$PlayerImpl']
});
	



};

// upstream: js/me/javax/microedition/media/MediaException.js
JS2ME_CLASS_SOURCES['js/me/javax/microedition/media/MediaException.js'] = function() {
js2me.createClass({
	superClass: 'javaRoot.$java.$lang.$Exception'
});
	



};

// upstream: js/me/javax/microedition/media/Player.js
JS2ME_CLASS_SOURCES['js/me/javax/microedition/media/Player.js'] = function() {
js2me.createClass({
});
	



};

// upstream: js/me/javax/microedition/media/PlayerImpl.js
JS2ME_CLASS_SOURCES['js/me/javax/microedition/media/PlayerImpl.js'] = function() {
js2me.createClass({
	construct: function (stream, mime) {
		this.listeners = [];
		this.state = this.$UNREALIZEDI;
		this.countLoop = 1;
		this.repeated = 0;
		var data = stream.getBytes();
		this.element = document.createElement('audio');
		//this.element.style.display = 'none';
		document.body.appendChild(this.element);
		this.control = new javaRoot.$javax.$microedition.$media.$control.$VolumeControlImpl(this);
		var player = this;
		if (mime == 'audio/x-wav') {
			this.element.addEventListener('canplaythrough', function () {
				js2me.restoreThread(threadId);
			});
			this.element.addEventListener('ended', function() { 
			   player.repeated++;
			   if (player.repeated < player.countLoop) {
				   player.element.play();
			   }
			});
			this.element.src = js2me.bytesToDataURI(data, 0, data.length, mime);
			//console.log(dataURI);
			js2me.isThreadSuspended = true;
			var threadId = js2me.currentThread;
			
			js2me.restoreStack[threadId] = [function () {
				return player;
			}];
		} else {
			console.log('Unsupported sound format: ' + mime);
		}
	},
	$CLOSEDI: 0,
	$UNREALIZEDI: 100,
	$REALIZEDI: 100,
	$PREFETCHEDI: 300,
	$STARTEDI: 400,
	/*
	 * 
	 */
	$addPlayerListener$Ljavax_microedition_media_PlayerListener_$V: function (listener) {
		this.listeners.push(listener);
		console.log('Player listener: ' + listener.className);
	},
	/*
	 * 
	 */
	$prefetch$$V: function () {
		if (this.state == this.$CLOSEDI) {
			throw new javaRoot.$java.$lang.$IllegalStateException();
		}
		this.state = this.$PREFETCHEDI;
	},
	/*
	 * 
	 */
	$realize$$V: function () {
		if (this.state == this.$CLOSEDI) {
			throw new javaRoot.$java.$lang.$IllegalStateException();
		}
		if (this.state == this.$UNREALIZEDI) {
			this.state = this.$PREFETCHEDI;
		}
	},
	/*
	 * 
	 */
	$setLoopCount$I$V: function (countLoop) {
		if (this.state == this.$CLOSEDI || this.state == this.$STAREDI) {
			throw new javaRoot.$java.$lang.$IllegalStateException();
		}
		if (countLoop == 0) {
			throw new javaRoot.$java.$lang.$IllegalArgumentException();
		}
		this.countLoop = countLoop;
		this.element.loop = countLoop == -1;
	},
	/*
	 * 
	 */
	$getControl$Ljava_lang_String_$Ljavax_microedition_media_Control_: function () {
		return this.control;
	},
	/*
	 * 
	 */
	$start$$V: function () {
		if (this.state == this.$CLOSEDI) {
			throw new javaRoot.$java.$lang.$IllegalStateException();
		}
		this.state = this.$STARTEDI;
		this.repeated = 0;
		this.element.play();
	},
	/*
	 * 
	 */
	$getState$$I: function () {
		return this.state;
	},
	/*
	 * 
	 */
	$stop$$V: function () {
		if (this.state == this.$CLOSEDI) {
			throw new javaRoot.$java.$lang.$IllegalStateException();
		}
		this.state = this.$PREFETCHEDI;
		this.element.pause();
	},
	sendEvent: function () {
		//TODO
	},
	/*
	 * 
	 */
	$setMediaTime$J$J: function (time) {
		//TODO
		return time;
	},
	/*
	 * 
	 */
	$close$$V: function () {
		this.state = this.$CLOSEDI;
	},
	/*
	 * 
	 */
	$deallocate$$V: function () {
		if (this.state == this.$CLOSEDI) {
			throw new javaRoot.$java.$lang.$IllegalStateException();
		}
		this.element.pause();
	},
	interfaces: ['javaRoot.$javax.$microedition.$media.$Player'],
	require: ['javaRoot.$javax.$microedition.$media.$control.$VolumeControlImpl']
});
	



};

// upstream: js/me/javax/microedition/media/PlayerListener.js
JS2ME_CLASS_SOURCES['js/me/javax/microedition/media/PlayerListener.js'] = function() {
js2me.createInterface({
	package: 'javaRoot.$javax.$microedition.$media',
	name: '$PlayerListener'
});



};

// upstream: js/me/javax/microedition/media/control/MIDIControl.js
JS2ME_CLASS_SOURCES['js/me/javax/microedition/media/control/MIDIControl.js'] = function() {
js2me.createInterface({
	superClass: 'javaRoot.$javax.$microedition.$media.$Control'
});



};

// upstream: js/me/javax/microedition/media/control/VolumeControl.js
JS2ME_CLASS_SOURCES['js/me/javax/microedition/media/control/VolumeControl.js'] = function() {
js2me.createInterface({
	superClass: 'javaRoot.$javax.$microedition.$media.$Control',
	package: 'javaRoot.$javax.$microedition.$media.$control',
	name: '$VolumeControl'
});



};

// upstream: js/me/javax/microedition/media/control/VolumeControlImpl.js
JS2ME_CLASS_SOURCES['js/me/javax/microedition/media/control/VolumeControlImpl.js'] = function() {
js2me.createClass({
	construct: function (player) {
		this.player = player;
	},
	/*
	 * 
	 */
	$setLevel$I$I: function (volume) {
		if (volume < 0) {
			volume = 0;
		}
		if (volume > 100) {
			volume = 100;
		}
		this.player.element.volume = volume / 100;
		this.player.sendEvent('VOLUME_CHANGED', volume);
		return volume;
	},
	interfaces: ['javaRoot.$javax.$microedition.$media.$control.$VolumeControl']
});



};

// upstream: js/me/javax/microedition/midlet/MIDlet.js
JS2ME_CLASS_SOURCES['js/me/javax/microedition/midlet/MIDlet.js'] = function() {
js2me.createClass({
	/*
	 * public final void notifyDestroyed()
	 */
	$notifyDestroyed$$V: function () {
		//TODO
		console.log('EXIT');
		location.reload();
	},
	/*
	 * protected MIDlet()
	 */
	_init$$V: function () {
	},
	/*
	 * public final String getAppProperty(String key)
	 */
	$getAppProperty$Ljava_lang_String_$Ljava_lang_String_: function (name) {
		var property = js2me.manifest[name.text.toLowerCase()];
		if (property != null) {
			return new javaRoot.$java.$lang.$String(property);
		}
		return null;
	}
});



};

// upstream: js/me/javax/microedition/midlet/MIDletStateChangeException.js
JS2ME_CLASS_SOURCES['js/me/javax/microedition/midlet/MIDletStateChangeException.js'] = function() {
js2me.createClass({
	superClass: 'javaRoot.$java.$lang.$Exception',
	name: '$MIDletStateChangeException',
	package: 'javaRoot.$javax.$microedition.$midlet'
});


};

// upstream: js/me/javax/microedition/pki/Certificate.js
JS2ME_CLASS_SOURCES['js/me/javax/microedition/pki/Certificate.js'] = function() {
js2me.createClass({
});


};

// upstream: js/me/javax/microedition/pki/CertificateException.js
JS2ME_CLASS_SOURCES['js/me/javax/microedition/pki/CertificateException.js'] = function() {
js2me.createClass({
	superClass: 'javaRoot.$java.$lang.$Exception'
});


};

// upstream: js/me/javax/microedition/rms/InvalidRecordIDException.js
JS2ME_CLASS_SOURCES['js/me/javax/microedition/rms/InvalidRecordIDException.js'] = function() {
js2me.createClass({
	superClass: 'javaRoot.$javax.$microedition.$rms.$RecordStoreException',
	package: 'javaRoot.$javax.$microedition.$rms',
	name: '$InvalidRecordIDException'
});


};

// upstream: js/me/javax/microedition/rms/RecordComparator.js
JS2ME_CLASS_SOURCES['js/me/javax/microedition/rms/RecordComparator.js'] = function() {
js2me.createInterface({
	package: 'javaRoot.$javax.$microedition.$rms',
	name: '$RecordComparator'
});


};

// upstream: js/me/javax/microedition/rms/RecordEnumeration.js
JS2ME_CLASS_SOURCES['js/me/javax/microedition/rms/RecordEnumeration.js'] = function() {
js2me.createInterface({
	package: 'javaRoot.$javax.$microedition.$rms',
	name: '$RecordEnumeration'
});


};

// upstream: js/me/javax/microedition/rms/RecordEnumerationImpl.js
JS2ME_CLASS_SOURCES['js/me/javax/microedition/rms/RecordEnumerationImpl.js'] = function() {
js2me.createClass({
	construct: function (store) {
		this.store = store;
		this.result = [];
		for (var i = 1; i <= this.store.$getNumRecords$$I(); i++) {
			try {
				this.result.push({
					id: i,
					data: this.store.$getRecord$I$_B(i)
				});
			} catch (e) {
			}
		}
		this.position = 0;
	},
	/*
	 * 
	 */
	$destroy$$V: function () {
		this.destroyed = true;
	},
	/*
	 * 
	 */
	$hasNextElement$$Z: function () {
		if (this.destroyed) {
			throw new javaRoot.$java.$lang.$IllegalStateException();
		}
		if (this.position < this.result.length) {
			return 1;
		} else {
			return 0;
		}
	},
	/*
	 * 
	 */
	$nextRecord$$_B: function () {
		if (this.destroyed) {
			throw new javaRoot.$java.$lang.$IllegalStateException();
		}
		if (this.position >= this.result.length) {
			throw new javaRoot.$javax.$microedition.$rms.InvalidRecordIDException();
		}
		return this.result[this.position++].data;
	},
	/*
	 * 
	 */
	$nextRecordId$$I: function () {
		if (this.destroyed) {
			throw new javaRoot.$java.$lang.$IllegalStateException();
		}
		if (this.position >= this.result.length) {
			throw new javaRoot.$javax.$microedition.$rms.InvalidRecordIDException();
		}
		return this.result[this.position++].id;
	},
	/*
	 * 
	 */
	$numRecords$$I: function () {
		if (this.destroyed) {
			throw new javaRoot.$java.$lang.$IllegalStateException();
		}
		return this.result.length;
	},
	/*
	 * 
	 */
	$reset$$V: function () {
		if (this.destroyed) {
			throw new javaRoot.$java.$lang.$IllegalStateException();
		}
		this.position = 0;
	},
	interfaces: ['javaRoot.$javax.$microedition.$rms.$RecordEnumeration']
});


};

// upstream: js/me/javax/microedition/rms/RecordFilter.js
JS2ME_CLASS_SOURCES['js/me/javax/microedition/rms/RecordFilter.js'] = function() {
js2me.createInterface({
});



};

// upstream: js/me/javax/microedition/rms/RecordStore.js
JS2ME_CLASS_SOURCES['js/me/javax/microedition/rms/RecordStore.js'] = function() {
js2me.createClass({
	construct: function(storageName) {
		this.storageName = storageName;
	},
	/*
	 * 
	 */
	$openRecordStore$Ljava_lang_String_Z$Ljavax_microedition_rms_RecordStore_: function (recordStoreName, createIfNecessary) {
		var storageName = this.getStorageName(recordStoreName);
		if (js2me.rmsStorage.getItem(storageName)) {
			return new javaRoot.$javax.$microedition.$rms.$RecordStore(storageName);
		} else {
			if (createIfNecessary) {
				js2me.rmsStorage.setItem(storageName, '0');
				js2me.rmsStorage.setItem(storageName + 'size', 0);
				js2me.rmsStorage.setItem(storageName + 'version', 0)
				js2me.rmsStorage.setItem(storageName + 'lastModified', 0);
				return new javaRoot.$javax.$microedition.$rms.$RecordStore(storageName);
			} else {
				throw new javaRoot.$javax.$microedition.$rms.$RecordStoreNotFoundException();
			}
		}
		
	},
	/*
	 * 
	 */
	$deleteRecord$I$V: function () {
		throw new javaRoot.$javax.$microedition.$rms.$RecordStoreException('deleteRecord is not supported by this engine');
		this.increaseVersion();
	},
	/*
	 * 
	 */
	$getNumRecords$$I : function () {
		return parseInt(js2me.rmsStorage.getItem(this.storageName + 'size'));
	},
	/*
	 * 
	 */
	$getLastModified$$J: function () {
		var time = parseInt(js2me.rmsStorage.getItem(this.storageName + 'lastModified'));
		return  {hi: Math.floor(time / 0x100000000), lo: time % 0x100000000};
	},
	/*
	 * public int getVersion() throws RecordStoreNotOpenException
	 */
	$getVersion$$I: function () {
		return parseInt(js2me.rmsStorage.getItem(this.storageName + 'version'));
	},
	/*
	 * public int addRecord(byte[] data, int offset, int numBytes) throws RecordStoreNotOpenException, RecordStoreException, RecordStoreFullException
	 */
	$addRecord$_BII$I: function (data, offset, numBytes) {
		var id = parseInt(js2me.rmsStorage.getItem(this.storageName + 'size')) + 1;
		js2me.rmsStorage.setItem(this.storageName + 'size', id);
		this.$setRecord$I_BII$V(id, data, offset, numBytes);
		return id;
	},
	/*
	 * 
	 */
	$getNextRecordID$$I: function () {
		return parseInt(js2me.rmsStorage.getItem(this.storageName + 'size')) + 1;
	},
	/*
	 * public byte[] getRecord(int recordId) throws RecordStoreNotOpenException, InvalidRecordIDException, RecordStoreException
	 */
	$getRecord$I$_B: function (id) {
		try {
			var array = js2me.rmsStorage.getItem(this.storageName + id).split(',');
		} catch (e) {
			throw new javaRoot.$javax.$microedition.$rms.$InvalidRecordIDException();
		}
		var result = [];
		if (array[0] === '') {
			return result;
		}
		for (var i = 0; i < array.length; i++) {
			result[i] = parseInt(array[i]);
		}
		return result;
	},
	/*
	 * public int getRecord(int recordId, byte[] buffer, int offset) throws RecordStoreNotOpenException, InvalidRecordIDException, RecordStoreException
	 */
	$getRecord$I_BI$I: function (id, buffer, offset) {
		var array = this.$getRecord$I$_B(id);
		if (array.length > buffer.length - offset) {
			throw new javaRoot.$java.$lang.$ArrayIndexOutOfBoundsException();
		}
		for (var i = 0; i < array.length; i++) {
			buffer[offset + i] = array[i];
		}
		return array.length;
	},
	/*
	 * public int getRecordSize(int recordId) throws RecordStoreNotOpenException, InvalidRecordIDException, RecordStoreException
	 */
	$getRecordSize$I$I: function (id) {
		return this.$getRecord$I$_B(id).length;
	},
	/*
	 * 
	 */
	$enumerateRecords$Ljavax_microedition_rms_RecordFilter_Ljavax_microedition_rms_RecordComparator_Z$Ljavax_microedition_rms_RecordEnumeration_: function(filter, comparator, keepUpdated) {
		if (filter || comparator || keepUpdated) {
			throw new Error('RecordStore: filter and comparator not supported');
		}
		var enumeration = new javaRoot.$javax.$microedition.$rms.$RecordEnumerationImpl(this);
		return enumeration;
	},
	/*
	 * public int getSizeAvailable() throws RecordStoreNotOpenException
	 */
	$getSizeAvailable$$I: function () {
		if (this.isClosed) {
			throw new javaRoot.$javax.$microedition.$rms.$RecordStoreNotOpenException();
		}
		return this.updateSize(0);
	},
	/*
	 * 
	 */
	$closeRecordStore$$V: function () {
		this.isClosed = true;
	},
	/*
	 * public static String[] listRecordStores()
	 */
	$listRecordStores$$_Ljava_lang_String_: function () {
		var vendorName = js2me.manifest['midlet-vendor'];
		var suiteName = js2me.manifest['midlet-name'];
		var storagePrefix = vendorName + '/' + suiteName + '/';
		var result = [];
		for (var recordName in js2me.rmsStorage) {
			if (recordName.indexOf(storagePrefix) != -1 && recordName.indexOf('/size') != -1) {
				var storageName = recordName.replace(storagePrefix, '').replace('/size', '');
				result.push(new javaRoot.$java.$lang.$String(storageName));
			}
		}
	},
	/*
	 * 
	 */
	$deleteRecordStore$Ljava_lang_String_$V: function (recordStoreName) {
		var storageName = this.getStorageName(recordStoreName);
		var size = js2me.rmsStorage.getItem(storageName + 'size')
		js2me.rmsStorage.removeItem(storageName);
		js2me.rmsStorage.removeItem(storageName + 'size');
		js2me.rmsStorage.removeItem(storageName + 'lastModified');
		js2me.rmsStorage.removeItem(storageName + 'version');
		for (var i = 1; i <= size; i++) {
			js2me.rmsStorage.removeItem(storageName + i);
		}
	},
	/*
	 * public void setRecord(int recordId, byte[] newData, int offset, int numBytes) throws RecordStoreNotOpenException, InvalidRecordIDException, RecordStoreException, RecordStoreFullException
	 */
	$setRecord$I_BII$V: function (id, data, offset, numBytes) {
		if (this.isClosed) {
			throw new javaRoot.$javax.$microedition.$rms.$RecordStoreNotOpenException();
		}
		if (id > parseInt(js2me.rmsStorage.getItem(this.storageName + 'size'))) {
			throw new javaRoot.$javax.$microedition.$rms.$InvalidRecordIDException();
		}
		var str = '';
		if (data) {
			str = data.slice(offset, offset + numBytes).toString();
		}
		var change = str.length;
		if (js2me.rmsStorage[this.storageName + id]) {
			change -= js2me.rmsStorage[this.storageName + id].length;
		}
		if (this.updateSize(change) < 0) {
			throw new javaRoot.$javax.$microedition.$rms.$RecordStoreFullException();
		}
		js2me.rmsStorage.setItem(this.storageName + id, str);
		js2me.rmsStorage.setItem(this.storageName + 'lastModified', Date.now());
		this.increaseVersion();
		
	},
	getStorageName: function (recordStoreName) {
		var vendorName = js2me.manifest['midlet-vendor'];
		var suiteName = js2me.manifest['midlet-name'];
		return vendorName + '/' + suiteName + '/' + recordStoreName.text + '/';
	},
	increaseVersion: function () {
		var version = parseInt(js2me.rmsStorage.getItem(this.storageName + 'version')) + 1;
		js2me.rmsStorage.setItem(this.storageName + 'version', version);
	},
	updateSize: function (change) {
		if (js2me.rmsStorage['freeSpace'] === undefined) {
			js2me.rmsStorage['freeSpace'] = 1024 * 1024 * 1024;
		}
		return js2me.rmsStorage['freeSpace'] = parseInt(js2me.rmsStorage['freeSpace']) + change;
	},
	require: ['javaRoot.$javax.$microedition.$rms.$InvalidRecordIDException', 'javaRoot.$javax.$microedition.$rms.$RecordStoreNotFoundException', 
		'javaRoot.$javax.$microedition.$rms.$RecordEnumerationImpl']
});


};

// upstream: js/me/javax/microedition/rms/RecordStoreException.js
JS2ME_CLASS_SOURCES['js/me/javax/microedition/rms/RecordStoreException.js'] = function() {
js2me.createClass({
	superClass: 'javaRoot.$java.$lang.$Exception'
});



};

// upstream: js/me/javax/microedition/rms/RecordStoreFullException.js
JS2ME_CLASS_SOURCES['js/me/javax/microedition/rms/RecordStoreFullException.js'] = function() {
js2me.createClass({
	superClass: 'javaRoot.$java.$lang.$Exception'
});



};

// upstream: js/me/javax/microedition/rms/RecordStoreNotFoundException.js
JS2ME_CLASS_SOURCES['js/me/javax/microedition/rms/RecordStoreNotFoundException.js'] = function() {
js2me.createClass({
	superClass: 'javaRoot.$javax.$microedition.$rms.$RecordStoreException'
});



};

// upstream: js/me/javax/microedition/rms/RecordStoreNotOpenException.js
JS2ME_CLASS_SOURCES['js/me/javax/microedition/rms/RecordStoreNotOpenException.js'] = function() {
js2me.createClass({
	superClass: 'javaRoot.$javax.$microedition.$rms.$RecordStoreException'
});



};

// upstream: js/me/javax/wireless/messaging/Message.js
JS2ME_CLASS_SOURCES['js/me/javax/wireless/messaging/Message.js'] = function() {
js2me.createInterface({
	package: 'javaRoot.$javax.$wireless.$messaging',
	name: '$Message'
});



};

// upstream: js/me/javax/wireless/messaging/MessageConnection.js
JS2ME_CLASS_SOURCES['js/me/javax/wireless/messaging/MessageConnection.js'] = function() {
js2me.createInterface({
	superClass: 'javaRoot.$javax.$microedition.$io.$Connection',
	package: 'javaRoot.$javax.$wireless.$messaging',
	name: '$MessageConnection'
});



};

// upstream: js/me/javax/wireless/messaging/TextMessage.js
JS2ME_CLASS_SOURCES['js/me/javax/wireless/messaging/TextMessage.js'] = function() {
js2me.createInterface({
	superClass: 'javaRoot.$javax.$wireless.$messaging.$Message',
	package: 'javaRoot.$javax.$wireless.$messaging',
	name: '$TextMessage'
});



};
