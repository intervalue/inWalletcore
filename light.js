/*jslint node: true */
"use strict";

var async = require('async');
var db = require('./db.js');
var utils = require('./utils.js');
var mutex = require('./mutex.js');
var eventBus = require('./event_bus.js');
var device = require('./device.js');
var hashnethelper = require('./hashnethelper');
var rpcHelper = require('./HDWallet/btc_rpcHelper');
var ethHelper = require('./HDWallet/eth_helper');
var _ = require("lodash");
var Bignumber = require("bignumber.js");
var constants = require('./constants.js')
//判断上次拉取/更新交易列表是否完成
var u_finished = true;
//交易记录列表
var tranList = [];
//钱包收款地址
var tranAddr = [];
//可用余额
var stable = 0;
//待确认余额
var pending = 0;

var otherStable = 0;
var otherPending = 0;
var otherTranList = [];
var otherTranObject = {};
var other_finished = true;
var haveUpdate = true;
var veryTrue = [];

var ETH_otherStable = 0;
var ETH_otherPending = 0;
var ETH_otherTranList = [];
var ETH_haveUpdate = true;

var multiUrl = [];

function setMultiUrl(multiUrl2) {
    multiUrl = multiUrl2;
}

var multiHash = [];

//var needCheck = [];

async function getMultiHash() {
    multiHash = await db.toList("select id,eStatu,multiHash, addressFrom, addressTO,sInfo,eInfo  from transactions where multiHash <> ''");
}

var fresh = false;
async function updateMultiTrans(addressObj, allAddress) {
    if (multiHash.length == 0 || fresh) await getMultiHash();
    let length = addressObj.length;
    for (let i = 0; i < length; i++) {
        setTimeout(function () {
            let key = addressObj[i].walletId;
            let addressOne = addressObj[i].address;
            var webHelper = require('./sendTransactionToNode');
            let multiLength = multiUrl.length;
            for (let j = 0; j < multiLength; j++) {
                let url = multiUrl[j];
                let chooseNetWork = 'http://' + url + '/addressSelect';
                let jsonObject = { "address": addressOne };
                jsonObject = JSON.parse(JSON.stringify(jsonObject));
                function updateMultiOrder(one, result, type, sInfo, eInfo) {
                    if (one != undefined && one.multiHash == result.orderNumber) {
                        if (one.eStatu != result.status || one.sInfo.length == 0 || one.eInfo.length == 0) {
                            db.query('update transactions set eStatu = ?,sInfo = ?, eInfo = ? where id = ?', [result.status, sInfo, eInfo, one.id], function (result) {
                                //console.log(result);
                            });
                        }
                    } else {
                        if (one != undefined) {
                            db.query('update transactions set multiHash = ?,type = ?,eStatu = ?, sType = ?, eType = ?, sInfo = ?, eInfo = ? where id = ?', [result.orderNumber, type, result.status, getIndex(result.sourceCurrency), getIndex(result.desCurrency), sInfo, eInfo, one.id], function (result) {
                                //console.log(result);
                            });
                        }
                    }
                }

                function insertMultiOrder(hash, result, type, sInfo, eInfo) {
                    db.query('update transactions set multiHash = ?,type = ?,eStatu = ?, sType = ?, eType = ?, sInfo = ?, eInfo = ? where id = ?', [result.orderNumber, type, result.status, getIndex(result.sourceCurrency), getIndex(result.desCurrency), sInfo, eInfo, hash], function (result) {
                        //console.log(result);
                        fresh = true;
                    });
                }

                function getIndex(str) {
                    if (str == 'INVE') {
                        return 1;
                    } else if (str == 'BTC') {
                        return 2;
                    } else if (str == 'ETH') {
                        return 3;
                    } else {
                        return 0;
                    }
                }
                webHelper.post(chooseNetWork, jsonObject, { "Content-Type": "application/json" }, function (err2, resultList) {
                    if (err2) {
                        console.log(err2);
                    } else {
                        resultList = JSON.parse(JSON.stringify(resultList.body));
                        let result2Length = resultList.length;
                        for (let j = 0; j < result2Length; j++) {
                            let result2 = resultList[j];
                            let address = _.indexOf(allAddress, addressOne);
                            if (address > -1) {
                                if (result2.type == 'transfer') {
                                    let stoOne = _.find(multiHash, { 'id': result2.stoTransactionHash, 'addressFrom': address });
                                    let rtoOne = _.findLast(multiHash, { 'id': result2.rtoTransactionHash, 'addressTo': address });
                                    if (stoOne != undefined) {
                                        updateMultiOrder(stoOne, result2, 1, result2.sourceAddress, result2.desAddress);
                                    }
                                    if (rtoOne != undefined) {
                                        updateMultiOrder(rtoOne, result2, 1, result2.sourceAddress, result2.desAddress);
                                    }
                                    if (stoOne == undefined && addressOne == result2.sourceAddress) {
                                        insertMultiOrder(result2.stoTransactionHash, result2, 1, result2.sourceAddress, result2.desAddress);
                                    }
                                    if (rtoOne == undefined && addressOne == result2.desAddress) {
                                        insertMultiOrder(result2.rtoTransactionHash, result2, 1, result2.sourceAddress, result2.desAddress);
                                    }
                                } else {
                                    /**
                                     * B用户已经可以去查了
                                     */
                                    let stoOne = _.find(multiHash, { id: result2.stoTransactionHash, 'addressFrom': address });
                                    let rtoOne = _.find(multiHash, { id: result2.rtoTransactionHash, 'addressTo': address });
                                    let dtoFirst = _.find(multiHash, { id: result2.dtoTransactionHash, 'addressFrom': address });
                                    let dtoLast = _.find(multiHash, { id: result2.dtoTransactionHash, 'addressTo': address });
                                    if (result2.oppositeSourceAddress == addressOne && result2.status < 3 && result2.status != 0) {
                                        let check = { 'walletId': key, 'result': result2 };
                                        //needCheck.push(check);
                                        check.url = url;
                                        eventBus.emit('newMultiTrans', check);
                                    }

                                    if (result2.stoTransactionHash != '' && addressOne == result2.sourceAddress && stoOne != undefined) {
                                        updateMultiOrder(stoOne, result2, 2, result2.sourceAddress + '|' + result2.desAddress, result2.oppositeSourceAddress + '|' + result2.oppositeDesAddress);
                                    }
                                    if (result2.rtoTransactionHash != '' && addressOne == result2.oppositeDesAddress && rtoOne != undefined) {
                                        updateMultiOrder(rtoOne, result2, 2, result2.sourceAddress + '|' + result2.desAddress, result2.oppositeSourceAddress + '|' + result2.oppositeDesAddress);
                                    }
                                    if (dtoFirst != undefined && result2.dtoTransactionHash != '' && (addressOne == result2.desAddress || addressOne == result2.oppositeSourceAddress)) {
                                        if (addressOne == result2.desAddress) {
                                            updateMultiOrder(dtoFirst, result2, 2, result2.sourceAddress + '|' + result2.desAddress, result2.oppositeSourceAddress + '|' + result2.oppositeDesAddress);
                                        } else {
                                            updateMultiOrder(dtoFirst, result2, 2, result2.sourceAddress + '|' + result2.desAddress, result2.oppositeSourceAddress + '|' + result2.oppositeDesAddress);
                                        }
                                    }

                                    if (stoOne == undefined && addressOne == result2.sourceAddress) {
                                        insertMultiOrder(result2.stoTransactionHash, result2, 2, result2.sourceAddress + '|' + result2.desAddress, result2.oppositeSourceAddress + '|' + result2.oppositeDesAddress);
                                    }
                                    if (rtoOne == undefined && addressOne == result2.oppositeDesAddress) {
                                        insertMultiOrder(result2.rtoTransactionHash, result2, 2, result2.sourceAddress + '|' + result2.desAddress, result2.oppositeSourceAddress + '|' + result2.oppositeDesAddress);
                                    }
                                    if (dtoFirst == undefined && addressOne == result2.oppositeSourceAddress || dtoLast == undefined && addressOne == result2.desAddress) {
                                        if (addressOne == result2.desAddress) {
                                            insertMultiOrder(result2.dtoTransactionHash, result2, 2, result2.sourceAddress + '|' + result2.desAddress, result2.oppositeSourceAddress + '|' + result2.oppositeDesAddress);
                                        } else {
                                            insertMultiOrder(result2.dtoTransactionHash, result2, 2, result2.sourceAddress + '|' + result2.desAddress, result2.oppositeSourceAddress + '|' + result2.oppositeDesAddress);
                                        }
                                    }
                                }
                            }
                        }
                    }
                });
            }

        },i * 1000);
    }
}

function getCheck() {
    return needCheck;
}

