"use strict"

const bitcoin = require('bitcoinjs-lib');
const bip39 = require('bip39');
const bip32 = bitcoin.bip32;
const ecpair = bitcoin.ECPair;
const network = bitcoin.networks.testnet
const network2 = bitcoin.networks.bitcoin
const BigNumber = require('decimal.js');
const crypto = bitcoin.crypto;
/**
 * #TODO import from privateKEY
 *      OVER BY pmj 11/05
 *      privateKey import just need use getAddressBynode
 *
 *  change by pmj 1107 only need segwit and publicKey
 */

function getAddressBynode (segwit, publicKey, networkType){
    if (Object.prototype.toString.call(publicKey) === "[object String]")
        publicKey = Buffer.from(publicKey, 'hex');
    if (segwit) {
        const { address } = bitcoin.payments.p2sh({
            redeem: bitcoin.payments.p2wpkh({ pubkey: publicKey, network: chooseNetWork(networkType) }),
            network: chooseNetWork(networkType)
        })
        return address;
    }
    else{
        return bitcoin.payments.p2pkh({ pubkey: publicKey, network: chooseNetWork(networkType) }).address;
    }
}

function _getRoot (mnemonic, password, networkType) {
    const seed = bip39.mnemonicToSeed(mnemonic, password);
    const root = bip32.fromSeed(seed, chooseNetWork(networkType));
    return root;
}

/**
 * generate a bitcoin address
 * ## not use
 * @param           mnemonic
 * @param @@canNULL password user owner password
 * @param @@canNULL segwit boolean  use segwit address
 * @param @@canNULL addressType more address use not mean 0
 */
var getAddress = function(mnemonic, password, segwit, addressType, networkType){
    if (isNaN(addressType)){
        addressType = 0;
    }
    const root = _getRoot (mnemonic, password, networkType);
    let path = "m/44'/0'/0'/0/";

    if (segwit){
        path = "m/49'/0'/0'/0/";
    }
    path += addressType;
    const child = root.derivePath(path);
    return getAddressBynode (segwit, child, networkType);
}

/**
 * get BIP32 Extended Private Key
 * ## not use
 */
var getPubKeyBymnemonic = function(mnemonic, password){
    return _getRoot (mnemonic, password).derivePath("m/44'/0'/0'/0").neutered().toBase58();
}

/**
 * get BIP32 Extended public Key
 * ## not use
 */
var getpriKeyBymnemonic = function(mnemonic, password){
    const root = _getRoot (mnemonic, password).derivePath("m/44'/0'/0'/0");
    return root.toBase58 ();
}

/**
 * get BIP32 derived public key
 */
var getdriPubKey = function(mnemonic, password, segwit, addressType, privateKey, networkType){
    let keyPair;
    if (privateKey){
        keyPair = ecpair.fromWIF(mnemonic, chooseNetWork(networkType)); //生成对应地址的公私钥

    } else {
        if (isNaN(addressType)){
            addressType = 0;
        }
        const root = _getRoot (mnemonic, password, networkType);
        let path = "m/44'/0'/0'/0/";

        if (segwit){
            path = "m/49'/0'/0'/0/";
        }
        path += addressType;

        let child0 = root.derivePath(path);
        mnemonic = child0.toWIF();
        keyPair = ecpair.fromWIF(mnemonic, chooseNetWork(networkType)); //生成对应地址的公私钥
    }
    return keyPair.publicKey.toString('hex');
}

/**
 * get derived private key
 * password 预留 因为流行的是空字符串 建议传空字符串
 */
var getdriPriKey = function(mnemonic, password, segwit, addressType, networkType){
    if (isNaN(addressType)){
        addressType = 0;
    }
    const root = _getRoot (mnemonic, password, networkType);
    let path = "m/44'/0'/0'/0/";

    if (segwit){
        path = "m/49'/0'/0'/0/";
    }
    path += addressType;
    const child0 = root.derivePath(path);
    let keyPair = ecpair.fromWIF(child0.toWIF(), chooseNetWork(networkType)); //生成对应地址的公私钥
    return keyPair.toWIF();
}

/**
 * 获取手续费
 * means 先以最大的费用算出来input 然后再output
 *
 */
