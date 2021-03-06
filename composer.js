/*jslint node: true */
"use strict";
var crypto = require('crypto');
var async = require('async');
var db = require('./db.js');
var constants = require('./constants.js');
var objectHash = require('./object_hash.js');
var objectLength = require("./object_length.js");
var ecdsaSig = require('./signature.js');
var mutex = require('./mutex.js');
var _ = require('lodash');
var storage = require('./storage.js');
// var myWitnesses = require('./my_witnesses.js');
var parentComposer = require('./parent_composer.js');
var validation = require('./validation.js');
var conf = require('./conf.js');
var inputs = require('./inputs.js');
var device = require('./device.js');
var light = require('./light.js');
var hash_placeholder = "--------------------------------------------"; // 256 bits (32 bytes) base64: 44 bytes
var sig_placeholder = "----------------------------------------------------------------------------------------"; // 88 bytes
var hashnethelper = require('./hashnethelper.js');
var transationVersion = require('./constants').transationVersion;
var NRG_PRICE = 0;
var eventBus = require('./event_bus.js');
if(!NRG_PRICE) {
    var tranNrgPrice = setInterval(async function () {
        NRG_PRICE = await hashnethelper.getNRGPrice();
        if(NRG_PRICE) {
            eventBus.emit('nrgPrice',NRG_PRICE);
            clearInterval(tranNrgPrice)
        }
    }, 10 * 1000);
}

var bGenesis = false;
exports.setGenesis = function (_bGenesis) { bGenesis = _bGenesis; };


function repeatString(str, times) {
    if (str.repeat)
        return str.repeat(times);
    return (new Array(times + 1)).join(str);
}

function sortOutputs(a, b) {
    var addr_comparison = a.address.localeCompare(b.address);
    return addr_comparison ? addr_comparison : (a.amount - b.amount);
}





