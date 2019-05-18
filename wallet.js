/*jslint node: true */
"use strict";

var async = require('async');
var _ = require('lodash');
var db = require('./db.js');
var ecdsaSig = require('./signature.js');
var mutex = require('./mutex.js');
var constants = require('./constants.js');
var conf = require('./conf.js');
var objectHash = require('./object_hash.js');
var network = require('./network.js');
var storage = require('./storage.js');
var device = require('./device.js');
var eventBus = require('./event_bus.js');
var ValidationUtils = require("./validation_utils.js");
var composer = require('./composer.js');
var balances = require('./balances');
var light = require('./light.js');
var bignumber = require('bignumber.js');

var message_counter = 0; //統計接受消息數
var assocLastFailedAssetMetadataTimestamps = {};
var ASSET_METADATA_RETRY_PERIOD = 3600 * 1000;

function handleJustsaying(ws, subject, body) {
    switch (subject) {
        // I'm connected to a hub, received challenge
        case 'hub/challenge':
            var challenge = body;
            device.handleChallenge(ws, challenge);
            break;

        // I'm connected to a hub, received a message through the hub
        case 'hub/message':
            var objDeviceMessage = body.message;
            var message_hash = body.message_hash;
            var respondWithError = function (error) {
                network.sendError(ws, error);
                network.sendJustsaying(ws, 'hub/delete', message_hash);
            };
            if (!message_hash || !objDeviceMessage || !objDeviceMessage.signature || !objDeviceMessage.pubkey || !objDeviceMessage.to || !objDeviceMessage.encrypted_package || !objDeviceMessage.encrypted_package.dh || !objDeviceMessage.encrypted_package.dh.sender_ephemeral_pubkey || !objDeviceMessage.encrypted_package.encrypted_message || !objDeviceMessage.encrypted_package.iv || !objDeviceMessage.encrypted_package.authtag) return network.sendError(ws, "missing fields");
            if (objDeviceMessage.to !== device.getMyDeviceAddress()) return network.sendError(ws, "not mine");
            if (message_hash !== objectHash.getBase64Hash(objDeviceMessage)) return network.sendError(ws, "wrong hash");
            if (!ecdsaSig.verify(objectHash.getDeviceMessageHashToSign(objDeviceMessage), objDeviceMessage.signature, objDeviceMessage.pubkey)) return respondWithError("wrong message signature");
            // end of checks on the open (unencrypted) part of the message. These checks should've been made by the hub before accepting the message

            // decrypt the message
            var json = device.decryptPackage(objDeviceMessage.encrypted_package);
            if (!json) return respondWithError("failed to decrypt");

            // who is the sender
            var from_address = objectHash.getDeviceAddress(objDeviceMessage.pubkey);
            // the hub couldn't mess with json.from as it was encrypted, but it could replace the objDeviceMessage.pubkey and re-sign. It'll be caught here
            if (from_address !== json.from) return respondWithError("wrong message signature");

            var handleMessage = function (bIndirectCorrespondent) {
                // serialize all messages from hub
                mutex.lock(["from_hub"], function (unlock) {
                    handleMessageFromHub(ws, json, objDeviceMessage.pubkey, bIndirectCorrespondent, {
                        ifError: function (err) {
                            respondWithError(err);
                            unlock();
                        },
                        ifOk: function () {
                            network.sendJustsaying(ws, 'hub/delete', message_hash);
                            unlock();
                        }
                    });
                });
            };
            // check that we know this device
            db.query("SELECT hub, is_indirect FROM correspondent_devices WHERE device_address=?", [from_address], function (rows) {
                if (rows.length > 0) {
                    if (json.device_hub && json.device_hub !== rows[0].hub) // update correspondent's home address if necessary
                        db.query("UPDATE correspondent_devices SET hub=? WHERE device_address=?", [json.device_hub, from_address], function () {
                            handleMessage(rows[0].is_indirect);
                        });else handleMessage(rows[0].is_indirect);
                } else {
                    // correspondent not known
                    var arrSubjectsAllowedFromNoncorrespondents = ["pairing", "my_xpubkey", "wallet_fully_approved"];
                    if (arrSubjectsAllowedFromNoncorrespondents.indexOf(json.subject) === -1) return respondWithError("correspondent not known and not whitelisted subject");
                    handleMessage(false);
                }
            });
            break;

        // I'm connected to a hub, received a report about my undelivered inbox
        case 'hub/message_box_status':
            if (!ws.bLoggedIn) return respondWithError("you are not my hub");
            if (body === 'empty') device.scheduleTempDeviceKeyRotation();
            break;

        case 'light/have_updates':
            lightWallet.refreshLightClientHistory();
            break;
    }
}

eventBus.on("message_from_hub", handleJustsaying);
eventBus.on("message_for_light", handleJustsaying);