async function updateHistory(addresses) {
    //console.log('interHistory');
    //如果上次updateHistory还没完成，则返回，否则继续往下走
    if (!u_finished) {
        return;
    }
    //将u_finished设置为false，表示正在进行交易记录更新
    u_finished = false;
    //判断钱包是否切换了，如果是，则重新初始化局部全节点列表。
    if (device.walletChanged) {
        device.walletChanged = false;
        await hashnethelper.initialLocalfullnodeList();
    }
    //update化交易列表


    //存储此次交易记录的数组
    let trans = null;

    if (tranList == null) {}
    let data;
    let tableIndex = 0;
    let offset = 0;
    let sysTableIndex = 0;
    let sysOffset = 0;
    try {
        for (var address of addresses) {
            await iniTranList(address);
            //从共识网拉取交易记录
            data = await hashnethelper.getTransactionHistory(address, tableIndex, offset, sysTableIndex, sysOffset);
            let result = data.result;
            // if(data.offset != tranList.length+result.length ){
            //     await db.execute("UPDATE transactions_index SET tableIndex= ?,offsets= ? WHERE address = ?", data.tableIndex, 0, data.address);
            //     return;
            // }
            //如果交易记录不为空，需要加入到待处理的数组中。
            if (result != null) {
                if (trans == null) {
                    trans = [];
                }
                if (result.length > 0) {
                    trans = trans.concat(result);
                }
            }

            // console.log(JSON.stringify(trans));
            //如果为NULL，则表示访问共识网有问题，返回。
            if (trans == null && result == null) {
                return;
            }
            // console.log("共识网拉取交易信息:");
            // console.log(trans);


            //如果交易记录长度为零，需要清空本地的交易记录。
            // if (trans.length === 0) {
            //     // await truncateTran(addresses);
            //     await db.execute("UPDATE transactions_index SET tableIndex= ?,offsets= ? WHERE address = ?", data.tableIndex, data.offset, data.address);
            // } else {
            //初始化交易列表
            // await iniTranList(addresses);
            for (var tran of trans) {

                // console.log(JSON.stringify(tranList));

                let my_tran = _.find(tranList, { id: tran.hash });
                // console.log(!my_tran);
                //本地存在交易记录，状态是待确认，需要进行状态的更新。
                if (my_tran && tran.isStable && tran.isValid && my_tran.result == 'pending') {
                    await updateTran(tran, data);
                }
                //本地存在交易记录，共识网判定交易非法，需要更新交易状态到本地
                else if (my_tran && tran.isStable && !tran.isValid && my_tran.result != 'final-bad') {
                    await badTran(tran, data);
                }
                //本地不存在此交易记录，需往本地插入交易记录
                else if (!my_tran) {
                    await insertTran(tran, data);
                    eventBus.emit('newtransaction', tran);
                } else {
                    await db.execute("UPDATE transactions_index SET tableIndex= ?,offsets= ?, sysTableIndex=?, sysOffset=? WHERE address = ?", data.tableIndex, data.offset, data.address, data.sysTableIndex,data.sysOffset);
                    eventBus.emit('newtransaction', tran);
                }
            }
            // }
        }
    } catch (e) {
        console.log(e.toString());
    }
        //此次交易记录更新完毕，重置标志位。
    finally {
        u_finished = true;
    }
}

function getHistoryIndex(address, callback) {
    db.query('select tableIndex,offsets from transactions_index WHERE address = ?', [address], function (result) {
        try {
            if (result == undefined || result.length == 0) {
                try {
                    let result = db.execute('insert into transactions_index(address, tableIndex, offsets) VALUES(?,?,?)', address, 0, 50);
                    callback(null, 0, 50);
                } catch (err) {
                    callback(null, 0, 50);
                }
            } else {
                callback(null, result[0].tableIndex, result[0].offsets);
            }
        } catch (err) {
            console.log(err);
            callback(null, 0, 50);
        }
    });
}

var btcImport = [];
/**
 * 获取其他的币种的交易记录填充进去
 */
async function updateOtherHistory(otherObjectArr, addresses) {
    if (!other_finished) {
        return;
    }

    other_finished = false;
    // update化交易列表
    // await initOtherTranList(addresses);
    try {
        let length = otherObjectArr.length;
        for (let i = 0; i < length; i++) {
            setTimeout( async function () {
                let object = updateHistoryObject[otherObjectArr[i].type];
                await object.initOtherTranList(otherObjectArr[i].address);
                object.getHistory(otherObjectArr[i].address, object.transCallback, false);
                if (otherObjectArr[i].type == 'BTC') {
                    //在这里importAddress 及获取最新的交易记录 因为insightapi更新不及时的问题
                    rpcHelper.getTransactionsFromRpc(otherObjectArr[i].address, insertIntoBTCFromRpc);
                    if (_.indexOf(btcImport, otherObjectArr[i].address) < 0) {
                        getHistoryIndex('IMPORTBTC*' + otherObjectArr[i].address, function (err, page, pageNum) {
                            if (page == 0) {
                                rpcHelper.importMyAddress(otherObjectArr[i].address, function (err, res) {
                                    console.log('import result' + err + res);
                                    return;
                                });
                            } else {
                                btcImport.push(otherObjectArr[i].address);
                            }
                        });
                    }
                }
            }, i * 2000);

        }
    } catch (err) {
        console.log(err);
    } finally {
        other_finished = true;
    }
}

/**
 * 其他币种获取链上的记录
 * @type {{BTC: {getHistory: getTransactions}}}
 */
var updateHistoryObject = {
    "BTC": {
        getHistory: rpcHelper.getTransactions,
        initOtherTranList: initOtherTranList,
        transCallback: btcCallback
    },
    "ETH": {
        getHistory: ethHelper.getTransactions,
        initOtherTranList: initETHTranList,
        transCallback: ethCallback
    }
};
var num = 0;
function updateHash(addresses) {
    try {
        if (num == undefined || num.length == 0 || num[0].tableIndex == undefined) {
            let result = db.execute('insert into transactions_index (address, tableIndex, offsets) VALUES (?,?,?)', 'hash-' + addresses, 0, 0);
            num = 0;
        } else {
            num = isNaN(num[0].tableIndex) ? 0 : num[0].tableIndex;
        }
        let haveNum = 0;
        for (let i = 0; i < 50; i++) {
            let number = num + i;
            let have = otherTranList[num];
            if (have == undefined) {
                haveUpdate = true;
                break;
            }
            haveNum = haveNum + 1;
            if (have.addressFrom == have.addressTo) {
                rpcHelper.searchHash(have.id, function (err, result) {
                    if (err || result == null) {
                        return;
                    }
                    let vin = result.vin;
                    let vout = result.vout;
                    if (vin[0].address == have.addressFrom) {
                        db.execute("update transactions set addressTo = ?,amount= ? where id=?", vout[0].scriptPubKey.addresses[0] != have.addressFrom ? vout[0].scriptPubKey.addresses[0] : vout[1].scriptPubKey.addresses[0], Math.abs(parseInt(new Bignumber(vout[0].value).times(100000000))).toString(), have.id);
                    } else {
                        db.execute("update transactions set addressFrom = ? where id=?", vin[0].address, have.id);
                    }
                });
            }
        }
        if (haveNum == 50) db.execute('update transactions_index set tableIndex = tableIndex + 50 where address = ? and tableIndex <= ?', 'hash-' + addresses, otherTranList.length - 50);
        haveUpdate = true;
    } catch (err) {
        console.log(err);
        haveUpdate = true;
    }
}

/**
 * 循环队列 更新btc数据
 */
// function doOther(){
//     let length = veryTrue.length;
//     for (let i=0; i< length; i++){
//         let object = veryTrue[i];
//
//         rpcHelper.searchHash(object.txid, function(err, result){
//             if (result != null){
//                 object.result = result;
//                 object.remove();
//             } else {
//                 continue;
//             }
//         }
//
//         })
//         //到这里就是单链
//         let object = data[i];
//         console.log("insert into transactions (id, creation_date, amount, fee, addressFrom, addressTo, result, remark, type, sType, eType, sHash, sConfirm, sStatu) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
//             object.txid, object.timereceived, parseInt(new Bignumber(object.amount).times(100000000).toString()), parseInt(new Bignumber(object.fee ? object.fee : 0).times(100000000).toString()), object.address, object.address, 'pending', '', 0, 2, 2, object.txid, object.confirmations, 0);
//         try{
//             let result = object.result;
//             let vin, vout;
//             if (result == null){
//                 console.log(object.txid);
//                 vin = object.vin;
//                 vout = object.vout;
//             } else {
//                 vin = result.vin;
//                 vout = result.vout;
//             }
//             let addressTo = object.address;
//             let addressFrom = object.address;
//             if (vin[0].address == addressFrom){
//                 addressTo = vout[0].scriptPubKey.addresses[0] != addressFrom? vout[0].scriptPubKey.addresses[0]: vout[1].scriptPubKey.addresses[0];
//             } else {
//                 addressFrom = vin[0].address;
//             }
//             let vinNumber = 0;
//             let voutNumber = 0;
//             let voutOwnNumber = 0;
//             let vinLength = vin.length;
//             let voutLength = vout.length;
//             for(let i=0; i<vinLength; i++){
//                 vinNumber = new Bignumber(vinNumber).plus(vin[i].value).toString();
//             }
//             for (let i=0; i<voutLength; i++){
//                 voutNumber = new Bignumber(voutNumber).plus(vout[i].value).toString();
//                 if (vout[i].scriptPubKey.addresses[0] == object.address){
//                     voutOwnNumber = new Bignumber(voutOwnNumber).plus(vout[i].value).toString();
//                 }
//             }
//             let amount = 0;
//             let fee = new Bignumber(vinNumber).minus(voutNumber).toString();
//             if (object.txid == '6fa2c7bc6ae40bfa22c76e5ad645d3de07b3d3a4a1da328c8e37cf0d5b1898be')
//                 console.log('11111');
//             if (addressFrom != object.address){
//                 amount = voutOwnNumber;
//             } else {
//                 amount = new Bignumber(vinNumber).minus(fee).minus(voutOwnNumber).toString();
//             }
//             console.log(amount);
//             console.log(fee);
//             if (object.confirmations >= 6){
//                 await db.execute("insert into transactions (id, creation_date, amount, fee, addressFrom, addressTo, result, remark, type, sType, eType, sHash, sConfirm, sStatu) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
//                     object.txid, object.time, Math.abs(parseInt(new Bignumber(amount).times(100000000).toString())), Math.abs(parseInt(new Bignumber(fee ? fee : 0).times(100000000).toString())), addressFrom, addressTo, 'good', '', 0, 2, 2, object.txid, object.confirmations, 1);
//             } else {
//                 await db.execute("insert into transactions (id, creation_date, amount, fee, addressFrom, addressTo, result, remark, type, sType, eType, sHash, sConfirm, sStatu) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
//                     object.txid, object.time, Math.abs(parseInt(new Bignumber(amount).times(100000000).toString())), Math.abs(parseInt(new Bignumber(fee ? fee : 0).times(100000000).toString())), addressFrom, addressTo, 'pending', '', 0, 2, 2, object.txid, object.confirmations, 0);
//             }
//     }
// }


