/*jslint node: true */
"use strict";
var hashnethelper = require('./hashnethelper.js');
var transationVersion = require('./constants').transationVersion;
var NRG_PRICE = 0;
var eventBus = require('./event_bus.js');
var ecdsaSig = require('./signature.js');
const webHelper = require("./webhelper.js");
const constants = require('./constants');
const objectHash = require('./object_hash.js');
const header = {'Content-Type': 'application/json'};
const device = require("./device.js");
const _ = require('lodash');
var light = require('./light.js');
const config = require('./conf.js')
const zero = '000000000000000000';
var mutex = require('./mutex.js');
var Decimal = require('decimal.js');
var db = require('./db.js');
var utils = require('./utils.js');
/**
 * 获取NRG_PRICE
 * @returns {number}
 */
async function getNrgPrice(){
    // if(!NRG_PRICE) {
    //     var tranNrgPrice = setInterval(async function () {
    if(!NRG_PRICE) {
        NRG_PRICE = await hashnethelper.getNRGPrice();
    }
    return NRG_PRICE;
    //         if(NRG_PRICE) {
    //             clearInterval(tranNrgPrice)
    //             return NRG_PRICE;
    //             eventBus.emit('nrgPrice',NRG_PRICE);
    //         }
    //     }, 2 * 1000);
    // }else{
    //     return NRG_PRICE;
    // }
}



/**
 * 构造交易结构
 * @param data
 * @returns {{fromAddress: *, toAddress: *, amount: string, timestamp: number, remark: string, vers: string, pubkey: *, type: number, fee: string, nrgPrice: number}}
 */
async function transactionMessage(data,cb) {
    var Bitcore = require('bitcore-lib');
    NRG_PRICE = await getNrgPrice();
    if(!NRG_PRICE) return cb(('error,unable to get nrgPrice'),null);
    try{

        let amount = (data.amount + "").split('.')[0];
        let amountP = (data.amount + "").split('.')[1] ? (data.amount + "").split('.')[1] : '';
        let amountPoint = amountP+zero.substring(-1,zero.length-amountP.length);
        let amountstr = (amount+amountP).replace(/\b(0+)/gi,"")+zero.substring(-1,zero.length-amountP.length);
        let Base64 = require('./base64Code');
        let noteBase64 = data.note ?  Base64.encode(data.note) :'';
        let fee = noteBase64 ? ((noteBase64.length * 1.0 /1024) * constants.NRG_PEER_KBYTE + constants.BASE_NRG).toString(): constants.BASE_NRG.toString();
        let stablesFrom = await light.findStable3(data.fromAddress);
        let stablesTo = new Decimal(stablesFrom).sub(data.amount).sub(new Decimal(fee*NRG_PRICE/1000000000000000000)).toString();
        let compareStables = new Decimal(stablesTo) >0
        if (!compareStables ||(compareStables && stablesTo.substr(0,1) == "-")) {
            return cb("not enough spendable funds from " + data.to_address + " for " + (parseInt(data.fee) + parseInt(data.amount)));
        }
        let obj =
            {
                fromAddress: data.fromAddress,
                toAddress: data.to_address,
                amount: amountstr,
                timestamp:  Math.round(Date.now()),
                remark: noteBase64,
                vers: transationVersion,
                pubkey: data.pubkey,
                type: 1,
                fee: fee,
                nrgPrice: NRG_PRICE,
            }
        var xPrivKey = new Bitcore.HDPrivateKey.fromString(data.xprivKey);
        let buf_to_sign = objectHash.getUnitHashToSign(obj);
        let pathSign = "m/44'/0'/0'/0/0";
        let privKeyBuf = xPrivKey.derive(pathSign).privateKey.bn.toBuffer({size:32});
        let signature = ecdsaSig.sign(buf_to_sign, privKeyBuf);
        obj.signature = signature;

        cb(null,obj);
    }catch (e) {
        cb(e.toString(),null);
    }


}

/**构造文本交易结构
 * @param data
 * @returns {{fromAddress: *, toAddress: *, amount: string, timestamp: number, remark: string, vers: string, pubkey: *, type: number, fee: string, nrgPrice: number}}
 */
async function transactionContext(data,cb) {
    var Bitcore = require('bitcore-lib');
    NRG_PRICE = await getNrgPrice();
    if (!NRG_PRICE) return cb(('error,unable to get nrgPrice'), null);
    try {
        let Base64 = require('./base64Code');
        let noteBase64 = data.note ? Base64.encode(data.note) : '';
        let fee = noteBase64 ? (noteBase64.length * 1.0 / 1024) * constants.NRG_PEER_KBYTE + constants.BASE_NRG.toString() : constants.BASE_NRG.toString();
        let obj =
            {
                fromAddress: data.change_address,
                timestamp: Math.round(Date.now()),
                context: noteBase64,
                vers: transationVersion,
                pubkey: data.pubkey,
                type: 4,
                fee: fee,
                nrgPrice: NRG_PRICE,
            }
        var xPrivKey = new Bitcore.HDPrivateKey.fromString(data.xprivKey);
        let buf_to_sign = objectHash.getUnitHashToSign(obj);
        let pathSign = "m/44'/0'/0'/0/0";
        let privKeyBuf = xPrivKey.derive(pathSign).privateKey.bn.toBuffer({size: 32});
        let signature = ecdsaSig.sign(buf_to_sign, privKeyBuf);
        obj.signature = signature;

        cb(null, obj);
    } catch (e) {
        cb(e.toString());
    }
}