//发送交易到共识网并更新数据库，刷新界面
async function writeTran(params, handleResult) {
    try{
        let amount;
        let amountP ;
        let amountPoint ;
        let amountstr ;
        let feeInt ;
        let feePoint ;
        let note;
        let feeTotal;
        var isHot = params.name;
        let zero = '000000000000000000';
        NRG_PRICE = await hashnethelper.getNRGPrice();
        if(!NRG_PRICE) return handleResult('unable to get nrgPrice');
        /**
         * 计算费用
         * @param str
         * @returns {string}
         * 1 KByte = 10e9 atom
         */
        // function getStrLeng(str){
        //     var realLength = 0;
        //     var len = str.length;
        //     var charCode = -1;
        //     for(var i = 0; i < len; i++){
        //         charCode = str.charCodeAt(i);
        //         if (charCode >= 0 && charCode <= 128) {
        //             realLength += 1;
        //         }else{
        //             // 如果是中文则长度加2
        //             realLength += 2;
        //         }
        //     }
        //     return ((realLength/1024*1000000000).toFixed(0))
        // }
        if (isHot =="isHot"){
            let amountt = params.amount;
            amount = parseInt(amountt.replace(/"/g,'').substring(-1,amountt.length-18) ? amountt.replace(/"/g,'').substring(-1,amountt.length-18) : 0);
            amountPoint = parseInt(amountt.replace(/"/g,'').substring(amountt.length-18,amountt.length) ? amountt.replace(/"/g,'').substring(amountt.length-18,amountt.length) : 0) ;

        }else {
            amount = (params.amount + "").split('.')[0];
            amountP = (params.amount + "").split('.')[1] ? (params.amount + "").split('.')[1] : '';
            amountPoint = amountP+zero.substring(-1,zero.length-amountP.length);
            amountstr = amount+amountP+zero.substring(-1,zero.length-amountP.length);
        }



        var obj;
        var signature;
        var deviceAddress = params.deviceAddress;
        let Base64 = require('./base64Code');
        note = params.note ? params.note: ''
        let noteBase64 = params.note ? await Base64.encode(params.note) :'';
        if (isHot != "isHot" && !params.goSendTran) {
            var timestamp = Math.round(Date.now());
            //isStable代表交易是否发送成功
            //isValid代表交易是否在共识网验证通过
            obj = { fromAddress: params.change_address, toAddress: params.to_address, amount: amountstr, timestamp, remark :noteBase64, vers:transationVersion};
            var address = await params.findAddressForJoint(params.change_address);
            obj.pubkey = address.definition[1].pubkey;
            // obj.fee = objectLength.getTotalPayloadSize(obj) + "";
            //obj.fee = "1000000000000000";
            obj.type = 1;
            obj.fee = noteBase64 ? ((noteBase64.length * 1.0 /1024) * constants.NRG_PEER_KBYTE + constants.BASE_NRG).toString(): constants.BASE_NRG.toString();
            obj.nrgPrice = NRG_PRICE;
            //TODO 测试   if (light.stable < obj.fee + obj.amount) {
            let stablesFrom = await light.findStable3(obj.fromAddress);

            /**
             * 统计发送交易地址可用余额
             */
            var Decimal = require('decimal.js');

            //let stablesFrom = stable[0].amount + stable[0].amount_point / parseInt(1 + zero) - stable[0].fee - stable[0].fee_point / parseInt(1 + zero);
            let stablesTo = new Decimal(params.amount).add(new Decimal(obj.fee*obj.nrgPrice / 1000000000000000000)).toFixed();

            if (new Decimal(stablesFrom).comparedTo(stablesTo) < 0) {
            //if (!compareStables ||(compareStables && stablesTo.substr(0,1) == "-")) {
                return handleResult("not enough spendable funds from " + params.to_address + " for " + (parseInt(obj.fee) + parseInt(obj.amount)));
            }
            //获取签名的BUF
            var buf_to_sign = objectHash.getUnitHashToSign(obj);
            //获取签名的私钥
            let Bitcore = require('bitcore-lib');
            var xPrivKey = new Bitcore.HDPrivateKey.fromString(params.xPrivKey);
            var path = "m/44'/0'/0'/0/0";
            var privKeyBuf = xPrivKey.derive(path).privateKey.bn.toBuffer({size:32});

            // var privKeyBuf = params.getLocalPrivateKey(params.xPrivKey);
            //通过私钥进行签名
            signature = ecdsaSig.sign(buf_to_sign, privKeyBuf);
        } else if(!params.goSendTran){
            obj = params;
            note =params.note ? await Base64.decode(params.note) :'';
            delete obj.name;
            delete obj.md5;
            delete obj.type;
            delete obj.isSignHot;
            // delete obj.walletType;
            // delete obj.walletId;
            // delete obj.address;
            // delete obj.name;
            // delete obj.image;
            // delete obj.mnemonic;
            // delete obj.mnemonicEncrypted;
            obj.type = 1;
            signature = params.signature;
        }
        if(params.signature) {
            obj = params;
        }
        else obj.signature = signature;

        obj.amount =obj.amount+"";
        delete obj.goSendTran;
        delete obj.getHash;
        let amountt = obj.amount;
        amount = parseInt(amountt.replace(/"/g,'').substring(-1,amountt.length-18) ? amountt.replace(/"/g,'').substring(-1,amountt.length-18) : 0);
        amountPoint = parseInt(amountt.replace(/"/g,'').substring(amountt.length-18,amountt.length) ? amountt.replace(/"/g,'').substring(amountt.length-18,amountt.length) : 0) ;

        feeTotal = noteBase64 ? ((noteBase64.length * 1.0 /1024) * constants.NRG_PEER_KBYTE+constants.BASE_NRG)*NRG_PRICE  : constants.BASE_NRG*NRG_PRICE;
        let fee = feeTotal+"";
        feeInt = parseInt(fee.replace(/"/g,'').substring(-1,fee.length-18) ? fee.replace(/"/g,'').substring(-1,fee.length-18) : 0);
        feePoint = parseInt(fee.replace(/"/g,'').substring(fee.length-18,fee.length) ? fee.replace(/"/g,'').substring(fee.length-18,fee.length) : 0);

        if(params.getHash){
            delete obj.findAddressForJoint;
            handleResult(null,signature,obj);
            return;
        }

        var network = require('./network.js');
        //往共识网发送交易
        let resultMessage = await network.sendTransaction(obj);

        //通过签名获取ID(44位)
        //obj.id = crypto.createHash("sha256").update(signature.substring(2), "utf8").digest("base64");
        obj.id = signature ? signature : obj.signature;

        if (resultMessage.code != 200) {
            //如果发送失败，则马上返回到界面
            return handleResult(resultMessage.data);
        }
        else {
            //通过队列进行数据库更新
            let result = resultMessage.data;
            await mutex.lock(["write"], async function (unlock) {
                try {
                    //更新数据库
                    await db.execute("INSERT INTO transactions (id,creation_date,amount,fee,addressFrom,addressTo,result,type,remark,amount_point,fee_point, multiHash) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
                        obj.id, obj.timestamp, amount, feeInt, obj.fromAddress, obj.toAddress, "pending", params.sendType ? params.sendType : 0 ,note, amountPoint, feePoint,obj.order);
                    //更新列表
                    obj.isStable = 1;
                    obj.isValid = 0;
                    light.refreshTranList(obj);
                    if(deviceAddress) {
                        // let eventBus = require('./event_bus.js');
                        // eventBus.emit('chat_transfer_notification', deviceAddress , obj.id);
                        require("./device").setDeviceChatTran(obj.id,deviceAddress)
                    }
                    //返回到界面
                    // alert("交易完成个");
                    let res = obj;
                    handleResult(null,isHot == "isHot" ? res:obj,null);
                }
                catch (e) {
                    console.log(e.toString());
                    handleResult(e.toString());
                }
                finally {
                    //解锁队列
                    await unlock();
                }
            });
        }
    }catch (e) {
        handleResult(e.toString());
    }

}

