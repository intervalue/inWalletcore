"use strict"

const btcHelper = require('./btc_helper');
const { platType_static, importType_static } = require('./static_enum');
// const btcrpcHelper = require('./btcrpc_helper');
const sjcl = require('sjcl');
// const bitcoin = require('bitcoinjs-lib');
const trueRpcHelper = require('./btc_rpcHelper');

const opts = {
    iter: 10000
};

class Wallet{
    /**
     *
     * @param mnemonic 助记词
     * @param type     钱包的种类
     * @param name      钱包的名称
     * @param passphrase 钱包的口令
     * @param info        口令提示
     * @param segwit       是否是隔离见证
     * @param importType    导入的类型 助记词还是私钥
     * @returns {Wallet}
     * @V1.2 add JSONexport 移除私钥跟助记词保存
     * @ V 1.3 修改rpc调用方式 不再依赖私钥
     * @ V 1.4 增加network 不再由系统统一设置
     */
    constructor(mnemonic, type, name, passphrase, info = '', segwit = true, importType = 0, network = 'testnet', fromFile, data){
        if (fromFile){
            this.walletName           = data.walletName;
            this.info                 = data.info;
            this.type                 = data.type;
            this.segwit               = data.segwit;
            this.publicKey            = data.publicKey;
            this.importType           = data.importType;
            this.HDWallet             = data.HDWallet;
            this.addressList          = data.addressList;
            this.encryptMnemonic      = data.encryptMnemonic;
            this.encryptPrivateKey    = data.encryptPrivateKey;
            this.network              = data.network;
            return this;

        }
        this.type = type;
        this.name = name;
        this.info = info;
        this.network = network;
        this.segwit = segwit;
        this.importType = importType == undefined? importType_static.mnemonic: importType; /** 0: mnemonic 1: privateKey */
        this.HDWallet = false;

        if (platType_static[type] == undefined){
            console.log('unknow plat', null);
            return null;
        }

        let privateKey = mnemonic;
        if (this.importType == importType_static.mnemonic){
            this.encryptMnemonic = sjcl.encrypt(passphrase, mnemonic, opts);
        } else {
            this.encryptPrivateKey = sjcl.encrypt(passphrase, privateKey, opts);
            this.publicKey = [];
            this.publicKey.push(btcHelper.getdriPubKey(mnemonic, null, segwit, 0, true, this.network));
        }
        this.getAddress(0, passphrase);
        // trueRpcHelper.importAddress(this.getAddress(0, passphrase), name, function(){
        //     console.log('import over');
        // });
        //btcrpcHelper.importPriKey(privateKewalletNamey, this.addressList[0], name, successFun, failedFun, this);
        //this.getBalance(this.addressList[0], callbackFun);
        return this;
    }

    /**
     * 根据导入时候的类型不同选择不同的生成方式
     */
    getAddress (addressType, passphrase){
        if (this.importType == importType_static.privateKey){
            return btcHelper.getAddressBynode(this.segwit, Buffer.from(this.publicKey[0], 'hex'), this.network);
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
        if (this.type == platType_static.BTC) {
            address = btcHelper.getAddressBynode(this.segwit, Buffer.from(this.getPublicKey(addressType, passphrase), 'hex'), this.network);
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

    /**
     * 提供外部获取公钥的接口
     * @param addressType
     * @param passphrase
     * @returns publicKey {String}
     */
    getPublicKey (addressType, passphrase){
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
        } catch (err){
            throw new Error('passphrase error:' + err);
            return;
        }


        //for (let i=length; i<length+20; i++){
            this.publicKey.push(btcHelper.getdriPubKey(mnemonic, '', this.segwit, 0, false, this.network));
        //}
        return;
    }

    /**
     * TODO 只是可用余额 后面看要不要显示未确认余额
     * @param address
     * @param callbackFun
     */
    getBalance (address, callbackFun){
        trueRpcHelper.getBalance(address, this.walletName, callbackFun);
    }

    getHistory (address, callbackFun){
        trueRpcHelper.getTransactions(address, callbackFun);
    }

    decrypt (passphrase){
        if (this.encryptMnemonic)
            return sjcl.decrypt(passphrase, this.encryptMnemonic);
        else
            return sjcl.decrypt(passphrase, this.encryptPrivateKey);
    }

    sendTransaction (passphrase, address, sendAddress, sendNum, fee, callbackFun, highFee, addressType = 0, justGetHash){
        let privateKey;
        let self = this;
        if (this.importType == importType_static.mnemonic)
            privateKey = btcHelper.getdriPriKey(this.decrypt(passphrase), '', this.segwit, addressType, this.network);
        else
            privateKey = this.decrypt(passphrase);
        console.log('privateKey' + privateKey);
        var wallet = this;
        trueRpcHelper.getUnSpent(address, wallet.walletName, function(err, res){
            if (err){
                callbackFun(err, null);
                return;
            }
            let hashObject = btcHelper.signTransaction(privateKey, wallet.segwit, address, sendAddress, sendNum, res, fee, self.network);
            if (!hashObject.success){
                callbackFun(hashObject.msg);
                return;
            }
            if (justGetHash){
                callbackFun(err, hashObject);
                return;
            }
            trueRpcHelper.sendrawtransaction(hashObject.hash, highFee, callbackFun);
        });
    }

    /**
     * getJSON to export to file
     */
    toJson(){
        return JSON.parse(JSON.stringify({
            walletName          : this.walletName,
            info                : this.info,
            type                : this.type,
            segwit              : this.segwit,
            publicKey           : this.publicKey,
            importType          : this.importType,
            HDWallet            : this.HDWallet,
            addressList         : this.addressList,
            encryptMnemonic     : this.encryptMnemonic,
            encryptPrivateKey   : this.encryptPrivateKey
        }));
    }
}

module.exports = Wallet;