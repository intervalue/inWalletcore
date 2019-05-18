/*jslint node: true */
"use strict";
var db = require('./db.js');

function store(correspondent_address, message, is_incoming, type) {
    var type = type || 'text';
    let msg = message.substring(-1,44);
    db.query("SELECT id FROM chat_messages WHERE message like ?",['%'+msg+'%'],function (rows) {
        if (rows != undefined && rows.length == 1 && msg.length == 44 && type == 'transaction') {
            db.query("UPDATE chat_messages set message =? WHERE id = ?",[message,rows[0].id]);
        }else {
            db.query("INSERT INTO chat_messages ('correspondent_address', 'message', 'is_incoming', 'type') VALUES (?, ?, ?, ?)", [correspondent_address, message, is_incoming, type]);
        }
    })

}

function load(correspondent_address, up_to_id, limit, cb) {
    db.query("SELECT id, message, creation_date, is_incoming, type FROM chat_messages \n\
		WHERE correspondent_address=? AND id < "+up_to_id+" ORDER BY id DESC LIMIT ?", [correspondent_address, limit], function(rows){
        cb(rows);
    });
}

function purge(correspondent_address) {
    db.query("DELETE FROM chat_messages \n\
		WHERE correspondent_address=?", [correspondent_address]);
}

exports.store = store;
exports.load = load;
exports.purge = purge;