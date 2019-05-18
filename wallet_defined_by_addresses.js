/*jslint node: true */
"use strict";

var db = require('./db.js');
var _ = require('lodash');
var device = require('./device.js');



function readAllControlAddresses(conn, arrAddresses, handleLists){
	conn = conn || db;
	conn.query(
		"SELECT DISTINCT address, shared_address_signing_paths.device_address, (correspondent_devices.device_address IS NOT NULL) AS have_correspondent \n\
		FROM shared_address_signing_paths LEFT JOIN correspondent_devices USING(device_address) WHERE shared_address IN(?)", 
		[arrAddresses], 
		function(rows){
			if (rows.length === 0)
				return handleLists([], []);
			var arrControlAddresses = rows.map(function(row){ return row.address; });
			var arrControlDeviceAddresses = rows.filter(function(row){ return row.have_correspondent; }).map(function(row){ return row.device_address; });
			readAllControlAddresses(conn, arrControlAddresses, function(arrControlAddresses2, arrControlDeviceAddresses2){
				handleLists(_.union(arrControlAddresses, arrControlAddresses2), _.union(arrControlDeviceAddresses, arrControlDeviceAddresses2));
			});
		}
	);
}


function readSharedAddressCosigners(shared_address, handleCosigners){
	db.query(
		"SELECT DISTINCT shared_address_signing_paths.device_address, name, "+db.getUnixTimestamp("shared_addresses.creation_date")+" AS creation_ts \n\
		FROM shared_address_signing_paths \n\
		JOIN shared_addresses USING(shared_address) \n\
		LEFT JOIN correspondent_devices USING(device_address) \n\
		WHERE shared_address=? AND device_address!=?",
		[shared_address, device.getMyDeviceAddress()],
		function(rows){
			if (rows.length === 0)
				throw Error("no cosigners found for shared address "+shared_address);
			handleCosigners(rows);
		}
	);
}

function determineIfHasMerkle(shared_address, handleResult){
	db.query(
		"SELECT 1 FROM shared_address_signing_paths WHERE shared_address=? AND device_address=? AND address=''",
		[shared_address, device.getMyDeviceAddress()],
		function(rows){
			handleResult(rows.length > 0);
		}
	);
}




exports.readSharedAddressCosigners = readSharedAddressCosigners;
exports.determineIfHasMerkle = determineIfHasMerkle;
exports.readAllControlAddresses = readAllControlAddresses;
