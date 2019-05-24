/*jslint node: true */
"use strict";
var async = require('async');
var crypto = require('crypto');
var db = require('./db.js');
var mutex = require('./mutex.js');
var conf = require('./conf.js');
var objectHash = require('./object_hash.js');
var _ = require('lodash');
var network = require('./network.js');
var device = require('./device.js');
var eventBus = require('./event_bus.js');
var Definition = require("./definition.js");
var ValidationUtils = require("./validation_utils.js");
var breadcrumbs = require('./breadcrumbs.js');
var btc = require('./HDWallet/btc_helper');
var rpc = require('./HDWallet/btc_rpcHelper');
var eth = require('./HDWallet/eth_helper');
var light = require('./light');

try {
    var Bitcore = require('bitcore-lib');
}
catch (e) { // if intervaluecore is a symlink, load bitcore-lib from the main module
    var Bitcore = loadBitcoreFromNearestParent(module.parent);
}

var MAX_BIP44_GAP = 20;
var MAX_INT32 = Math.pow(2, 31) - 1;

function loadBitcoreFromNearestParent(mod) {
    if (!mod)
        throw Error("reached root but bitcore not found");
    try {
        return require(mod.paths[0] + '/bitcore-lib');
    }
    catch (e) {
        console.log("bitcore-lib not found from " + mod.filename + ", will try from its parent");
        return loadBitcoreFromNearestParent(mod.parent);
    }
}

function sendOfferToCreateNewWallet(device_address, wallet, arrWalletDefinitionTemplate, walletName, arrOtherCosigners, isSingleAddress, callbacks) {
    var body = { wallet: wallet, wallet_definition_template: arrWalletDefinitionTemplate, wallet_name: walletName, other_cosigners: arrOtherCosigners, is_single_address: isSingleAddress };
    device.sendMessageToDevice(device_address, "create_new_wallet", body, callbacks);
}

function sendCommandToCancelNewWallet(device_address, wallet, callbacks) {
    device.sendMessageToDevice(device_address, "cancel_new_wallet", { wallet: wallet }, callbacks);
}

function sendMyXPubKey(device_address, wallet, my_xpubkey) {
    device.sendMessageToDevice(device_address, "my_xpubkey", { wallet: wallet, my_xpubkey: my_xpubkey });
}

function sendNotificationThatWalletFullyApproved(device_address, wallet) {
    device.sendMessageToDevice(device_address, "wallet_fully_approved", { wallet: wallet });
}

function sendNewWalletAddress(device_address, wallet, is_change, address_index, address) {
    device.sendMessageToDevice(device_address, "new_wallet_address", {
        wallet: wallet, address: address, is_change: is_change, address_index: address_index
    });
}


function readNextAccount(handleAccount) {
    db.query("SELECT MAX(account) AS max_account FROM wallets", function (rows) {
        var account = (rows.length === 0) ? 0 : (rows[0].max_account + 1);
        handleAccount(account);
    });
}

// check that all members agree that the wallet is fully approved now
function checkAndFinalizeWallet(wallet, onDone) {
    db.query("SELECT member_ready_date FROM wallets LEFT JOIN extended_pubkeys USING(wallet) WHERE wallets.wallet=?", [wallet], function (rows) {
        if (rows.length === 0) { // wallet not created yet or already deleted
            //	throw Error("no wallet in checkAndFinalizeWallet");
            console.log("no wallet in checkAndFinalizeWallet");
            return onDone ? onDone() : null;
        }
        if (rows.some(function (row) { return !row.member_ready_date; }))
            return onDone ? onDone() : null;
        db.query("UPDATE wallets SET ready_date=" + db.getNow() + " WHERE wallet=? AND ready_date IS NULL", [wallet], function () {
            if (onDone)
                onDone();
            eventBus.emit('wallet_completed', wallet);
        });
    });
}

function checkAndFullyApproveWallet(wallet, onDone) {
    db.query("SELECT approval_date FROM wallets LEFT JOIN extended_pubkeys USING(wallet) WHERE wallets.wallet=?", [wallet], function (rows) {
        if (rows.length === 0) // wallet not created yet
            return onDone ? onDone() : null;
        if (rows.some(function (row) { return !row.approval_date; }))
            return onDone ? onDone() : null;
        db.query("UPDATE wallets SET full_approval_date=" + db.getNow() + " WHERE wallet=? AND full_approval_date IS NULL", [wallet], function () {
            db.query(
                "UPDATE extended_pubkeys SET member_ready_date=" + db.getNow() + " WHERE wallet=? AND device_address=?",
                [wallet, device.getMyDeviceAddress()],
                function () {
                    db.query(
                        "SELECT device_address FROM extended_pubkeys WHERE wallet=? AND device_address!=?",
                        [wallet, device.getMyDeviceAddress()],
                        function (rows) {
                            // let other members know that I've collected all necessary xpubkeys and ready to use this wallet
                            rows.forEach(function (row) {
                                sendNotificationThatWalletFullyApproved(row.device_address, wallet);
                            });
                            checkAndFinalizeWallet(wallet, onDone);
                        }
                    );
                }
            );
        });
    });
}

