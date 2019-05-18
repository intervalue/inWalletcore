"use strict";

var webHelper = require('./webhelper.js');
var request = require('request');

/**
 * 向中继广播消息, 将由用户选择哪个中继发起跨链交易 重复三次失败就抛出错误
 */
function sendTransaction(httpType, url, header, data, callback) {
    //var whileCase = true;
    // var i = 0;
    // while (i < 3){
    if (httpType.toLowerCase() == 'post') {
        webHelper.httpPost(url, header, data).then(function (res) {
            callback(null, res);
        }).then(function (err) {
            callback(err, null);
        }).catch(function (err) {
            console.log(err);
            callback(err, null);
        });
        //console.log(result);
    } else {
        webHelper.httpGet(url, header).then(function (err, res) {
            callback(null, res);
            return;
        }).then(function (err) {
            callback(err);
            return;
        }).catch(function (err) {
            callback(err, null);
        });
    }
}

function get(url, data, callback) {
    // const options = {
    //     url: url,
    //     headers: {
    //         "Content-Type": "application/json",
    //     },
    //     method: 'GET',
    //     json: true
    // };
    // request(options, callback);

    webHelper.httpGet(url, null, callback);
}

function post(url, data, header, callback) {
    var options = {
        url: url,
        headers: {
            "Content-Type": "application/json;"
        },
        body: data,
        method: 'POST',
        json: true,
        timeout: 1500
    };

    request(options, callback);
}

module.exports.sendTransaction = sendTransaction;
module.exports.get = get;
module.exports.post = post;