let needUpdate = true;

async function insertIntoBTCFromRpc(err, data, lengthFull) {
    if (err != undefined || data.length == 0) return;
    let length = data.length;
    let object = otherTranObject[data[0].address];
    for (let i = 0; i < length; i++) {
        let databaseObject = _.find(object, { 'id': data[i].txid });
        if (databaseObject == undefined) {
            needUpdate = false;
        }
        let have = _.find(otherTranList, { sHash: data[i].txid });
        let have2 = _.find(otherTranList, { eHash: data[i].txid });
        // if (!data[i].result) {
        //     veryTrue.push(data[i]);
        // }
        if (have) {
            if (have.addressFrom == have.addressTo && have.eConfirm != 1) {
                needUpdate = false;
                rpcHelper.searchHash(have.id, function (err, result) {
                    if (err || result == null) {
                        return;
                    }
                    haveUpdate = true;
                    let vin, vout;
                    if (result == null) {
                        vin = object.vin;
                        vout = object.vout;
                    } else {
                        vin = result.vin;
                        vout = result.vout;
                    }
                    if (vin != undefined) {
                        let addressTo = have.addressFrom;
                        let addressFrom = have.addressFrom;
                        if (vin[0].address == addressFrom) {
                            addressTo = vout[0].scriptPubKey.addresses[0] != addressFrom ? vout[0].scriptPubKey.addresses[0] : vout[1].scriptPubKey.addresses[0];
                        } else {
                            addressFrom = vin[0].address;
                        }
                        let vinNumber = 0;
                        let voutNumber = 0;
                        let voutOwnNumber = 0;
                        let vinLength = vin.length;
                        let voutLength = vout.length;
                        for (let i = 0; i < vinLength; i++) {
                            vinNumber = new Bignumber(vinNumber).plus(vin[i].value).toString();
                        }
                        for (let i = 0; i < voutLength; i++) {
                            voutNumber = new Bignumber(voutNumber).plus(vout[i].value).toString();
                            if (vout[i].scriptPubKey.addresses[0] == have.addressFrom) {
                                voutOwnNumber = new Bignumber(voutOwnNumber).plus(vout[i].value).toString();
                            }
                        }
                        let amount = 0;
                        let fee = new Bignumber(vinNumber).minus(voutNumber).toString();
                        if (addressFrom != have.addressFrom) {
                            amount = voutOwnNumber;
                        } else {
                            amount = new Bignumber(vinNumber).minus(fee).minus(voutOwnNumber).toString();
                        }
                        needUpdate = true;
                        db.execute("update transactions set addressTo = ?,addressFrom = ?, amount=?, eConfirm = 1, fee=? where id=?", addressTo, addressFrom, parseInt(new Bignumber(amount).times(100000000).toString()), parseInt(new Bignumber(fee).times(100000000).toString()), have.id);
                    }
                });
            }
            if (have.sStatu == 0) {
                let object = data[i];
                if (have.sConfirm >= 6) {
                    await db.execute("update transactions set sConfirm = ?, result = 'good',sStatu = 1 where sHash = ?", object.confirmations, data[i].txid);
                } else if (have.sConfirm < 6) {
                    await db.execute("update transactions set sConfirm = ?, fee=? where sHash = ?", object.confirmations, Math.abs(parseInt(new Bignumber(object.fee ? object.fee : 0).times(100000000).toString())), data[i].txid);
                } else {
                    await db.execute("update transactions set sConfirm = ?, fee=? where sHash = ?", object.confirmations, Math.abs(parseInt(new Bignumber(object.fee ? object.fee : 0).times(100000000).toString())), data[i].txid);
                }
                haveUpdate = true;
            }
        } else if (have2) {
            if (have.addressFrom == have.addressTo) {
                rpcHelper.searchHash(have.id, function (err, result) {
                    if (err || result == null) {
                        return;
                    }
                    let vin = result.vin;
                    let vout = result.vout;
                    if (vin[0].address == have.addressFrom) {
                        db.execute("update transactions set addressTo = ? where id=?", vout[0].scriptPubKey.addresses[0] != have.addressFrom ? vout[0].scriptPubKey.addresses[0] : vout[1].scriptPubKey.addresses[0], have.id);
                    } else {
                        db.execute("update transactions set addressFrom = ? where id=?", vin[0].address, have.id);
                    }
                    haveUpdate = true;
                });
            }
            if (have2.eStatu == 0) {
                let object = data[i];
                if (have.eConfirm >= 6) {
                    await db.execute("update transactions set eConfirm = ?, result = 'good',eStatu = 1 where eHash = ?", object.confirmations, data[i].txid);
                } else if (have.eConfirm < 6) {
                    await db.execute("update transactions set eConfirm = ? where eHash = ?", object.confirmations, data[i].txid);
                } else {
                    await db.execute("update transactions set eConfirm = ? where eHash = ?", object.confirmations, data[i].txid);
                }
                haveUpdate = true;
            }
        } else {
            //到这里就是单链
            let object = data[i];
            try {
                let result = object.result;
                let vin, vout;
                if (result == null) {
                    vin = object.vin;
                    vout = object.vout;
                } else {
                    vin = result.vin;
                    vout = result.vout;
                }
                if (vin != undefined) {
                    let addressTo = object.address;
                    let addressFrom = object.address;
                    if (vin[0].address == addressFrom) {
                        addressTo = vout[0].scriptPubKey.addresses[0] != addressFrom ? vout[0].scriptPubKey.addresses[0] : vout[1].scriptPubKey.addresses[0];
                    } else {
                        addressFrom = vin[0].address;
                    }
                    let vinNumber = 0;
                    let voutNumber = 0;
                    let voutOwnNumber = 0;
                    let vinLength = vin.length;
                    let voutLength = vout.length;
                    for (let i = 0; i < vinLength; i++) {
                        vinNumber = new Bignumber(vinNumber).plus(vin[i].value).toString();
                    }
                    for (let i = 0; i < voutLength; i++) {
                        voutNumber = new Bignumber(voutNumber).plus(vout[i].value).toString();
                        if (vout[i].scriptPubKey.addresses[0] == object.address) {
                            voutOwnNumber = new Bignumber(voutOwnNumber).plus(vout[i].value).toString();
                        }
                    }
                    let amount = 0;
                    let fee = new Bignumber(vinNumber).minus(voutNumber).toString();
                    if (addressFrom != object.address) {
                        amount = voutOwnNumber;
                    } else {
                        amount = new Bignumber(vinNumber).minus(fee).minus(voutOwnNumber).toString();
                    }
                    if (object.confirmations >= 6) {
                        await db.execute("insert into transactions (id, creation_date, amount, fee, addressFrom, addressTo, result, remark, type, sType, eType, sHash, sConfirm, sStatu) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)", object.txid, object.time * 1000, Math.abs(parseInt(new Bignumber(amount).times(100000000).toString())), Math.abs(parseInt(new Bignumber(fee ? fee : 0).times(100000000).toString())), addressFrom, addressTo, 'good', '', 0, 2, 2, object.txid, object.confirmations, 1);
                    } else {
                        await db.execute("insert into transactions (id, creation_date, amount, fee, addressFrom, addressTo, result, remark, type, sType, eType, sHash, sConfirm, sStatu) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)", object.txid, object.time * 1000, Math.abs(parseInt(new Bignumber(amount).times(100000000).toString())), Math.abs(parseInt(new Bignumber(fee ? fee : 0).times(100000000).toString())), addressFrom, addressTo, 'pending', '', 0, 2, 2, object.txid, object.confirmations, 0);
                    }
                } else {
                    if (object.confirmations >= 6) {
                        await db.execute("insert into transactions (id, creation_date, amount, fee, addressFrom, addressTo, result, remark, type, sType, eType, sHash, sConfirm, sStatu) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)", object.txid, object.time * 1000, Math.abs(parseInt(new Bignumber(object.amount).times(100000000).toString())), Math.abs(parseInt(new Bignumber(object.fee ? object.fee : 0).times(100000000).toString())), object.address, object.address, 'pending', '', 0, 2, 2, object.txid, object.confirmations, 0);
                    } else {
                        await db.execute("insert into transactions (id, creation_date, amount, fee, addressFrom, addressTo, result, remark, type, sType, eType, sHash, sConfirm, sStatu) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)", object.txid, object.time * 1000, Math.abs(parseInt(new Bignumber(object.amount).times(100000000).toString())), Math.abs(parseInt(new Bignumber(object.fee ? object.fee : 0).times(100000000).toString())), object.address, object.address, 'pending', '', 0, 2, 2, object.txid, object.confirmations, 0);
                    }
                }

                haveUpdate = true;
            } catch (err) {
                console.log(err);
            }
        }
    }
    object = null;
    if (needUpdate && lengthFull) {
        await db.execute('update transactions_index set tableIndex = 0, offsets = 100 WHERE address = ?', ['BTC*' + data[0].address]);
    }
    if (haveUpdate) eventBus.emit('my_transactions_became_stable');
}
/**
 * 更新BTC数据
 */