// one of callbacks MUST be called, otherwise the mutex will stay locked
function handleMessageFromHub(ws, json, device_pubkey, bIndirectCorrespondent, callbacks) {
    var subject = json.subject;
    var body = json.body;
    if (!subject || typeof body == "undefined") return callbacks.ifError("no subject or body");
    //if (bIndirectCorrespondent && ["cancel_new_wallet", "my_xpubkey", "new_wallet_address"].indexOf(subject) === -1)
    //    return callbacks.ifError("you're indirect correspondent, cannot trust "+subject+" from you");
    var from_address = objectHash.getDeviceAddress(device_pubkey);

    switch (subject) {
        case "pairing":
            device.handlePairingMessage(json, device_pubkey, callbacks);
            break;

        case "text":
            message_counter++;
            if (!ValidationUtils.isNonemptyString(body)) return callbacks.ifError("text body must be string");
            // the wallet should have an event handler that displays the text to the user
            eventBus.emit("text", from_address, body, message_counter);
            callbacks.ifOk();
            break;

        case "transaction":
            message_counter++;
            if (!ValidationUtils.isNonemptyString(body)) return callbacks.ifError("transaction body must be string");
            // the wallet should have an event handler that displays the text to the user
            eventBus.emit("transaction", from_address, body, message_counter);
            callbacks.ifOk();
            break;

        case "removed_paired_device":
            if (conf.bIgnoreUnpairRequests) {
                // unpairing is ignored
                callbacks.ifError("removed_paired_device ignored: " + from_address);
            } else {
                determineIfDeviceCanBeRemoved(from_address, function (bRemovable) {
                    if (!bRemovable) return callbacks.ifError("device " + from_address + " is not removable");
                    device.removeCorrespondentDevice(from_address, function () {
                        eventBus.emit("removed_paired_device", from_address);
                        callbacks.ifOk();
                    });
                });
            }
            break;

        case "chat_recording_pref":
            message_counter++;
            eventBus.emit("chat_recording_pref", from_address, body, message_counter);
            callbacks.ifOk();
            break;

        case "create_new_wallet":
            // {wallet: "base64", wallet_definition_template: [...]}
            walletDefinedByKeys.handleOfferToCreateNewWallet(body, from_address, callbacks);
            break;

        case "cancel_new_wallet":
            // {wallet: "base64"}
            if (!ValidationUtils.isNonemptyString(body.wallet)) return callbacks.ifError("no wallet");
            walletDefinedByKeys.deleteWallet(body.wallet, from_address, callbacks.ifOk);
            break;

        case "my_xpubkey":
            // allowed from non-correspondents
            // {wallet: "base64", my_xpubkey: "base58"}
            if (!ValidationUtils.isNonemptyString(body.wallet)) return callbacks.ifError("no wallet");
            if (!ValidationUtils.isNonemptyString(body.my_xpubkey)) return callbacks.ifError("no my_xpubkey");
            if (body.my_xpubkey.length > 112) return callbacks.ifError("my_xpubkey too long");
            walletDefinedByKeys.addDeviceXPubKey(body.wallet, from_address, body.my_xpubkey, callbacks.ifOk);
            break;

        case "wallet_fully_approved":
            // allowed from non-correspondents
            // {wallet: "base64"}
            if (!ValidationUtils.isNonemptyString(body.wallet)) return callbacks.ifError("no wallet");
            walletDefinedByKeys.handleNotificationThatWalletFullyApproved(body.wallet, from_address, callbacks.ifOk);
            break;

        case "new_wallet_address":
            // {wallet: "base64", is_change: (0|1), address_index: 1234, address: "BASE32"}
            if (!ValidationUtils.isNonemptyString(body.wallet)) return callbacks.ifError("no wallet");
            if (!(body.is_change === 0 || body.is_change === 1)) return callbacks.ifError("bad is_change");
            if (!ValidationUtils.isNonnegativeInteger(body.address_index)) return callbacks.ifError("bad address_index");
            if (!ValidationUtils.isValidAddress(body.address)) return callbacks.ifError("no address or bad address");
            walletDefinedByKeys.addNewAddress(body.wallet, body.is_change, body.address_index, body.address, function (err) {
                if (err) return callbacks.ifError(err);
                callbacks.ifOk();
            });
            break;

        case "create_new_shared_address":
            // {address_definition_template: [...]}
            if (!ValidationUtils.isArrayOfLength(body.address_definition_template, 2)) return callbacks.ifError("no address definition template");
            walletDefinedByAddresses.validateAddressDefinitionTemplate(body.address_definition_template, from_address, function (err, assocMemberDeviceAddressesBySigningPaths) {
                if (err) return callbacks.ifError(err);
                // this event should trigger a confirmatin dialog, user needs to approve creation of the shared address and choose his
                // own address that is to become a member of the shared address
                eventBus.emit("create_new_shared_address", body.address_definition_template, assocMemberDeviceAddressesBySigningPaths);
                callbacks.ifOk();
            });
            break;

        case "approve_new_shared_address":
            // {address_definition_template_chash: "BASE32", address: "BASE32", device_addresses_by_relative_signing_paths: {...}}
            if (!ValidationUtils.isValidAddress(body.address_definition_template_chash)) return callbacks.ifError("invalid addr def c-hash");
            if (!ValidationUtils.isValidAddress(body.address)) return callbacks.ifError("invalid address");
            if (typeof body.device_addresses_by_relative_signing_paths !== "object" || Object.keys(body.device_addresses_by_relative_signing_paths).length === 0) return callbacks.ifError("invalid device_addresses_by_relative_signing_paths");
            walletDefinedByAddresses.approvePendingSharedAddress(body.address_definition_template_chash, from_address, body.address, body.device_addresses_by_relative_signing_paths);
            callbacks.ifOk();
            break;

        case "reject_new_shared_address":
            // {address_definition_template_chash: "BASE32"}
            if (!ValidationUtils.isValidAddress(body.address_definition_template_chash)) return callbacks.ifError("invalid addr def c-hash");
            walletDefinedByAddresses.deletePendingSharedAddress(body.address_definition_template_chash);
            callbacks.ifOk();
            break;

        case "new_shared_address":
            // {address: "BASE32", definition: [...], signers: {...}}
            walletDefinedByAddresses.handleNewSharedAddress(body, {
                ifError: callbacks.ifError,
                ifOk: function () {
                    callbacks.ifOk();
                    eventBus.emit('maybe_new_transactions');
                }
            });
            break;

        // request to sign a unit created on another device
        // two use cases:
        // 1. multisig: same address hosted on several devices
        // 2. multilateral signing: different addresses signing the same message, such as a (dumb) contract
        case "sign":
            // {address: "BASE32", signing_path: "r.1.2.3", unsigned_unit: {...}}
            if (!ValidationUtils.isValidAddress(body.address)) return callbacks.ifError("no address or bad address");
            if (!ValidationUtils.isNonemptyString(body.signing_path) || body.signing_path.charAt(0) !== 'r') return callbacks.ifError("bad signing path");
            var objUnit = body.unsigned_unit;
            if (typeof objUnit !== "object") return callbacks.ifError("no unsigned unit");
            // replace all existing signatures with placeholders so that signing requests sent to us on different stages of signing become identical,
            // hence the hashes of such unsigned units are also identical
            objUnit.authors.forEach(function (author) {
                var authentifiers = author.authentifiers;
                for (var path in authentifiers) authentifiers[path] = authentifiers[path].replace(/./, '-');
            });
            var assocPrivatePayloads = body.private_payloads;
            if ("private_payloads" in body) {
                if (typeof assocPrivatePayloads !== "object" || !assocPrivatePayloads) return callbacks.ifError("bad private payloads");
                for (var payload_hash in assocPrivatePayloads) {
                    var payload = assocPrivatePayloads[payload_hash];
                    var hidden_payload = _.cloneDeep(payload);
                    if (payload.denomination) // indivisible asset.  In this case, payload hash is calculated based on output_hash rather than address and blinding
                        hidden_payload.outputs.forEach(function (o) {
                            delete o.address;
                            delete o.blinding;
                        });
                    var calculated_payload_hash = objectHash.getBase64Hash(hidden_payload);
                    if (payload_hash !== calculated_payload_hash) return callbacks.ifError("private payload hash does not match");
                    if (!ValidationUtils.isNonemptyArray(objUnit.messages)) return callbacks.ifError("no messages in unsigned unit");
                    if (objUnit.messages.filter(function (objMessage) {
                        return objMessage.payload_hash === payload_hash;
                    }).length !== 1) return callbacks.ifError("no such payload hash in the messages");
                }
            }
            // findAddress handles both types of addresses
            findAddress(body.address, body.signing_path, {
                ifError: callbacks.ifError,
                ifLocal: function (objAddress) {
                    // the commented check would make multilateral signing impossible
                    //db.query("SELECT 1 FROM extended_pubkeys WHERE wallet=? AND device_address=?", [row.wallet, from_address], function(sender_rows){
                    //    if (sender_rows.length !== 1)
                    //        return callbacks.ifError("sender is not cosigner of this address");
                    callbacks.ifOk();
                    objUnit.unit = objectHash.getUnitHash(objUnit);
                    var objJoint = { unit: objUnit, unsigned: true };
                    eventBus.once("validated-" + objUnit.unit, function (bValid) {
                        if (!bValid) {
                            console.log("===== unit in signing request is invalid");
                            return;
                        }
                        // This event should trigger a confirmation dialog.
                        // If we merge coins from several addresses of the same wallet, we'll fire this event multiple times for the same unit.
                        // The event handler must lock the unit before displaying a confirmation dialog, then remember user's choice and apply it to all
                        // subsequent requests related to the same unit
                        eventBus.emit("signing_request", objAddress, body.address, objUnit, assocPrivatePayloads, from_address, body.signing_path);
                    });
                    // if validation is already under way, handleOnlineJoint will quickly exit because of assocUnitsInWork.
                    // as soon as the previously started validation finishes, it will trigger our event handler (as well as its own)
                    network.handleOnlineJoint(ws, objJoint);
                    //});
                },
                ifRemote: function (device_address) {
                    if (device_address === from_address) {
                        callbacks.ifError("looping signing request for address " + body.address + ", path " + body.signing_path);
                        throw Error("looping signing request for address " + body.address + ", path " + body.signing_path);
                    }
                    var text_to_sign = objectHash.getUnitHashToSign(body.unsigned_unit).toString("base64");
                    // I'm a proxy, wait for response from the actual signer and forward to the requestor
                    eventBus.once("signature-" + device_address + "-" + body.address + "-" + body.signing_path + "-" + text_to_sign, function (sig) {
                        sendSignature(from_address, text_to_sign, sig, body.signing_path, body.address);
                    });
                    // forward the offer to the actual signer
                    device.sendMessageToDevice(device_address, subject, body);
                    callbacks.ifOk();
                },
                ifMerkle: function (bLocal) {
                    callbacks.ifError("there is merkle proof at signing path " + body.signing_path);
                },
                ifUnknownAddress: function () {
                    callbacks.ifError("not aware of address " + body.address + " but will see if I learn about it later");
                    eventBus.once("new_address-" + body.address, function () {
                        // rewrite callbacks to avoid duplicate unlocking of mutex
                        handleMessageFromHub(ws, json, device_pubkey, bIndirectCorrespondent, { ifOk: function () {}, ifError: function () {} });
                    });
                }
            });
            break;

        case "signature":
            // {signed_text: "base64 of sha256", signing_path: "r.1.2.3", signature: "base64"}
            if (!ValidationUtils.isStringOfLength(body.signed_text, constants.HASH_LENGTH)) // base64 of sha256
                return callbacks.ifError("bad signed text");
            if (!ValidationUtils.isStringOfLength(body.signature, constants.SIG_LENGTH) && body.signature !== '[refused]') return callbacks.ifError("bad signature length");
            if (!ValidationUtils.isNonemptyString(body.signing_path) || body.signing_path.charAt(0) !== 'r') return callbacks.ifError("bad signing path");
            if (!ValidationUtils.isValidAddress(body.address)) return callbacks.ifError("bad address");
            eventBus.emit("signature-" + from_address + "-" + body.address + "-" + body.signing_path + "-" + body.signed_text, body.signature);
            callbacks.ifOk();
            break;

        case 'private_payments':
            var arrChains = body.chains;
            if (!ValidationUtils.isNonemptyArray(arrChains)) return callbacks.ifError("no chains found");
            profiler.increment();

            if (conf.bLight) network.requestUnfinishedPastUnitsOfPrivateChains(arrChains); // it'll work in the background

            var assocValidatedByKey = {};
            var bParsingComplete = false;
            var cancelAllKeys = function () {
                for (var key in assocValidatedByKey) eventBus.removeAllListeners(key);
            };

            var current_message_counter = ++message_counter;

            var checkIfAllValidated = function () {
                if (!assocValidatedByKey) // duplicate call - ignore
                    return console.log('duplicate call of checkIfAllValidated');
                for (var key in assocValidatedByKey) if (!assocValidatedByKey[key]) return console.log('not all private payments validated yet');
                assocValidatedByKey = null; // to avoid duplicate calls
                if (!body.forwarded) {
                    emitNewPrivatePaymentReceived(from_address, arrChains, current_message_counter);
                    // note, this forwarding won't work if the user closes the wallet before validation of the private chains
                    var arrUnits = arrChains.map(function (arrPrivateElements) {
                        return arrPrivateElements[0].unit;
                    });
                    db.query("SELECT address FROM unit_authors WHERE unit IN(?)", [arrUnits], function (rows) {
                        var arrAuthorAddresses = rows.map(function (row) {
                            return row.address;
                        });
                        // if the addresses are not shared, it doesn't forward anything
                        forwardPrivateChainsToOtherMembersOfSharedAddresses(arrChains, arrAuthorAddresses, from_address, true);
                    });
                }
                profiler.print();
            };

            async.eachSeries(arrChains, function (arrPrivateElements, cb) {
                // validate each chain individually
                var objHeadPrivateElement = arrPrivateElements[0];
                if (!!objHeadPrivateElement.payload.denomination !== ValidationUtils.isNonnegativeInteger(objHeadPrivateElement.output_index)) return cb("divisibility doesn't match presence of output_index");
                var output_index = objHeadPrivateElement.payload.denomination ? objHeadPrivateElement.output_index : -1;
                var payload_hash = objectHash.getBase64Hash(objHeadPrivateElement.payload);
                var key = 'private_payment_validated-' + objHeadPrivateElement.unit + '-' + payload_hash + '-' + output_index;
                assocValidatedByKey[key] = false;
                network.handleOnlinePrivatePayment(ws, arrPrivateElements, true, {
                    ifError: function (error) {
                        console.log("handleOnlinePrivatePayment error: " + error);
                        cb("an error"); // do not leak error message to the hub
                    },
                    ifValidationError: function (unit, error) {
                        console.log("handleOnlinePrivatePayment validation error: " + error);
                        cb("an error"); // do not leak error message to the hub
                    },
                    ifAccepted: function (unit) {
                        console.log("handleOnlinePrivatePayment accepted");
                        assocValidatedByKey[key] = true;
                        cb(); // do not leak unit info to the hub
                    },
                    // this is the most likely outcome for light clients
                    ifQueued: function () {
                        console.log("handleOnlinePrivatePayment queued, will wait for " + key);
                        eventBus.once(key, function (bValid) {
                            if (!bValid) return cancelAllKeys();
                            assocValidatedByKey[key] = true;
                            if (bParsingComplete) checkIfAllValidated();else console.log('parsing incomplete yet');
                        });
                        cb();
                    }
                });
            }, function (err) {
                bParsingComplete = true;
                if (err) {
                    cancelAllKeys();
                    return callbacks.ifError(err);
                }
                checkIfAllValidated();
                callbacks.ifOk();
                // forward the chains to other members of output addresses
                if (!body.forwarded) forwardPrivateChainsToOtherMembersOfOutputAddresses(arrChains);
            });
            break;

        case 'payment_notification':
            // note that since the payments are public, an evil user might notify us about a payment sent by someone else
            // (we'll be fooled to believe it was sent by the evil user).  It is only possible if he learns our address, e.g. if we make it public.
            // Normally, we generate a one-time address and share it in chat session with the future payer only.
            var current_message_counter = ++message_counter;
            var unit = body;
            if (!ValidationUtils.isStringOfLength(unit, constants.HASH_LENGTH)) return callbacks.ifError("invalid unit in payment notification");
            var bEmitted = false;
            var emitPn = function (objJoint) {
                if (bEmitted) return;
                bEmitted = true;
                emitNewPublicPaymentReceived(from_address, objJoint.unit, current_message_counter);
            };
            eventBus.once('saved_unit-' + unit, emitPn);
            storage.readJoint(db, unit, {
                ifNotFound: function () {
                    console.log("received payment notification for unit " + unit + " which is not known yet, will wait for it");
                    callbacks.ifOk();
                },
                ifFound: function (objJoint) {
                    emitPn(objJoint);
                    eventBus.removeListener('saved_unit-' + unit, emitPn);
                    callbacks.ifOk();
                }
            });
            break;

        default:
            callbacks.ifError("unknnown subject: " + subject);
    }
}

