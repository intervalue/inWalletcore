"use strict";

var Web3 = require('web3');
// var util = require('ethereumjs-util')

var _require = require('./static_enum'),
    platType_static = _require.platType_static,
    importType_static = _require.importType_static;
// const sjcl = require('sjcl');


var ethHelper = require('./eth_helper');
var request = require('request');

// const opts = {
//     iter: 10000
// };

if (typeof web3 !== 'undefined') {
    var web3 = new Web3(web3.currentProvider);
} else {
    // set the provider you want from Web3.providers
    // var web3 = new Web3(new Web3.providers.HttpProvider("http://52.221.119.220:8080"));
    var web3 = new Web3(new Web3.providers.HttpProvider("http://52.221.119.220:8181"));
}
var Tx = require('ethereumjs-tx');

//如果是主网  将-rinkeby删除
//如果是ropsten  将-rinkeby改成-ropsten

function getHistory(address, callbackFun) {
    var url = "https://api.etherscan.io/api?module=account" + "&action=txlist" + "&address=" + address + "&startblock=0" + "&endblock=99999999" + "&page=1&offset=10" + "&sort=asc" + "&apikey=QP5HJPUX3J5X3IG37D5C1IKQZPXFC8DSSP";

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
            callbackFun(null, JSON.parse(body));
            return;
        }
    });
}

function getTime(s) {
    var newDate = new Date();
    newDate.setTime(s * 1000);
    return newDate.toString();
}

function sendtranstion(mnemonic, toaddress, sendmoney) {
    var addressType = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : 0;
    var importType = arguments.length > 4 && arguments[4] !== undefined ? arguments[4] : 0;
    var justGetTxHash = arguments[5];
    var callbackFun = arguments[6];

    var privateKey = void 0;
    var address = void 0;
    if (importType == importType_static.mnemonic) {
        privateKey = ethHelper.getPrivateKey(mnemonic, addressType);
        address = ethHelper.getAddressBynode(Buffer.from(ethHelper.getPubliyKey(mnemonic, addressType, false), 'hex'));
    } else {
        privateKey = mnemonic
        //address = ethHelper.getAddressBynode(Buffer.from(ethHelper.getPubliyKey(privateKey, addressType, true), 'hex'));
        /**
         * 修复eth删除助记词后，转账报错问题  2019-04-25  by lhp
         */
        address = ethHelper.getAddressBynode(ethHelper.getPubliyKey(privateKey, addressType, true));

        privateKey = ethHelper.getPrivateKey(mnemonic, addressType, true);
    }
    console.log('privateKey: ' + privateKey);
    console.log('address:    ' + address);
    ethHelper.getUnUseBanlance(address, toaddress, sendmoney, function (err, res) {
        if (err) {
            callbackFun(err, null);
            return;
        } else {
            if (res.d <= 0) {
                err = "not enough spendable";
                callbackFun(err, null);
                return;
            } else {
                var gasPrice = res.gasPrice;
                var gas = res.gas;
                var hashobject = ethHelper.sendtranstion(address, privateKey, toaddress, sendmoney, gasPrice, gas);
                if (!hashobject.success) {
                    console.log(hashobject.msg);
                }
                if (justGetTxHash) {
                    callbackFun(null, hashobject.hash2, hashobject.hash);
                    return;
                }
                ethHelper.sendRawTranstion(hashobject.hash, callbackFun, address);
            }
        }
    });
}

module.exports = {
    sendtranstion: sendtranstion,
    getHistory: getHistory
};