async function insertIntoBTC(data, address) {
    if (data == null) {
        await db.execute("update transactions_index set tableIndex = 0, offsets = 50 where address = ?", 'BTC*' + address);
        return;
    }
    //data = JSON.parse(data);
    let from = data.from;
    if (from == undefined) {
        return;
    }
    let to = data.to;
    let items = data.items;
    let unFill = false;
    let length = data.items.length;
    let canUpdate = true; //还有需要更新状态的 not use 反向的 先往后扫 再回头
    let allInsert = true; //如果这一页的每一条都没有插入 有可能下一页还有数据
    let haveUpdate2 = false;
    /**
     * 没有那么多的数据了 证明到最后一页了或者数据没有那么多 标示一下 然后如果里面所有的交易都是已经确认的状态那就是更新查询的 从第一页扫十行
     */
    if (to - from < length) {
        unFill = true;
    }

    try {
        let myHistory = otherTranObject[address];

        for (let i = 0; i < length; i++) {
            try {
                let item = items[i];
                let databaseObject = _.find(myHistory, { 'id': item.txid });
                if (databaseObject != undefined) {
                    allInsert = false;
                }
                if (databaseObject == undefined || databaseObject.sConfirm < 6) {
                    if (databaseObject != undefined && databaseObject.sConfirm < 6 && i > 10) {
                        canUpdate = false;
                    }
                    let vin = item.vin;
                    let vout = item.vout;

                    let fromAddress = vin[0].addr;
                    let toAddress = vout[0].scriptPubKey.addresses == undefined? null: vout[0].scriptPubKey.addresses[0];
                    let amount = new Bignumber(vout[0].value).times(100000000).toString();
                    if (toAddress != address && fromAddress != address) {
                        //toAddress = address;
                        let length2 = vout.length;
                        for (let i = 0; i < length2; i++) {
                            if (vout[i].scriptPubKey.addresses != undefined && vout[i].scriptPubKey.addresses[0] == address) {
                                toAddress = address;
                                amount = new Bignumber(vout[i].value).times(100000000).toString();
                                break;
                            }
                        }
                    }
                    let fee = new Bignumber(item.fees).times(100000000).toString();
                    let result = item.confirmations >= 6 ? 'good' : 'pending';
                    let sStatu = item.confirmations >= 6 ? 0 : 1;
                    if (databaseObject == undefined) {
                        haveUpdate2 = true;
                        haveUpdate = true;
                        await db.execute("insert into transactions(id, creation_date, amount, fee, addressFrom, addressTo, result, remark, type, sType, eType, sHash, sConfirm, sStatu) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)", item.txid, item.time * 1000, amount, fee, fromAddress, toAddress, result, '', 0, 2, 2, item.txid, item.confirmations, sStatu);
                        continue;
                    }
                    if (databaseObject.sConfirm != item.confirmations) {
                        haveUpdate2 = true;
                        haveUpdate = true;
                        await db.execute("update transactions set sConfirm = ?, result = ?,sStatu = ?,amount=?,fee=?, addressFrom=?, addressTo=? where sHash = ?", item.confirmations, result, sStatu, amount, fee, fromAddress, toAddress, item.txid);
                        continue;
                    }
                }
            } catch (err){
                console.log(err);
            }
        }
        //transactions_index(address, tableIndex, offsets)
        //更新扫描的页码
        if (unFill && to != 10 && canUpdate) {
            await db.execute("update transactions_index set tableIndex = 0, offsets = 10 where address = ?", 'BTC*' + address);
            return;
        }

        if (!unFill && (to - from != 10 || allInsert)) {
            await db.execute("update transactions_index set tableIndex = offsets, offsets = offsets + 50 where address = ?", 'BTC*' + address);
            return;
        }
    } catch (err) {
        console.log(err);
    }

    if (haveUpdate2) eventBus.emit('my_transactions_became_stable');

    // let length = data.length;
    // let object = otherTranObject[data[0].address];
    // for (let i = 0; i < length; i++) {
    //     let databaseObject = _.find(object, { 'id': data[i].txid});
    //     if (databaseObject == undefined){
    //         needUpdate = false;
    //     }
    //     let have = _.find(otherTranList, { sHash: data[i].txid });
    //     let have2 = _.find(otherTranList, { eHash: data[i].txid });
    //     // if (!data[i].result) {
    //     //     veryTrue.push(data[i]);
    //     // }
    //     if (have) {
    //         if (have.addressFrom == have.addressTo && have.eConfirm != 1) {
    //             needUpdate = false;
    //             rpcHelper.searchHash(have.id, function (err, result) {
    //                 if (err || result == null) {
    //                     return;
    //                 }
    //                 haveUpdate = true;
    //                 let vin, vout;
    //                 if (result == null) {
    //                     vin = object.vin;
    //                     vout = object.vout;
    //                 } else {
    //                     vin = result.vin;
    //                     vout = result.vout;
    //                 }
    //                 if (vin != undefined) {
    //                     let addressTo = have.addressFrom;
    //                     let addressFrom = have.addressFrom;
    //                     if (vin[0].address == addressFrom) {
    //                         addressTo = vout[0].scriptPubKey.addresses[0] != addressFrom ? vout[0].scriptPubKey.addresses[0] : vout[1].scriptPubKey.addresses[0];
    //                     } else {
    //                         addressFrom = vin[0].address;
    //                     }
    //                     let vinNumber = 0;
    //                     let voutNumber = 0;
    //                     let voutOwnNumber = 0;
    //                     let vinLength = vin.length;
    //                     let voutLength = vout.length;
    //                     for (let i = 0; i < vinLength; i++) {
    //                         vinNumber = new Bignumber(vinNumber).plus(vin[i].value).toString();
    //                     }
    //                     for (let i = 0; i < voutLength; i++) {
    //                         voutNumber = new Bignumber(voutNumber).plus(vout[i].value).toString();
    //                         if (vout[i].scriptPubKey.addresses[0] == have.addressFrom) {
    //                             voutOwnNumber = new Bignumber(voutOwnNumber).plus(vout[i].value).toString();
    //                         }
    //                     }
    //                     let amount = 0;
    //                     let fee = new Bignumber(vinNumber).minus(voutNumber).toString();
    //                     if (addressFrom != have.addressFrom) {
    //                         amount = voutOwnNumber;
    //                     } else {
    //                         amount = new Bignumber(vinNumber).minus(fee).minus(voutOwnNumber).toString();
    //                     }
    //                     needUpdate = true;
    //                     db.execute("update transactions set addressTo = ?,addressFrom = ?, amount=?, eConfirm = 1, fee=? where id=?", addressTo, addressFrom, parseInt(new Bignumber(amount).times(100000000).toString()), parseInt(new Bignumber(fee).times(100000000).toString()), have.id);
    //                 }
    //             });
    //         }
    //         if (have.sStatu == 0) {
    //             let object = data[i];
    //             if (have.sConfirm >= 6) {
    //                 await db.execute("update transactions set sConfirm = ?, result = 'good',sStatu = 1 where sHash = ?", object.confirmations, data[i].txid);
    //             } else if (have.sConfirm < 6) {
    //                 await db.execute("update transactions set sConfirm = ?, fee=? where sHash = ?", object.confirmations, Math.abs(parseInt(new Bignumber(object.fee ? object.fee : 0).times(100000000).toString())), data[i].txid);
    //             } else {
    //                 await db.execute("update transactions set sConfirm = ?, fee=? where sHash = ?", object.confirmations, Math.abs(parseInt(new Bignumber(object.fee ? object.fee : 0).times(100000000).toString())), data[i].txid);
    //             }
    //             haveUpdate = true;
    //         }
    //     } else if (have2) {
    //         if (have.addressFrom == have.addressTo) {
    //             rpcHelper.searchHash(have.id, function (err, result) {
    //                 if (err || result == null) {
    //                     return;
    //                 }
    //                 let vin = result.vin;
    //                 let vout = result.vout;
    //                 if (vin[0].address == have.addressFrom) {
    //                     db.execute("update transactions set addressTo = ? where id=?", vout[0].scriptPubKey.addresses[0] != have.addressFrom ? vout[0].scriptPubKey.addresses[0] : vout[1].scriptPubKey.addresses[0], have.id);
    //                 } else {
    //                     db.execute("update transactions set addressFrom = ? where id=?", vin[0].address, have.id);
    //                 }
    //                 haveUpdate = true;
    //             });
    //         }
    //         if (have2.eStatu == 0) {
    //             let object = data[i];
    //             if (have.eConfirm >= 6) {
    //                 await db.execute("update transactions set eConfirm = ?, result = 'good',eStatu = 1 where eHash = ?", object.confirmations, data[i].txid);
    //             } else if (have.eConfirm < 6) {
    //                 await db.execute("update transactions set eConfirm = ? where eHash = ?", object.confirmations, data[i].txid);
    //             } else {
    //                 await db.execute("update transactions set eConfirm = ? where eHash = ?", object.confirmations, data[i].txid);
    //             }
    //             haveUpdate = true;
    //         }
    //     } else {
    //         //到这里就是单链
    //         let object = data[i];
    //         try {
    //             let result = object.result;
    //             let vin, vout;
    //             if (result == null) {
    //                 vin = object.vin;
    //                 vout = object.vout;
    //             } else {
    //                 vin = result.vin;
    //                 vout = result.vout;
    //             }
    //             if (vin != undefined) {
    //                 let addressTo = object.address;
    //                 let addressFrom = object.address;
    //                 if (vin[0].address == addressFrom) {
    //                     addressTo = vout[0].scriptPubKey.addresses[0] != addressFrom ? vout[0].scriptPubKey.addresses[0] : vout[1].scriptPubKey.addresses[0];
    //                 } else {
    //                     addressFrom = vin[0].address;
    //                 }
    //                 let vinNumber = 0;
    //                 let voutNumber = 0;
    //                 let voutOwnNumber = 0;
    //                 let vinLength = vin.length;
    //                 let voutLength = vout.length;
    //                 for (let i = 0; i < vinLength; i++) {
    //                     vinNumber = new Bignumber(vinNumber).plus(vin[i].value).toString();
    //                 }
    //                 for (let i = 0; i < voutLength; i++) {
    //                     voutNumber = new Bignumber(voutNumber).plus(vout[i].value).toString();
    //                     if (vout[i].scriptPubKey.addresses[0] == object.address) {
    //                         voutOwnNumber = new Bignumber(voutOwnNumber).plus(vout[i].value).toString();
    //                     }
    //                 }
    //                 let amount = 0;
    //                 let fee = new Bignumber(vinNumber).minus(voutNumber).toString();
    //                 if (addressFrom != object.address) {
    //                     amount = voutOwnNumber;
    //                 } else {
    //                     amount = new Bignumber(vinNumber).minus(fee).minus(voutOwnNumber).toString();
    //                 }
    //                 if (object.confirmations >= 6) {
    //                     await db.execute("insert into transactions (id, creation_date, amount, fee, addressFrom, addressTo, result, remark, type, sType, eType, sHash, sConfirm, sStatu) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)", object.txid, object.time * 1000, Math.abs(parseInt(new Bignumber(amount).times(100000000).toString())), Math.abs(parseInt(new Bignumber(fee ? fee : 0).times(100000000).toString())), addressFrom, addressTo, 'good', '', 0, 2, 2, object.txid, object.confirmations, 1);
    //                 } else {
    //                     await db.execute("insert into transactions (id, creation_date, amount, fee, addressFrom, addressTo, result, remark, type, sType, eType, sHash, sConfirm, sStatu) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)", object.txid, object.time * 1000, Math.abs(parseInt(new Bignumber(amount).times(100000000).toString())), Math.abs(parseInt(new Bignumber(fee ? fee : 0).times(100000000).toString())), addressFrom, addressTo, 'pending', '', 0, 2, 2, object.txid, object.confirmations, 0);
    //                 }
    //             } else {
    //                 if (object.confirmations >= 6) {
    //                     await db.execute("insert into transactions (id, creation_date, amount, fee, addressFrom, addressTo, result, remark, type, sType, eType, sHash, sConfirm, sStatu) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)", object.txid, object.time * 1000, Math.abs(parseInt(new Bignumber(object.amount).times(100000000).toString())), Math.abs(parseInt(new Bignumber(object.fee ? object.fee : 0).times(100000000).toString())), object.address, object.address, 'pending', '', 0, 2, 2, object.txid, object.confirmations, 0);
    //                 } else {
    //                     await db.execute("insert into transactions (id, creation_date, amount, fee, addressFrom, addressTo, result, remark, type, sType, eType, sHash, sConfirm, sStatu) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)", object.txid, object.time * 1000, Math.abs(parseInt(new Bignumber(object.amount).times(100000000).toString())), Math.abs(parseInt(new Bignumber(object.fee ? object.fee : 0).times(100000000).toString())), object.address, object.address, 'pending', '', 0, 2, 2, object.txid, object.confirmations, 0);
    //                 }
    //             }
    //
    //             haveUpdate = true;
    //         } catch (err) {
    //             console.log(err);
    //         }
    //     }
    // }
    // object = null;
    // if (needUpdate && lengthFull) {
    //     await db.execute('update transactions_index set tableIndex = 0, offsets = 100 WHERE address = ?', ['BTC*' + data[0].address]);
    // }
    // if (haveUpdate)
    //     eventBus.emit('my_transactions_became_stable');
}

