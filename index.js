var serialport = require("serialport");
var promisify = require("./promisify");

var BIT_LENGTH_MS = 1;
var DEVICE_BOOT_TIME_MS = 500;

var HEADER = [1, 1, 0, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0, 1, 0];
var FOOTER = [1, 0, 1, 0, 1, 1, 0, 1];
var HOUSES = [
	[0, 1, 1, 0, 0], //A
	[0, 1, 1, 1, 0], //B
	[0, 1, 0, 0, 0], //C
	[0, 1, 0, 1, 0], //D
	[1, 0, 0, 0, 0], //E
	[1, 0, 0, 1, 0], //F
	[1, 0, 1, 0, 0], //G
	[1, 0, 1, 1, 0], //H
	[1, 1, 1, 0, 0], //I
	[1, 1, 1, 1, 0], //J
	[1, 1, 0, 0, 0], //K
	[1, 1, 0, 1, 0], //L
	[0, 0, 0, 0, 0], //M
	[0, 0, 0, 1, 0], //N
	[0, 0, 1, 0, 0], //O
	[0, 0, 1, 1, 0], //P
];
var MODULES = [
	[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], //01
	[0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0], //02
	[0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0], //03
	[0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0], //04
	[0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0], //05
	[0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0], //06
	[0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0], //07
	[0, 0, 0, 0, 1, 0, 1, 1, 0, 0, 0], //08
	[1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], //09
	[1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0], //10
	[1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0], //11
	[1, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0], //12
	[1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0], //13
	[1, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0], //14
	[1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0], //15
	[1, 0, 0, 0, 1, 0, 1, 1, 0, 0, 0], //16
];

module.exports = {
	listPorts: promisify(function (callback, errcallback) {
		serialport.list().then(function (err, ports) {
			if (err) {
				errcallback(err);
			} else {
				var ret = [];
				ports.forEach(function (port) {
					ret.push({
						comName: port.comName,
						manufacturer: port.manufacturer,
					});
				});
				callback(ret);
			}
		});
	}),
	device: function () {
		var dev = {
			sending: false,
			serialport: null,
			startTick: function (bitqueue, callback, errcallback) {
				// If we're already sending, try again soon
				if (dev.sending) {
					setTimeout(function () {
						dev.tick(bitqueue, callback, errcallback);
					}, 1000);
				} else {
					dev.tick(bitqueue, callback, errcallback);
				}
			},
			tick: function (bitqueue, callback, errcallback) {
				if (bitqueue.length > 0) {
					dev.sending = true;
					var lines;
					if (bitqueue.shift() === 1) {
						lines = { rts: true, dtr: false };
					} else {
						lines = { rts: false, dtr: true };
					}
					dev.serialport.set(lines, function (err, result) {
						if (!err) {
							setTimeout(dev.tock, BIT_LENGTH_MS, bitqueue, callback, errcallback);
						} else {
							dev.sending = false;
							errcallback(err);
						}
					});
				} else {
					//Done sending
					dev.sending = false;
					callback();
				}
			},
			tock: function (bitqueue, callback, errcallback) {
				dev.serialport.set({ rts: true, dtr: true }, function (err, result) {
					if (!err) {
						setTimeout(dev.tick, BIT_LENGTH_MS, bitqueue, callback, errcallback);
					} else {
						dev.sending = false;
						errcallback(err);
					}
				});
			},
			open: promisify(function (comName, callback, errcallback) {
				dev.close(function () {
					dev.serialport = new serialport(comName, { baudrate: 9600 }, function (err) {
						if (err) {
							errcallback(err);
						} else {
							//Give the firecracker 1/2 sec to warm up
							setTimeout(callback, DEVICE_BOOT_TIME_MS);
						}
					});
				}, errcallback);
			}),
			close: promisify(function (callback, errcallback) {
				if (dev.serialport) {
					dev.serialport.close(function (err) {
						if (!err) {
							dev.serialport = null;
							callback();
						} else {
							errcallback(err);
						}
					});
				} else {
					callback();
				}
			}),
			sendCommand: promisify(function (house, module, onoff, callback, errcallback) {
				if (HOUSES[house]) {
					if (MODULES[module]) {
						var command = HOUSES[house].concat(MODULES[module]);
						if (!onoff) command[10] = 1;
						var bits = HEADER.concat(command).concat(FOOTER);
						dev.startTick(bits, callback, errcallback);
					} else {
						errcallback("Invalid module");
					}
				} else {
					errcallback("Invalid house");
				}
			})
		};
		return dev;
	},
};
