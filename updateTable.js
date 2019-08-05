/*jslint node: true */
"use strict";
/**
 * @description:
 * 第一次更新sqlite数据库
 * 初始化版本号version=1
 * @author: lhp
 * @time: 2019-07-16 11:04
 */
var VERSION = 3;

var async = require('async');
var bCordova = (typeof window === 'object' && window.cordova);
console.log('bCordova:    ',bCordova)
function migrateDb(connection, onDone){
    connection.db[bCordova ? 'query' : 'all']("PRAGMA user_version", function(err, result){
        if (err)
            throw Error("PRAGMA user_version failed: "+err);
        var rows = bCordova ? result.rows : result;

        var version = rows[0].user_version;
        console.log("db version "+version+", software version "+VERSION);
        if(VERSION == version){
            return onDone();
        }
        var arrQueries = [];
        if( version < 1 || version == 18){
            connection.addQuery(arrQueries, "ALTER TABLE transactions_index ADD COLUMN sysTableIndex INTEGER  DEFAULT 0");
            connection.addQuery(arrQueries, "ALTER TABLE transactions_index ADD COLUMN sysOffset INTEGER  DEFAULT 0");
            connection.addQuery(arrQueries, "ALTER TABLE transactions ADD COLUMN tranType INTEGER  DEFAULT 1");
        }
        if(version < 2 || version == 18){
            connection.addQuery(arrQueries, "ALTER TABLE transactions ADD COLUMN executionResult CHAR ");
            connection.addQuery(arrQueries, "ALTER TABLE transactions ADD COLUMN error CHAR ");
        }
        if(version < 3 || version == 18){
            connection.addQuery(arrQueries, "ALTER TABLE transactions ADD COLUMN data TEXT ");
        }
        connection.addQuery(arrQueries, "PRAGMA user_version="+VERSION);
        async.series(arrQueries, function(){
            onDone();
        });

    });
}


exports.migrateDb = migrateDb;