/*
	params.signing_addresses must sign the message but they do not necessarily pay
	params.paying_addresses pay for byte outputs and commissions
*/
async function composeJointForJoint(params) {


    // try to use as few paying_addresses as possible. Assuming paying_addresses are sorted such that the most well-funded addresses come first
    if (params.minimal && !params.send_all) {
        var callbacks = params.callbacks;
        var arrCandidatePayingAddresses = params.paying_addresses;

        var trySubset = function (count) {
            if (count > constants.MAX_AUTHORS_PER_UNIT)
                return callbacks.ifNotEnoughFunds("Too many authors.  Consider splitting the payment into two units.");
            var try_params = _.clone(params);
            delete try_params.minimal;
            try_params.paying_addresses = arrCandidatePayingAddresses.slice(0, count);
            try_params.callbacks = {
                ifOk: callbacks.ifOk,
                ifError: callbacks.ifError,
                ifNotEnoughFunds: function (error_message) {
                    if (count === arrCandidatePayingAddresses.length)
                        return callbacks.ifNotEnoughFunds(error_message);
                    trySubset(count + 1); // add one more paying address
                }
            };
            composeJoint(try_params);
        };

        return trySubset(1);
    }

    var arrSigningAddresses = params.signing_addresses || [];
    var arrPayingAddresses = params.paying_addresses || [];
    var arrOutputs = params.outputs || [];
    var arrMessages = _.clone(params.messages || []);
    var assocPrivatePayloads = params.private_payloads || {}; // those that correspond to a subset of params.messages
    var fnRetrieveMessages = params.retrieveMessages;
    //	var lightProps = params.lightProps;
    var signer = params.signer;
    var callbacks = params.callbacks;

    //	if (conf.bLight && !lightProps)
    //		throw Error("no parent props for light");


    //profiler.start();
    var arrChangeOutputs = arrOutputs.filter(function (output) { return (output.amount === 0); });
    var arrExternalOutputs = arrOutputs.filter(function (output) { return (output.amount > 0); });
    if (arrChangeOutputs.length > 1)
        throw Error("more than one change output");
    if (arrChangeOutputs.length === 0)
        throw Error("no change outputs");

    if (arrPayingAddresses.length === 0)
        throw Error("no payers?");
    var arrFromAddresses = _.union(arrSigningAddresses, arrPayingAddresses).sort();

    var objPaymentMessage = {
        app: "payment",
        payload_location: "inline",
        payload_hash: hash_placeholder,
        payload: {
            // first output is the change, it has 0 amount (placeholder) that we'll modify later.
            // Then we'll sort outputs, so the change is not necessarity the first in the final transaction
            outputs: arrChangeOutputs
            // we'll add more outputs below
        }
    };
    var total_amount = 0;
    arrExternalOutputs.forEach(function (output) {
        objPaymentMessage.payload.outputs.push(output);
        total_amount += output.amount;
    });
    arrMessages.push(objPaymentMessage);

    var bMultiAuthored = (arrFromAddresses.length > 1);
    var objUnit = {
        version: constants.version,
        alt: constants.alt,
        //timestamp: Date.now(),
        messages: arrMessages,
        authors: []
    };
    var objJoint = { unit: objUnit };
    if (params.earned_headers_commission_recipients) // it needn't be already sorted by address, we'll sort it now
        objUnit.earned_headers_commission_recipients = params.earned_headers_commission_recipients.concat().sort(function (a, b) {
            return ((a.address < b.address) ? -1 : 1);
        });
    else if (bMultiAuthored) // by default, the entire earned hc goes to the change address
        objUnit.earned_headers_commission_recipients = [{ address: arrChangeOutputs[0].address, earned_headers_commission_share: 100 }];

    var total_input;
    var last_ball_mci;
    var assocSigningPaths = {};
    var unlock_callback;
    var conn;
    var lightProps;

    var handleError = function (err) {
        //profiler.stop('compose');
        unlock_callback();
        if (typeof err === "object") {
            if (err.error_code === "NOT_ENOUGH_FUNDS")
                return callbacks.ifNotEnoughFunds(err.error);
            throw Error("unknown error code in: " + JSON.stringify(err));
        }
        callbacks.ifError(err);
    };

    await async.series([
        function (cb) { // lock
            mutex.lock(arrFromAddresses.map(function (from_address) { return 'c-' + from_address; }), function (unlock) {
                unlock_callback = unlock;
                cb();
            });
        },
        function (cb) { // start transaction
            db.takeConnectionFromPool(function (new_conn) {
                conn = new_conn;
                conn.query("BEGIN", function () { cb(); });
            });
        },
        function (cb) { // authors
            async.eachSeries(arrFromAddresses, function (from_address, cb2) {

                function setDefinition() {
                    signer.readDefinition(conn, from_address, function (err, arrDefinition) {
                        if (err)
                            return cb2(err);
                        objAuthor.definition = arrDefinition;
                        cb2();
                    });
                }

                var objAuthor = {
                    address: from_address,
                    authentifiers: {}
                };
                signer.readSigningPaths(conn, from_address, function (assocLengthsBySigningPaths) {
                    var arrSigningPaths = Object.keys(assocLengthsBySigningPaths);
                    assocSigningPaths[from_address] = arrSigningPaths;
                    for (var j = 0; j < arrSigningPaths.length; j++)
                        objAuthor.authentifiers[arrSigningPaths[j]] = repeatString("-", assocLengthsBySigningPaths[arrSigningPaths[j]]);
                    objUnit.authors.push(objAuthor);
                    return setDefinition();
                });
            }, cb);
        },
        // messages retrieved via callback
        function (cb) {
            if (!fnRetrieveMessages)
                return cb();
            console.log("will retrieve messages");
            fnRetrieveMessages(conn, last_ball_mci, bMultiAuthored, arrPayingAddresses, function (err, arrMoreMessages, assocMorePrivatePayloads) {
                console.log("fnRetrieveMessages callback: err code = " + (err ? err.error_code : ""));
                if (err)
                    return cb((typeof err === "string") ? ("unable to add additional messages: " + err) : err);
                Array.prototype.push.apply(objUnit.messages, arrMoreMessages);
                if (assocMorePrivatePayloads && Object.keys(assocMorePrivatePayloads).length > 0)
                    for (var payload_hash in assocMorePrivatePayloads)
                        assocPrivatePayloads[payload_hash] = assocMorePrivatePayloads[payload_hash];
                cb();
            });
        },
        function (cb) { // input coins
            objUnit.headers_commission = objectLength.getHeadersSize(objUnit);
            var naked_payload_commission = objectLength.getTotalPayloadSize(objUnit); // without input coins

            if (bGenesis) {
                var issueInput = { type: "issue", serial_number: 1, amount: constants.TOTAL_WHITEBYTES };
                if (objUnit.authors.length > 1) {
                    issueInput.address = arrWitnesses[0];
                }
                objPaymentMessage.payload.inputs = [issueInput];
                objUnit.payload_commission = objectLength.getTotalPayloadSize(objUnit);
                total_input = constants.TOTAL_WHITEBYTES;
                return cb();
            }
            if (params.inputs) { // input coins already selected
                if (!params.input_amount)
                    throw Error('inputs but no input_amount');
                total_input = params.input_amount;
                objPaymentMessage.payload.inputs = params.inputs;
                objUnit.payload_commission = objectLength.getTotalPayloadSize(objUnit);
                return cb();
            }

            // all inputs must appear before last_ball
            var target_amount = params.send_all ? Infinity : (total_amount + objUnit.headers_commission + naked_payload_commission);
            inputs.pickDivisibleCoinsForAmountForJoint(
                conn, null, arrPayingAddresses, last_ball_mci, target_amount, bMultiAuthored, params.spend_unconfirmed || 'own',
                function (arrInputsWithProofs, _total_input) {
                    if (!arrInputsWithProofs)
                        return cb({
                            error_code: "NOT_ENOUGH_FUNDS",
                            error: "not enough spendable funds from " + arrPayingAddresses + " for " + target_amount
                        });
                    total_input = _total_input;
                    objPaymentMessage.payload.inputs = arrInputsWithProofs.map(function (objInputWithProof) { return objInputWithProof.input; });
                    objUnit.payload_commission = objectLength.getTotalPayloadSize(objUnit);
                    console.log("inputs increased payload by", objUnit.payload_commission - naked_payload_commission);
                    cb();
                }
            );
        }
    ], function (err) {
        // we close the transaction and release the connection before signing as multisig signing may take very very long
        // however we still keep c-ADDRESS lock to avoid creating accidental doublespends
        conn.query(err ? "ROLLBACK" : "COMMIT", function () {
            conn.release();
            if (err)
                return handleError(err);

            // change, payload hash, signature, and unit hash
            var change = total_input - total_amount - objUnit.headers_commission - objUnit.payload_commission;
            if (change <= 0) {
                if (!params.send_all)
                    throw Error("change=" + change + ", params=" + JSON.stringify(params));
                return handleError({
                    error_code: "NOT_ENOUGH_FUNDS",
                    error: "not enough spendable funds from " + arrPayingAddresses + " for fees"
                });
            }
            objPaymentMessage.payload.outputs[0].amount = change;
            objPaymentMessage.payload.outputs.sort(sortOutputs);
            objPaymentMessage.payload_hash = objectHash.getBase64Hash(objPaymentMessage.payload);
            var text_to_sign = objectHash.getUnitHashToSign(objUnit);
            async.each(
                objUnit.authors,
                function (author, cb2) {
                    var address = author.address;
                    async.each( // different keys sign in parallel (if multisig)
                        assocSigningPaths[address],
                        function (path, cb3) {
                            if (signer.sign) {
                                signer.sign(objUnit, assocPrivatePayloads, address, path, function (err, signature) {
                                    if (err)
                                        return cb3(err);
                                    // it can't be accidentally confused with real signature as there are no [ and ] in base64 alphabet
                                    if (signature === '[refused]')
                                        return cb3('one of the cosigners refused to sign');
                                    author.authentifiers[path] = signature;
                                    cb3();
                                });
                            }
                            else {
                                signer.readPrivateKey(address, path, function (err, privKey) {
                                    if (err)
                                        return cb3(err);
                                    author.authentifiers[path] = ecdsaSig.sign(text_to_sign, privKey);
                                    cb3();
                                });
                            }
                        },
                        function (err) {
                            cb2(err);
                        }
                    );
                },
                async function (err) {
                    if (err)
                        return handleError(err);
                    let { walletId, pubKey } = await device.getInfo();
                    objUnit.unit = objectHash.getUnitHash(objUnit);
                    if (bGenesis)
                        objJoint.ball = objectHash.getBallHash(objUnit.unit);
                    console.log(require('util').inspect(objJoint, { depth: null }));
                    objJoint.unit.timestamp = Math.round(Date.now() / 1000); // light clients need timestamp
                    if (Object.keys(assocPrivatePayloads).length === 0)
                        assocPrivatePayloads = null;
                    //profiler.stop('compose');
                    await callbacks.ifOk(objJoint, assocPrivatePayloads, unlock_callback);
                }
            );
        });
    });
}


