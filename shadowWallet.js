/*jslint node: true */
"use strict";

var getSourceString = require('./string_utils').getSourceString;
var Bitcore = require('bitcore-lib');
var crypto = require('crypto');
var objectHash = require('./object_hash.js');
var ecdsaSig = require('./signature');
var signatureCode;
var signatureDetlCode;
var RANDOM;
var constants = require('constants');
/**
 * 热钱包 生成授权签名-扫描地址
 * @param address
 * @param cb
 * @returns
 */
exports.getSignatureCode = function(address,cb){
    RANDOM = crypto.randomBytes(4).toString("hex");
    console.log(RANDOM);
    var db = require("./db");
    db.query("select count(1) as t from my_addresses where address = ?",[address],function (rs) {
        if(rs[0].t == 0) {
            signatureCode =
                {
                    name:"shadow",
                    type:"sign",
                    addr:address,
                    random:RANDOM
                };
            return cb(signatureCode);
        }else {
            return cb("wallet exists");
        }
    });
};

/**
 * 冷钱包  进行授权签名
 * @param signatureCode
 * @param words
 * @param cb
 * @returns {*}
 */
exports.getSignatureDetlCode = function(signatureCode,xPrivkey, cb){
    if(xPrivkey == null || xPrivkey == "") {
        cb("xPrivkey could not be null~!");
        return ;
    }

    var json;
    switch(typeof signatureCode) {
        case "string":
            json = JSON.parse(signatureCode);
            break;
        case "object":
            json = signatureCode;
            break;
        default:
            cb(false);
            break;
    }
    var sign_json = {
        name:"shadow",
        type:"sign",
        addr:json.addr,
        random:json.random
    };
    var buf_to_sign = crypto.createHash("sha256").update(getSourceString(sign_json), "utf8").digest();

    var xPrivKey = new Bitcore.HDPrivateKey.fromString(xPrivkey);

    var path = "m/44'/0'/0'/0/0";
    var privateKey = xPrivKey.derive(path).privateKey.bn.toBuffer({size:32});
    var sign_64 = ecdsaSig.sign(buf_to_sign, privateKey);

    var path2 = "m/44'/0'/0'";
    var privateKey2 = xPrivKey.derive(path2);
    var xpubkey = Bitcore.HDPublicKey(privateKey2).xpubkey;

    var pubkey = derivePubkey(xpubkey ,"m/0/0");

    signatureDetlCode =
        {
            name:"shadow",
            type:"signDetl",
            signature:sign_64,
            random:json.random,
            expub:xpubkey +'',
            addr:json.addr,
            pubkey:pubkey
        };
    return cb(signatureDetlCode);
};

function derivePubkey(xPubKey, path) {
    var hdPubKey = new Bitcore.HDPublicKey(xPubKey);
    return hdPubKey.derive(path).publicKey.toBuffer().toString("base64");
}

/**
 * 热钱包  生成热钱包
 * @param signatureDetlCode
 * @param cb
 * @returns {*}
 */
exports.generateShadowWallet = function(signatureDetlCode,cb){
    if(!RANDOM) {
        return cb("random failed");
    }
    var json;
    switch(typeof signatureDetlCode) {
        case "string":
            json = JSON.parse(signatureDetlCode);
            break;
        case "object":
            json = signatureDetlCode;
            break;
        default:
            cb(false);
            break;
    }
    if(RANDOM != json.random) {
        return cb("random failed");
    }
    var addr = json.addr;
    var sign = json.signature;
    var xpub = json.expub;
    var pubkey = json.pubkey;

    var sing_json = {
        name:"shadow",
        type:"sign",
        addr:addr,
        random:json.random
    };

    var result = {
        'addr':addr,
        'sign':sign,
        'xpub':xpub,
        'pubkey':pubkey
    };
    var buf_to_sign = crypto.createHash("sha256").update(getSourceString(sing_json), "utf8").digest();

    var pub1 = ecdsaSig.recover(buf_to_sign,sign,1).toString("base64");
    var pub2 = ecdsaSig.recover(buf_to_sign,sign,0).toString("base64");
    var definition1 = ["sig",{"pubkey":pub1}];
    var definition2 = ["sig",{"pubkey":pub2}];
    var address1 = objectHash.getChash160(definition1);
    var address2 = objectHash.getChash160(definition2);

    if(address1 === addr  || address2 == addr) {
        RANDOM = '';
        cb(result);
    } else
        cb("validation failed");
};


var light = require("./light");
/**
 * 热钱包生成交易授权签名
 * @param opts
 * @param cb
 * @returns {*}
 */