/**
 * 在UI层如果是BTC就一次导入20个公钥 超过20个要用户输解锁密码继续添加
 * @param wallet
 * @param xPubKey
 * @param account
 * @param arrWalletDefinitionTemplate
 * @param onDone
 * @param justAddPublicKey
 */
function addWallet(wallet, xPubKey, account, arrWalletDefinitionTemplate, onDone, justAddPublicKey) {
    var assocDeviceAddressesBySigningPaths = getDeviceAddressesBySigningPaths(arrWalletDefinitionTemplate);
    var arrDeviceAddresses = _.uniq(_.values(assocDeviceAddressesBySigningPaths));
    mutex.lock(['addWallet'], function (unlock) {
        /**
         * 如果是增加公钥地址时不需要重新存储钱包的 查询结果中如果没有就直接使用之前的插入
         */
        if (justAddPublicKey) {
            async.waterfall([
                    function (callback) {
                        db.query("SELECT 1 FROM wallets  WHERE wallet=?", [wallet], function (rows) {
                            callback(null, rows);
                        });
                    },
                    function (result, callback) {
                        if (rows.length <= 0) {
                            addWallet(wallet, xPubKey, account, arrWalletDefinitionTemplate, onDone);
                        }
                        async.eachSeries(
                            arrDeviceAddresses,
                            function (device_address, cb2) {
                                console.log("adding device " + device_address + ' to wallet ' + wallet);
                                var fields = "wallet, device_address";
                                var values = "?,?";
                                var arrParams = [wallet, device_address];
                                // arrDeviceAddresses.length === 1 works for singlesig with external priv key
                                if (device_address === device.getMyDeviceAddress() || arrDeviceAddresses.length === 1) {
                                    fields += ", extended_pubkey, approval_date";
                                    values += ",?," + db.getNow();
                                    arrParams.push(xPubKey);
                                    if (arrDeviceAddresses.length === 1) {
                                        fields += ", member_ready_date";
                                        values += ", " + db.getNow();
                                    }
                                }
                                db.query("INSERT " + db.getIgnore() + " INTO extended_pubkeys (" + fields + ") VALUES (" + values + ")", arrParams, function () {
                                    cb2();
                                });
                            },
                            callback)
                    }],
                function (err) {
                    if(err) return onDone(err)
                    console.log("addPublicKey done " + wallet);
                    (arrDeviceAddresses.length === 1) ? onDone() : checkAndFullyApproveWallet(wallet, onDone);
                }
            );
        }
        // async.series([
        //     function (cb) {
        //         var fields = "wallet, account, definition_template";
        //         var values = "?,?,?";
        //         if (arrDeviceAddresses.length === 1) { // single sig
        //             fields += ", full_approval_date, ready_date";
        //             values += ", " + db.getNow() + ", " + db.getNow();
        //         }
        //         db.query("INSERT INTO wallets (" + fields + ") VALUES (" + values + ")", [wallet, account, JSON.stringify(arrWalletDefinitionTemplate)], function () {
        //             cb();
        //         });
        //     },
        //     function (cb) {
        //         // async.eachSeries(
        //         //     arrDeviceAddresses,
        //         //     function (device_address, cb2) {
        //                 let device_address = arrDeviceAddresses[0];
        //                 console.log("adding device " + device_address + ' to wallet ' + wallet);
        //                 var fields = "wallet, device_address, extended_pubkey, approval_date, member_ready_date";
        //                 var values = "?,?,?," + db.getNow()+','+ db.getNow();
        //                 var arrParams = [wallet, device_address];
        //                 arrParams.push(xPubKey);
        //
        //                 db.query("INSERT " + db.getIgnore() + " INTO extended_pubkeys (" + fields + ") VALUES (" + values + ")", arrParams, function () {
        //                     cb();
        //                 });
        //         //     },
        //         //     cb
        //         // );
        //     },
        //     function (cb) {
        //         var arrSigningPaths = Object.keys(assocDeviceAddressesBySigningPaths);
        //         // async.eachSeries(
        //         //     arrSigningPaths,
        //         //     function (signing_path, cb2) {
        //                 let signing_path = arrSigningPaths[0];
        //                 console.log("adding signing path " + signing_path + ' to wallet ' + wallet);
        //                 var device_address = assocDeviceAddressesBySigningPaths[signing_path];
        //                 db.query(
        //                     "INSERT INTO wallet_signing_paths (wallet, signing_path, device_address) VALUES (?,?,?)",
        //                     [wallet, signing_path, device_address],
        //                     function () {
        //                         cb();
        //                     }
        //                 );
        //         //     },
        //         //     cb
        //         // );
        //     }
        // ], function () {
        //     console.log("addWallet done " + wallet);
        //     (arrDeviceAddresses.length === 1) ? onDone() : checkAndFullyApproveWallet(wallet, onDone);
        // });

        var fields = "wallet, account, definition_template";
        var values = "?,?,?";
        if (arrDeviceAddresses.length === 1) { // single sig
            fields += ", full_approval_date, ready_date";
            values += ", " + db.getNow() + ", " + db.getNow();
        }

        try {
            db.query("INSERT " + db.getIgnore() + " INTO wallets (" + fields + ") VALUES (" + values + ")", [wallet, account, JSON.stringify(arrWalletDefinitionTemplate)], function () {
                let device_address = arrDeviceAddresses[0];
                console.log("adding device " + device_address + ' to wallet ' + wallet);
                var fields = "wallet, device_address, extended_pubkey, approval_date, member_ready_date";
                var values = "?,?,?," + db.getNow() + ',' + db.getNow();
                var arrParams = [wallet, device_address];
                arrParams.push(xPubKey);

                db.query("INSERT " + db.getIgnore() + " INTO extended_pubkeys (" + fields + ") VALUES (" + values + ")", arrParams, function () {
                    var arrSigningPaths = Object.keys(assocDeviceAddressesBySigningPaths);
                    let signing_path = arrSigningPaths[0];
                    console.log("adding signing path " + signing_path + ' to wallet ' + wallet);
                    db.query(
                        "INSERT INTO wallet_signing_paths (wallet, signing_path, device_address) VALUES (?,?,?)",
                        [wallet, signing_path, device_address],
                        function () {
                            unlock();
                            onDone()
                        });
                });
            });
        } catch (e) {
            unlock();
            console.log(e.toString())
            alert(e.toString())
        }finally {
            unlock();
        }
    });
}

