'use strict';

var Bitcore = require('bitcore-lib');
var Mnemonic = require('bitcore-mnemonic');
var objectHash = require('./object_hash.js');
var ecdsaSig = require('./signature.js');
//let words = 'shield salmon sport horse cool hole pool panda embark wrap fancy equip'
//let words = 'silent lava disease visa liquid champion finish curtain alarm spy picnic become'//商户
//let address = '6GTHF7OFAGTZ6HS6KHLD44HDUC6XCJMG'//商户
//let words = 'file rough blade expand shield glimpse fabric screen simple subway rail arrest'//用户1
//let address = '5DRZKXVSZ2JEDQ6VCWB4PUMKO4IETLJD'//用户1
// let words = 'special script goat oil monitor loan ring else joke divorce anchor draw'//用户2
//let address = '7UJN4AEMWVYXGYB6KKFFNXV3DVTTNRO4'//用户2


function derivePubkey(xPubKey, path) {
    var hdPubKey = new Bitcore.HDPublicKey(xPubKey);
    return hdPubKey.derive(path).publicKey.toBuffer().toString("base64");
}

function getprivKey(words) {
    var m = new Mnemonic(words);
    console.log(m.toString());
    var xprivKey = m.toHDPrivateKey().xprivkey; //主私钥
    var xpubkey = m.toHDPrivateKey().xpubkey; //主公钥
    var xPrivKey = new Bitcore.HDPrivateKey.fromString(xprivKey);
    var path2 = "m/44'/0'/0'";
    var privateKey2 = xPrivKey.derive(path2);
    var xPubkey = Bitcore.HDPublicKey(privateKey2).xpubkey;
    var path = "m/0/0";
    var pubkey = derivePubkey(xPubkey, path); //扩展公钥，用于验证签名
    var arrDefinition = ["sig", { "pubkey": pubkey }];
    var address = objectHash.getChash160(arrDefinition);

    var obj = {
        xprivKey: xprivKey,
        xpubkey: xpubkey,
        pubkey: pubkey,
        address: address
    };
    return obj;
}

function getPubkey(xprivKey) {
    var xPrivKey = new Bitcore.HDPrivateKey.fromString(xprivKey);
    var path2 = "m/44'/0'/0'";
    var privateKey2 = xPrivKey.derive(path2);
    var xPubkey = Bitcore.HDPublicKey(privateKey2).xpubkey;
    var path = "m/0/0";
    function derivePubkey(xPubKey, path) {
        var hdPubKey = new Bitcore.HDPublicKey(xPubKey);
        return hdPubKey.derive(path).publicKey.toBuffer().toString("base64");
    }
    var pubkey = derivePubkey(xPubkey, path); //扩展公钥，用于验证签名
    return pubkey;
}

function signature(msg, xprivKey){

var obj= {
    msg:msg
}


var buf_to_sign = objectHash.getUnitHashToSign(obj);

var xPrivKey = new Bitcore.HDPrivateKey.fromString(xprivKey);
//获取签名的私钥
var pathSign = "m/44'/0'/0'/0/0";
var privKeyBuf = xPrivKey.derive(pathSign).privateKey.bn.toBuffer({size:32});

let signature = ecdsaSig.sign(buf_to_sign, privKeyBuf);
//对签名进行验证
 return signature;
}

/**
 * 字符串转base64
 * @param data
 * @returns {string}
 */
let stringToBase64 =(data) =>{
    return new Buffer(data).toString("base64")
}

/**
 * 数字转base64
 * @param data
 * @returns {*}
 */
let numberToBase64 =(data) =>{
    let k = data.toString(16);
    k = k.length % 2 ==1 ? "0"+k : k;
    return Buffer.from(k,'hex').toString("base64")
}

/**
 * base转字符串
 * @param data
 */
let base64ToString =(data) => {
    return  Buffer.from(data,"base64").toString();

}

/**
 * base64转数字
 * @param data
 */
let base64ToNumber =(data) => {
    let b = Buffer.from(data,"base64").toString("hex");
    return parseInt(b,16);
}



module.exports = {
    getprivKey: getprivKey,
    getPubkey: getPubkey,
    stringToBase64: stringToBase64,
    numberToBase64: numberToBase64,
    base64ToString: base64ToString,
    base64ToNumber: base64ToNumber,
    signature: signature
};