/**构造合约交易
 * @param data
 */
async function contractTransactionData(opts,cb) {
    var Bitcore = require('bitcore-lib');
    NRG_PRICE = await getNrgPrice();
    if (!NRG_PRICE) return cb(('error,unable to get nrgPrice'), null);
    let stablesFrom = await light.findStable3(opts.fromAddress);
    //let stablesFrom = stable[0].amount + stable[0].amount_point / parseInt(1 + zero) - stable[0].fee - stable[0].fee_point / parseInt(1 + zero);
    let stablesTo = new Decimal(stablesFrom).sub(opts.amount).sub(new Decimal(0.0005*NRG_PRICE / 1000000000000000000)).toString();
    let compareStables = new Decimal(stablesTo) >0
    if (!compareStables ||(compareStables && stablesTo.substr(0,1) == "-")) {
        return cb("not enough spendable funds from " + opts.toAddress + " for " + (parseInt(opts.fee ? opts.fee : 0) + parseInt(opts.amount)));
    }
    let amount = (opts.amount + "").split('.')[0];
    let amountP = (opts.amount + "").split('.')[1] ? (opts.amount + "").split('.')[1] : '';
    // let amountPoint = amountP+zero.substring(-1,zero.length-amountP.length);
    let amountstr = (amount+amountP).replace(/\b(0+)/gi,"")+zero.substring(-1,zero.length-amountP.length);
    // let gas = new Decimal(constants.BASE_NRG).times(NRG_PRICE).toFixed();

    try{
        let info = await hashnethelper.getAccountInfo(opts.fromAddress);
        let nonce = info.nonce;
        let callData = opts.callData;
        let gasPrice = NRG_PRICE;
        let value = amountstr;
        let gasLimit = constants.BASE_NRG;
        //let gasLimit = 2000000;
        let toAddress = opts.toAddress;
        // let data ={
        //     nonce: utils.numberToBase64(nonce),
        //     //callData: utils.stringToBase64("3a93424a000000000000000000000000000000000000000000000000000000000000000"+callData),
        //     callData: utils.stringToBase64(utils.Hexstring2btye("3a93424a000000000000000000000000000000000000000000000000000000000000000"+callData)),
        //     gasPrice: utils.numberToBase64(gasPrice),
        //     value: utils.numberToBase64(value),
        //     gasLimit: utils.numberToBase64(gasLimit),
        //     toAddress: utils.stringToBase64(toAddress)
        // }
        let data ={
            nonce: nonce.toString(),
            //callData: utils.stringToBase64("3a93424a000000000000000000000000000000000000000000000000000000000000000"+callData),
            callData: utils.stringToBase64(utils.Hexstring2btye("3a93424a000000000000000000000000000000000000000000000000000000000000000"+callData)),
            gasPrice: gasPrice.toString(),
            value: value.toString(),
            gasLimit: gasLimit.toString(),
            toAddress: toAddress.toString()
        }
        data = utils.stringToBase64(JSON.stringify(data));
        let obj = {
            fromAddress: opts.fromAddress,
            timestamp: Math.round(Date.now()),
            data: data,
            //data: new Buffer(JSON.stringify(data)).toString("base64"),
            vers: transationVersion,
            pubkey: opts.pubkey,
            type: 2
        }
        var xPrivKey = new Bitcore.HDPrivateKey.fromString(opts.xprivKey);
        let buf_to_sign = objectHash.getUnitHashToSign(obj);
        let pathSign = "m/44'/0'/0'/0/0";
        let privKeyBuf = xPrivKey.derive(pathSign).privateKey.bn.toBuffer({size: 32});
        let signature = ecdsaSig.sign(buf_to_sign, privKeyBuf);
        obj.signature = signature;
        cb(null, obj);
    } catch (e) {
        cb(e.toString());
    }
}

/**
 * 往共识网发送交易
 * @param data
 * @returns {*}
 */
