"use strict"



var bitcoin_rpc = require('node-bitcoin-rpc');
const BigNumber = require('bignumber.js');
const btc_helper = require('./btc_helper');
var _ = require("lodash");
const { platType_static, importType_static } = require('./static_enum');
var webHelper = require('../sendTransactionToNode');
var db = require('../db.js');
var config = require('../conf.js');
var into = false;
var btcSearch = false;
var request = require('request');

const RPC_USERNAME = 'test';
const RPC_PASSWORD = 'test';
const RPC_HOST = config.URL.BTC_RPC;
const RPC_PORT = 8332;

bitcoin_rpc.init(RPC_HOST, RPC_PORT, RPC_USERNAME, RPC_PASSWORD);

/**
 * 获取可用余额
 * @param address
 * @param walletName
 * @param callbackFun
 */
function getBalance(address, walletName, callbackFun){
    getUnSpent(address, walletName, function(err, res){
        if (err !== null){
            callbackFun(err, null);
        } else {
            let amount = new BigNumber(0);
            let unSpentList = JSON.parse(res);
            let length = unSpentList.length;
            for (let i=0; i<length; i++){
                amount = amount.plus(new BigNumber(JSON.parse(JSON.stringify(unSpentList[i]))['amount']));
            }
            callbackFun(null, amount.toString());
        }
    });
}

/**
 * 获取未消费的utxo
 * @param address
 * @param walletName
 * @param callbackFun
 */
function getUnSpent(address, walletName, callbackFun, rescan){
    // importAddress(address, walletName, function(err, result){
    //     if (err !== null){
    //         callbackFun(err, null);
    //         return;
    //     } else {
    listUnSpent(address, function (err, res) {
        if (err !== null) {
            callbackFun(err, null);
            return;
        } else {
            /**
             * 增加排序 减少手续费
             */
            if (res.result != undefined)
                res = res.result;
            res = selectionSort(res);
            callbackFun(null, JSON.stringify(res));
            return;
        }
    });
    //     }
    // }, rescan);
}

function listUnSpent(address, callback){
    bitcoin_rpc.call('listunspent', [6, 9999999, [address], false], function(err, res){
        if (err !== null){
            callback(err);
        } else {
            if (res.result.length == 0){
                getUnspentByThird(address, callback);
                return;
            } else {
                callback(err, res);
            }
        }
    });
}


function getUnspentByThird (address, callback){
    var url = "http://"+config.URL.BTC_API+":3002/insight-api/addrs/" + address +"/utxo";
    var options = {
        method: 'get',
        url: url,
        headers: {
            'Content-Type': 'application/JSON'
        }
    };

    request(options, function (err, res, body) {
        if (err) {
            callback(err, null);
            return;
        } else {
            callback(null, JSON.parse(body));
            return;
        }
    });
}

function selectionSort(arr) {
    var len = arr.length;
    var minIndex, temp;
    for (var i = 0; i < len - 1; i++) {
        minIndex = i;
        for (var j = i + 1; j < len; j++) {
            if (arr[j].amount < arr[minIndex].amount) {     // 寻找最小的数
                minIndex = j;                 // 将最小数的索引保存
            }
        }
        temp = arr[i];
        arr[i] = arr[minIndex];
        arr[minIndex] = temp;
    }
    return arr.reverse();
}

/**
 * 导入地址
 * @param address
 * @param walletName
 * @param callbackFun
 */
function importAddress(address, walletName, callbackFun, rescan = false, now = 0){
    //if (!rescan) {

    getAddressGroup(function (err3, res3) {
        if (err3 !== null) {
            callbackFun(err3, res3);
        } else {
            let length = res3.length;
            for (let i = 0; i < length; i++) {
                if (res3[i][0][0] == address) {
                    db.query('update transactions_index set tableIndex = 1 WHERE address = ?', ['IMPORTBTC*' + address], function(result){
                        console.log('update ' + result);
                        callbackFun(null, null);
                        return;
                    });
                }
            }
            bitcoin_rpc.call('importmulti', [[{
                "scriptPubKey": {"address": address},
                "timestamp": now,
                "label": address
            }], {'rescan': rescan}], function (err, res) {
                if (err !== null) {
                    callbackFun(err, null);
                    return;
                } else {
                    callbackFun(err, res.result);
                    return;
                }
            });
        }
    });

    // } else {
    //     bitcoin_rpc.call('importmulti', [[{
    //         "scriptPubKey" : { "address": address },
    //         "timestamp" : now,
    //         "label" : address
    //     }], {'rescan': rescan}], function (err, res) {
    //         if (err !== null) {
    //             callbackFun(err, null);
    //             return;
    //         } else {
    //             callbackFun(err, res.result);
    //             return;
    //         }
    //     });
    // }

}

