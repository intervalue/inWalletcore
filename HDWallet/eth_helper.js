"use strict"

var Web3 = require('web3');
var bip39 = require('bip39')
var hdkey = require('ethereumjs-wallet/hdkey')
var util = require('ethereumjs-util')
let web3api;
var secp256k1 = require('secp256k1');
// var SHA3 = require('keccakjs')
const bitcoin = require('bitcoinjs-lib');
const webHelper = require('../webhelper');
var db = require('../db.js');
const BigNumber = require('bignumber.js');
var mutex = require('../mutex.js');
//初始化过程
var web3;
if (typeof web3 !== 'undefined') {
    web3 = new Web3(web3.currentProvider);
} else {
    // set the provider you want from Web3.providers
    // var web3 = new Web3(new Web3.providers.HttpProvider("http://52.221.119.220:8080"));
    web3 = new Web3(new Web3.providers.HttpProvider("http://eth.inve.one:8181"));
}
var Tx = require('ethereumjs-tx');

const sjcl = require('sjcl');

const opts = {
    iter: 10000
};

// // web3js ~ 0.18.2
// if (typeof web3api !== 'undefined') {
//     web3api = new Web3(web3api.currentProvider);
// } else {
//     // set the provider you want from Web3.providers
//     web3api = new Web3(new Web3.providers.HttpProvider("http://localhost:8545"));
// }

var getPubliyKey=function(mnemonic,addresstype,privateKey){
    if(privateKey){
        //var publicKey= secp256k1.publicKeyCreate(Buffer.from(mnemonic,'hex'), false).toString("hex");
        /**
         * 修复eth删除助记词后，转账报错问题  2019-04-25  by lhp
         */

        if (isNaN(addresstype)) {
            addresstype = 0;
        }
        let path = "m/44'/60'/0'/0/";

        path += addresstype;

        var hdWallet = hdkey.fromExtendedKey(mnemonic);

        var key1 = hdWallet.derivePath(path);

        var publicKey = key1._hdkey._publicKey.toString("hex");
    }else {
        if (isNaN(addresstype)) {
            addresstype = 0;
        }
        let path = "m/44'/60'/0'/0/";

        path += addresstype;

        var seed = bip39.mnemonicToSeed(mnemonic);

        var hdWallet = hdkey.fromMasterSeed(seed);

        var key1 = hdWallet.derivePath(path);

        var publicKey = key1._hdkey._publicKey.toString("hex");
    }
    return publicKey;
}

function getPrivateKey(mnemonic,addresstype,PrivateKey ){
    if(isNaN(addresstype)){
        addresstype=0;
    }
    let path ="m/44'/60'/0'/0/";

    path +=addresstype;

    var seed = bip39.mnemonicToSeed(mnemonic);

    /**
     * 修复eth删除助记词后，转账报错问题  2019-04-25  by lhp
     */
    var hdWallet = PrivateKey ?  hdkey.fromExtendedKey(mnemonic): hdkey.fromMasterSeed(seed);

    var key1 = hdWallet.derivePath(path);

    var privateKey =key1._hdkey._privateKey;

    return privateKey.toString("hex");
}
var getAddress = function(mnemonic,addresstype){
    if(isNaN(addresstype)){
        addresstype=0;
    }
    let path ="m/44'/60'/0'/0/";
    path +=addresstype;
    var seed = bip39.mnemonicToSeed(mnemonic);

    var hdWallet = hdkey.fromMasterSeed(seed);

    var key1 = hdWallet.derivePath(path);

    var publicKey =key1._hdkey._publicKey;

    console.log("publickey:"+publicKey.toString('hex'));
    console.log("priwebHelpervatekey:"+key1._hdkey._privateKey.toString('hex'))

    return getAddressBynode(publicKey,addresstype);

}


function getAddressBynode(publicKey){
    if (Object.prototype.toString.call(publicKey) === "[object String]")
        publicKey = Buffer.from(publicKey, 'hex');

    var address = util.pubToAddress(publicKey, true);
    address = util.toChecksumAddress(address.toString('hex'));

    return address.toLowerCase();
}
function getUnUseBanlance(address,toaddress,sendmoney,callbackFun) {
    web3.eth.estimateGas({
        from : address,
        to: toaddress,
        value: "0x"+sendmoney.toString(16),//发送的金额，这里是16进制，实际表示发送256个wei
        data: ""
    }, function(err, result){
        var gasPrice = web3.eth.gasPrice == undefined? 10000000000: web3.eth.gasPrice;
        var number = new BigNumber(result).times(gasPrice).toString();
        var c =isNaN(number)?0: number;
        console.log("gas："+c+"wei");
        c= new BigNumber(c).plus(new BigNumber(sendmoney)).toString();
        web3.eth.getBalance(address,function(err, res){
            if(err){
                callbackFun(err,null);
                return;
            }else {
                res = res.toString();
                /**
                 * change by pmj reason see function sendtranstion
                 */
                callbackFun(null,{gasPrice: parseInt(gasPrice).toString(16), gas: result,d:res-c});
                return;
            }
        });
    });
}