let urlList = [];
async function sendTransactions(opts, cb){
    try{
        // if(urlList.length == 0){
        //     let result = await webHelper.httpPost(device.my_device_hashnetseed_url + '/v1/getlocalfullnodes', null, {pubkey: opts.pubkey});
        //     let localfullnodes = JSON.parse(JSON.parse(result).data);
        //     _.forEach(localfullnodes,function (res) {
        //         urlList.push(`${res.ip}:${res.httpPort}`)
        //     });
        // }
        // let localfullnode =urlList[Math.round(Math.random() * urlList.length)];
        let localfullnode = config.URL.INVE_TRANSACTION_URL;
        let message = JSON.stringify(opts);
        let resultMessage = JSON.parse(await webHelper.httpPost(getUrl(localfullnode, '/v1/sendmsg'), null, buildData({message})));
        if (resultMessage.code != 200) {
            //如果发送失败，则马上返回到界面
            cb(resultMessage.data, null);
        }else {
            console.log('opts: ',opts)
            await inserTrans(opts)
            cb(null,resultMessage)
        }
    }catch (e) {
        cb(e.toString(),null)
    }

}

/**
 * 发往第三方服务器
 * @param data
 * @param cb
 */
async function sendTransactionToOtherServer(data, cb){
    try{
        let url = constants.payUrl;
        let obj =
            {
                //localfullnode_list: data.localfullnode_list,    //发送到intervalue的local full node
                localfullnode_list: [config.URL.INVE_TRANSACTION_URL],    //发送到intervalue的local full node
                bizid: data.bizid,           //商家号
                paysign: data.paysign,          //支付系统对本次支付交易的签名
                orderid: data.orderid,          //商家生成的订单号
                paytransid : data.paytransid,       //支付系统本次交易号
                ptimestamp: data.ptimestamp,        //支付系统生成的时间stamp
                wallettransid: data.wallettransid, //就是下结构体中的signature
                amount: data.amount,
                paybody: {
                    message: data.paybody.message
                }   //intervalue要求的转帐数据体
            }
        let res = await webHelper.httpPost(url, header, obj);
        res = JSON.parse(res);
        if(res.errorcode =="0"){
           await inserTrans(data.paybody.message);
            cb(null, res);
        }else {
            cb(res.errormsg);
        }

    }catch (e) {
        cb(e.toString())
    }

}

let inserTrans = async (obj) => {
    if(obj.hasOwnProperty("data")){
        let b = JSON.parse(new Buffer(obj.data,"base64").toString());
        // obj.amount = utils.base64ToNumber(b.value).toString();
        // obj.fee = utils.base64ToNumber(b.gasLimit);
        // obj.toAddress = utils.base64ToString(b.toAddress);
        // obj.nrgPrice = utils.base64ToNumber(b.gasPrice)
        obj.amount = b.value;
        obj.fee = b.gasLimit;
        obj.toAddress = b.toAddress;
        obj.nrgPrice = b.gasPrice;
    }
    let amount = obj.amount;
    let amountInt = parseInt(amount.replace(/"/g, '').substring(-1, amount.length - 18) ? amount.replace(/"/g, '').substring(-1, amount.length - 18) : 0);
    let amountPoint = parseInt(amount.replace(/"/g, '').substring(amount.length - 18, amount.length) ? amount.replace(/"/g, '').substring(amount.length - 18, amount.length) : 0);
    let NRG_PRICE = obj.nrgPrice;
    let fee = (obj.fee * NRG_PRICE).toString();
    let feeInt = parseInt(fee.replace(/"/g,'').substring(-1,fee.length-18) ? fee.replace(/"/g,'').substring(-1,fee.length-18) : 0);
    let feePoint = parseInt(fee.replace(/"/g,'').substring(fee.length-18,fee.length) ? fee.replace(/"/g,'').substring(fee.length-18,fee.length) : 0);
    let Base64 = require('./base64Code');
    let note = obj.remark ? await Base64.decode(obj.remark) : '';
    await mutex.lock(["write"], async function (unlock) {
        try {
            //更新数据库
            await db.execute("INSERT INTO transactions (id,creation_date,amount,fee,addressFrom,addressTo,result,type,remark,amount_point,fee_point, multiHash,tranType) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
                obj.signature, obj.timestamp, amountInt, feeInt, obj.fromAddress, obj.toAddress, "pending", obj.sendType ? obj.sendType : 0 ,note, amountPoint, feePoint,obj.order,obj.type);
            //更新列表
            obj.isStable = 1;
            obj.isValid = 0;
            light.refreshTranList(obj);
            return '';

        }
        catch (e) {
            console.log(e.toString());
            return toString()
        }
        finally {
            //解锁队列
            await unlock();
        }
    });
}

//组装访问共识网的url
let getUrl = (localfullnode, suburl) => {
    return 'http://' + localfullnode + suburl;
}
//组装往共识网发送数据的对象
let buildData = (data) => {
    return JSON.parse(JSON.stringify(data));
}




module.exports = {
    transactionMessage: transactionMessage,
    sendTransactions: sendTransactions,
    transactionContext: transactionContext,
    sendTransactionToOtherServer: sendTransactionToOtherServer,
    contractTransactionData: contractTransactionData
}