var getFee = function (sendAddress, address, sendNum, unSpent, segwit, networkType, privateKey, percent){
    const txb = new bitcoin.TransactionBuilder(chooseNetWork(networkType));
    unSpent = JSON.parse(unSpent);
    let length = unSpent.length;
    let sum = new BigNumber(0);
    let signList = [];
    let canSendTrans = false;

    let minCost = new BigNumber(sendNum); // 最少要能发这么多钱
    //let fee = new BigNumber(0);

    let nowIndex = 0;

    for (let i=0; i<length; i++) {
        try {
            txb.addInput(unSpent[i].txid, unSpent[i].vout);
        } catch (err) {
            return {'success': false, 'msg': err};
        }
        sum = sum.plus(new BigNumber(unSpent[i].amount));
        let signStr = {'value': parseInt(new BigNumber(unSpent[i].amount).times(100000000).toString()), 'index': i};
        signList.push(signStr);
        if (sum.greaterThan(minCost)) {
            canSendTrans = true;
            nowIndex = i;
            break;
        }
    }
    if (!canSendTrans){
        return {'success': false, 'msg': 'amount not enough'};
    }

    try{
        txb.addOutput(sendAddress, parseInt(new BigNumber(sendNum).times(100000000).toString()));
    } catch(err){
        console.log(err);
        return {'success': false, 'msg': err};
    }

    /**
     * 不管怎么样都填入一个output凑size  使用大概的公式算出大概的费用 减掉就是找零
     */
    let aboutfee = new BigNumber((signList.length * 148 + 2 * 34 + 10) * percent).dividedBy(100000000);
    let sumCost = aboutfee.plus(minCost);
    if (!sum.greaterThanOrEqualTo(sumCost)){
        canSendTrans = false;
        for (let i=nowIndex + 1; i<length; i++){
            try {
                txb.addInput(unSpent[i].txid, unSpent[i].vout);
            } catch (err) {
                console.log(err)
                return {'success': false, 'msg': err};
            }
            sum = sum.plus(new BigNumber(unSpent[i].amount));
            let signStr = {'value': parseInt(new BigNumber(unSpent[i].amount).times(100000000).toString()), 'index': i};
            signList.push(signStr);
            if (sum.greaterThanOrEqualTo(sumCost)) {
                canSendTrans = true;
                nowIndex = i;
                break;
            }
        }
    }

    /**
     * 备份txb重用 如果钱够就只要一个找零地址就可以了 不够再加上input 加上output
     * @type {bitcoin.TransactionBuilder}
     */
    let txbBackUp = txb;

    if (!canSendTrans){
        return {'success': false, 'msg': 'amount not enough'};
    }

    if (sum.greaterThan(sumCost)){
        try{
            txb.addOutput(address, parseInt(sum.minus(sumCost).times(100000000).toString()))
        } catch (err){
            console.log(err);
            return {'success': false, 'msg': err};
        }
    }

    // 交易签名
    for (let signStr of signList) {
        const keyPair = bitcoin.ECPair.fromWIF(privateKey, chooseNetWork(networkType))
        if (segwit){
            try{
                const p2wpkh = bitcoin.payments.p2wpkh({ pubkey: keyPair.publicKey, network: chooseNetWork(networkType) })
                const p2sh = bitcoin.payments.p2sh({ redeem: p2wpkh, network: chooseNetWork(networkType) });
                txb.sign(signStr.index, keyPair, p2sh.redeem.output, null, signStr.value);
            } catch(err){
                console.log(err);
                return {'success': false, 'msg': err};
            }
        } else {
            try{
                txb.sign(signStr.index, keyPair);
            } catch(err){
                console.log(err);
                return {'success': false, 'msg': err};
            }

        }
    }
    try {
        let fee = new BigNumber(txb.build().toHex().length/2 * percent).dividedBy(100000000);
        if (sum.greaterThanOrEqualTo(fee.plus(minCost))){
            return {'success': true, 'fee': fee, 'hash': txbBackUp, 'sum': sum, 'signList': signList};
        } else {
            fee = new BigNumber((txb.build().toHex().length/2 + 148) * percent).dividedBy(100000000);
            return {'success': true, 'fee': fee, 'hash': txbBackUp, 'nowIndex': nowIndex, 'sum': sum, 'signList': signList};
        }
    } catch(err){
        console.log(err);
        return {'success': false, 'msg': err};
    }
}