/*
	params.signing_addresses must sign the message but they do not necessarily pay
	params.paying_addresses pay for byte outputs and commissions
*/
function composeJoint(params) {

    var arrWitnesses = params.witnesses;
    if (!arrWitnesses) {
        myWitnesses.readMyWitnesses(function (_arrWitnesses) {
            params.witnesses = _arrWitnesses;
            composeJoint(params);
        });
        return;
    }

    // try to use as few paying_addresses as possible. Assuming paying_addresses are sorted such that the most well-funded addresses come first
    if (params.minimal && !params.send_all) {
        var callbacks = params.callbacks;
        var arrCandidatePayingAddresses = params.paying_addresses;

        var trySubset = function (count) {
            if (count > constants.MAX_AUTHORS_PER_UNIT)
                return callbacks.ifNotEnoughFunds("Too many authors.  Consider splitting the payment into two units.");
            var try_params = _.clone(params);
            delete try_params.minimal;
            try_params.paying_addresses = arrCandidatePayingAddresses.slice(0, count);
            try_params.callbacks = {
                ifOk: callbacks.ifOk,
                ifError: callbacks.ifError,
                ifNotEnoughFunds: function (error_message) {
                    if (count === arrCandidatePayingAddresses.length)
                        return callbacks.ifNotEnoughFunds(error_message);
                    trySubset(count + 1); // add one more paying address
                }
            };
            composeJoint(try_params);
        };

        return trySubset(1);
    }

    var arrSigningAddresses = params.signing_addresses || [];
    var arrPayingAddresses = params.paying_addresses || [];
    var arrOutputs = params.outputs || [];
    var arrMessages = _.clone(params.messages || []);
    var assocPrivatePayloads = params.private_payloads || {}; // those that correspond to a subset of params.messages
    var fnRetrieveMessages = params.retrieveMessages;
    //	var lightProps = params.lightProps;
    var signer = params.signer;
    var callbacks = params.callbacks;

    //	if (conf.bLight && !lightProps)
    //		throw Error("no parent props for light");


    //profiler.start();
    var arrChangeOutputs = arrOutputs.filter(function (output) { return (output.amount === 0); });
    var arrExternalOutputs = arrOutputs.filter(function (output) { return (output.amount > 0); });
    if (arrChangeOutputs.length > 1)
        throw Error("more than one change output");
    if (arrChangeOutputs.length === 0)
        throw Error("no change outputs");

    if (arrPayingAddresses.length === 0)
        throw Error("no payers?");
    var arrFromAddresses = _.union(arrSigningAddresses, arrPayingAddresses).sort();

    var objPaymentMessage = {
        app: "payment",
        payload_location: "inline",
        payload_hash: hash_placeholder,
        payload: {
            // first output is the change, it has 0 amount (placeholder) that we'll modify later.
            // Then we'll sort outputs, so the change is not necessarity the first in the final transaction
            outputs: arrChangeOutputs
            // we'll add more outputs below
        }
    };
    var total_amount = 0;
    arrExternalOutputs.forEach(function (output) {
        objPaymentMessage.payload.outputs.push(output);
        total_amount += output.amount;
    });
    arrMessages.push(objPaymentMessage);

    var bMultiAuthored = (arrFromAddresses.length > 1);
    var objUnit = {
        version: constants.version,
        alt: constants.alt,
        //timestamp: Date.now(),
        messages: arrMessages,
        authors: []
    };
    var objJoint = { unit: objUnit };
    if (params.earned_headers_commission_recipients) // it needn't be already sorted by address, we'll sort it now
        objUnit.earned_headers_commission_recipients = params.earned_headers_commission_recipients.concat().sort(function (a, b) {
            return ((a.address < b.address) ? -1 : 1);
        });
    else if (bMultiAuthored) // by default, the entire earned hc goes to the change address
        objUnit.earned_headers_commission_recipients = [{ address: arrChangeOutputs[0].address, earned_headers_commission_share: 100 }];

    var total_input;
    var last_ball_mci;
    var assocSigningPaths = {};
    var unlock_callback;
    var conn;
    var lightProps;

    var handleError = function (err) {
        //profiler.stop('compose');
        unlock_callback();
        if (typeof err === "object") {
            if (err.error_code === "NOT_ENOUGH_FUNDS")
                return callbacks.ifNotEnoughFunds(err.error);
            throw Error("unknown error code in: " + JSON.stringify(err));
        }
        callbacks.ifError(err);
    };

    async.series([
        function (cb) { // lock
            mutex.lock(arrFromAddresses.map(function (from_address) { return 'c-' + from_address; }), function (unlock) {
                unlock_callback = unlock;
                cb();
            });
        },
        function (cb) { // lightProps
            if (!conf.bLight)
                return cb();
            var network = require('./network.js');
            network.requestFromLightVendor(
                'light/get_parents_and_last_ball_and_witness_list_unit',
                { witnesses: arrWitnesses },
                function (ws, request, response) {
                    if (response.error)
                        return handleError(response.error); // cb is not called
                    if (!response.parent_units || !response.last_stable_mc_ball || !response.last_stable_mc_ball_unit || typeof response.last_stable_mc_ball_mci !== 'number')
                        return handleError("invalid parents from light vendor"); // cb is not called
                    lightProps = response;
                    cb();
                }
            );
        },
        function (cb) { // start transaction
            db.takeConnectionFromPool(function (new_conn) {
                conn = new_conn;
                conn.query("BEGIN", function () { cb(); });
            });
        },
        function (cb) { // parent units
            if (bGenesis)
                return cb();

            function checkForUnstablePredecessors() {
                conn.query(
                    // is_stable=0 condition is redundant given that last_ball_mci is stable
                    "SELECT 1 FROM units CROSS JOIN unit_authors USING(unit) \n\
                    WHERE  (main_chain_index>? OR main_chain_index IS NULL) AND address IN(?) AND definition_chash IS NOT NULL \n\
                    UNION \n\
                    SELECT 1 FROM units JOIN address_definition_changes USING(unit) \n\
                    WHERE (main_chain_index>? OR main_chain_index IS NULL) AND address IN(?) \n\
                    UNION \n\
                    SELECT 1 FROM units CROSS JOIN unit_authors USING(unit) \n\
                    WHERE (main_chain_index>? OR main_chain_index IS NULL) AND address IN(?) AND sequence!='good'",
                    [last_ball_mci, arrFromAddresses, last_ball_mci, arrFromAddresses, last_ball_mci, arrFromAddresses],
                    function (rows) {
                        if (rows.length > 0)
                            return cb("some definition changes or definitions or nonserials are not stable yet");
                        cb();
                    }
                );
            }

            if (conf.bLight) {
                objUnit.parent_units = lightProps.parent_units;
                objUnit.last_ball = lightProps.last_stable_mc_ball;
                objUnit.last_ball_unit = lightProps.last_stable_mc_ball_unit;
                last_ball_mci = lightProps.last_stable_mc_ball_mci;
                return checkForUnstablePredecessors();
            }
            parentComposer.pickParentUnitsAndLastBall(
                conn,
                arrWitnesses,
                function (err, arrParentUnits, last_stable_mc_ball, last_stable_mc_ball_unit, last_stable_mc_ball_mci) {
                    if (err)
                        return cb("unable to find parents: " + err);
                    objUnit.parent_units = arrParentUnits;
                    objUnit.last_ball = last_stable_mc_ball;
                    objUnit.last_ball_unit = last_stable_mc_ball_unit;
                    last_ball_mci = last_stable_mc_ball_mci;
                    checkForUnstablePredecessors();
                }
            );
        },
        function (cb) { // authors
            async.eachSeries(arrFromAddresses, function (from_address, cb2) {

                function setDefinition() {
                    signer.readDefinition(conn, from_address, function (err, arrDefinition) {
                        if (err)
                            return cb2(err);
                        objAuthor.definition = arrDefinition;
                        cb2();
                    });
                }

                var objAuthor = {
                    address: from_address,
                    authentifiers: {}
                };
                signer.readSigningPaths(conn, from_address, function (assocLengthsBySigningPaths) {
                    var arrSigningPaths = Object.keys(assocLengthsBySigningPaths);
                    assocSigningPaths[from_address] = arrSigningPaths;
                    for (var j = 0; j < arrSigningPaths.length; j++)
                        objAuthor.authentifiers[arrSigningPaths[j]] = repeatString("-", assocLengthsBySigningPaths[arrSigningPaths[j]]);
                    objUnit.authors.push(objAuthor);
                    conn.query(
                        "SELECT 1 FROM unit_authors CROSS JOIN units USING(unit) \n\
                        WHERE address=? AND is_stable=1 AND sequence='good' AND main_chain_index<=? \n\
                        LIMIT 1",
                        [from_address, last_ball_mci],
                        function (rows) {
                            if (rows.length === 0) // first message from this address
                                return setDefinition();
                            // try to find last stable change of definition, then check if the definition was already disclosed
                            conn.query(
                                "SELECT definition \n\
                                FROM address_definition_changes CROSS JOIN units USING(unit) LEFT JOIN definitions USING(definition_chash) \n\
                                WHERE address=? AND is_stable=1 AND sequence='good' AND main_chain_index<=? \n\
                                ORDER BY level DESC LIMIT 1",
                                [from_address, last_ball_mci],
                                function (rows) {
                                    if (rows.length === 0) // no definition changes at all
                                        return cb2();
                                    var row = rows[0];
                                    row.definition ? cb2() : setDefinition(); // if definition not found in the db, add it into the json
                                }
                            );
                        }
                    );
                });
            }, cb);
        },
        function (cb) { // witnesses
            if (bGenesis) {
                objUnit.witnesses = arrWitnesses;
                return cb();
            }
            if (conf.bLight) {
                if (lightProps.witness_list_unit)
                    objUnit.witness_list_unit = lightProps.witness_list_unit;
                else
                    objUnit.witnesses = arrWitnesses;
                return cb();
            }
            // witness addresses must not have references
            storage.determineIfWitnessAddressDefinitionsHaveReferences(conn, arrWitnesses, function (bWithReferences) {
                if (bWithReferences)
                    return cb("some witnesses have references in their addresses");
                storage.findWitnessListUnit(conn, arrWitnesses, last_ball_mci, function (witness_list_unit) {
                    if (witness_list_unit)
                        objUnit.witness_list_unit = witness_list_unit;
                    else
                        objUnit.witnesses = arrWitnesses;
                    cb();
                });
            });
        },
        // messages retrieved via callback
        function (cb) {
            if (!fnRetrieveMessages)
                return cb();
            console.log("will retrieve messages");
            fnRetrieveMessages(conn, last_ball_mci, bMultiAuthored, arrPayingAddresses, function (err, arrMoreMessages, assocMorePrivatePayloads) {
                console.log("fnRetrieveMessages callback: err code = " + (err ? err.error_code : ""));
                if (err)
                    return cb((typeof err === "string") ? ("unable to add additional messages: " + err) : err);
                Array.prototype.push.apply(objUnit.messages, arrMoreMessages);
                if (assocMorePrivatePayloads && Object.keys(assocMorePrivatePayloads).length > 0)
                    for (var payload_hash in assocMorePrivatePayloads)
                        assocPrivatePayloads[payload_hash] = assocMorePrivatePayloads[payload_hash];
                cb();
            });
        },
        function (cb) { // input coins
            objUnit.headers_commission = objectLength.getHeadersSize(objUnit);
            var naked_payload_commission = objectLength.getTotalPayloadSize(objUnit); // without input coins

            if (bGenesis) {
                var issueInput = { type: "issue", serial_number: 1, amount: constants.TOTAL_WHITEBYTES };
                if (objUnit.authors.length > 1) {
                    issueInput.address = arrWitnesses[0];
                }
                objPaymentMessage.payload.inputs = [issueInput];
                objUnit.payload_commission = objectLength.getTotalPayloadSize(objUnit);
                total_input = constants.TOTAL_WHITEBYTES;
                return cb();
            }
            if (params.inputs) { // input coins already selected
                if (!params.input_amount)
                    throw Error('inputs but no input_amount');
                total_input = params.input_amount;
                objPaymentMessage.payload.inputs = params.inputs;
                objUnit.payload_commission = objectLength.getTotalPayloadSize(objUnit);
                return cb();
            }

            // all inputs must appear before last_ball
            var target_amount = params.send_all ? Infinity : (total_amount + objUnit.headers_commission + naked_payload_commission);
            inputs.pickDivisibleCoinsForAmount(
                conn, null, arrPayingAddresses, last_ball_mci, target_amount, bMultiAuthored, params.spend_unconfirmed || 'own',
                function (arrInputsWithProofs, _total_input) {
                    if (!arrInputsWithProofs)
                        return cb({
                            error_code: "NOT_ENOUGH_FUNDS",
                            error: "not enough spendable funds from " + arrPayingAddresses + " for " + target_amount
                        });
                    total_input = _total_input;
                    objPaymentMessage.payload.inputs = arrInputsWithProofs.map(function (objInputWithProof) { return objInputWithProof.input; });
                    objUnit.payload_commission = objectLength.getTotalPayloadSize(objUnit);
                    console.log("inputs increased payload by", objUnit.payload_commission - naked_payload_commission);
                    cb();
                }
            );
        }
    ], function (err) {
        // we close the transaction and release the connection before signing as multisig signing may take very very long
        // however we still keep c-ADDRESS lock to avoid creating accidental doublespends
        conn.query(err ? "ROLLBACK" : "COMMIT", function () {
            conn.release();
            if (err)
                return handleError(err);

            // change, payload hash, signature, and unit hash
            var change = total_input - total_amount - objUnit.headers_commission - objUnit.payload_commission;
            if (change <= 0) {
                if (!params.send_all)
                    throw Error("change=" + change + ", params=" + JSON.stringify(params));
                return handleError({
                    error_code: "NOT_ENOUGH_FUNDS",
                    error: "not enough spendable funds from " + arrPayingAddresses + " for fees"
                });
            }
            objPaymentMessage.payload.outputs[0].amount = change;
            objPaymentMessage.payload.outputs.sort(sortOutputs);
            objPaymentMessage.payload_hash = objectHash.getBase64Hash(objPaymentMessage.payload);
            var text_to_sign = objectHash.getUnitHashToSign(objUnit);
            async.each(
                objUnit.authors,
                function (author, cb2) {
                    var address = author.address;
                    async.each( // different keys sign in parallel (if multisig)
                        assocSigningPaths[address],
                        function (path, cb3) {
                            if (signer.sign) {
                                signer.sign(objUnit, assocPrivatePayloads, address, path, function (err, signature) {
                                    if (err)
                                        return cb3(err);
                                    // it can't be accidentally confused with real signature as there are no [ and ] in base64 alphabet
                                    if (signature === '[refused]')
                                        return cb3('one of the cosigners refused to sign');
                                    author.authentifiers[path] = signature;
                                    cb3();
                                });
                            }
                            else {
                                signer.readPrivateKey(address, path, function (err, privKey) {
                                    if (err)
                                        return cb3(err);
                                    author.authentifiers[path] = ecdsaSig.sign(text_to_sign, privKey);
                                    cb3();
                                });
                            }
                        },
                        function (err) {
                            cb2(err);
                        }
                    );
                },
                function (err) {
                    if (err)
                        return handleError(err);
                    objUnit.unit = objectHash.getUnitHash(objUnit);
                    if (bGenesis)
                        objJoint.ball = objectHash.getBallHash(objUnit.unit);
                    console.log(require('util').inspect(objJoint, { depth: null }));
                    objJoint.unit.timestamp = Math.round(Date.now() / 1000); // light clients need timestamp
                    if (Object.keys(assocPrivatePayloads).length === 0)
                        assocPrivatePayloads = null;
                    //profiler.stop('compose');
                    callbacks.ifOk(objJoint, assocPrivatePayloads, unlock_callback);
                }
            );
        });
    });
}