function importMultiAddress(address, now = 0, callback){
    bitcoin_rpc.call('importmulti', [[{
        "scriptPubKey" : { "address": address },
        "timestamp" : now,
        "label" : address
    }], {'rescan': true}], function (err, res) {
        if (err !== null) {
            callback(err, null);
            return false;
        } else {
            callback(null, true);
            return true;
        }
    });
}

/**
 * 查询地址是否导入
 * TODO 可以把结果存起来 而不是每次去查
 * @param callbackFun
 */
function getAddressGroup(callbackFun){
    bitcoin_rpc.call('listaddressgroupings', [], function(err, res){
        if (err !== null){
            callbackFun(err, null);
            return;
        } else {
            callbackFun(err, res.result);
            return;
        }
    })
}

var into = false;
function getTransactionsFromRpc(address, callbackFun){
    if (into){
        return;
    }
    into = true;
    try {
        listTransactions(address,
            // bitcoin_rpc.call('listtransactions', ['*', 10000, 0, true],
            function (err, res, lengthFull) {
                btcSearch = false;
                if (err !== null && err != undefined) {
                    into = false;
                    callbackFun(err, null);
                    return;
                } else {
                    into = false;
                    callbackFun(err, res, lengthFull);
                    res = null;
                    return;
                }
            });
    } catch (err){
        console.log(err);
        callbackFun(err);
    } finally {
        into = false;
    }
}

/*
 * 获取某个地址的交易记录
 */
function getTransactions(address, callbackFun, rescan, now){
    // if (into){
    //     return;
    // }
    // into = true;
    // try {
    //     importAddress(address, address, function(importErr, importres){
    //         if (importErr !== null){
    //             callbackFun(importErr);
    //             return;
    //         }
    //         listTransactions(address,
    //             // bitcoin_rpc.call('listtransactions', ['*', 10000, 0, true],
    //             function (err, res, lengthFull) {
    //                 btcSearch = false;
    //                 if (err !== null && err != undefined) {
    //                     into = false;
    //                     callbackFun(err, null);
    //                     return;
    //                 } else {
    //                     into = false;
    //                     callbackFun(err, res, lengthFull);
    //                     res = null;
    //                     return;
    //                 }
    //             });
    //     }, rescan, now);
    // } catch (err){
    //     console.log(err);
    //     callbackFun(err);
    // } finally {
    //     into = false;
    // }

    getIndex('BTC*' + address, function(err, page, pageNum){
        if (pageNum - page > 50)
            pageNum = page + 50;
        var url = "http://"+config.URL.BTC_API+":3002/insight-api/addrs/" + address +"/txs?from=" + page + "&to=" + pageNum;
        var options = {
            method: 'get',
            url: url,
            headers: {
                'Content-Type': 'application/JSON'
            }
        };

        request(options, function (err, res, body) {
            if (err) {
                callbackFun(err, null);
                return;
            } else {
                try {
                    body = JSON.parse(body);
                } catch (err){
                    callbackFun(null, null, address);
                    return;
                }
                callbackFun(null, body, address);
                return;
            }
        });
    });
}

function importMyAddress(address, callbackFun){
    var url = "http://"+config.URL.BTC_API+":3002/insight-api/addrs/" + address +"/txs?from=0&to=1";
    var options = {
        method: 'get',
        url: url,
        headers: {
            'Content-Type': 'application/JSON'
        }
    };
    request(options, function (err, res, body) {
        if (err) {
            callbackFun(err, null);
            return;
        } else {
            try {
                body = JSON.parse(body);
            } catch (err){
                callbackFun(null, null, address);
                return;
            }
            let num = body.totalItems;
            if (num == 0){
                importAddress(address, address, callbackFun, true, 'now');
                return;
            }
            var url2 = "http://"+config.URL.BTC_API+":3002/insight-api/addrs/" + address +"/txs?from=" + (num - 1) + "&to=" + num;
            var options2 = {
                method: 'get',
                url: url2,
                headers: {
                    'Content-Type': 'application/JSON'
                }
            };
            request(options2, function (err2, res2, body2) {
                if (err2) {
                    console.log(err2);
                } else {
                    try {
                        body2 = JSON.parse(body2);
                    } catch (err3) {
                        console.log(err3);
                    }
                    if (body2.items == undefined || body2.items.length == 0){
                        return;
                    }
                    importAddress(address, address, callbackFun, true, num == 0? 'now': body2.items[0].time - 1)
                    return;
                }
            });

        }
    });
}