/**
 * 根据walletId查找地址
 * @param walletId
 * @param cb
 */
function readAddressByWallet(walletId, cb) {
    db.query("select address from my_addresses where wallet = ?", [walletId], function (rows) {
        if (rows != null && rows.length === 1) {
            cb(rows[0].address);
        } else {
            cb(false);
        }
    });
}

/**
 * 发送交易
 * @param opts
 * @param handleResult
 * @returns {Promise<*>}
 */
async function sendMultiPayment(opts, handleResult) {
    if (opts.name == "isHot") {
        //不做处理
    } else if (!opts.goSendTran) {
        opts.findAddressForJoint = findAddressForJoint;
        //判断发送方是否等于接收方，不允许发送给自己
        if (!opts.change_address &&opts.to_address && opts.change_address == opts.to_address) {
            return handleResult("to_address and from_address is same");
        }
        //判断金额是否正常
        if (typeof opts.amount !== 'number') return handleResult('amount must be a number');
        if (opts.amount <= 0) return handleResult('amount must be positive');
    }
    //往共识网发送交易并更新数据库
    await composer.writeTran(opts, handleResult);
}

/**
 * 获取设备钱包信息
 * @param cb
 */
function getWalletsInfo(cb) {
    // db.query("select address,wallet, (ifnull(sumto.totalInt,0) - ifnull(sumfrom.totalInt,0)) stableInt , (ifnull(sumto.totalPoint,0) - ifnull(sumfrom.totalPoint,0)) stablePoint ,ifnull(sumto.totalInt,0) receive , ifnull(sumfrom.totalInt,0) sent from my_addresses  \n\
    //     left join  \n\
    //     ( select addressTo, sum(amount) totalInt, sum(amount_point) totalPoint  from transactions where result='good' group by addressTo ) sumto on sumto.addressTo = my_addresses.address \n\
    //     left join \n\
    //     (select addressFrom ,sum(amount  + fee ) totalInt ,sum(amount_point + fee_point) totalPoint from transactions where (result = 'good' or result = 'pending') and id <>'QQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQ' group by addressFrom) sumfrom \n\
    //     on my_addresses.address = sumfrom.addressFrom",function (result) {
    //     if(result != null && result.length > 0 ) {
    //         let trans = [];
    //         result.forEach(function(tran){
    //             trans.push({address : tran.address,
    //                 wallet  : tran.wallet,
    //                 stablesInt  : tran.stableInt,
    //                 stablesPoint  : tran.stablePoint
    //             });
    //         });
    //         cb(trans);
    //     }else {
    //         cb(false);
    //     }
    // })
    db.query("select address, result, ifnull(amount,0) amount, ifnull(fee,0) fee, ifnull(amount_point,0)amount_point, ifnull(fee_point,0) fee_point, wallet  from  my_addresses a left join transactions b on a.address = b.addressTo", function (resTo) {
        let trans = [];
        let transTo = [];
        let transFrom = [];
        if (resTo && resTo.length > 0) {
            resTo.forEach(function (to) {
                if (transTo.length > 0) {
                    transTo.forEach(function (toTran) {
                        let w = _.find(transTo, { 'address': to.address });
                        if (w && toTran.address == to.address) {
                            if (to.result == 'good'){
                                toTran.stablesInt += to.amount, toTran.stablesPoint += to.amount_point;
                            }
                        } else if (!w && toTran.address != to.address) {
                            if (to.result == 'good') {
                                transTo.push({
                                    address: to.address,
                                    wallet: to.wallet,
                                    stablesInt: to.amount,
                                    stablesPoint: to.amount_point
                                });
                            } else {
                                transTo.push({
                                    address: to.address,
                                    wallet: to.wallet,
                                    stablesInt: 0,
                                    stablesPoint: 0
                                });
                            }
                        }
                    });
                } else {
                    if (to.result == 'good') {
                        transTo.push({
                            address: to.address,
                            wallet: to.wallet,
                            stablesInt: to.amount,
                            stablesPoint: to.amount_point
                        });
                    } else {
                        transTo.push({
                            address: to.address,
                            wallet: to.wallet,
                            stablesInt: 0,
                            stablesPoint: 0
                        });
                    }
                }
            });
        }
        db.query("select address, ifnull(amount,0) amount, ifnull(fee,0) fee, ifnull(amount_point,0)amount_point, ifnull(fee_point,0) fee_point, wallet  from  my_addresses a left join transactions b on a.address = b.addressFrom where b.result in('good','pending')", function (resFrom) {
            if (resFrom && resFrom.length > 0) {
                resFrom.forEach(function (from) {
                    if (transFrom.length > 0) {
                        transFrom.forEach(function (fromTran) {
                            let w = _.find(transFrom, { 'address': from.address });
                            if (w && fromTran.address == from.address && from.result != 'final-bad') {
                                fromTran.stablesInt = fromTran.stablesInt + from.amount + from.fee, fromTran.stablesPoint = fromTran.stablesPoint + from.amount_point + from.fee_point;
                            } else if (!w && fromTran.address != from.address  && from.result != 'final-bad') {
                                transFrom.push({ address: from.address,
                                    wallet: from.wallet,
                                    stablesInt: from.amount + from.fee,
                                    stablesPoint: from.amount_point + from.fee_point
                                });
                            }
                        });
                    } else {
                        transFrom.push({ address: from.address,
                            wallet: from.wallet,
                            stablesInt: from.amount + from.fee,
                            stablesPoint: from.amount_point + from.fee_point
                        });
                    }
                });
            }
            if (transTo.length > 0 && transFrom.length > 0) {
                transTo.forEach(function (toTran) {
                    trans.push({ address: toTran.address,
                        wallet: toTran.wallet,
                        stablesInt: toTran.stablesInt,
                        stablesPoint: toTran.stablesPoint
                    });
                });
                transFrom.forEach(function (fromTran) {
                    trans.push({ address: fromTran.address,
                        wallet: fromTran.wallet,
                        stablesInt: -fromTran.stablesInt,
                        stablesPoint: -fromTran.stablesPoint
                    });
                });

                let transTotal = [];
                trans.forEach(function (res) {
                    if (transTotal.length > 0) {
                        transTotal.forEach(function (res2) {
                            let w = _.find(transTotal, { 'address': res.address });
                            if (w && res.address == res2.address) {
                                res2.stablesInt += res.stablesInt, res2.stablesPoint += res.stablesPoint;
                            } else if (!w && res.address != res2.address) {
                                transTotal.push({ address: res.address,
                                    wallet: res.wallet,
                                    stablesInt: res.stablesInt,
                                    stablesPoint: res.stablesPoint
                                });
                            }
                        });
                    } else {
                        transTotal.push({ address: res.address,
                            wallet: res.wallet,
                            stablesInt: res.stablesInt,
                            stablesPoint: res.stablesPoint
                        });
                    }
                });
                cb(transTotal);
            } else if (transTo.length > 0) {
                cb(transTo);
            } else if (transFrom.length > 0) {
                cb(transFrom);
            }
        });
    });
}