function signMessage(from_address, message, signer, handleResult) {
    var objAuthor = {
        address: from_address,
        authentifiers: {}
    };
    var objUnit = {
        signed_message: message,
        authors: [objAuthor]
    };
    var assocSigningPaths = {};
    signer.readSigningPaths(db, from_address, function (assocLengthsBySigningPaths) {
        var arrSigningPaths = Object.keys(assocLengthsBySigningPaths);
        assocSigningPaths[from_address] = arrSigningPaths;
        for (var j = 0; j < arrSigningPaths.length; j++)
            objAuthor.authentifiers[arrSigningPaths[j]] = repeatString("-", assocLengthsBySigningPaths[arrSigningPaths[j]]);
        signer.readDefinition(db, from_address, function (err, arrDefinition) {
            if (err)
                throw Error("signMessage: can't read definition: " + err);
            objAuthor.definition = arrDefinition;
            var text_to_sign = objectHash.getUnitHashToSign(objUnit);
            async.each(
                objUnit.authors,
                function (author, cb2) {
                    var address = author.address;
                    async.each( // different keys sign in parallel (if multisig)
                        assocSigningPaths[address],
                        function (path, cb3) {
                            if (signer.sign) {
                                signer.sign(objUnit, {}, address, path, function (err, signature) {
                                    if (err)
                                        return cb3(err);
                                    // it can't be accidentally confused with real signature as there are no [ and ] in base64 alphabet
                                    if (signature === '[refused]')
                                        return cb3('one of the cosigners refused to sign');
                                    author.authentifiers[path] = signature;
                                    cb3();
                                });
                            }
                            else {
                                signer.readPrivateKey(address, path, function (err, privKey) {
                                    if (err)
                                        return cb3(err);
                                    author.authentifiers[path] = ecdsaSig.sign(text_to_sign, privKey);
                                    cb3();
                                });
                            }
                        },
                        function (err) {
                            cb2(err);
                        }
                    );
                },
                function (err) {
                    if (err)
                        return handleResult(err);
                    console.log(require('util').inspect(objUnit, { depth: null }));
                    handleResult(null, objUnit);
                }
            );
        });
    });
}