function getIndex(address, callback){
    db.query('select tableIndex,offsets from transactions_index WHERE address = ?', [address], function(result) {
        try {
            if (result == undefined || result.length == 0){
                try {
                    let result = db.execute('insert into transactions_index(address, tableIndex, offsets) VALUES(?,?,?)', address, 0, 50);
                    callback(null, 0, 50);
                } catch (err){
                    callback(null, 0, 50);
                }

            } else {
                callback(null, result[0].tableIndex, result[0].offsets);
            }
        } catch(err){
            console.log(err)
            callback(null, 0, 50);
        }
    });
}

function listTransactions(address, callback) {
    if (btcSearch)
        return;
    setTimeout(function(){
        btcSearch = false;
    }, 18000);
    btcSearch = true;
    getIndex('BTC*' + address, function(sqlerr, sqlres, offset){
        let page = sqlres;
        bitcoin_rpc.call('listtransactions', ['*', 10, 0, true], function(err, res){
            if (err !== null){
                getTransactionByThird(address, function(err, res){
                    btcSearch = false;
                    callback(err, res);
                });
            } else {
                let canNext = true;
                let outStr = {};
                let output = [];
                let result = JSON.parse(JSON.stringify(res.result));
                res = null;
                let length = result.length;
                let resultObject = {};
                for (let i = 0; i < length; i++) {
                    if (result[i]['address'] == address) {
                        if (resultObject[result[i].txid] == 1) {
                            if (outStr[result[i].txid]['fee'] == undefined){
                                outStr[result[i].txid]['fee'] = result[i].fee;
                            }
                            continue;
                        }
                        if (result[i].confirmations < 8 ){
                            canNext = false;
                        }
                        resultObject[result[i].txid] = 1;
                        outStr[result[i].txid] = result[i];
                    }
                }
                _.forEach(outStr, function(key, value){
                    output.push(key);
                });
                outStr = null;
                let hashLength = 0;
                let outputLength = output.length;
                if (outputLength == 0){
                    if (length == 500 && canNext){
                        db.query('update transactions_index set tableIndex = tableIndex + 1 WHERE address = ?', ['BTC*' + address], function(result){
                            if (output.length == 0 && page != 0){
                                getTransactionByThird(address, callback);
                            } else {
                                btcSearch = false;
                                callback(err, output);
                            }
                        });
                    } else {
                        //db.query('update transactions_index set tableIndex = 0, offsets = 10000 WHERE address = ?', ['BTC*' + address], function(result) {
                        if (output.length == 0 && page != 0) {
                            getTransactionByThird(address, callback);
                        } else {
                            btcSearch = false;
                            callback(err, output, true);
                        }
                        //});
                    }
                } else {
                    for (let i=0; i<outputLength; i++){
                        var txid = output[i].txid;
                        searchHash(txid, function(err, result){
                            //console.log(err);
                            output[i].result = result;
                            output[i].choose = 1;
                            if (err){
                                //console.log(txid);
                            }
                            let isChoose = true;
                            for (let j=0; j<output.length; j++){
                                if (!output[j].choose){
                                    isChoose = false;
                                    break;
                                }
                            }
                            if (isChoose){
                                if (length == 500 && canNext){
                                    db.query('update transactions_index set tableIndex = tableIndex + 1 WHERE address = ?', ['BTC*' + address], function(result){
                                        if (output.length == 0 && page != 0){
                                            getTransactionByThird(address, callback);
                                        } else {
                                            btcSearch = false;
                                            callback(err, output);
                                        }
                                    });
                                } else {
                                    //db.query('update transactions_index set tableIndex = 0, offsets = 10000 WHERE address = ?', ['BTC*' + address], function(result) {
                                    if (output.length == 0 && page != 0) {
                                        getTransactionByThird(address, callback);
                                    } else {
                                        btcSearch = false;
                                        callback(err, output, true);
                                    }
                                    //});
                                }
                            }
                        });
                    }
                }
            }
        });
    });
}

/**
 * 第三方接口调用回调
 * @param address
 * @param callback
 */
function getTransactionByThird(address, callback){
    getIndex('BTC-' + address, function(sqlerr, sqlres){
        let page = sqlres;
        webHelper.get('https://api.blockcypher.com/v1/btc/test3/addrs/' + address + '?limit=200&after=' + page, null, function (err, data) {
            if (err !== null) {
                callback(err);
            } else {
                let tx = JSON.parse(data).txrefs;
                if (tx == undefined || data.indexOf('error') > -1){
                    callback(null, []);
                    return;
                }
                let length = tx == undefined? 0: tx.length;
                let dataList = [];
                if (length <= 0)
                    callback(null, []);
                db.query('update transactions_index set tableIndex = ? WHERE address = ?', tx[0].block_height, 'BTC-' + address, function(result){
                    for (let i = 0; i < length; i++) {
                        let hash = tx[i].tx_hash;
                        searchHash(hash, function (err, res) {
                            if (res !== null) {
                                dataList.push(res);
                                if (dataList.length == length) {
                                    callback(null, dataList);
                                }
                            }
                        });
                    }
                });
            }
        })
    });
}