// initiator of the new wallet creates records about itself and sends requests to other devices
function createWallet(xPubKey, account, arrWalletDefinitionTemplate, walletName, isSingleAddress, handleWallet, type) {
    var wallet = type+'-' + crypto.createHash("sha256").update(xPubKey, "utf8").digest("base64");
    console.log('will create wallet ' + wallet);
    var arrDeviceAddresses = getDeviceAddresses(arrWalletDefinitionTemplate);
    addWallet(wallet, xPubKey, account, arrWalletDefinitionTemplate, function (err) {
        if(err) handleWallet(null,err);
        handleWallet(wallet);
        if (arrDeviceAddresses.length === 1) // single sig
            return;
        console.log("will send offers");
        // this continues in parallel while the callback handleWallet was already called
        // We need arrOtherCosigners to make sure all cosigners know the pubkeys of all other cosigners, even when they were not paired.
        // For example, there are 3 cosigners: A (me), B, and C. A is paired with B, A is paired with C, but B is not paired with C.
        device.readCorrespondentsByDeviceAddresses(arrDeviceAddresses, function (arrOtherCosigners) {
            if (arrOtherCosigners.length !== arrDeviceAddresses.length - 1)
                throw Error("incorrect length of other cosigners");
            arrDeviceAddresses.forEach(function (device_address) {
                if (device_address === device.getMyDeviceAddress())
                    return;
                console.log("sending offer to " + device_address);
                sendOfferToCreateNewWallet(device_address, wallet, arrWalletDefinitionTemplate, walletName, arrOtherCosigners, isSingleAddress, null);
                sendMyXPubKey(device_address, wallet, xPubKey);
            });
        });
    });
}

function createMultisigWallet(xPubKey, account, count_required_signatures, arrDeviceAddresses, walletName, isSingleAddress, handleWallet, type) {
    if (count_required_signatures > arrDeviceAddresses.length)
        throw Error("required > length");
    var set = arrDeviceAddresses.map(function (device_address) { return ["sig", { pubkey: '$pubkey@' + device_address }]; });
    var arrDefinitionTemplate = ["r of set", { required: count_required_signatures, set: set }];
    createWallet(xPubKey, account, arrDefinitionTemplate, walletName, isSingleAddress, handleWallet, type);
}

// walletName will not be used
function createSinglesigWallet(xPubKey, account, walletName, handleWallet, type) {
    var arrDefinitionTemplate = ["sig", { pubkey: '$pubkey@' + device.getMyDeviceAddress() }];
    createWallet(xPubKey, account, arrDefinitionTemplate, walletName, null, handleWallet, type);
}