var MAX_FEE = 20000;

function filterMostFundedAddresses(rows, estimated_amount) {
    if (!estimated_amount)
        return rows.map(function (row) { return row.address; });
    var arrFundedAddresses = [];
    var accumulated_amount = 0;
    for (var i = 0; i < rows.length; i++) {
        arrFundedAddresses.push(rows[i].address);
        accumulated_amount += rows[i].total;
        if (accumulated_amount > estimated_amount + MAX_FEE)
            break;
    }
    return arrFundedAddresses;
}

function readSortedFundedAddresses(asset, arrAvailableAddresses, estimated_amount, spend_unconfirmed, handleFundedAddresses) {
    if (arrAvailableAddresses.length === 0)
        return handleFundedAddresses([]);
    if (estimated_amount && typeof estimated_amount !== 'number')
        throw Error('invalid estimated amount: ' + estimated_amount);
    // addresses closest to estimated amount come first
    var order_by = estimated_amount ? "(SUM(amount)>" + estimated_amount + ") DESC, ABS(SUM(amount)-" + estimated_amount + ") ASC" : "SUM(amount) DESC";
    db.query(
        "SELECT * FROM ( \n\
            SELECT address, SUM(amount) AS total \n\
            FROM outputs \n\
            CROSS JOIN units USING(unit) \n\
            WHERE address IN(?) "+ inputs.getConfirmationConditionSql(spend_unconfirmed) + " AND sequence='good' \n\
				AND is_spent=0 AND asset"+ (asset ? "=?" : " IS NULL") + " \n\
			GROUP BY address ORDER BY "+ order_by + " \n\
		) AS t \n\
		WHERE NOT EXISTS ( \n\
			SELECT * FROM units CROSS JOIN unit_authors USING(unit) \n\
			WHERE is_stable=0 AND unit_authors.address=t.address AND definition_chash IS NOT NULL \n\
		)",
        asset ? [arrAvailableAddresses, asset] : [arrAvailableAddresses],
        function (rows) {
            var arrFundedAddresses = filterMostFundedAddresses(rows, estimated_amount);
            handleFundedAddresses(arrFundedAddresses);
        }
    );
}






