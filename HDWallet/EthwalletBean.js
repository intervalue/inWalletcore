"use strict"

const ethHelper = require('./eth_helper');

const { platType_static, importType_static } = require('./static_enum');
const sjcl = require('sjcl');

const opts = {
    iter: 10000
};

class EthWallet{
    constructor(mnemonic, type, name, passphrase, info , importType){
        this.type = type;
        this.name = name;
        this.info = info;
        this.importType = importType == undefined? importType_static.mnemonic: importType; /** 0: mnemonic 1: privateKey 3:storgefile*/
        let privateKey = mnemonic;
        if(importType=="0"){
            console.log("ImportByMnemonic:");
        }else if(importType=="1"){
            console.log("ImportByPirvateKey:");
        }else {
            console.log("ImportByStorgefile:");
        }
        // this.mnemonic=mnemonic;
        if (this.importType == importType_static.mnemonic){
            this.encryptMnemonic = sjcl.encrypt(passphrase, mnemonic, opts);
        } else {
            this.encryptPrivateKey = sjcl.encrypt(passphrase, privateKey, opts);
            this.publicKey = [];
            this.publicKey.push(ethHelper.getPubliyKey(privateKey,0,true));
        }
        try {
            this.getAddress(0, passphrase);
        } catch (err){
            console.log(err);
        }

        return this;
    }
    getBalance(address,callbackFun){
        ethHelper.getBalance(address,callbackFun);
    }

    getAddress (addressType, passphrase){
        if (this.importType == importType_static.privateKey){
            return ethHelper.getAddressBynode(Buffer.from(this.publicKey[0], 'hex'));
        }
        if (this.addressList == undefined){
            this.addressList = [];
        }
        if (isNaN(addressType)){
            addressType = 0;
        }

        if (this.addressList[addressType? addressType: 0]){
            return this.addressList[addressType? addressType: 0];
        }

        let address;
        if (this.type == platType_static.ETH) {
            address = ethHelper.getAddressBynode(Buffer.from(this.getPublicKey(addressType, passphrase), 'hex'));
        }
        if (address){
            this.addressList[addressType? addressType:0] = address;
            return address;
        }
        else {
            throw new Error('invalid plat or importType');
            return;
        }
    }

    // getPrivateKey (addressType, passphrase){
    //     let privateKey;
    //     let mnemonic;
    //
    //     if (this.privateKeyList == undefined){
    //         this.privateKeyList = [];
    //     }
    //     if (isNaN(addressType)){
    //         addressType = 0;
    //     }
    //     if (this.privateKeyList[addressType? addressType: 0]){
    //         return this.privateKeyList[addressType? addressType: 0];
    //     }
    //
    //     if(this.importType==importType_static.privateKey){
    //         try{
    //             privateKey = sjcl.decrypt(passphrase, this.encryptPrivateKey);
    //         } catch (err) {
    //             throw new Error('passphrase error:' + err);
    //             return;
    //         }
    //     }else {
    //         try{
    //             mnemonic = sjcl.decrypt(passphrase, this.encryptMnemonic);
    //         } catch (err) {
    //             throw new Error('passphrase error:' + err);
    //             return;
    //         }
    //         if (this.type == platType_static.ETH) {
    //             privateKey = ethHelper.getPrivateKey(mnemonic,addressType);
    //         }
    //     }
    //     if (privateKey){
    //         this.privateKeyList[addressType? addressType:0] = privateKey;
    //         return privateKey;
    //     }
    //     else {
    //         throw new Error('invalid plat or importType');
    //         return;
    //     }
    // }

    getPublicKey (addressType, passphrase,privatekey){
        if (isNaN(addressType)){
            addressType = 0;
        }
        if (this.publicKey == undefined || this.publicKey[addressType? addressType:0] == undefined){
            this.getTwentyPubKey(passphrase);
        }
        return this.publicKey[addressType? addressType:0] == undefined? this.publicKey[0]: this.publicKey[addressType];
    }

    getTwentyPubKey(passphrase){
        if (this.publicKey == undefined){
            this.publicKey = [];
        }
        let length = this.publicKey.length;
        let mnemonic;
        try{
            mnemonic = sjcl.decrypt(passphrase, this.encryptMnemonic);
        } catch (err) {
            throw new Error('passphrase error:' + err);
            return;
        }


        //for (let i=length; i<length+20; i++){
            this.publicKey.push(ethHelper.getPubliyKey(mnemonic, 0));
        //}
        return;
    }

    sendtranstion(passphrase,address,toaddress,sendmoney,justGetTxHash,callbackFun){
        let privateKey;
        if(this.importType==importType_static.mnemonic){
            let mnemonic;
            try{
                mnemonic = sjcl.decrypt(passphrase, this.encryptMnemonic);
            } catch (err) {
                throw new Error('passphrase error:' + err);
                return;
            }
            privateKey = ethHelper.getPrivateKey(mnemonic,passphrase);
        }else{
            try{
                privateKey = sjcl.decrypt(passphrase, this.encryptPrivateKey);
            } catch (err) {
                throw new Error('passphrase error:' + err);
                return;
            }
        }
        ethHelper.getUnUseBanlance(address,toaddress,sendmoney,function (err,res) {
            if(err){
                callbackFun(err,null);
                return;
            }else {
                if(res.d<=0){
                    err="not enough spendable";
                    callbackFun(err,null);
                    return;
                }else {
                    let gasPrice=res.gasPrice;
                    console.log("gas"+gasPrice);
                    let hashobject= ethHelper.sendtranstion(address,privateKey,toaddress,sendmoney,gasPrice);
                    if(!hashobject.success){
                        console.log(hashobject.msg);
                    }
                    console.log(justGetTxHash);
                    if(justGetTxHash){
                        callbackFun(null,hashobject.hash2);
                        return;
                    }
                    ethHelper.sendRawTranstion(hashobject.hash,callbackFun);
                }

            }
        });

    }


}
module.exports = EthWallet;