function updateStatu(){
    ETH_haveUpdate = true;
    haveUpdate = true;
    tranList = null;
}


/**
 * 更新ETH数据
 * 在这里更新page
 */
async function insertIntoETH(result, address, page) {
    let data = JSON.parse(result).result;
    if (data == null) return;
    let length = data.length;
    let pageChange = false;
    for (let i = 0; i < length; i++) {
        let have = _.find(ETH_otherTranList, { sHash: data[i].hash });
        if (have) {
            if (have.sStatu == 0) {
                let object = data[i];
                let gas = object.gasUsed;
                let gasPrice = object.gasPrice;
                let fee = new Bignumber(gas).times(new Bignumber(gasPrice)).toString();
                let fee1 = 0;
                let fee2 = fee;
                if (fee.length > 18) {
                    fee1 = fee.substr(0, fee.length - 18);
                    fee2 = fee.substr(fee.length - 18);
                }
                let backStatus = 'good';
                if (data[i].confirmations >= 12) {
                    await db.execute("update transactions set sConfirm = ?, fee = ?,fee_point = ?, sStatu = 1, result = ? WHERE id = ?", data[i].confirmations, fee1, fee2, backStatus, data[i].hash);
                } else if (data[i].confirmations < 12) {
                    await db.execute("update transactions set sConfirm = ?, fee = ?,fee_point = ? WHERE id = ?", data[i].confirmations, fee1, fee2, data[i].hash);
                }
                ETH_haveUpdate = true;
            }
        } else {
            //到这里就是单链
            let object = data[i];
            let value = object.value;
            let gas = object.gasUsed;
            let gasPrice = object.gasPrice;
            gas = new Bignumber(gas)
            gasPrice = new Bignumber(gasPrice)
            let fee = gas.times(gasPrice).toString();
            let amount1 = 0;
            let amount2 = value;
            let fee1 = 0;
            let fee2 = fee;
            if (value.length > 18) {
                amount1 = value.substr(0, value.length - 18);
                amount2 = value.substr(value.length - 18);
            }

            if (fee.length > 18) {
                fee1 = fee.substr(0, fee.length - 18);
                fee2 = fee.substr(fee.length - 18);
            }
            try {
                let backStatus = 'good';
                if (data[i].isError == "1"){
                    //backStatus = 'final-bad';
                    amount1 = 0;
                    amount2 = 0;
                }
                if (data[i].confirmations >= 12) {
                    await db.execute("insert into transactions (id, creation_date, amount,amount_point, fee,fee_point, addressFrom, addressTo, result, remark, type, sType, eType, sHash, sConfirm, sStatu) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", object.hash, object.timeStamp * 1000, amount1, amount2, fee1, fee2, object.from, object.to, backStatus, '', 0, 3, 3, object.hash, object.confirmations, 1);
                } else {
                    await db.execute("insert into transactions (id, creation_date, amount,amount_point, fee,fee_point, addressFrom, addressTo, result, remark, type, sType, eType, sHash, sConfirm, sStatu) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", object.hash, object.timeStamp * 1000, amount1, amount2, fee1, fee2, object.from, object.to, 'pending', '', 0, 3, 3, object.hash, object.confirmations, 0);
                }
                ETH_haveUpdate = true;
            } catch (err) {
                ETH_haveUpdate = true;
                pageChange = true;
                console.log(err);
            }
        }
    }
    if (!pageChange && length >= 50) await db.execute('update transactions_index set tableIndex = ? where address = ?', page + 1, address);
    if (ETH_haveUpdate) eventBus.emit('my_transactions_became_stable');
}

/**
 * add lengthFull 如果是全的就说明要继续下一页 就是rpc返回你要的完整的条数说明rpc还有后续
 * @param err
 * @param data
 * @param lengthFull
 */
function btcCallback(err, data, address) {
    if (err !== null || data == '') {
        other_finished = true;
        return;
    }
    insertIntoBTC(data, address);
    other_finished = true;
}

function ethCallback(err, data, address, page) {
    if (err !== null || data == '') {
        other_finished = true;
        return;
    }
    insertIntoETH(data, address, page);
    other_finished = true;
}