// called from UI
function createWalletByDevices(xPubKey, account, count_required_signatures, arrOtherDeviceAddresses, walletName, isSingleAddress, handleWallet, type) {
    console.log('createWalletByDevices: xPubKey=' + xPubKey + ", account=" + account);
    if (arrOtherDeviceAddresses.length === 0)
        createSinglesigWallet(xPubKey, account, walletName, handleWallet, type);
    else
        createMultisigWallet(xPubKey, account, count_required_signatures,
            [device.getMyDeviceAddress()].concat(arrOtherDeviceAddresses), walletName, isSingleAddress, handleWallet, type);
}

// called from UI after user confirms creation of wallet initiated by another device
function approveWallet(wallet, xPubKey, account, arrWalletDefinitionTemplate, arrOtherCosigners, onDone) {
    var arrDeviceAddresses = getDeviceAddresses(arrWalletDefinitionTemplate);
    device.addIndirectCorrespondents(arrOtherCosigners, function () {
        addWallet(wallet, xPubKey, account, arrWalletDefinitionTemplate, function () {
            arrDeviceAddresses.forEach(function (device_address) {
                if (device_address !== device.getMyDeviceAddress())
                    sendMyXPubKey(device_address, wallet, xPubKey);
            });
            if (onDone)
                onDone();
        });
    });
}

// called from UI
function cancelWallet(wallet, arrDeviceAddresses, arrOtherCosigners) {
    console.log("canceling wallet " + wallet);
    // some of the cosigners might not be paired
    /*
    arrDeviceAddresses.forEach(function(device_address){
        if (device_address !== device.getMyDeviceAddress())
            sendCommandToCancelNewWallet(device_address, wallet);
    });*/
    var arrOtherDeviceAddresses = _.uniq(arrOtherCosigners.map(function (cosigner) { return cosigner.device_address; }));
    var arrInitiatorDeviceAddresses = _.difference(arrDeviceAddresses, arrOtherDeviceAddresses);
    if (arrInitiatorDeviceAddresses.length !== 1)
        throw Error("not one initiator?");
    var initiator_device_address = arrInitiatorDeviceAddresses[0];
    sendCommandToCancelNewWallet(initiator_device_address, wallet);
    arrOtherCosigners.forEach(function (cosigner) {
        if (cosigner.device_address === device.getMyDeviceAddress())
            return;
    });
    db.query("DELETE FROM extended_pubkeys WHERE wallet=?", [wallet], function () {
        db.query("DELETE FROM wallet_signing_paths WHERE wallet=?", [wallet], function () { });
    });
}

// called from network, without user interaction
// One of the proposed cosigners declined wallet creation
function deleteWallet(wallet, rejector_device_address, onDone) {
    db.query("SELECT approval_date FROM extended_pubkeys WHERE wallet=? AND device_address=?", [wallet, rejector_device_address], function (rows) {
        if (rows.length === 0) // you are not a member device
            return onDone();
        if (rows[0].approval_date) // you've already approved this wallet, you can't change your mind
            return onDone();
        db.query("SELECT device_address FROM extended_pubkeys WHERE wallet=?", [wallet], function (rows) {
            var arrMemberAddresses = rows.map(function (row) { return row.device_address; });
            var arrQueries = [];
            db.addQuery(arrQueries, "DELETE FROM extended_pubkeys WHERE wallet=?", [wallet]);
            db.addQuery(arrQueries, "DELETE FROM wallet_signing_paths WHERE wallet=?", [wallet]);
            db.addQuery(arrQueries, "DELETE FROM wallets WHERE wallet=?", [wallet]);
            // delete unused indirect correspondents
            db.addQuery(
                arrQueries,
                "DELETE FROM correspondent_devices WHERE is_indirect=1 AND device_address IN(?) AND NOT EXISTS ( \n\
                    SELECT * FROM extended_pubkeys WHERE extended_pubkeys.device_address=correspondent_devices.device_address \n\
                )",
                [arrMemberAddresses]
            );
            async.series(arrQueries, function () {
                eventBus.emit('wallet_declined', wallet, rejector_device_address);
                onDone();
            });
        });
    });
}

// called from network, without user interaction
// One of the proposed cosigners declined wallet creation\
/**
 * 根据walletid删除钱包数据库信息
 * @param wallet
 * @param onDone
 */
