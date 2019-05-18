// "use strict";
//
// const RPC_USERNAME = 'test';
// const RPC_PASSWORD = 'test';
// const RPC_HOST = "127.0.0.1";
// const RPC_PORT = 18332;
//
// const client = require('kapitalize')();
// const btcHelper = require('./btc_helper');
//
//
// client
//     .auth(RPC_USERNAME, RPC_PASSWORD)
//     .set('host', RPC_HOST)
//     .set({
//         port:RPC_PORT
//     });
//
// /**
//  * 导入私钥
//  * @param privateKey
//  * @param walletName
//  */
// function importPriKey(privateKey, address, walletName, successFun, failedFun, wallet){
//     failedFun = checkCallbackFun(successFun, failedFun);
//
//     client.getaccount(address, function(err, result){
//         if (err){
//             client.importprivkey(privateKey, walletName, function(err, imported_result) {
//                 if (err && err.toString().indexOf('"error":null') < 0) {
//                     console.log(err);
//                     failedFun(err);
//                     return;
//                 }
//                 wallet.HDWallet = true;
//                 //client.encryptwallet(passphrase, function(err, result){
//                 //    if (err) return console.log(err);
//                 successFun(imported_result);
//                 //});
//             });
//         } else {
//             wallet.HDWallet = true;
//             successFun(null);
//         }
//     });
//
// }
//
// /**
//  * 导出私钥 如果是已经导入过的地址才能导出
//  */
// function exportPriKey (address, successFun, failedFun){
//     failedFun = checkCallbackFun(successFun, failedFun);
//     client.dumpprivkey(address, function(err, result){
//         if (err  && err.toString().indexOf('"error":null') < 0){
//             failedFun(err);
//             return;
//         }
//         successFun(result);
//     });
// }
//
// /**
//  * 获取余额
//  */
// // function getBalance (address, successFun, failedFun){
// //     failedFun = checkCallbackFun(successFun, failedFun);
// //     client.listunspent(6, 9999999,[address],function(err, array_unspent) {
// //         if (err  && err.toString().indexOf('"error":null') < 0) {
// //             console.log('ERROR[listunspent]:',err);
// //             failedFun(err);
// //             return;
// //         }
// //         var sum_amount=0;
// //         let length = array_unspent == undefined?0:array_unspent.length;
// //         for(var uu=0;uu< length;uu++){
// //             var unspent_record=array_unspent[uu];
// //             if(unspent_record.amount>0){
// //                 sum_amount+=unspent_record.amount;
// //             }
// //         }
// //         if (array_unspent.length != 0)
// //             console.log(array_unspent[0].address + ':' + parseFloat(sum_amount.toFixed(8)))
// //         successFun(parseFloat(sum_amount.toFixed(8)));
// //     });
// // }
//
// /**
//  * 获取交易记录
//  * @param walletName
//  * @param successFun
//  * @param failedFun
//  */
// function getTransactionHistorys (walletName, successFun, failedFun){
//     failedFun = checkCallbackFun(successFun, failedFun);
//     client.listtransactions(walletName, 10, 0, function(err, result){
//         if (err  && err.toString().indexOf('"error":null') < 0) {
//             failedFun(err);
//             console.log('ERROR[transactions]:',err);
//             return;
//         }
//         successFun(JSON.stringify(result));
//     })
// }
//
// /**
//  * 必须是导入的钱包才能交易
//  * @param address
//  * @param receivedAddress
//  * @param sendMoney
//  * @param tee
//  * @param successFunc
//  * @param failedFunc
//  */
// function doSample(address, receivedAddress, sendMoney, tee, successFun, failedFun){
//     failedFun = checkCallbackFun(successFun, failedFun);
//     //获取未使用的交易(UTXO)用于构建新交易的输入数据块
//     client.listunspent(6, 9999999,[address],function(err, array_unspent) {
//         if (err  && err.toString().indexOf('"error":null') < 0) {
//             return failedFun(err);
//         }
//
//         var array_transaction_in=[];
//         var sum_amount=0;
//         for(var uu=0;uu<array_unspent.length;uu++){
//             var unspent_record=array_unspent[uu];
//             if(unspent_record.amount>0){
//                 sum_amount+=unspent_record.amount;
//                 array_transaction_in[array_transaction_in.length]={"txid":unspent_record.txid,"vout":unspent_record.vout};
//                 if( sum_amount > (sendMoney + tee) ){
//                     break;
//                 }
//             }
//         }
//
//         //确保新交易的输入金额满足最小交易条件
//         if (sum_amount < sendMoney + tee) return failedFun('Invalid unspent amount');
//         //生成测试新交易的输出数据块，此处示例是给指定目标测试钱包地址转账一小笔测试比特币
//         //注意：输入总金额与给目标转账加找零金额间的差额即MIN_TRANSACTION_FEE，就是支付给比特币矿工的交易成本费用
//         var obj_transaction_out={
//             [address]: (sum_amount - sendMoney - tee).toFixed(8),   // 找零地址和金额，默认用发送者地址
//             [receivedAddress]:  sendMoney.toFixed(8)// 目标转账地址和金额
//         };
//
//         //生成交易原始数据包
//         client.createrawtransaction(array_transaction_in, obj_transaction_out, function(err2, rawtransaction) {
//             if (err2) return failedFun('ERROR[createrawtransaction]:' + err2);
//
//             //签名交易原始数据包
//             client.signrawtransaction(rawtransaction, function(err3, signedtransaction) {
//                 if (err3) return failedFun('ERROR[signrawtransaction]:' + err3);
//
//                 var signedtransaction_hex_str = signedtransaction.hex;
//
//                 //广播已签名的交易数据包
//                 client.sendrawtransaction(signedtransaction_hex_str,false,function(err4, sended) { //注意第二个参数缺省为false,如果设为true则指Allow high fees to force it to spend，会在in与out金额差额大于正常交易成本费用时强制发送作为矿工费用(谨慎!)
//                     if (err4) return failedFun('ERROR[sendrawtransaction]:' + err4);
//                     successFun(sended);
//                     client.listaccounts(function(err, account_list) {
//                         if (err) return failedFun(err);
//
//                     });
//                 });
//             });
//         });
//     });
// }
//
// function decryWallet (passphrase, successFun, failureFun){
//     client.walletpassphrase(passphrase, 10, function(err, result){
//         console.log(err);
//         console.log(result);
//     })
// }
//
// function checkCallbackFun(successFunc, failedFunc){
//     if (successFunc == undefined || typeof successFunc !== "function"){
//         successFunc = console.log;
//         //throw new Error('successFunc must be function');
//         //return;
//     }
//     if (failedFunc == undefined || typeof failedFunc !== "function"){
//         failedFunc = successFunc;
//     }
//     return failedFunc;
// }
//
// module.exports = {
//     'importPriKey'          : importPriKey,
//     'exportPriKey'          : exportPriKey,
//     'getBalance'            : getBalance,
//     'getTransactionHistorys': getTransactionHistorys,
//     'doSample'              : doSample,
//     'decryWallet'           : decryWallet
//
// }
//
//
//
