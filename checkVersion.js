'use strict';

var webhelper = require('./webhelper');
var header = { 'Content-Type': 'application/json' };
var url = 'https://www.inve.one/inve-fast/api/versioncontrol//info/version';
var eventBus = require('./event_bus.js');

function version(oldVersion) {
    webhelper.httpGet(url, header, function (err, res) {
        if (err) {
            console.log(err);
            return;
        }
        if (res) {
            var data = JSON.parse(res).versionControl;
            if(data){
                var newVersion = data.version.substring(1);
                if (newVersion > oldVersion) eventBus.emit('new_version', data);
            }
            //eventBus.emit('new_version', data);
        }
    });
}

exports.version = version;