var signTransaction = function (privateKey, segwit, address, sendAddress, sendNum, unSpent, fee, networkType, percent = 20){
    let result = getFee(sendAddress, address, sendNum, unSpent, segwit, networkType, privateKey, percent);
    // if (result.success){
    //     /**
    //      * 不需要加入input 只需要加入找零output即可
    //      */
    //     let sum = result.sum;
    //     let signList = result.signList;
    //     let txb = result.hash;
    //     let cost = new BigNumber(sendNum).plus(result.fee);
    //     if (result.nowIndex != undefined){
    //         let length = unSpent.length;
    //         let canSendTrans = false;
    //         for (let i=result.nowIndex; i<length; i++){
    //             try {
    //                 txb.addInput(unSpent[i].txid, unSpent[i].vout);
    //             } catch (err) {
    //                 console.log(err)
    //                 return {'success': false, 'msg': err};
    //             }
    //             sum = sum.plus(new BigNumber(unSpent[i].amount));
    //             let signStr = {'value': parseInt(new BigNumber(unSpent[i].amount).times(100000000).toString()), 'index': i};
    //             signList.push(signStr);
    //             if (sum.greaterThan(cost)) {
    //                 canSendTrans = true;
    //                 break;
    //             }
    //         }
    //
    //         if (!canSendTrans){
    //             console.log('qian bugou ');
    //             return {'success': false, 'msg': 'amount not enough'};
    //         }
    //     }
    //
    //
    //     /**
    //      * 有多的返回这个账号找零地址
    //      */
    //     if (sum.greaterThan(cost)) {
    //         try{
    //             txb.addOutput(address, parseInt(sum.minus(cost).times(100000000).toString()))
    //         } catch (err){
    //             console.log(err);
    //             return {'success': false, 'msg': err};
    //         }
    //     }
    //     // 交易签名
    //     for (let signStr of signList) {
    //         const keyPair = bitcoin.ECPair.fromWIF(privateKey, chooseNetWork(networkType))
    //         if (segwit) {
    //             try {
    //                 //const redeemScript = bitcoin.script.witnessPubKeyHash.output.encode(pubKeyHash)
    //                 const p2wpkh = bitcoin.payments.p2wpkh({
    //                     pubkey: keyPair.publicKey,
    //                     network: chooseNetWork(networkType)
    //                 })
    //                 const p2sh = bitcoin.payments.p2sh({redeem: p2wpkh, network: chooseNetWork(networkType)});
    //                 txb.sign(signStr.index, keyPair, p2sh.redeem.output, null, signStr.value);
    //             } catch (err) {
    //                 console.log(err);
    //                 return {'success': false, 'msg': err};
    //             }
    //         } else {
    //             try {
    //                 txb.sign(signStr.index, keyPair);
    //             } catch (err) {
    //                 console.log(err)
    //                 return {'success': false, 'msg': err};
    //             }
    //
    //         }
    //     }
    // } else {
    //     return result;
    // }

    if (result.success){
        const txb = new bitcoin.TransactionBuilder(chooseNetWork(networkType));
        unSpent = JSON.parse(unSpent);
        let length = unSpent.length;
        let sum = new BigNumber(0);
        let signList = [];
        let canSendTrans = false;
        fee = result.fee;
        let cost = new BigNumber(sendNum).plus(new BigNumber(fee));
        for (let i=0; i<length; i++) {
            try {
                txb.addInput(unSpent[i].txid, unSpent[i].vout);
            } catch (err) {
                console.log(err)
                return {'success': false, 'msg': err};
            }
            sum = sum.plus(new BigNumber(unSpent[i].amount))
            let signStr = {'value': parseInt(new BigNumber(unSpent[i].amount).times(100000000).toString()), 'index': i};
            signList.push(signStr)
            if (sum.greaterThanOrEqualTo(cost)) {
                canSendTrans = true;
                break;
            }
        }
        if (!canSendTrans){
            return {'success': false, 'msg': 'amount not enough'};
        }
        // 添加交易中的 Outputs，矿工费用 = 15000 - 12000 = 3000 satoshi
        // addOutput 方法的参数分别为收款地址和转账金额
        try{
            txb.addOutput(sendAddress, parseInt(new BigNumber(sendNum).times(100000000).toString()));
        } catch(err){
            console.log(err);
            return {'success': false, 'msg': err};
        }
        /**
         * 有多的返回这个账号找零地址
         */
        if (sum.greaterThan(cost)) {
            try{
                txb.addOutput(address, parseInt(sum.minus(cost).times(100000000).toString()))
            } catch (err){
                console.log(err)
                return {'success': false, 'msg': err};
            }
        }
        // 交易签名
        for (let signStr of signList) {
            const keyPair = bitcoin.ECPair.fromWIF(privateKey, chooseNetWork(networkType))
            if (segwit){
                // console.log(1);
                // const pubKey = this.getdriPubKey(privateKey, null, null, null, true);
                // const pubKeyHash = crypto.hash160(pubKey);
                // 得到隔离见证地址的回执脚本
                try{
                    //const redeemScript = bitcoin.script.witnessPubKeyHash.output.encode(pubKeyHash)
                    const p2wpkh = bitcoin.payments.p2wpkh({ pubkey: keyPair.publicKey, network: chooseNetWork(networkType) })
                    const p2sh = bitcoin.payments.p2sh({ redeem: p2wpkh, network: chooseNetWork(networkType) });
                    txb.sign(signStr.index, keyPair, p2sh.redeem.output, null, signStr.value);
                } catch(err){
                    console.log(err);
                    return {'success': false, 'msg': err};
                }
            } else {
                try{
                    txb.sign(signStr.index, keyPair);
                } catch(err){
                    console.log(err)
                    return {'success': false, 'msg': err};
                }

            }
        }
        // 打印签名后的交易 hash
        try {
            // console.log(txb.build().getId());
            // console.log(txb.build().toHex());
            return {'success': true, 'hash': txb.build().toHex(), 'txid': txb.build().getId()};
        } catch(err){
            console.log(err);
            return {'success': false, 'msg': err};
        }
    } else {
        return result;
    }
}

function chooseNetWork (networkType){
    if (networkType == 'testnet')
        return network;
    return network2;
}

module.exports = {
    getAddress      :   getAddress,
    getdriPubKey    :   getdriPubKey,
    getdriPriKey    :   getdriPriKey,
    getAddressBynode:   getAddressBynode,
    signTransaction :   signTransaction,
    chooseNetWork   :   chooseNetWork
}