async function findAddressForJoint(address) {
    let row = await db.first("SELECT wallet, account, is_change, address_index,definition \n\
        FROM my_addresses JOIN wallets USING(wallet) \n\
        WHERE address=? ", address);
    return {
        definition: JSON.parse(row.definition),
        wallet: row.wallet,
        account: row.account,
        is_change: row.is_change,
        address_index: row.address_index
    };
}

function findAddress(address, signing_path, callbacks, fallback_remote_device_address) {
    db.query("SELECT wallet, account, is_change, address_index, full_approval_date, device_address \n\
        FROM my_addresses JOIN wallets USING(wallet) JOIN wallet_signing_paths USING(wallet) \n\
        WHERE address=? AND signing_path=?", [address, signing_path], function (rows) {
        if (rows.length > 1) throw Error("more than 1 address found");
        if (rows.length === 1) {
            var row = rows[0];
            if (!row.full_approval_date) return callbacks.ifError("wallet of address " + address + " not approved");
            if (row.device_address !== device.getMyDeviceAddress()) return callbacks.ifRemote(row.device_address);
            var objAddress = {
                address: address,
                wallet: row.wallet,
                account: row.account,
                is_change: row.is_change,
                address_index: row.address_index
            };
            callbacks.ifLocal(objAddress);
            return;
        }
        db.query(
            //	"SELECT address, device_address, member_signing_path FROM shared_address_signing_paths WHERE shared_address=? AND signing_path=?",
            // look for a prefix of the requested signing_path
            "SELECT address, device_address, signing_path FROM shared_address_signing_paths \n\
                    WHERE shared_address=? AND signing_path=SUBSTR(?, 1, LENGTH(signing_path))", [address, signing_path], function (sa_rows) {
                if (rows.length > 1) throw Error("more than 1 member address found for shared address " + address + " and signing path " + signing_path);
                if (sa_rows.length === 0) {
                    if (fallback_remote_device_address) return callbacks.ifRemote(fallback_remote_device_address);
                    return callbacks.ifUnknownAddress();
                }
                var objSharedAddress = sa_rows[0];
                var relative_signing_path = 'r' + signing_path.substr(objSharedAddress.signing_path.length);
                var bLocal = objSharedAddress.device_address === device.getMyDeviceAddress(); // local keys
                if (objSharedAddress.address === '') {
                    return callbacks.ifMerkle(bLocal);
                } else if (objSharedAddress.address === 'secret') {
                    return callbacks.ifSecret();
                }
                findAddress(objSharedAddress.address, relative_signing_path, callbacks, bLocal ? null : objSharedAddress.device_address);
            });
    });
}