//刷新本地交易记录列表
function refreshTranList(tran) {
    let my_tran = _.find(tranList, { id: tran.id });
    //如果交易记录存在
    if (my_tran) {
        //交易的接收方
        if (tranAddr.indexOf(tran.to)) {
            //更新余额和待确认金额
            if (my_tran.result != 'good' && tran.isValid) {
                stable += tran.amount;
                pending -= tran.amount;
            } else if (my_tran.result == 'good' && !tran.isValid) {
                stable -= tran.amount;
            }
        }
        //交易的发送方
        else {
            if (my_tran.result != 'final-bad' && !tran.isValid) {
                //更新余额和待确认金额
                stable += tran.amount;
                stable += tran.fee;
                pending -= tran.amount;
                pending -= tran.fee;
            }
        }
        //更新交易记录的状态
        my_tran.result = getResultFromTran(tran);
    } else {
        //如果本地不存在记录，需要插入新的记录到列表中
        my_tran = { id: tran.hash, creation_date: tran.creation_date, amount: tran.amount, fee: tran.fee, addressFrom: tran.addressFrom, addressTo: tran.addressTo, result: getResultFromTran(tran) };
        //如果是交易的接收方
        if (tranAddr.indexOf(tran.to)) {
            //更新余额和待确认金额
            my_tran.action = 'received';
            switch (my_tran.result) {
                case 'pending':
                    pending += tran.amount;
                    break;
                case 'good':
                    stable += tran.amount;
                    break;
                case 'final-bad':
                    my_tran.action = 'invalid';
                    break;
            }
        } else {
            //交易的发送方
            my_tran.action = 'sent';
            switch (my_tran.result) {

                case 'pending':
                    stable -= tran.amount;
                    stable -= tran.fee;
                    pending += tran.amount;
                    pending += tran.fee;
                    break;
                case 'good':
                    stable -= tran.amount;
                    stable -= tran.fee;
                    break;
                case 'final-bad':
                    my_tran.action = 'invalid';
                    break;
            }
            //往列表中插入记录
        }
        tranList.push(my_tran);
    }
}
//通过交易的状态返回数据库中状态的值
function getResultFromTran(tran) {
    if (tran.isStable && tran.isValid) {
        return 'good';
    } else if (tran.isStable && !tran.isValid) {
        return 'final-bad';
    } else if (!tran.isStable) {
        return 'pending';
    }
}

/**
 * 获取比特币的交易记录
 * sType or eType === 1
 * @param addresses
 * @returns {Promise<void>}
 */
async function initOtherTranList(addresses) {
    //console.log(otherTranList);
    if (!haveUpdate) {
        return;
    }
    haveUpdate = false;
    tranAddr = addresses;
    //余额 = 收到 - 发送
    //otherStable = parseInt((await db.single("select (select sum(amount) from transactions where addressTo in (?) and result = 'good') - \n\
    //		(select (amount + fee) from transactions where addressFrom in (?) and (result = 'good' or result = 'pending')) as stable", addresses, addresses)));
    //待确认
    //otherPending = parseInt((await db.single("select (select sum(amount) from transactions where addressTo in (?) and result = 'pending') + \n\
    //		(select sum(amount + fee) from transactions where addressFrom in (?) and result = 'pending') as pending", addresses, addresses)));
    //交易列表
    otherTranList = await db.toList("select id,addressFrom, addressTo,sStatu,sHash,sConfirm,eConfirm from transactions WHERE (sType = (select id from coin_type where coinType = 'BTC')) or (eType = (select id from coin_type where coinType = 'BTC'))\n");

    let otherTranObject1 = _.groupBy(otherTranList, 'addressFrom');
    let otherTranObject2 = _.groupBy(otherTranList, 'addressTo');
    function customizer(objValue, srcValue) {
        if (_.isArray(objValue)) {
            return _.unionBy(objValue, srcValue, 'id');
        }
    }
    otherTranObject = _.mergeWith(otherTranObject1, otherTranObject2, customizer);
    otherTranObject1 = null;
    otherTranObject2 = null;
    // let idList = _.pick(otherTranObject, 'id');
    // let idList2 = _.pick(otherTranObject, 'id');
    //console.log(otherTranObject);
    num = await db.execute('select tableIndex from transactions_index where address =?', 'hash-' + addresses);
    //updateHash(addresses);
}

async function initETHTranList(addresses) {
    if (!ETH_haveUpdate) {
        return;
    }
    ETH_haveUpdate = false;
    tranAddr = addresses;
    //余额 = 收到 - 发送
    //ETH_otherStable = parseInt((await db.single("select (select sum(amount) from transactions where addressTo in (?) and result = 'good') - \n\
    //		(select (amount + fee) from transactions where addressFrom in (?) and (result = 'good' or result = 'pending')) as stable", addresses, addresses)));
    //待确认
    //ETH_otherPending = parseInt((await db.single("select (select sum(amount) from transactions where addressTo in (?) and result = 'pending') + \n\
    //		(select sum(amount + fee) from transactions where addressFrom in (?) and result = 'pending') as pending", addresses, addresses)));
    //交易列表
    ETH_otherTranList = await db.toList("select id,addressFrom, addressTo,sStatu,sHash,sConfirm from transactions WHERE (sType = (select id from coin_type where coinType = 'ETH')) or (eType = (select id from coin_type where coinType = 'ETH'))\n");
}

//钱包启动后初始化余额、待确认、交易列表
async function iniTranList(addresses) {
    var rs1 = tranAddr == [];
    var rs2 = tranAddr != addresses;
    var rs3 = !tranList;
    // if (tranAddr == [] || tranAddr != addresses || !tranList) {
    tranAddr = addresses;
    //余额 = 收到 - 发送
    stable = parseInt((await db.single("select (select sum(amount) from transactions where addressTo in (?) and result = 'good') - \n\
			(select (amount + fee) from transactions where addressFrom in (?) and (result = 'good' or result = 'pending')) as stable", addresses, addresses)));
    //待确认
    pending = parseInt((await db.single("select (select sum(amount) from transactions where addressTo in (?) and result = 'pending') + \n\
			(select sum(amount + fee) from transactions where addressFrom in (?) and result = 'pending') as pending", addresses, addresses)));
    //交易列表
    tranList = await db.toList("select *,case when result = 'final-bad' then 'invalid' when addressFrom in (?) then 'sent' else 'received' end as action \n\
		 from transactions where(addressFrom in (?) or addressTo in (?))", addresses, addresses, addresses);
    // console.log(tranList);
    // }
}

//交易列表
function findTranList(wallet, cb) {
    // var interval = setInterval(function () {
    // change by  zl  删除不筛选pending状态的sql
    db.query("select datetime(creation_date/1000, 'unixepoch', 'localtime') as dateTime,*,case when result = 'final-bad' then 'invalid' when addressFrom in (select address from my_addresses where wallet = ?) then 'sent' else 'received' end as action \n" + "\n" + "from transactions where(addressFrom in (select address from my_addresses where wallet = ?) ) \n" + "union all\n" + "\n" + "select datetime(creation_date/1000, 'unixepoch', 'localtime') as dateTime, *,case when result = 'final-bad' then 'invalid' when addressTo in (select address from my_addresses where wallet = ?) then 'received' else 'sent' end as action \n" + "\n" + "from transactions where addressTo in (select address from my_addresses where wallet = ?)\n" + "\n" + " order by creation_date desc", [wallet, wallet, wallet, wallet], function (row) {
        //change by pmj 交易记录为什么peding的不出来？？？
        //db.query("select datetime(creation_date/1000, 'unixepoch', 'localtime') as dateTime,*,case when result = 'final-bad' then 'invalid' when addressFrom in (select address from my_addresses where wallet = ?) then 'sent' else 'received' end as action \n" + "\n" + "from transactions where(addressFrom in (select address from my_addresses where wallet = ?) ) \n" + "union all\n" + "\n" + "select datetime(creation_date/1000, 'unixepoch', 'localtime') as dateTime, *,case when result = 'final-bad' then 'invalid' when addressTo in (select address from my_addresses where wallet = ?) then 'received' else 'sent' end as action \n" + "\n" + "from transactions where addressTo in (select address from my_addresses where wallet = ?)\n" + "\n" + " order by creation_date desc", [wallet, wallet, wallet, wallet], function (row) {
        if (row != undefined && row.length > 0) {
            //clearInterval(interval);
            cb(row);
        } else {
            cb([]);
        }
    });
    //do whatever here..
    //}, 500);
}

//余额
async function findStable(wallet) {
    console.log('test1 -----' + wallet);
    // return stable =  await db.toList("select (select ifnull(sum(amount),0), ifnull(sum(amount_point),0) from transactions where addressTo in (select address from my_addresses where wallet = ?) and result = 'good') - \n\
    // 		(select ifnull(sum(amount + fee),0) from transactions where addressFrom in (select address from my_addresses where wallet = ?) and (result = 'good' or result = 'pending'))", wallet, wallet);

    return stable = await db.toList("select a.amount-ifnull(b.amount,0) amount, a.amount_point - ifnull(b.amount_point,0) amount_point,ifnull(b.fee,0) fee,ifnull(b.fee_point,0) fee_point from \n" + "(select addressTo, ifnull(sum(amount),0)  amount, ifnull(sum(amount_point),0)  amount_point \n" + "from transactions where addressTo in(select address from my_addresses where wallet = ? and result = 'good')) a \n" + "left join \n" + "(select addressFrom, ifnull(sum(amount),0) amount, ifnull(sum(amount_point),0) amount_point,ifnull(sum(fee),0) fee, ifnull(sum(fee_point),0) fee_point \n" + " from transactions where addressFrom in(select address from my_addresses where wallet = ? and ( result = 'good' or result = 'pending'))) b\n" + " on a.addressTo = b.addressFrom", wallet, wallet);
}