function deleteWalletFromUI(wallet, onDone) {
    var arrQueries = [];
    var address ;
    var otherAddresses = [];
    db.query("select address from my_addresses where wallet =?",[wallet],function (res) {
        if(res) address = res[0].address;
        db.query("select address from my_addresses where wallet <>?",[wallet],function (res1) {
            if(res1) res1.forEach(function (t) {
                otherAddresses.push(t.address);
            });
            db.addQuery(arrQueries, "DELETE FROM my_addresses WHERE wallet=?", [wallet]);
            db.addQuery(arrQueries, "DELETE FROM extended_pubkeys WHERE wallet=?", [wallet]);
            db.addQuery(arrQueries, "DELETE FROM wallet_signing_paths WHERE wallet=?", [wallet]);
            db.addQuery(arrQueries, "DELETE FROM wallets WHERE wallet=?", [wallet]);
            //删除地址时，删除当前地址交易记录（本地其他地址与当前地址关联交易pending状态的交易记录）
            db.addQuery(arrQueries, "DELETE FROM transactions WHERE (addressFrom =? or addressTo =?) AND addressFrom NOT IN(?) and addressTo  NOT IN(?)", [address, address, otherAddresses, otherAddresses]);
            db.addQuery(arrQueries, "DELETE FROM transactions WHERE (addressFrom =? or addressTo =?) AND addressFrom  IN(SELECT addressFrom  FROM transactions WHERE result='pending' and addressFrom in (?)) and addressTo IN(SELECT addressTo FROM  transactions WHERE result='pending' and addressTo in(?))", [address, address, otherAddresses, otherAddresses]);
            db.addQuery(arrQueries, "DELETE FROM transactions_index WHERE address like ?", ['%' + address + '%']);
            // delete unused indirect correspondents
            async.series(arrQueries, function () {
                light.updateStatu();
                onDone();
            });
        });

    })

}

/**
 * 根据address删除钱包数据库信息
 * @param address
 * @param onDone
 */
function deleteWalletFromUIForAddress(address, onDone) {
    var arrQueries = [];
    var wallet ;
    var otherAddresses = [];
    db.query("select address,wallet from my_addresses where address =?",[address],function (res) {
        if(res){
            wallet = res[0].wallet;
        }
        db.query("select address from my_addresses where wallet <>?",[wallet],function (res1) {
            if(res1) res1.forEach(function (t) {
                otherAddresses.push(t.address);
            });
            db.addQuery(arrQueries, "DELETE FROM my_addresses WHERE wallet=?", [wallet]);
            db.addQuery(arrQueries, "DELETE FROM extended_pubkeys WHERE wallet=?", [wallet]);
            db.addQuery(arrQueries, "DELETE FROM wallet_signing_paths WHERE wallet=?", [wallet]);
            db.addQuery(arrQueries, "DELETE FROM wallets WHERE wallet=?", [wallet]);
            //删除地址时，删除当前地址交易记录（本地其他地址与当前地址关联交易pending状态的交易记录）
            db.addQuery(arrQueries, "DELETE FROM transactions WHERE (addressFrom =? or addressTo =?) AND addressFrom NOT IN(?) and addressTo  NOT IN(?)", [address, address, otherAddresses, otherAddresses]);
            db.addQuery(arrQueries, "DELETE FROM transactions WHERE (addressFrom =? or addressTo =?) AND addressFrom  IN(SELECT addressFrom  FROM transactions WHERE result='pending' and addressFrom in (?)) and addressTo IN(SELECT addressTo FROM  transactions WHERE result='pending' and addressTo in(?))", [address, address, otherAddresses, otherAddresses]);
            db.addQuery(arrQueries, "DELETE FROM transactions_index WHERE address like ?", ['%' + address + '%']);
            // delete unused indirect correspondents
            async.series(arrQueries, function (err) {
                if(err) return onDone(err)
                light.updateStatu();
                onDone();
            });
        });

    })

}

// called from network, without user interaction

function readCosigners(wallet, handleCosigners) {
    db.query(
        "SELECT extended_pubkeys.device_address, name, approval_date, extended_pubkey \n\
        FROM extended_pubkeys LEFT JOIN correspondent_devices USING(device_address) WHERE wallet=?",
        [wallet],
        function (rows) {
            rows.forEach(function (row) {
                if (row.device_address === device.uPMyHotDeviceAddress()) {
                    if (row.name !== null)
                        throw Error("found self in correspondents");
                    row.me = true;
                }
                //else if (row.name === null)
                //throw Error("cosigner not found among correspondents, cosigner=" + row.device_address + ", my=" + device.getMyDeviceAddress());
            });
            handleCosigners(rows);
        }
    );
}


function getDeviceAddresses(arrWalletDefinitionTemplate) {
    return _.uniq(_.values(getDeviceAddressesBySigningPaths(arrWalletDefinitionTemplate)));
}