function readSharedBalance(wallet, handleBalance) {
    balances.readSharedBalance(wallet, function (assocBalances) {
        if (conf.bLight) {
            // make sure we have all asset definitions available
            var arrAssets = Object.keys(assocBalances).filter(function (asset) {
                return asset !== 'base';
            });
            if (arrAssets.length === 0) return handleBalance(assocBalances);
            network.requestProofsOfJointsIfNewOrUnstable(arrAssets, function () {
                handleBalance(assocBalances);
            });
        } else {
            handleBalance(assocBalances);
        }
    });
}

function readBalance(wallet, handleBalance) {
    balances.readBalance(wallet, function (assocBalances) {
        if (conf.bLight) {
            // make sure we have all asset definitions available
            var arrAssets = Object.keys(assocBalances).filter(function (asset) {
                return asset !== 'base';
            });
            if (arrAssets.length === 0) return handleBalance(assocBalances);
            network.requestProofsOfJointsIfNewOrUnstable(arrAssets, function () {
                handleBalance(assocBalances);
            });
        } else {
            handleBalance(assocBalances);
        }
    });
}

function readAssetMetadata(arrAssets, handleMetadata) {
    var sql = "SELECT asset, metadata_unit, name, suffix, decimals FROM asset_metadata";
    if (arrAssets && arrAssets.length) sql += " WHERE asset IN (" + arrAssets.map(db.escape).join(', ') + ")";
    db.query(sql, function (rows) {
        var assocAssetMetadata = {};
        for (var i = 0; i < rows.length; i++) {
            var row = rows[i];
            var asset = row.asset || "base";
            assocAssetMetadata[asset] = {
                metadata_unit: row.metadata_unit,
                decimals: row.decimals,
                name: row.suffix ? row.name + '.' + row.suffix : row.name
            };
        }
        handleMetadata(assocAssetMetadata);
        // after calling the callback, try to fetch missing data about assets
        if (!arrAssets) return;
        var updateAssets = conf.bLight ? network.requestProofsOfJointsIfNewOrUnstable : function (arrAssets, onDone) {
            onDone();
        };
        updateAssets(arrAssets, function () {
            // make sure we have assets itself
            arrAssets.forEach(function (asset) {
                if (assocAssetMetadata[asset] || asset === 'base' && asset === constants.BLACKBYTES_ASSET) return;
                if ((assocLastFailedAssetMetadataTimestamps[asset] || 0) > Date.now() - ASSET_METADATA_RETRY_PERIOD) return;
                fetchAssetMetadata(asset, function (err, objMetadata) {
                    if (err) return console.log(err);
                    assocAssetMetadata[asset] = {
                        metadata_unit: objMetadata.metadata_unit,
                        decimals: objMetadata.decimals,
                        name: objMetadata.suffix ? objMetadata.name + '.' + objMetadata.suffix : objMetadata.name
                    };
                    eventBus.emit('maybe_new_transactions');
                });
            });
        });
    });
}