//余额
async function findStable3(address) {
    try{
        let sqlto="select  *,cast(amount_point as CHAR ) as amount_point,cast(fee_point as CHAR ) as fee_point,addressTo address  from transactions where addressTo=?";
        let sqlFrom="select  *,addressFrom address from transactions where addressFrom=?";
        let resTo = await  db.toList(sqlto,address);
        let resFrom = await  db.toList(sqlFrom,address);
        let to ={amount:0 ,amountPoint: 0}
        let from ={amount:0 ,amountPoint: 0}
        if(resTo && resTo.length > 0) {
            let amount = 0;
            let amountPoint = 0;
            resTo.forEach(function (i) {
                if(i.result == 'good'){
                    amount+= Number(i.amount);
                    amountPoint+=Number(i.amount_point)
                }
            });
            to.amount = amount;
            to.amountPoint = amountPoint.toString();
        }
        if(resFrom && resFrom.length > 0) {
            let amount = 0;
            let amountPoint = 0;
            resFrom.forEach(function (i) {
                if(i.result =='good' || i.result == 'pending'){
                    amount+= (i.amount+i.fee);
                    amountPoint+=(Number(i.amount_point)+Number(i.fee_point))
                }
            });
            from.amount = amount;
            from.amountPoint = amountPoint;
        }

        let stables = new Bignumber(to.amount.toString()).minus(new Bignumber(from.amount.toString())).plus(new Bignumber(to.amountPoint.toString()).div(new Bignumber(constants.INVE_VALUE.toString()))).minus(new Bignumber(from.amountPoint.toString()).div(new Bignumber(constants.INVE_VALUE.toString()))).toFixed();

        return stables;
    }catch (e) {
        return 0;
    }

    //console.log('test1 -----' + wallet);
    // return stable =  await db.toList("select (select ifnull(sum(amount),0), ifnull(sum(amount_point),0) from transactions where addressTo in (select address from my_addresses where wallet = ?) and result = 'good') - \n\
    // 		(select ifnull(sum(amount + fee),0) from transactions where addressFrom in (select address from my_addresses where wallet = ?) and (result = 'good' or result = 'pending'))", wallet, wallet);

    //return stable = await db.toList("select a.amount-ifnull(b.amount,0) amount, a.amount_point - ifnull(b.amount_point,0) amount_point,ifnull(b.fee,0) fee,ifnull(b.fee_point,0) fee_point from \n" + "(select addressTo, ifnull(sum(amount),0)  amount, ifnull(sum(amount_point),0)  amount_point \n" + "from transactions where addressTo in(select address from my_addresses where wallet = ? and result = 'good')) a \n" + "left join \n" + "(select addressFrom, ifnull(sum(amount),0) amount, ifnull(sum(amount_point),0) amount_point,ifnull(sum(fee),0) fee, ifnull(sum(fee_point),0) fee_point \n" + " from transactions where addressFrom in(select address from my_addresses where wallet = ? and ( result = 'good' or result = 'pending'))) b\n" + " on a.addressTo = b.addressFrom", wallet, wallet);
}

//余额
function findStable2(wallet, cb) {
    db.query("select (select ifnull(sum(amount),0) from transactions where addressTo in (select address from my_addresses where wallet = ?) and result = 'good') - \n\
			(select ifnull(sum(amount + fee),0) from transactions where addressFrom in (select address from my_addresses where wallet = ?) and (result = 'good' or result = 'pending')) as stable", [wallet, wallet], function (rows) {
        console.log('test----' + wallet);
        if (rows != undefined && rows.length > 0) {
            cb(rows[0].stable);
        } else {
            cb(0);
        }
    });
}

//根据余额查询交易信息
async function findTranInfoById(id) {
    let rows = await db.execute("SELECT * FROM transactions where id = ?", id);
    if (rows != undefined && rows.length == 1) return { id: rows[0].id, amount: rows[0].amount, result: rows[0].result };else return 0;
}

//查询聊天中未确认的交易
async function findPendingWithChat() {
    let rows = await db.toList("SELECT tran.*,tda.device FROM transactions_device_address tda LEFT JOIN transactions tran ON tda.id = tran.id");
    if (rows != null && rows.length > 0) return rows;else return 0;
}

//将交易列表(包括数据库中的交易记录)清空，发生的主要场景是共识网重启后，之前的交易记录会清空，本地需要同步。
async function truncateTran(addresses) {
    await iniTranList(addresses);
    let count = tranList.length;
    let cmds = [];
    if (count > 0) {
        db.addCmd(cmds, "delete from transactions where addressFrom in (?) or addressTo in (?)", addresses, addresses);
        db.addCmd(cmds, "DELETE FROM transactions_index WHERE  address IN (?)", addresses);
        //用队列的方式更新数据库
        await mutex.lock(["write"], async function (unlock) {
            try {
                let b_result = await db.executeTrans(cmds);
                if (!b_result) {
                    //清空列表
                    tranList = [];
                    //更新界面
                    eventBus.emit('my_transactions_became_stable');
                }
            } catch (e) {
                console.log(e.toString());
            } finally {
                //解锁事务队列delete from transactions where addressFrom = '0x59f338234df2c9c48d6d6a204492e72a55452fd8' or addressTO = '0x59f338234df2c9c48d6d6a204492e72a55452fd8'
                await unlock();
            }
        });
    }
}
//更新已有交易记录的状态
async function updateTran(tran, data) {
    let id = tran.hash;
    let cmds = [];
    //用队列的方式更新数据库
    //更新数据库
    let sql;
    let parm;
    let obj = JSON.parse(tran.message);
    let fee = "0";
    if (obj.hasOwnProperty("data")) {
        let b = JSON.parse(new Buffer(obj.data, "base64").toString());
        // obj.amount = utils.base64ToNumber(b.value).toString();
        // obj.fee = utils.base64ToNumber(b.gasLimit);
        // obj.toAddress = utils.base64ToString(b.toAddress);
        // obj.nrgPrice = utils.base64ToNumber(b.gasPrice)
        obj.amount = b.value;
        fee = b.gasLimit;
        obj.toAddress = b.toAddress;
        obj.nrgPrice = b.gasPrice;
        if(obj.toAddress == ""){
            let res = await hashnethelper.getReceipt(id);
            tran.toAddress = new Buffer.from(res.executionResult,'hex').toString();
        }
    }
    if (obj.type == 2) {
        let res = await hashnethelper.getReceipt(id);
        let NRG_PRICE = obj.nrgPrice;
        if(res) {
            fee = (res.gasUsed * NRG_PRICE).toString();
            obj.feeInt = parseInt(fee.replace(/"/g, '').substring(-1, fee.length - 18) ? fee.replace(/"/g, '').substring(-1, fee.length - 18) : 0);
            obj.feePoint = parseInt(fee.replace(/"/g, '').substring(fee.length - 18, fee.length) ? fee.replace(/"/g, '').substring(fee.length - 18, fee.length) : 0);
            obj.executionResult = res.executionResult ? res.executionResult :"";
            obj.error = res.error ? res.error : "";

        }else {
            obj.feeInt = "0"
            obj.feePoint = "0"
        }

        db.addCmd(cmds, "update transactions set result = 'good', fee =?, fee_point=?, executionResult=?, error=?   where id = ?", obj.feeInt, obj.feePoint,obj.executionResult, obj.error, id);
        db.addCmd(cmds, "UPDATE transactions_index SET tableIndex= ?,offsets= ?,sysTableIndex = ?, sysOffset = ?  WHERE address = ?", data.tableIndex, data.offset, data.sysTableIndex, data.sysOffset, data.address)
    } else {
        db.addCmd(cmds, "update transactions set result = 'good'   where id = ?", id)
        db.addCmd(cmds, "UPDATE transactions_index SET tableIndex= ?,offsets= ?,sysTableIndex = ?, sysOffset = ?  WHERE address = ?", data.tableIndex, data.offset, data.sysTableIndex, data.sysOffset, data.address)

    }
    await mutex.lock(["write"], async function (unlock) {
        try {
            let u_result = await db.executeTrans(cmds);
            if (u_result.affectedRows) {
                //更新列表
                refreshTranList(tran);
                //更新界面
                eventBus.emit('my_transactions_became_stable');
            }

        }catch (e) {
            console.log(e.toString());
        } finally {
            //解锁事务队列
            await unlock();
        };
    });
}
//失败的交易
async function badTran(tran, data) {
    let id = tran.hash;
    let cmds = [];
    db.addCmd(cmds, "update transactions set result = 'final-bad' where id = ?", id);
    db.addCmd(cmds, "UPDATE transactions_index SET tableIndex= ?,offsets= ? WHERE address = ?", data.tableIndex, data.offset, data.address);
    // await db.execute("UPDATE transactions_index SET tableIndex= ?,offsets= ? WHERE address = ?",data.tableIndex,data.offset,data.address);
    //用队列的方式更新数据库
    await mutex.lock(["write"], async function (unlock) {
        try {
            //更新数据库
            let b_result = await db.executeTrans(cmds);
            if (!b_result) {
                //更新列表
                refreshTranList(tran);
                //刷新界面
                eventBus.emit('my_transactions_became_stable');
            }
        } catch (e) {
            console.log(e.toString());
        } finally {
            //解锁事务队列
            await unlock();
        }
    });
}

/**
 * 新增一条其他币种的交易记录 这里是单链
 * @returns {Promise<void>}
 */