function getDeviceAddressesBySigningPaths(arrWalletDefinitionTemplate) {
    function evaluate(arr, path) {
        var op = arr[0];
        var args = arr[1];
        if (!args)
            return;
        var prefix = '$pubkey@';
        switch (op) {
            case 'sig':
                if (!args.pubkey || args.pubkey.substr(0, prefix.length) !== prefix)
                    return;
                var device_address = args.pubkey.substr(prefix.length);
                assocDeviceAddressesBySigningPaths[path] = device_address;
                break;
            case 'hash':
                if (!args.hash || args.hash.substr(0, prefix.length) !== prefix)
                    return;
                var device_address = args.hash.substr(prefix.length);
                assocDeviceAddressesBySigningPaths[path] = device_address;
                break;
            case 'or':
            case 'and':
                for (var i = 0; i < args.length; i++)
                    evaluate(args[i], path + '.' + i);
                break;
            case 'r of set':
                if (!ValidationUtils.isNonemptyArray(args.set))
                    return;
                for (var i = 0; i < args.set.length; i++)
                    evaluate(args.set[i], path + '.' + i);
                break;
            case 'weighted and':
                if (!ValidationUtils.isNonemptyArray(args.set))
                    return;
                for (var i = 0; i < args.set.length; i++)
                    evaluate(args.set[i].value, path + '.' + i);
                break;
            case 'address':
            case 'definition template':
                throw Error(op + " not supported yet");
            // all other ops cannot reference device address
        }
    }
    var assocDeviceAddressesBySigningPaths = {};
    evaluate(arrWalletDefinitionTemplate, 'r');
    return assocDeviceAddressesBySigningPaths;
}


//todo delete 底层
function readNextAddressIndex(wallet, is_change, handleNextAddressIndex) {
    db.query("SELECT MAX(address_index) AS last_used_index FROM my_addresses WHERE wallet=? AND is_change=?", [wallet, is_change], function (rows) {
        var last_used_index = rows[0].last_used_index;
        handleNextAddressIndex((last_used_index === null) ? 0 : (last_used_index + 1));
    });
}


function readLastUsedAddressIndex(wallet, is_change, handleLastUsedAddressIndex) {
    db.query(
        "SELECT MAX(address_index) AS last_used_index FROM my_addresses JOIN outputs USING(address) WHERE wallet=? AND is_change=?",
        [wallet, is_change],
        function (rows) {
            var last_used_index = rows[0].last_used_index;
            handleLastUsedAddressIndex(last_used_index);
        }
    );
}

/**
 * 衍生出子公钥 并用base64编码
 * @param xPubKey
 * @param path
 * @returns {*}
 */
function derivePubkey(xPubKey, path) {
    var hdPubKey = new Bitcore.HDPublicKey(xPubKey);
    return hdPubKey.derive(path).publicKey.toBuffer().toString("base64");
}

/**
 *	获取地址
 * @param wallet
 * @param is_change
 * @param address_index
 * @param handleNewAddress
 *
 * walletId 在BTC多地址的情况下时 第一个公钥对应walletId 然后是对应多个地址
 * 支持不同的币种生成不同的地址
 * segwit in btc means 隔离见证地址
 */
function deriveAddress(wallet, is_change, address_index, handleNewAddress, type, segwit, network) {
    console.log('import Type:' + type);
    db.query("SELECT definition_template, full_approval_date, account FROM wallets WHERE wallet=?", [wallet], function (wallet_rows) {
        if (wallet_rows.length === 0)
            throw Error("wallet not found: " + wallet + ", is_change=" + is_change + ", index=" + address_index);
        if (!wallet_rows[0].full_approval_date)
            throw Error("wallet not fully approved yet: " + wallet);
        var arrDefinitionTemplate = JSON.parse(wallet_rows[0].definition_template);
        db.query(
            "SELECT device_address, extended_pubkey FROM extended_pubkeys WHERE wallet=?",
            [wallet],
            function (rows) {
                if (rows.length === 0)
                    throw Error("no extended pubkeys in wallet " + wallet);
                if (type == 'BTC'){
                    if (rows.length < address_index + 1){
                        throw  Error("not have enough extended pubkeys in wallet" + wallet); // this prompt means need user import password to import more publicKey
                        return;
                    }
                    let address = btc.getAddressBynode(segwit, rows[address_index].extended_pubkey, network);
                    console.log('walletAddress:   ' + address + '----------------------------------------------------');
                    function importBtc(){
                        rpc.importMultiAddress(address, 0, function(err, res){
                            if (err !== null){
                                console.log(err);
                                setTimeout(importBtc, 1000);
                            }
                        })
                    }

                    importBtc();

                    handleNewAddress(address, arrDefinitionTemplate);
                    return;
                } else if (type == 'ETH'){
                    if (rows.length < address_index + 1){
                        throw  Error("not have enough extended pubkeys in wallet" + wallet); // this prompt means need user import password to import more publicKey
                        return;
                    }
                    let address = eth.getAddressBynode(rows[address_index].extended_pubkey);
                    console.log('walletAddress:   ' + address + '----------------------------------------------------');
                    handleNewAddress(address, arrDefinitionTemplate);
                    return;
                }
                var path = "m/" + is_change + "/" + address_index;
                var params = {};
                rows.forEach(function (row) {
                    if (!row.extended_pubkey)
                        throw Error("no extended_pubkey for wallet " + wallet);
                    params['pubkey@' + row.device_address] = derivePubkey(row.extended_pubkey, path);
                    console.log('pubkey for wallet ' + wallet + ' path ' + path + ' device ' + row.device_address + ' xpub ' + row.extended_pubkey + ': ' + params['pubkey@' + row.device_address]);
                });
                /**
                 * 这里是生成地址的地方 其他币种应该是不一样的
                 */
                var arrDefinition = Definition.replaceInTemplate(arrDefinitionTemplate, params);
                var address = objectHash.getChash160(arrDefinition);
                handleNewAddress(address, arrDefinition);
            }
        );
    });
}