function getSavingCallbacks(callbacks) {
    return {
        ifError: callbacks.ifError,
        ifNotEnoughFunds: callbacks.ifNotEnoughFunds,
        ifOk: function (objJoint, assocPrivatePayloads, composer_unlock) {
            var objUnit = objJoint.unit;
            var unit = objUnit.unit;
            validation.validate(objJoint, {
                ifUnitError: function (err) {
                    composer_unlock();
                    callbacks.ifError("Validation error: " + err);
                    //	throw Error("unexpected validation error: "+err);
                },
                ifJointError: function (err) {
                    throw Error("unexpected validation joint error: " + err);
                },
                ifTransientError: function (err) {
                    throw Error("unexpected validation transient error: " + err);
                },
                ifNeedHashTree: function () {
                    throw Error("unexpected need hash tree");
                },
                ifNeedParentUnits: function (arrMissingUnits) {
                    throw Error("unexpected dependencies: " + arrMissingUnits.join(", "));
                },
                ifOk: function (objValidationState, validation_unlock) {
                    console.log("base asset OK " + objValidationState.sequence);
                    if (objValidationState.sequence !== 'good') {
                        validation_unlock();
                        composer_unlock();
                        return callbacks.ifError("Bad sequence " + objValidationState.sequence);
                    }
                    postJointToLightVendorIfNecessaryAndSave(
                        objJoint,
                        function onLightError(err) { // light only
                            console.log("failed to post base payment " + unit);
                            var eventBus = require('./event_bus.js');
                            if (err.match(/signature/))
                                eventBus.emit('nonfatal_error', "failed to post unit " + unit + ": " + err + "; " + JSON.stringify(objUnit), new Error());
                            validation_unlock();
                            composer_unlock();
                            callbacks.ifError(err);
                        },
                        function save() {
                            console.log("delete writer.saveJoint")
                            // writer.saveJoint(
                            //     objJoint, objValidationState,
                            //     function (conn, cb) {
                            //         if (typeof callbacks.preCommitCb === "function")
                            //             callbacks.preCommitCb(conn, objJoint, cb);
                            //         else
                            //             cb();
                            //     },
                            //     function onDone(err) {
                            //         validation_unlock();
                            //         composer_unlock();
                            //         if (err)
                            //             return callbacks.ifError(err);
                            //         console.log("composer saved unit " + unit);
                            //         callbacks.ifOk(objJoint, assocPrivatePayloads);
                            //     }
                            // );
                        }
                    );
                } // ifOk validation
            }); // validate
        }
    };
}


