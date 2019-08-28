'use strict';

var Bitcore = require('bitcore-lib');
var Mnemonic = require('bitcore-mnemonic');
var objectHash = require('./object_hash.js');
var ecdsaSig = require('./signature.js');
var Decimal = require('decimal.js');
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
    var arrDefinition = ["sig", {"pubkey": pubkey}];
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

function signature(opts, xprivKey) {
    var buf_to_sign = objectHash.getUnitHashToSign(opts);

    var xPrivKey = new Bitcore.HDPrivateKey.fromString(xprivKey);
//获取签名的私钥
    var pathSign = "m/44'/0'/0'/0/0";
    var privKeyBuf = xPrivKey.derive(pathSign).privateKey.bn.toBuffer({size: 32});

    let signature = ecdsaSig.sign(buf_to_sign, privKeyBuf);
//对签名进行验证
    return signature;
}

/**
 * 字符串转base64
 * @param data
 * @returns {string}
 */
let stringToBase64 = (data) => {
    return new Buffer(data).toString("base64")
}

/**
 * 数字转base64
 * @param data
 * @returns {*}
 */
let numberToBase64 = (data) => {
    let n = new Decimal(data);
    let k = n.toNumber().toString(16);
    k = k.length % 2 == 1 ? "0" + k : k;
    return Buffer.from(k, 'hex').toString("base64")
}


/**
 * base转字符串
 * @param data
 */
let base64ToString = (data) => {
    return Buffer.from(data, "base64").toString();

}

/**
 * base64转数字
 * @param data
 */
let base64ToNumber = (data) => {
    let b = Buffer.from(data, "base64").toString("hex");
    return new Decimal(parseInt(b, 16)).sub('0').toFixed();
}

let Hexstring2btye = (str)=> {
    let pos = 0;
    let len = str.length;
    if (len % 2 != 0) {
        return null;
    }
    len /= 2;
    let hexA = new Array();
    for (let i = 0; i < len; i++) {
        let s = str.substr(pos, 2);
        let v = parseInt(s, 16);
        hexA.push(v);
        pos += 2;
    }
    return hexA;
}

/**
* @description:
*
* @param: String转16
* @return
* @author: lhp
* @time: 2019-08-23 17-06
*/
let String2Hex = (data, cb) => {
    try{
        let str =  Buffer.from(data, "base64").toString("hex");
        if(cb) cb(null ,str);
        else return str;  
    }catch (e) {
        console.log("String2Hex: ",e.toString())
        if(cb) cb(e.toString())
        else return '';
    }


}


/**
* @description:
*
* @param: 去重
* @return
* @author: lhp
* @time: 2019-08-22 16-49
*/
let  arrayUnique = (arr, name) => {
    var hash = {};
    return arr.reduce(function (item, next) {
        hash[next[name]] ? '' : hash[next[name]] = true && item.push(next);
        return item;
    }, []);
}

/**
 * 自动补位
 * @param num
 * @param length
 * @returns {string}
 * @constructor
 */
let  PrefixInteger =(num, length) => {
    return (Array(length).join('0') + num).slice(-length);
}


module.exports = {
    getprivKey: getprivKey,
    getPubkey: getPubkey,
    stringToBase64: stringToBase64,
    numberToBase64: numberToBase64,
    base64ToString: base64ToString,
    base64ToNumber: base64ToNumber,
    signature: signature,
    Hexstring2btye: Hexstring2btye,
    arrayUnique:arrayUnique,
    PrefixInteger:PrefixInteger,
    String2Hex:String2Hex
};