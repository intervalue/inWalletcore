"use strict";
/**
 * 工具类
 * 助记词生成
 * 公私钥生成
 */

var BMnemonic = require("bitcore-mnemonic");

let hdPrikey;

/**
 * 初始化/恢复 助记词、公私钥
 * @param words 助记词
 * @param passphrase 口令
 * @returns {Mnemonic}
 */
function generateMnemonic(words , passphrase) {

    var mnemonic;
    passphrase = passphrase!=null? passphrase : "";
    if(words == null || words == "") {
        mnemonic = new BMnemonic();
        while(!BMnemonic.isValid(mnemonic.toString())) {
           mnemonic = new BMnemonic();
        }
    }else {
        try {
            mnemonic = new BMnemonic(words);
        }catch (e) {
            console.log("recovery mnemonic failed~!");
            throw e;
        }
    }
    hdPrikey = mnemonic.toHDPrivateKey(passphrase);
    return mnemonic;
}


/**
 * 获取主私钥
 * @returns {*}
 */
function getHDprikey(){
    return hdPrikey;
}

/**
 * 获取公钥
 * @returns {*}
 */
function getHDpubkey() {

}

/**
 *  验证助记词是否合法
 * @param words 助记词
 * @returns {*|boolean}
 */
function isValid(words) {
  return BMnemonic.isValid(words);
}

/**
 * 扩展公私钥
 */
function getBIPHDprikey() {

}



exports.generateMnemonic = generateMnemonic;
exports.getHDprikey = getHDprikey;
exports.getHDpubkey = getHDpubkey;
exports.isValid = isValid;