function fetchAssetMetadata(asset, handleMetadata) {
    device.requestFromHub('hub/get_asset_metadata', asset, function (err, response) {
        if (err) {
            if (err === 'no metadata') assocLastFailedAssetMetadataTimestamps[asset] = Date.now();
            return handleMetadata("error from get_asset_metadata " + asset + ": " + err);
        }
        var metadata_unit = response.metadata_unit;
        var registry_address = response.registry_address;
        var suffix = response.suffix;
        if (!ValidationUtils.isStringOfLength(metadata_unit, constants.HASH_LENGTH)) return handleMetadata("bad metadata_unit: " + metadata_unit);
        if (!ValidationUtils.isValidAddress(registry_address)) return handleMetadata("bad registry_address: " + registry_address);
        var fetchMetadataUnit = conf.bLight ? function (onDone) {
            network.requestProofsOfJointsIfNewOrUnstable([metadata_unit], onDone);
        } : function (onDone) {
            onDone();
        };
        fetchMetadataUnit(function (err) {
            if (err) return handleMetadata("fetchMetadataUnit failed: " + err);
            storage.readJoint(db, metadata_unit, {
                ifNotFound: function () {
                    handleMetadata("metadata unit " + metadata_unit + " not found");
                },
                ifFound: function (objJoint) {
                    objJoint.unit.messages.forEach(function (message) {
                        if (message.app !== 'data') return;
                        var payload = message.payload;
                        if (payload.asset !== asset) return;
                        if (!payload.name) return handleMetadata("no name in asset metadata " + metadata_unit);
                        var decimals = payload.decimals !== undefined ? parseInt(payload.decimals) : undefined;
                        if (decimals !== undefined && !ValidationUtils.isNonnegativeInteger(decimals)) return handleMetadata("bad decimals in asset metadata " + metadata_unit);
                        db.query("INSERT " + db.getIgnore() + " INTO asset_metadata (asset, metadata_unit, registry_address, suffix, name, decimals) \n\
							VALUES (?,?,?, ?,?,?)", [asset, metadata_unit, registry_address, suffix, payload.name, decimals], function () {
                            var objMetadata = {
                                metadata_unit: metadata_unit,
                                suffix: suffix,
                                decimals: decimals,
                                name: payload.name
                            };
                            handleMetadata(null, objMetadata);
                        });
                    });
                }
            });
        });
    });
}