function postJointToLightVendorIfNecessaryAndSave(objJoint, onLightError, save) {
    if (conf.bLight) { // light clients cannot save before receiving OK from light vendor
        var network = require('./network.js');
        network.postJointToLightVendor(objJoint, function (response) {
            if (response === 'accepted')
                save();
            else
                onLightError(response.error);
        });
    }
    else
        save();
}



function getMessageIndexByPayloadHash(objUnit, payload_hash) {
    for (var i = 0; i < objUnit.messages.length; i++)
        if (objUnit.messages[i].payload_hash === payload_hash)
            return i;
    throw Error("message not found by payload hash " + payload_hash);
}

function generateBlinding() {
    return crypto.randomBytes(12).toString("base64");
}



exports.composeJoint = composeJoint;

exports.signMessage = signMessage;

exports.filterMostFundedAddresses = filterMostFundedAddresses;
exports.readSortedFundedAddresses = readSortedFundedAddresses;

exports.sortOutputs = sortOutputs;
exports.getSavingCallbacks = getSavingCallbacks;
exports.postJointToLightVendorIfNecessaryAndSave = postJointToLightVendorIfNecessaryAndSave;
exports.generateBlinding = generateBlinding;
exports.getMessageIndexByPayloadHash = getMessageIndexByPayloadHash;
exports.writeTran = writeTran;