exports.getTradingUnit = async function (opts ,cb) {

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
    let feeTotal;
    let zero = '000000000000000000';
    let amount = (opts.amount + "").split('.')[0];
    let amountP = (opts.amount + "").split('.')[1] ? (opts.amount + "").split('.')[1] : '';
    let amountPoint = amountP+zero.substring(-1,zero.length-amountP.length);
    let amountstr = amount+amountP+zero.substring(-1,zero.length-amountP.length);
    var isHot = opts.name;
    var obj;
    var signature;
    var deviceAddress = opts.deviceAddress;
    var timestamp = Math.round(Date.now());
    let Base64 = require('./base64Code');
    let noteBase64 = opts.note ?  Base64.encode(opts.note) :'';
    let NRG_PRICE = await hashnethelper.getNRGPrice();

    switch(typeof opts) {
        case "string":
            opts = JSON.parse(signatureDetlCode);
            break;
        case "object":
            opts = opts;
            break;
        default:
            cb(false);
            break;
    }
    //判断发送方是否等于接收方，不允许发送给自己
    if (opts.change_address == opts.to_address) {
        return cb("to_address and from_address is same"
        );
    }
    if (opts.change_address == opts.to_address) {
        return cb("to_address and from_address is same");
    }
    if (typeof opts.amount !== 'number')
        return cb('amount must be a number');
    if (opts.amount < 0)
        return cb('amount must be positive');
    var isHot = opts.ishot;

    var objectLength = require("./object_length.js");

    var obj = {fromAddress: opts.change_address, toAddress: opts.to_address, amount: amountstr, timestamp, remark :note, vers:constants.transationVersion};


    obj.fee = noteBase64 ? ((noteBase64.length * 1.0 /1024) * constants.NRG_PEER_KBYTE + constants.BASE_NRG).toString(): constants.BASE_NRG.toString();
    obj.nrgPrice = NRG_PRICE;
    feeTotal = obj.fee * NRG_PRICE
    //obj.fee = "0";
    /**
     * 统计发送交易地址可用余额
     */
    getAmount(opts.walletId,function (stable) {
        var Decimal = require('decimal.js');

        let stablesFrom = stable[0].amount + stable[0].amount_point / parseInt(1 + zero) - stable[0].fee - stable[0].fee_point / parseInt(1 + zero);
        let stablesTo = new Decimal(stablesFrom).sub(params.amount).sub(new Decimal(obj.fee*obj.nrgPrice / 1000000000000000000)).toString();
        let compareStables = new Decimal(stablesTo) >0
        if (!compareStables ||(compareStables && stablesTo.substr(0,1) == "-")) {
            return cb("not enough spendable funds from " + opts.to_address + " for " + (parseInt(obj.fee) + parseInt(obj.amount)));
        }

        var db = require("./db");
        db.query("SELECT wallet, account, is_change, address_index,definition FROM my_addresses JOIN wallets USING(wallet) WHERE address=? ",[obj.fromAddress],function (row) {
            var address;

            if(row != null && row.length > 0) {
                address = {
                    definition: JSON.parse(row[0].definition),
                    wallet: row[0].wallet,
                    account: row[0].account,
                    is_change: row[0].is_change,
                    address_index: row[0].address_index
                };
                obj.pubkey = address.definition[1].pubkey;
                obj.type = 1;
                var str = getSourceString(obj);
                var authorized_signature = obj;

                let h = crypto.createHash("md5");
                h.update(str);
                var md5 = h.digest("hex");
                authorized_signature.md5 = md5;
                authorized_signature.name = "isHot";
                authorized_signature.type = "trading";
                // authorized_signature.walletType= opts.walletType;
                // authorized_signature.walletId= opts.walletId;
                // authorized_signature.address= opts.address;
                // authorized_signature.name= opts.name;
                // authorized_signature.image= opts.image;
                // authorized_signature.ammount= opts.ammount;
                // authorized_signature.mnemonic= opts.mnemonic;
                // authorized_signature.mnemonicEncrypted= opts.mnemonicEncrypted;
                cb(authorized_signature);
            }
        });
    });

};

/**
 *  冷钱包进行签名
 * @param opts
 * @param words
 * @param cb
 * @returns {Promise<void>}
 */
exports.signTradingUnit = function (opts ,xPrivkey ,cb) {
    if(xPrivkey == null || xPrivkey == "") {
        cb("xPrivkey could not be null~!");
        return ;
    }

    switch(typeof opts) {
        case "string":
            opts = JSON.parse(signatureDetlCode);
            break;
        case "object":
            opts = opts;
            break;
        default:
            cb(false);
            break;
    }
    var type = opts.type;
    var name = opts.name;
    var md5 = opts.md5;

    var obj = {fromAddress: opts.fromAddress, toAddress: opts.toAddress, amount: opts.amount, timestamp: opts.timestamp, remark: opts.remark, vers: opts.vers};
    obj.pubkey = opts.pubkey;
    obj.type = 1;
    obj.fee = opts.fee;
    var str = getSourceString(obj);

    let h = crypto.createHash("md5");

    h.update(str);

    var result = h.digest("hex");

    if( result != md5) {
        return cb("validation failed");
    }

    var buf_to_sign = objectHash.getUnitHashToSign(obj);

    //签名
    // var mnemonic = new Mnemonic(words);
    // var xPrivKey = mnemonic.toHDPrivateKey("");
    var xPrivKey = new Bitcore.HDPrivateKey.fromString(xPrivkey);

    var path = "m/44'/0'/0'/0/0";
    var privateKey = xPrivKey.derive(path).privateKey.bn.toBuffer({size:32});
    var signature = ecdsaSig.sign(buf_to_sign, privateKey);

    var path2 = "m/44'/0'/0'";
    var privateKey2 = xPrivKey.derive(path2);
    var xpubkey = Bitcore.HDPublicKey(privateKey2).xpubkey;

    var pubkey = derivePubkey(xpubkey ,"m/0/0");
    var flag = ecdsaSig.verify(buf_to_sign,signature,pubkey);

    opts.type = "sign";
    opts.name = "isHot";
    opts.signature = signature;

    if(flag) {
        cb(opts);
    } else {
        cb("signature failed");
    }
};

async function getAmount (walletId,cb){
    let res = await light.findStable(walletId);
    cb(res)
}


