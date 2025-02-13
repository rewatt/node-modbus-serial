'use strict';
var util = require('util');
var events = require('events');
var SerialPort = require("serialport").SerialPort;

var crc16 = require('./../utils/crc16');

/**
 * check if a buffer chunk can be a modbus answer
 * or modbus exception
 *
 * @param {RTUBufferedPort} modbus
 * @param {Buffer} buf the buffer to check.
 * @return {boolean} if the buffer can be an answer
 */
function checkData(modbus, buf) {
    // check buffer size
    if (buf.length != modbus._length && buf.length != 5) return false;

    // calculate crc16
    var crcIn = buf.readUInt16LE(buf.length - 2);

    // check buffer unit-id, command and crc
    return (buf[0] == modbus._id &&
        (0x7f & buf[1]) == modbus._cmd &&
        crcIn == crc16(buf.slice(0, -2)));
}

/**
 * Simulate a modbus-RTU port using buffered serial connection
 */
var RTUBufferedPort = function(path, options) {
    var modbus = this;

    // options
    if (typeof(options) == 'undefined') options = {};

    // internal buffer
    this._buffer = new Buffer(0);
    this._id = 0;
    this._cmd = 0;
    this._length = 0;

    // create the SerialPort
    this._client= new SerialPort(path, options, false);

    // register the port data event
    this._client.on('data', function(data) {
        /* add data to buffer
         */
        modbus._buffer = Buffer.concat([modbus._buffer, data]);

        /* check if buffer include a complete modbus answer
         */
        var length = modbus._length;
        var bufferLength = modbus._buffer.length ;

        // check data length
        if (bufferLength < 5 || length < 6) return;

        // loop and check length-sized buffer chunks
        for (var i = 0; i < (bufferLength - length + 1); i++) {
            // cut a length of bytes from buffer
            var _data = modbus._buffer.slice(i, i + length);

            // check if this is the data we are waiting for
            if (checkData(modbus, _data)) {
                // adjust i to end of data chunk
                i = i + length;

                // emit a data signal
                modbus.emit('data', _data);
            }
        }

        /* cut checked data from buffer
         */
        if (i) {
            modbus._buffer = modbus._buffer.slice(i);
        }
    });

    events.call(this);
};
util.inherits(RTUBufferedPort, events);

/**
 * Simulate successful port open
 */
RTUBufferedPort.prototype.open = function (callback) {
    this._client.open(callback);
};

/**
 * Simulate successful close port
 */
RTUBufferedPort.prototype.close = function (callback) {
    this._client.close(callback);
};

/**
 * Check if port is open
 */
RTUBufferedPort.prototype.isOpen = function() {
    return this._client.isOpen();
};

/**
 * Send data to a modbus slave
 */
RTUBufferedPort.prototype.write = function (data) {
    // check data length
    if (data.length < 6) {
        // raise an error ?
        return;
    }

    // remember current unit and command
    this._id = data[0];
    this._cmd = data[1];

    // calculate expected answer length
    switch (this._cmd) {
        case 1:
        case 2:
            var length = data.readUInt16BE(4);
            this._length = 3 + parseInt((length - 1) / 8 + 1) + 2;
            break;
        case 3:
        case 4:
            var length = data.readUInt16BE(4);
            this._length = 3 + 2 * length + 2;
            break;
        case 5:
        case 6:
        case 15:
        case 16:
            this._length = 6 + 2;
            break;
        default:
            // raise and error ?
            this._length = 0;
            break;
    }

    // send buffer to slave
    this._client.write(data);
};

module.exports = RTUBufferedPort;
