"use strict"

const Wallet = require('./wallet_bean');
const { platType_static, importType_static } = require('./static_enum');
const sjcl = require('sjcl');

/**
 * add btc wallet by pmj 18/11/05
 */

var walletList = [];

function importWallet (mnemonic, type, name, passphrase, info, segwit, importType){
    let wallet = new Wallet(mnemonic, type, name, passphrase, info, segwit, importType);
    addWalletToList(wallet);
}

function addWalletToList (wallet){
    if (wallet.constructor === Wallet.prototype.constructor)
        walletList.push(wallet);
    else
        throw new Error('invalid wallet');
}

function getWalletList (){
    return walletList;
}

/**
 * need reset walletList index
 * @param index
 * @returns {Array}
 */
function removeWalletList (index){
    walletList.remove(index);
    return getWalletList();
}

/**
 * 修改指定钱包的属性
 * @param index
 * @param typeString
 * @param changeInfo
 */
function changeWalletInfo (index, typeString, changeInfo){
    walletList[index][typeString] = changeInfo;
}

function initWalletFromFile (walletList, passphrase){
    let walletListJson = [];
    try{
        walletListJson = JSON.parse(walletList);
    } catch (err){
        throw new Error('error walletList file');
        return;
    }
    let length = walletListJson.length;
    for (let i=0; i<length; i++){
        let walletJson = walletListJson[i];
        let mnemonic = '';
        try{
            if (walletJson.importType == importType_static.mnemonic){
                mnemonic = sjcl.decrypt(passphrase, walletJson.encryptMnemonic);
            } else {
                mnemonic = sjcl.decrypt(passphrase, walletJson.encryptPrivateKey);
            }
        } catch (err){
            throw new Error('decrypt error' + err);
            return;
        }
        importWallet(mnemonic, walletJson.type, walletJson.walletName, passphrase, walletJson.info, walletJson.segwit, walletJson.importType);
    }
}

function exportWalletListJson (){
    let walletListJson = [];
    let length = walletList.length;
    for (let i=0; i<length; i++){
        walletListJson.push(walletList[i].toJson());
    }
    return walletListJson;
}


module.exports = {
    importWallet        : importWallet,
    getWalletList       : getWalletList,
    removeWalletList    : removeWalletList,
    changeWalletInfo    : changeWalletInfo,
    initWalletFromFile  : initWalletFromFile,
    exportWalletListJson: exportWalletListJson
}