/**
 * 记录地址
 * @param wallet
 * @param is_change
 * @param address_index
 * @param address
 * @param arrDefinition
 * @param onDone
 * 唯一一个把地址记录进去的地方
 */
function recordAddress(wallet, is_change, address_index, address, arrDefinition, onDone) {
    if(is_change != 0 || address_index != 0) {
        console.log("error:the address is not allow create----is_change is"+is_change + ",address_index is " + address_index);
        onDone();
        return;
    }
    if (typeof address_index === 'string' && is_change)
        throw Error("address with string index cannot be change address");
    var address_index_column_name = (typeof address_index === 'string') ? 'app' : 'address_index';
    db.query( // IGNORE in case the address was already generated
        "INSERT " + db.getIgnore() + " INTO my_addresses (wallet, is_change, " + address_index_column_name + ", address, definition) VALUES (?,?,?,?,?)",
        [wallet, is_change, address_index, address, JSON.stringify(arrDefinition)],
        function () {
            eventBus.emit("new_address-" + address);
            if (onDone)
                onDone();
            //	network.addWatchedAddress(address);
            if (conf.bLight && !is_change)
                network.addLightWatchedAddress(address);
        }
    );
}

//todo delete
function deriveAndRecordAddress(wallet, is_change, address_index, handleNewAddress, type, segwit, network) {
    deriveAddress(wallet, is_change, address_index, function (address, arrDefinition) {
        recordAddress(wallet, is_change, address_index, address, arrDefinition, function () {
            handleNewAddress(address);
        });
    }, type, segwit, network);
}

/**
 * 发行地址
 * @param wallet
 * @param is_change
 * @param address_index
 * @param handleNewAddress
 */
function issueAddress(wallet, is_change, address_index, handleNewAddress, type, segwit, network) {
    breadcrumbs.add('issueAddress wallet=' + wallet + ', is_change=' + is_change + ', index=' + address_index);
    deriveAndRecordAddress(wallet, is_change, address_index, function (address) {
        db.query("SELECT device_address FROM extended_pubkeys WHERE wallet=?", [wallet], function (rows) {
            rows.forEach(function (row) {
                if (row.device_address !== device.getMyDeviceAddress())
                    sendNewWalletAddress(row.device_address, wallet, is_change, address_index, address);
            });
            handleNewAddress({ address: address, is_change: is_change, address_index: address_index, creation_ts: parseInt(Date.now() / 1000) });
        });
    }, type, segwit, network);
    setTimeout(function () {
        checkAddress(0, 0, 0);
    }, 5000);
}


/**
 *
 * @param wallet
 * @param is_change
 * @param from_index
 * @param handleAddress
 */
function selectRandomAddress(wallet, is_change, from_index, handleAddress) {
    if (from_index === null)
        from_index = -1;
    db.query(
        "SELECT address, address_index, " + db.getUnixTimestamp("creation_date") + " AS creation_ts \n\
		FROM my_addresses WHERE wallet=? AND is_change=? AND address_index>? ORDER BY "+ db.getRandom() + " LIMIT 1",
        [wallet, is_change, from_index],
        function (rows) {
            handleAddress(rows[0]);
        }
    );
}


/**
 *
 * @param wallet
 * @param is_change
 * @param handleAddress
 */
function issueNextAddress(wallet, is_change, handleAddress, type, segwit) {
    console.log('issue NEXT')
    mutex.lock(['issueNextAddress'], function (unlock) {
        readNextAddressIndex(wallet, is_change, function (next_index) {
            issueAddress(wallet, is_change, next_index, function (addressInfo) {
                handleAddress(addressInfo);
                unlock();
            }, type, segwit);
        });
    });
}