function readTransactionHistory(wallet, handleHistory) {
    light.findTranList(wallet, function (cb) {
        return handleHistory(cb);
    });
}

// returns assoc array signing_path => (key|merkle)
function readFullSigningPaths(conn, address, arrSigningDeviceAddresses, handleSigningPaths) {

    var assocSigningPaths = {};

    function goDeeper(member_address, path_prefix, onDone) {
        // first, look for wallet addresses
        var sql = "SELECT signing_path FROM my_addresses JOIN wallet_signing_paths USING(wallet) WHERE address=?";
        var arrParams = [member_address];
        if (arrSigningDeviceAddresses && arrSigningDeviceAddresses.length > 0) {
            sql += " AND device_address IN(?)";
            arrParams.push(arrSigningDeviceAddresses);
        }
        conn.query(sql, arrParams, function (rows) {
            rows.forEach(function (row) {
                assocSigningPaths[path_prefix + row.signing_path.substr(1)] = 'key';
            });
            if (rows.length > 0) return onDone();
            // next, look for shared addresses, and search from there recursively
            sql = "SELECT signing_path, address FROM shared_address_signing_paths WHERE shared_address=?";
            arrParams = [member_address];
            if (arrSigningDeviceAddresses && arrSigningDeviceAddresses.length > 0) {
                sql += " AND device_address IN(?)";
                arrParams.push(arrSigningDeviceAddresses);
            }
            conn.query(sql, arrParams, function (rows) {
                if (rows.length > 0) {
                    async.eachSeries(rows, function (row, cb) {
                        if (row.address === '') {
                            // merkle
                            assocSigningPaths[path_prefix + row.signing_path.substr(1)] = 'merkle';
                            return cb();
                        } else if (row.address === 'secret') {
                            assocSigningPaths[path_prefix + row.signing_path.substr(1)] = 'secret';
                            return cb();
                        }

                        goDeeper(row.address, path_prefix + row.signing_path.substr(1), cb);
                    }, onDone);
                } else {
                    assocSigningPaths[path_prefix] = 'key';
                    onDone();
                }
            });
        });
    }

    goDeeper(address, 'r', function () {
        handleSigningPaths(assocSigningPaths); // order of signing paths is not significant
    });
}