function insertOtherTran(data, callback) {
    var updateSql = `INSERT INTO transactions (id, creation_date, amount, fee, addressFrom, addressTo, result, remark, type, sType, eType, sHash, sConfirm, sStatu) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;
    db.query(updateSql, [data.txid, Math.round(new Date().getTime()), data.amount, data.fee, data.addressFrom, data.addressTo, 'pending', '', 0, data.type, data.type, data.txid, 0, 0], callback);
    haveUpdate = true;
}

function insertETHTran(data, callback) {
    var updateSql = `INSERT INTO transactions (id, creation_date, amount, amount_point, fee, addressFrom, addressTo, result, remark, type, sType, eType, sHash, sConfirm, sStatu) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;
    db.query(updateSql, [data.txid, Math.round(new Date().getTime()), data.amount, data.amount_point, data.fee, data.addressFrom, data.addressTo, 'pending', '', 0, data.type, data.type, data.txid, 0, 0], callback);
    ETH_haveUpdate = true;
}

/**
 * 新增一条多链的记录
 * @param data
 * @returns {Promise<void>}
 */
function insertMultiTran(data, callback) {
    var insertSql = `INSERT INTO transactions(id, creation_date, amount, amount_point, fee, fee_point, addressFrom, addressTo, result, remark, type, sType, eType, percent, sHash, sConfirm, sStatu, multiHash)VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;
    db.query(insertSql, [data.txid, Math.round(new Date().getTime()), data.amount, data.amount_point, data.fee, data.fee_point, data.addressFrom, data.addressTo, 'pending', '', data.type, data.sType, data.eType, data.percent, data.txid, 0, 0, data.multiHash], callback);
}

/**
 * 更新inve的multiHash
 * @param txid
 * @param multiHash
 * @param callback
 */
function updateMultiHash(txid, multiHash, type, callback) {
    var updateSql = `update transactions set multiHash = ?, type = ? WHERE id = ?`;
    db.query(updateSql, [multiHash, type, txid], callback);
}

/**
 * 获取币种
 * @param type
 * @param callback
 */
var coinTypeList = {};
function getCoinType(type, callback) {
    try {
        if (coinTypeList[type]) {
            callback(null, coinTypeList[type]);
            return;
        }
        db.query('select * from coin_type', function (res) {
            var length = res.length;
            for (var i = 0; i < length; i++) {
                var object = res[i];
                coinTypeList[object.coinType] = object;
            }
            callback(null, coinTypeList[type]);
        });
    } catch (err) {
        console.log(err);
        callback(err);
    }
}

/**
 *
 * @returns {Promise<*>}
 //  */
// async function getPending() {
//     let res =  await db.toList("SELECT id FROM transactions a left join my_addresses b on a.addressFrom=b.address WHERE result = 'pending' and b.wallet like'ETH-%' ");
//     return res;
// }

//新增一条交易记录
async function insertTran(tran, data) {
    console.log("\nsaving unit:");

    try{
        // console.log(JSON.stringify(tran));
        let updateTime = tran.updateTime;
        let obj = tran;
        tran = JSON.parse(tran.message);
        if(tran.hasOwnProperty("data")){
            let b = JSON.parse(new Buffer(tran.data,"base64").toString());
            // tran.amount = utils.base64ToNumber(b.value).toString();
            // tran.fee = utils.base64ToNumber(b.gasLimit);
            // tran.toAddress = utils.base64ToString(b.toAddress);
            // tran.nrgPrice = utils.base64ToNumber(b.gasPrice)
            tran.amount = b.value;
            tran.fee = b.gasLimit;
            tran.toAddress = b.toAddress;
            tran.nrgPrice = b.gasPrice;
            if(tran.toAddress == ""){
                let res = await hashnethelper.getReceipt(tran.signature);
                tran.toAddress = new Buffer.from(res.executionResult,'hex').toString();
            }
        }
        let executionResult ="";
        let error ="";
        let amount = tran.amount;
        let amountInt = parseInt(amount.replace(/"/g, '').substring(-1, amount.length - 18) ? amount.replace(/"/g, '').substring(-1, amount.length - 18) : 0);
        let amountPoint = parseInt(amount.replace(/"/g, '').substring(amount.length - 18, amount.length) ? amount.replace(/"/g, '').substring(amount.length - 18, amount.length) : 0);
        let NRG_PRICE = tran.nrgPrice;
        let fee = (tran.fee * NRG_PRICE).toString();
        let feeInt = parseInt(fee.replace(/"/g,'').substring(-1,fee.length-18) ? fee.replace(/"/g,'').substring(-1,fee.length-18) : 0);
        let feePoint = parseInt(fee.replace(/"/g,'').substring(fee.length-18,fee.length) ? fee.replace(/"/g,'').substring(fee.length-18,fee.length) : 0);
        if(tran.type == 2){
            let res = await hashnethelper.getReceipt(tran.signature);
            if(res){
                fee = (res.gasUsed * NRG_PRICE).toString();
                feeInt = parseInt(fee.replace(/"/g,'').substring(-1,fee.length-18) ? fee.replace(/"/g,'').substring(-1,fee.length-18) : 0);
                feePoint = parseInt(fee.replace(/"/g,'').substring(fee.length-18,fee.length) ? fee.replace(/"/g,'').substring(fee.length-18,fee.length) : 0);
                executionResult = res.executionResult ? res.executionResult: "";
                error = res.error ? res.error : "";

            }else {
                feeInt = "0"
                feePoint = "0"
            }


        }
        let Base64 = require('./base64Code');
        let note = tran.remark ? await Base64.decode(tran.remark) : '';
        //let fee = tran.fee.toFixed(0)
        var cmds = [];
        var fields = "id, creation_date, amount, fee, addressFrom, addressTo, result, remark, amount_point, fee_point, tranType, executionResult,error";
        var values = "?,?,?,?,?,?,?,?,?,?,?,?,?";
        // var params = [tran.hash, tran.time, amountInt, feeInt || 0, tran.fromAddress, tran.toAddress, getResultFromTran(tran), tran.remark, amountPoint, feePoint];
        var params = [tran.signature, updateTime, amountInt, feeInt || 0, tran.fromAddress, tran.toAddress, getResultFromTran(obj), note, amountPoint, feePoint, tran.type, executionResult,error];
        db.addCmd(cmds, "INSERT INTO transactions (" + fields + ") VALUES (" + values + ")", ...params);
        db.addCmd(cmds, "UPDATE transactions_index SET tableIndex= ?,offsets= ?,sysTableIndex = ?, sysOffset = ?  WHERE address = ?", data.tableIndex, data.offset,data.sysTableIndex, data.sysOffset, data.address);
        // await db.execute("UPDATE transactions_index SET tableIndex= ?,offsets= ? WHERE address = ?",data.tableIndex,data.offset,data.address);
        //用队列的方式更新数据库
        await mutex.lock(["write"], async function (unlock) {
            try {
                //更新数据库
                let i_result = await db.executeTrans(cmds);
                if (!i_result) {
                    //更新列表
                    refreshTranList(tran);
                    //刷新列表
                    eventBus.emit('my_transactions_became_stable');
                }
            } catch (e) {
                console.log(e.toString());
            } finally {
                //解锁事务队列
                await unlock();
            }
        });
    } catch (e) {
        console.log(e.toString())
    }

}

exports.stable = function () {
    return stable;
};
exports.pending = function () {
    return pending;
};
exports.tranList = function () {
    return tranList;
};

async function getDiceWin(address,cb){
    let res = await db.toList("select id,creation_date,amount,fee,amount_point,fee_point,addressFrom,addressTo,case error when'' then substr(executionResult,64,1) else''end as front  from transactions where addressTo=? and result<>'final-bad' order by creation_date desc ",address);
    if(res.length > 0){
        res.forEach(async function (i) {
            i.lotteryAmount = new Bignumber(i.amount).plus(new Bignumber(i.amount_point).div(new Bignumber(constants.INVE_VALUE))).toFixed();
            let res1 = await db.toList("select id,creation_date,amount,fee,amount_point,fee_point,addressFrom,addressTo from transactions where addressFrom=? and id=?",address,i.id+'_1');
            if(res1.length == 1){
                i.winnAmount = new Bignumber(res1[0].amount).plus(new Bignumber(res1[0].amount_point).div(new Bignumber(constants.INVE_VALUE))).toFixed();
                i.winnAmount = i.winnAmount == i.lotteryAmount ?"":i.winnAmount;
            }
            delete i.addressTo;
            delete i.fee;
            delete i.amount;
            delete i.fee_point;
            delete i.amount_point;
        });
        cb(res)
    }else {
        cb([])
    }
}

exports.updateHistory = updateHistory;
exports.updateOtherHistory = updateOtherHistory;
exports.refreshTranList = refreshTranList;
exports.iniTranList = iniTranList;
exports.findStable = findStable;
exports.findTranList = findTranList;
exports.findStable2 = findStable2;
exports.findStable3 = findStable3;
exports.findTranInfoById = findTranInfoById;
exports.findPendingWithChat = findPendingWithChat;
exports.insertOtherTran = insertOtherTran;
exports.insertMultiTran = insertMultiTran;
exports.getCoinType = getCoinType;
exports.updateMultiHash = updateMultiHash;
exports.insertETHTran = insertETHTran;
exports.updateMultiTrans = updateMultiTrans;
exports.getCheck = getCheck;
exports.setMultiUrl = setMultiUrl;
exports.updateStatu = updateStatu;
exports.getDiceWin = getDiceWin;
//exports.getPending = getPending;