// selects one of recent addresses if the gap is too large, otherwise issues a new address
function issueOrSelectNextAddress(wallet, is_change, handleAddress, type, segwit, network) {
    console.log('issueORselectNext' + type);
    readNextAddressIndex(wallet, is_change, function (next_index) {
        if (next_index < MAX_BIP44_GAP)
            return issueAddress(wallet, is_change, next_index, handleAddress, type, segwit, network);
        readLastUsedAddressIndex(wallet, is_change, function (last_used_index) {
            if (last_used_index === null || next_index - last_used_index >= MAX_BIP44_GAP)
                selectRandomAddress(wallet, is_change, last_used_index, handleAddress);
            else
                issueAddress(wallet, is_change, next_index, handleAddress, type, segwit, network);
        });
    });
}


function checkAddress(account, is_change, address_index) {
    db.query("SELECT wallet, extended_pubkey FROM wallets JOIN extended_pubkeys USING(wallet) WHERE account=?", [account], function (rows) {
        if (rows.length === 0 || rows.length > 1)
            return;
        var row = rows[0];
        var pubkey = derivePubkey(row.extended_pubkey, "m/" + is_change + "/" + address_index);
        var arrDefinition = ['sig', { pubkey: pubkey }];
        var address = objectHash.getChash160(arrDefinition);
        db.query(
            "SELECT address, definition FROM my_addresses WHERE wallet=? AND is_change=? AND address_index=?",
            [row.wallet, is_change, address_index],
            function (address_rows) {
                if (address_rows.length === 0)
                    return;
                var address_row = address_rows[0];
                var db_pubkey = JSON.parse(address_row.definition)[1].pubkey;
                if (db_pubkey !== pubkey)
                    throw Error("pubkey mismatch, derived: " + pubkey + ", db: " + db_pubkey);
                if (address_row.address !== address)
                    throw Error("address mismatch, derived: " + address + ", db: " + address_row.address);
                breadcrumbs.add("addresses match");
            }
        );
    });
}

/**
 * 读取地址
 * @param wallet
 * @param opts
 * @param handleAddresses
 */
//TODO 需要优化
function readAddresses(wallet, opts, handleAddresses) {
    var sql = "SELECT address, address_index, is_change, " + db.getUnixTimestamp("creation_date") + " AS creation_ts \n\
		FROM my_addresses WHERE wallet=?";
    if (opts.is_change === 0 || opts.is_change === 1)
        sql += " AND is_change=" + opts.is_change;
    sql += " ORDER BY creation_ts";
    if (opts.reverse)
        sql += " DESC";
    if (opts.limit)
        sql += " LIMIT " + opts.limit;
    db.query(
        sql,
        [wallet],
        function (rows) {
            handleAddresses(rows);
        }
    );
    checkAddress(0, 0, 0);
}



function forwardPrivateChainsToOtherMembersOfWallets(arrChains, arrWallets, conn, onSaved) {
    console.log("forwardPrivateChainsToOtherMembersOfWallets", arrWallets);
    conn = conn || db;
    conn.query(
        "SELECT device_address FROM extended_pubkeys WHERE wallet IN(?) AND device_address!=?",
        [arrWallets, device.getMyDeviceAddress()],
        function (rows) {
            var arrDeviceAddresses = rows.map(function (row) { return row.device_address; });
            console.log("delete walletGeneral.forwardPrivateChainsToDevices");
            // walletGeneral.forwardPrivateChainsToDevices(arrDeviceAddresses, arrChains, true, conn, onSaved);
        }
    );
}

function readDeviceAddressesControllingPaymentAddresses(conn, arrAddresses, handleDeviceAddresses) {
    if (arrAddresses.length === 0)
        return handleDeviceAddresses([]);
    conn = conn || db;
    conn.query(
        "SELECT DISTINCT device_address FROM my_addresses JOIN extended_pubkeys USING(wallet) WHERE address IN(?) AND device_address!=?",
        [arrAddresses, device.getMyDeviceAddress()],
        function (rows) {
            var arrDeviceAddresses = rows.map(function (row) { return row.device_address; });
            handleDeviceAddresses(arrDeviceAddresses);
        }
    );
}




exports.readNextAccount = readNextAccount;
exports.createWalletByDevices = createWalletByDevices;
exports.approveWallet = approveWallet;
exports.cancelWallet = cancelWallet;

exports.deleteWallet = deleteWallet;

exports.issueNextAddress = issueNextAddress;
exports.issueOrSelectNextAddress = issueOrSelectNextAddress;
exports.readAddresses = readAddresses;

exports.forwardPrivateChainsToOtherMembersOfWallets = forwardPrivateChainsToOtherMembersOfWallets;

exports.readDeviceAddressesControllingPaymentAddresses = readDeviceAddressesControllingPaymentAddresses;

exports.readCosigners = readCosigners;
exports.deleteWalletFromUI = deleteWalletFromUI;
exports.deleteWalletFromUIForAddress = deleteWalletFromUIForAddress;
exports.derivePubkey = derivePubkey;
exports.issueAddress = issueAddress;
exports.createWallet = createWallet;
exports.issueNextAddress = issueNextAddress;