function getSigner(opts, arrSigningDeviceAddresses, signWithLocalPrivateKey) {
    var bRequestedConfirmation = false;
    return {
        readSigningPaths: function (conn, address, handleLengthsBySigningPaths) {
            // returns assoc array signing_path => length
            readFullSigningPaths(conn, address, arrSigningDeviceAddresses, function (assocTypesBySigningPaths) {
                var assocLengthsBySigningPaths = {};
                for (var signing_path in assocTypesBySigningPaths) {
                    var type = assocTypesBySigningPaths[signing_path];
                    if (type === 'key') assocLengthsBySigningPaths[signing_path] = constants.SIG_LENGTH;else if (type === 'merkle') {
                        if (opts.merkle_proof) assocLengthsBySigningPaths[signing_path] = opts.merkle_proof.length;
                    } else if (type === 'secret') {
                        if (opts.secrets && opts.secrets[signing_path]) assocLengthsBySigningPaths[signing_path] = opts.secrets[signing_path].length;
                    } else throw Error("unknown type " + type + " at " + signing_path);
                }
                handleLengthsBySigningPaths(assocLengthsBySigningPaths);
            });
        },
        readDefinition: function (conn, address, handleDefinition) {
            conn.query("SELECT definition FROM my_addresses WHERE address=? UNION SELECT definition FROM shared_addresses WHERE shared_address=?", [address, address], function (rows) {
                if (rows.length !== 1) throw Error("definition not found");
                handleDefinition(null, JSON.parse(rows[0].definition));
            });
        },
        sign: function (objUnsignedUnit, assocPrivatePayloads, address, signing_path, handleSignature) {
            var buf_to_sign = objectHash.getUnitHashToSign(objUnsignedUnit);
            findAddress(address, signing_path, {
                ifError: function (err) {
                    throw Error(err);
                },
                ifUnknownAddress: function (err) {
                    throw Error("unknown address " + address + " at " + signing_path);
                },
                ifLocal: function (objAddress) {
                    signWithLocalPrivateKey(objAddress.wallet, objAddress.account, objAddress.is_change, objAddress.address_index, buf_to_sign, function (sig) {
                        handleSignature(null, sig);
                    });
                },
                ifRemote: function (device_address) {
                    // we'll receive this event after the peer signs
                    eventBus.once("signature-" + device_address + "-" + address + "-" + signing_path + "-" + buf_to_sign.toString("base64"), function (sig) {
                        handleSignature(null, sig);
                        if (sig === '[refused]') eventBus.emit('refused_to_sign', device_address);
                    });
                    console.log("delete walletGeneral.sendOfferToSign");
                    // walletGeneral.sendOfferToSign(device_address, address, signing_path, objUnsignedUnit, assocPrivatePayloads);
                    if (!bRequestedConfirmation) {
                        eventBus.emit("confirm_on_other_devices");
                        bRequestedConfirmation = true;
                    }
                },
                ifMerkle: function (bLocal) {
                    if (!bLocal) throw Error("merkle proof at path " + signing_path + " should be provided by another device");
                    if (!opts.merkle_proof) throw Error("merkle proof at path " + signing_path + " not provided");
                    handleSignature(null, opts.merkle_proof);
                },
                ifSecret: function () {
                    if (!opts.secrets || !opts.secrets[signing_path]) throw Error("secret " + signing_path + " not found");
                    handleSignature(null, opts.secrets[signing_path]);
                }
            });
        }
    };
}

function signMessage(from_address, message, arrSigningDeviceAddresses, signWithLocalPrivateKey, handleResult) {
    var signer = getSigner({}, arrSigningDeviceAddresses, signWithLocalPrivateKey);
    composer.signMessage(from_address, message, signer, handleResult);
}

function readDeviceAddressesUsedInSigningPaths(onDone) {

    var sql = "SELECT DISTINCT device_address FROM shared_address_signing_paths ";
    sql += "UNION SELECT DISTINCT device_address FROM wallet_signing_paths ";
    sql += "UNION SELECT DISTINCT device_address FROM pending_shared_address_signing_paths";

    db.query(sql, function (rows) {
        if (!rows) return;
        //var arrDeviceAddress = rows.map(function(r) { return r.device_address; });
        var arrDeviceAddress = [rows[0].device_address];
        onDone(arrDeviceAddress);
    });
}

function determineIfDeviceCanBeRemoved(device_address, handleResult) {
    device.readCorrespondent(device_address, function (correspondent) {
        if (!correspondent) return handleResult(false);
        readDeviceAddressesUsedInSigningPaths(function (arrDeviceAddresses) {
            handleResult(arrDeviceAddresses.indexOf(device_address) === -1);
        });
    });
};

/**
 * 查询第一个创建的INVE钱包
 * @param cb
 */
function findFirstAddress(cb) {
    db.query('select  a.*,b.definition_template from my_addresses a  left join wallets b on a.wallet=b.wallet limit 1', function (rows) {
        if (rows != undefined && rows.length == 1) {
            let obj = {};
            obj.address = rows[0].address;
            obj.wallet = rows[0].wallet;
            obj.definition = rows[0].definition;
            obj.definition_template = rows[0].definition_template;
            cb(obj);
        }
    });
}

function getWallets(cb) {
    db.query('select * from my_addresses', function (rows) {
        if (rows != undefined && rows.length > 0) {
            cb(rows);
        }else {
            cb([])
        }
    });
}


exports.readSharedBalance = readSharedBalance;
exports.readBalance = readBalance;
exports.readAssetMetadata = readAssetMetadata;
exports.readTransactionHistory = readTransactionHistory;
exports.sendMultiPayment = sendMultiPayment;
exports.signMessage = signMessage;
exports.getWalletsInfo = getWalletsInfo;
exports.getWallets = getWallets;
exports.readAddressByWallet = readAddressByWallet;
exports.readDeviceAddressesUsedInSigningPaths = readDeviceAddressesUsedInSigningPaths;
exports.determineIfDeviceCanBeRemoved = determineIfDeviceCanBeRemoved;
exports.findFirstAddress = findFirstAddress;
exports.findAddressForJoint = findAddressForJoint;