/**
 * 广播交易
 * @param hash
 * @param highFee
 * @param callbackFun
 */
function sendrawtransaction(hash, highFee = false, callbackFun, address){
    bitcoin_rpc.call('sendrawtransaction', [hash, highFee], function(err, result){
        console.log(hash);
        if (err !== null){
            callbackFun(err, null);
        } else {
            callbackFun(err, result, address);
            return;
        }
    });
}

function sendTransaction (mnemonic, sendAddress, sendNum, fee, callbackFun, highFee, addressType = 0, importType = 0, segwit = true, networkType = 'testnet', justGetHash, percent){
    let privateKey;
    if (importType == importType_static.mnemonic)
        privateKey = btc_helper.getdriPriKey(mnemonic, '', segwit, addressType, networkType);
    else
        privateKey = mnemonic;
    let address = btc_helper.getAddressBynode(segwit, btc_helper.getdriPubKey(mnemonic, '', segwit, addressType, importType != importType_static.mnemonic, networkType), networkType);
    console.log('privateKey' + privateKey);
    console.log('address' + address);
    getUnSpent(address, address, function(err, res){
        if (err){
            callbackFun(err, null);
            return;
        }
        let hashObject = btc_helper.signTransaction(privateKey, segwit, address, sendAddress, sendNum, res, fee, networkType, percent);
        if (!hashObject.success){
            callbackFun(hashObject.msg);
            return;
        }
        if (justGetHash){
            callbackFun(err, hashObject, address);
            return;
        }
        sendrawtransaction(hashObject.hash, highFee, callbackFun, address);
    });
}

function searchHash (hash, callbackFun, watchOnly = true, searchIn = false){
    bitcoin_rpc.call('getrawtransaction', [hash, watchOnly], function(err, res){
        if (err !== null){
            callbackFun(err, null);
            return;
        } else {
            if (JSON.parse(JSON.stringify(res)).error != null){
                callbackFun(JSON.parse(JSON.stringify(res)).error.message);
                return;
            }
            if (searchIn) {
                callbackFun(err, res);
                return;
            }
            let vinList = res.result.vin;
            let length = vinList.length;
            let vinResult = [];
            for (let i=0; i<length; i++){
                let vin = vinList[i]
                let vinTxId = vin.txid;
                let vinIdx = vin.vout;

                searchHash(vinTxId, function(err2, res2){
                    if (err2 !== null){
                        callbackFun(err, null);
                        return;
                    } else {
                        let outPut = res2.result.vout;
                        let outLength = outPut.length;
                        for (let j=0; j<outLength; j++){
                            if (outPut[j].n == vinIdx){
                                vinResult.push({'address': outPut[j].scriptPubKey.addresses[0], 'value': outPut[j].value})
                            }
                        }
                        if (vinResult.length == length){
                            let voutResult = res.result.vout;
                            let length1 = vinResult.length;
                            let length2 = voutResult.length;
                            let inputNum = 0;
                            let outputNum = 0;
                            let amount = 0;
                            let fee = 0;
                            for (let i = 0; i<length1; i++){
                                inputNum = new BigNumber(inputNum).plus(vinResult[i].value);
                            }
                            for (let i = 0; i<length2; i++){
                                outputNum = new BigNumber(outputNum).plus(voutResult[i].value);
                            }

                            fee = new BigNumber(inputNum).minus(outputNum).toString();
                            if (length2 > 1 && voutResult[length2 - 1] == vinResult[0].address){
                                amount = new BigNumber(inputNum).minus(fee).minus(voutResult[length2 - 1].value).toString();
                            } else {
                                amount = outputNum.toString();
                            }

                            let result = {'txid': hash, 'hash': hash, 'vout': res.result.vout, time: res.result.time, 'fee': fee, 'amount': amount, 'vin': vinResult, 'confirmations': res.result.confirmations, 'blockHash': res.result.blockhash};
                            callbackFun(err2, result);
                            return;
                        }
                    }
                }, watchOnly, true);
            }
            return;
        }
    });
}

module.exports = {
    getBalance          : getBalance,
    getUnSpent          : getUnSpent,
    sendrawtransaction  : sendrawtransaction,
    getTransactions     : getTransactions,
    searchHash          : searchHash,
    importAddress       : importAddress,
    importMultiAddress  : importMultiAddress,
    sendTransaction     : sendTransaction,
    importMyAddress     : importMyAddress,
    getTransactionsFromRpc  :   getTransactionsFromRpc
}