"use strict"
const Wallet = require('../model/wallet.js');
const bitcoin = require('bitcoinjs-lib');
var bitcore = require('bitcore-lib');
const bip39 = require('bip39');
const bip32 = bitcoin.bip32;
const ecpair = bitcoin.ECPair;
const network = bitcoin.networks.testnet
const network2 = bitcoin.networks.bitcoin


var walletList = [];

function getAddressBynode (segwit, child){
    if (segwit) {
        const { address } = bitcoin.payments.p2sh({
            redeem: bitcoin.payments.p2wpkh({ pubkey: child.publicKey, network: network }),
            network: network
        })
        return address;
    }
    else{
        return bitcoin.payments.p2pkh({ pubkey: child.publicKey, network: network }).address
    }
}

function getRoot (mnemonic, password){
    const seed = bip39.mnemonicToSeed(mnemonic, password)
    //let key = bitcore.HDPrivateKey.fromSeed(seed, network).xprivkey
    //console.log(key + '---============fasjdflaskjfsd')
    const root = bip32.fromSeed(seed, network)
    //const child = root.derivePath("m/44'/0'/0'/0/2")
    //console.log(bitcore.HDPrivateKey.fromSeed(seed, network))
    //let hdkey = bip32.fromBase58(key)
    //console.log(hdkey)
    //console.log(bitcoin.crypto.sha256(Buffer.from(key)))
    //console.log(key)
    //let keyPair = ecpair.fromWIF(child.toWIF()); //生成对应地址的公私钥
    //console.log(keyPair)
    // console.log(keyPair.publicKey.toString('hex'))
    // console.log(keyPair.toWIF())

    return root
}

var getWallet = function(id){
    return walletList[i];
}

var getAllWallet = function(){
    return walletList;
}



var addWallet = function(wallet){
    if ( wallet.constructor === Wallet.prototype.constructor)
    {
        walletList.push(wallet);
        return;
    }
    throw Error("invalid wallet");
}

/**
 * generate a bitcoin address
 * @param           mnemonic
 * @param @@canNULL password user owner password
 * @param @@canNULL segwit boolean  use segwit address
 * @param @@canNULL addressType more address use not mean 0
 */
var getAddress = function(mnemonic, password, segwit, addressType){
    if (isNaN(addressType)){
        addressType = 0
    }
    const root = getRoot (mnemonic, password);
    let path = "m/44'/0'/0'/0/"

    if (segwit){
        path = "m/49'/0'/0'/0/"
    }
    path += addressType
    const child = root.derivePath(path)
    return getAddressBynode (segwit, child);
}

/**
 * 找零地址
 * ##not use
 * @param mnemonic
 * @param password
 * @param segwit
 * @param addressType
 */
var getReceiveAddress = function(mnemonic, password, segwit, addressType){
    if (isNaN(addressType)){
        addressType = 0
    }
    const root = getRoot (mnemonic, password);
    let path = "m/44'/0'/0'/1/"

    if (segwit){
        path = "m/49'/0'/0'/1/"
    }
    path += addressType
    const child = root.derivePath(path)
    return getAddressBynode (segwit, child);
}

/**
 * get BIP32 Extended Private Key
 * ## not use
 */
var getPubKeyBymnemonic = function(mnemonic, password){
    return getRoot (mnemonic, password).derivePath("m/44'/0'/0'/0").neutered().toBase58()
}

/**
 * get BIP32 Extended public Key
 * ## not use
 */
var getpriKeyBymnemonic = function(mnemonic, password){
    const root = getRoot (mnemonic, password).derivePath("m/44'/0'/0'/0")
    return root.toBase58 ()
}

/**
 * get BIP32 derived public key
 */
var getdriPubKey = function(mnemonic, password, segwit, addressType){
    if (isNaN(addressType)){
        addressType = 0
    }
    const root = getRoot (mnemonic, password);
    let path = "m/44'/0'/0'/0/"

    if (segwit){
        path = "m/49'/0'/0'/0/"
    }
    path += addressType
    const child0 = root.derivePath(path)
    let keyPair = ecpair.fromWIF(child0.toWIF(), network); //生成对应地址的公私钥
    return keyPair.publicKey.toString('hex')
}

/**
 * get derived private key
 */
var getdriPriKey = function(mnemonic, password, segwit, addressType){
    if (isNaN(addressType)){
        addressType = 0
    }
    const root = getRoot (mnemonic, password);
    let path = "m/44'/0'/0'/0/"

    if (segwit){
        path = "m/49'/0'/0'/0/"
    }
    path += addressType
    //console.log(root.toWIF())
    const child0 = root.derivePath(path)
    let keyPair = ecpair.fromWIF(child0.toWIF(), network); //生成对应地址的公私钥

    return keyPair.toWIF()


}


module.exports = {
    'getWallet' : getWallet,
    'getAddress': getAddress,
    'getPubKeyBymnemonic': getPubKeyBymnemonic,
    'getpriKeyBymnemonic': getpriKeyBymnemonic,
    'getdriPubKey': getdriPubKey,
    'getdriPriKey': getdriPriKey,
    'getReceiveAddress': getReceiveAddress
};