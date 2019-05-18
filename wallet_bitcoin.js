/*jslint node: true */
"use strict";

let version = new Buffer([0x00]);
/**
 *  生成比特币钱包地址
 * @param xprikey 扩展主私钥
 * @param acount
 * @param change
 * @param address_index
 *
 * m / purpose' / coin_type' / account' / change / address_index
 */
function getBitAddress(xprikey,account,change,address_index) {
    var path = "m/44'/0'/"+ account +"'/"+ change +"/"+ address_index;

    let secre = require('./secrethelper');
    let Bitcore = require('bitcore-lib');

    var path1 = "m/44'/0'/"+ account + "'";
    var path2 = "m/"+change + "/" + address_index;

    var hdPriKey = Bitcore.HDPrivateKey.fromString(xprikey);

    var privateKey = hdPriKey.derive(path1);

    var xpubkey = Bitcore.HDPrivateKey(privateKey).xpubkey;
    var hdPubkey = new Bitcore.HDPublicKey(xpubkey);
    var pubkey = hdPubkey.derive(path2).publicKey.toBuffer();


    // var pubkey222 = publicKey.publicKey.toBuffer().toString("base64");
    // var pubkey = publicKey.toBuffer();

    var s = secre.sha256hash(pubkey);
    var payload = secre.ripemd160hash(s);

    var vp = Buffer.concat([version,payload] ,version.length + payload.length);

    var checksum = secre.sha256hash(secre.sha256hash(vp));
    var vpc = Buffer.concat([vp,checksum.slice(0,4)] , vp.length+4);

    var address =  secre.base58encode(vpc);
    return address;
};




exports.getBitAddress = getBitAddress;