// console.log(web3api.version.api);
// console.log(web3api.version.network);
// var version = web3api.version.api;
// console.log(version);
//gasPrice,gasLimit,
function sendtranstion(address,privateKey,toaddress,sendmoney,gasPrice, gas) {
    // var result = web3.eth.estimateGas({
    //     from : address,
    //     to: toaddress,
    //     value: "0x"+sendmoney.toString(16),//发送的金额，这里是16进制，实际表示发送256个wei
    //     data: ""
    // });
    // var gasPrice = web3.eth.gasPrice;
    // var c =result*gasPrice;
    // console.log("gas："+c+"wei");
    // gasPrice = gasPrice.toString(16);

    var number = web3.eth.getTransactionCount(address).toString(16);

    /**
     * by pmj change nonce random
     * TODO 可以修改进公共的方法
     * @type {Buffer}
     */
    function randomNum(length){
        if (isNaN(length) || length <= 0)
            length = 6;
        let result = '';
        for (let i=0; i<length; i++){
            result = result + '' + Math.floor(Math.random() * 10);
        }
        return result;
    }

    // //var number = randomNum(6);
    // console.log(gasPrice);

    var privateKey = new Buffer(privateKey, 'hex');
    /**
     * toString change to hex need Integer
     * String will don't change
     * @type {string}
     */
    var value = "0x" + parseInt(sendmoney).toString(16)
    var rawTx = {
        nonce: '0x' + number,//随机数
        //gasPrice和gasLimit如果不知道怎么填，可以参考etherscan上的任意一笔交易的值
        gasPrice: '0x' + gasPrice,
        gasLimit: '0x' + gasPrice + sendmoney.toString(16) + '1', // need change will by zl @pmj
        to: toaddress,//接受方地址或者合约地址
        gas: gas,
        value: value,//发送的金额，这里是16进制，实际表示发送256个wei
        data: ''
    }

    //使用私钥对原始的交易信息进行签名，得到签名后的交易数据
    var tx = new Tx(rawTx);
    tx.sign(privateKey);

    var hash2=util.bufferToHex(tx.hash(true))
    var serializedTx = tx.serialize();
    var hash = '0x' + serializedTx.toString('hex');
    try {
        return {'success': true, 'hash': hash,'hash2':hash2};
    } catch(err){
        return {'success': false, 'msg': err};
    }
}

function sendRawTranstion(hash,callbackFun, address){
    web3.eth.sendRawTransaction(hash, function(err, hash) {
        if (!err){
            callbackFun(err,hash, address);
        }else{
            callbackFun(err,null);
            return;
        }
    });
}

function getBalance(address,callbackFun){
    web3.eth.getBalance(address,function(err, res){
        if(err){
            callbackFun(err,null);
            return;
        }else {
            callbackFun(null,res);
        }
    });
}

function getTransactions (address, cb){
    //mutex.lock(['ethgetTransactions'], function(unlock){
    db.query("select tableIndex from transactions_index WHERE address=?", [address], function(rows){
        var page = 1;
        var offset = 50;
        if (rows.length > 0){
            page = rows[0].tableIndex;
            //         unlock();
        } else {
            try {
                db.query('insert or ignore into transactions_index (address, tableIndex, offsets) VALUES (?,?,?)', [address, 1, 50],function () {
                    //                 unlock();
                });
            } catch (e) {
                console.log(e);
                //              unlock();
            }
        }
        let url = 'https://api.etherscan.io/api?module=account&action=txlist&address=' + address + '&startblock=0&endblock=99999999&page=' + page + '&offset=' + offset + '&sort=asc&apikey=Z2D253ZB8QIUF4QIEM3VR2KAAFH131J32H';
        webHelper.httpGet(url,null, function(err, result){
            cb(err, result, address, page);
        });
    });
    //});
}

// function updatePendingTransactions(hash) {
//     var receipt = web3.eth.getTransaction(hash.id);
//     if (receipt && receipt.blockHash && receipt.blockNumber && receipt.transactionIndex && receipt.to) {
//         db.query("update transactions set result = 'good' where id = ?", [hash.id], function () {});
//     } else {
//         db.query("update transactions set result = 'final-bad' where id = ?", [hash.id], function () {});
//     }
// }


module.exports = {
    web3api: web3api,
    getPubliyKey: getPubliyKey,
    getAddress: getAddress,
    getAddressBynode: getAddressBynode,
    sendtranstion: sendtranstion,
    getBalance: getBalance,
    getPrivateKey: getPrivateKey,
    sendRawTranstion:sendRawTranstion,
    getUnUseBanlance:getUnUseBanlance,
    getTransactions:    getTransactions
    //updatePendingTransactions : updatePendingTransactions
}