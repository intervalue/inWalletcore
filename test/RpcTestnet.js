//************************************************//
//   Bitcoin-Testnet RPC sample of node.js        //
//          PPk Public Group ? 2016.              //
//           http://ppkpub.org                    //
//     Released under the MIT License.            //
//************************************************//
//对应比特币测试网络(Bitcoin testnet)的RPC服务接口访问参数
// var RPC_USERNAME='admin1';
// var RPC_PASSWORD='123';
// var RPC_HOST="127.0.0.1";
// var RPC_PORT=19001;

const RPC_USERNAME = 'test';
const RPC_PASSWORD = 'test';
const RPC_HOST = "127.0.0.1";
const RPC_PORT = 18332;

//测试使用的钱包地址
TEST_ADDRESS='mkiytxYA6kxUC8iTnzLPgMfCphnz91zRfZ'; //测试用的钱包地址，注意与比特币正式地址的区别
TEST_PRIVATE_KEY='cTAUfueRoL1HUXasWdnETANA7uRq33BUp3Sw88vKZpo9Hs8xWP82'; //测试用的钱包私钥
TEST_WALLET_NAME='TestWallet1';  //测试的钱包名称


TEST_ADDRESS2='1ATzXtDqUvYGsXnUGBT3oLwBL4YSHRHifg';
TEST_PRIVATE_KEY2='KwQdurEsF3xZawJAT4kCm3jnhQLEfzqZ1F5UCekpL1aEUMFpof6c'

MIN_DUST_AMOUNT=0.01;  //最小有效交易金额,单位satoshi，即0.00000001 BTC
MIN_TRANSACTION_FEE=0.00000001; //矿工费用的最小金额，单位satoshi

var bitcoin_rpc = require('node-bitcoin-rpc');

bitcoin_rpc.init(RPC_HOST, RPC_PORT, RPC_USERNAME, RPC_PASSWORD);
bitcoin_rpc.call('importaddress', ['2NFSMkLsw1CG8jcWn1dafUhQz7qMv1SPkcx', 'TestWallet1', false], function (err, res) {
    if (err !== null) {
        console.log('I have an error :( ' + err + ' ' + res.error)
    } else {
        //console.log(res);
        console.log('Yay! I need to do whatevere now with ' + JSON.stringify(res.result));
    }
})

// bitcoin_rpc.call('listunspent', [6, 9999999,['2NFSMkLsw1CG8jcWn1dafUhQz7qMv1SPkcx']], function (err, res) {
//     if (err !== null) {
//         console.log('I have an error :( ' + err + ' ' + res.error)
//     } else {
//         //console.log(res);
//         console.log('Yay! I need to do whatevere now with ' + JSON.stringify(res.result));
//     }
// });
//
// bitcoin_rpc.call('sendrawtransaction', ['02000000023123994fe8512201bd6c74721afad7d09940370f0dbd329642ab5283d5512f59010000006b483045022100e3d4b98e681cc5dfa3fefd2db3459c4b9be1dae6418bc30530ea7776aa42f1e40220678cf24d2ea5a59115491adac41db7b4ad18963cd699f0574a887a4450fde9d90121022e9f31292873eee495ca9744fc410343ff373622cca60d3a4c926e58716114b9fffffffff9f88c06b183919bebdb3c4b6c48c59d7df875bd9e36a0ffcee145d58ca22092000000006b483045022100eaac6ed861209398d8f39a087f6afdb00f7144a9c0192fb0023f4dddcf4028d3022017bc27eb94825f1662a200220e559e5c7c2ff03fdd188187f703736e7e7d86890121022e9f31292873eee495ca9744fc410343ff373622cca60d3a4c926e58716114b9ffffffff02a08601000000000017a914f36dd1fbf56abfeba56737880b57ec5175e681bb87d40d0000000000001976a914391ef5239da2a3904cda1fd995fb7c4377487ea988ac00000000',
// false], function(err, res){
//     console.log(err);
//     console.log(res);
// })

// bitcoin_rpc.call('accounts', ['2NFSMkLsw1CG8jcWn1dafUhQz7qMv1SPkcx'], function(err, res){
//     console.log(err);
//     console.log(res);
// })



// bitcoin_rpc.call('')

// bitcoin_rpc.call('listunspent', [6, 9999999,['2NFSMkLsw1CG8jcWn1dafUhQz7qMv1SPkcx']], function (err, res) {
//     if (err !== null) {
//         console.log('I have an error :( ' + err + ' ' + res.error)
//     } else {
//         //console.log(res);
//         console.log('Yay! I need to do whatevere now with ' + JSON.stringify(res.result));
//     }
// })



//显示当前连接的比特币测试网络信息
// client.getInfo(function(err, info) {
//   if (err) return console.log(err);
//   console.log('Info:', info);
// });

//查看当前钱包下属地址账户余额变动情况
// client.listaccounts(function(err, account_list) {
//   if (err) return console.log(err);
//   console.log("Accounts list:\n", account_list);
// });

/**
 * 查看总共收到了多少个
 */
// client.getreceivedbyaddress('mkiytxYA6kxUC8iTnzLPgMfCphnz91zRfZ', function(err, result){
//     console.log(result);
// })

// client.listreceivedbyaddress(1, false, function(err, result){
//     console.log(err)
//     console.log(result)
// })

/**
 * 获取所有的账号
 */
// client.listaccounts(1, function(err, result){
//     console.log(result)
// })

/**
 * 获取这个账号的所有的交易记录
 */
// client.listtransactions(TEST_WALLET_NAME, 10, 0, function(err, result){
//     console.log(err);
//     console.log(JSON.stringify(result) + '++++++')
// })

/**
 * 获取某个地址的所属账号
 */
// clieres.resultnt.getaccount('mmgCmpPsZkSygHasvGNcxVxqjTG5LkPnGp', function(err, result){
//     console.log(err);
//     console.log('testAccount' + JSON.stringify(result))
// })

//console.log(client.help);
// client.help(function(err, resultList){
//     console.log(err);
//     //console.log(resultList);
// })
//
// client.dumpprivkey('2NFSMkLsw1CG8jcWn1dafUhQz7qMv1SPkcx', function(err, imported_result){
//     console.log(err);
//     console.log(imported_result);
// })
//
//
//
// client.importaddress('2NFSMkLsw1CG8jcWn1dafUhQz7qMv1SPkcx', 'TestWallet1', false, function(err, imported_result){
//     console.log(err);
//     console.log(imported_result);
// })

/**
 * 获取收到的钱
 */
// client.getbalance('TestWallet1', 1, function(err, result){
//     //console.log(err);
//     //console.log(JSON.stringify(result) + '-----------')
// })

// console.log(client.importaddress);
// console.log(client.importAddress);
// console.log(client.importAddress);
//L4x77a78UwsBHTLjLPkkjLD89bh3W9B7MWLSPqXbcGj6o8hPwKiQ
//cPohZDuFBqw145vNZavWAiwuDx5QN6LyBmmcouFeQRppaVyHmmis
/**
 * 导入私钥
 */
// client.importprivkey('cQRCoondMydduDrE8DUx3k5pHnsQkC21waQZe2Umf7Y2fkfKz5Ms','pmj_test+n',function(err, imported_result) {
//     if (err) return console.log(err + '|||||');
//     console.log('Imported OK:', imported_result);
//
//     //doSample();
// });

// //检查测试帐号是否已存在于测试节点
// client.getaccount(TEST_ADDRESS, function(err, result) {
//   if (err || result!=TEST_WALLET_NAME ) { //如不存在，则新导入测试帐号私钥
//       //console.log('Import the test account[',TEST_WALLET_NAME,']:',TEST_ADDRESS);
//       client.importprivkey(TEST_PRIVATE_KEY,TEST_WALLET_NAME,function(err, imported_result) {
//           if (err) return console.log(err);
//           console.log('Imported OK2:', imported_result);
//           //doSample();
//       });
//   }else{ //如已存在，则直接执行示例
//       console.log('The test account[',TEST_WALLET_NAME,'] existed. Address:',TEST_ADDRESS);
//       //doSample();
//   }
//
// });
//
// /**
//  * 获取未消费的utxo
//  */
// client.listunspent(6, 9999999,['mkiytxYA6kxUC8iTnzLPgMfCphnz91zRfZ'],function(err, array_unspent) {
//     if (err) return console.log('ERROR[listunspent]:',err);
//     //console.log('Unspent:', JSON.parse(JSON.stringify(array_unspent)));
//
//     //var array_transaction_in=[];
//
//     var sum_amount=0;
//     for(var uu=0;uu<array_unspent.length;uu++){
//         var unspent_record=array_unspent[uu];
//         if(unspent_record.amount>0){
//             sum_amount+=unspent_record.amount;
//         }
//     }
//     console.log(array_unspent[0].address + ':' + sum_amount.toFixed(8))
// });
//
// /**
//  * 获取未消费的utxo
//  */
// client.listunspent(6, 9999999,['mmgCmpPsZkSygHasvGNcxVxqjTG5LkPnGp'],function(err, array_unspent) {
//     if (err) return console.log('ERROR[listunspent]:',err);
//     //console.log('Unspent:', JSON.parse(JSON.stringify(array_unspent)));
//
//     //var array_transaction_in=[];
//
//     var sum_amount=0;
//     for(var uu=0;uu<array_unspent.length;uu++){
//         var unspent_record=array_unspent[uu];
//         if(unspent_record.amount>0){
//             sum_amount+=unspent_record.amount;
//         }
//     }
//     console.log(array_unspent[0].address + ':' + parseFloat(sum_amount.toFixed(8)))
// });
//
// /**
//  * 导出私钥 如果是已经导入过的地址才能导出
//  */
// client.dumpprivkey('mmgCmpPsZkSygHasvGNcxVxqjTG5LkPnGp', function(err, result){
//     console.log(result);
// })
//
// // 转账
// function doSample(){
//     //获取未使用的交易(UTXO)用于构建新交易的输入数据块
//     client.listunspent(6, 9999999,['mkiytxYA6kxUC8iTnzLPgMfCphnz91zRfZ'],function(err, array_unspent) {
//       if (err) return console.log('ERROR[listunspent]:',err);
//       //console.log('Unspent:', JSON.parse(JSON.stringify(array_unspent)));
//
//       var array_transaction_in=[];
//
//       var sum_amount=0;
//       var inputSum = 0;
//       var test = false;
//       for(var uu=0;uu<array_unspent.length;uu++){
//           var unspent_record=array_unspent[uu];
//           if(unspent_record.amount>0){
//               sum_amount+=unspent_record.amount;
//               //if (!test){
//                   array_transaction_in[array_transaction_in.length]={"txid":unspent_record.txid,"vout":unspent_record.vout};
//                //   inputSum += unspent_record.amount;
//               //}
//
//               if( sum_amount > (MIN_DUST_AMOUNT+MIN_TRANSACTION_FEE + MIN_DUST_AMOUNT * 0.5) ){
//               //    test = true;
//                   break;
//               }
//                   //continue;
//           }
//       }
//
//       //console.log(sum_amount + '--------||||')
//       //确保新交易的输入金额满足最小交易条件
//       if (sum_amount<MIN_DUST_AMOUNT+MIN_TRANSACTION_FEE) return console.log('Invalid unspent amount');
//
//       //生成测试新交易的输出数据块，此处示例是给指定目标测试钱包地址转账一小笔测试比特币
//       //注意：输入总金额与给目标转账加找零金额间的差额即MIN_TRANSACTION_FEE，就是支付给比特币矿工的交易成本费用
//         //console.log((sum_amount-MIN_DUST_AMOUNT-MIN_TRANSACTION_FEE)/100000000)
//         // console.log(sum_amount)
//         // console.log(inputSum)
//         //sum_amount = 1
//       var obj_transaction_out={
//           "mmgCmpPsZkSygHasvGNcxVxqjTG5LkPnGp": MIN_DUST_AMOUNT.toFixed(8),   //目标转账地址和金额
//           "mkiytxYA6kxUC8iTnzLPgMfCphnz91zRfZ":  (sum_amount - MIN_DUST_AMOUNT -MIN_TRANSACTION_FEE - MIN_DUST_AMOUNT * 0.5).toFixed(8)//找零地址和金额，默认用发送者地址
//            };
//       console.log('Transaction_out:', array_transaction_in)
//       console.log('Transaction_out:', obj_transaction_out);
//
//       //生成交易原始数据包
//       client.createrawtransaction(array_transaction_in,obj_transaction_out,function(err2, rawtransaction) {
//           if (err2) return console.log('ERROR[createrawtransaction]:',err2);
//           //console.log('Rawtransaction:', rawtransaction);
//
//           //签名交易原始数据包
//           client.signrawtransaction(rawtransaction,function(err3, signedtransaction) {
//               if (err3) return console.log('ERROR[signrawtransaction]:',err3);
//               //console.log('Signedtransaction:', signedtransaction);
//
//               var signedtransaction_hex_str=signedtransaction.hex;
//               //console.log('signedtransaction_hex_str:', signedtransaction_hex_str);
//
//               //广播已签名的交易数据包
//               client.sendrawtransaction(signedtransaction_hex_str,false,function(err4, sended) { //注意第二个参数缺省为false,如果设为true则指Allow high fees to force it to spend，会在in与out金额差额大于正常交易成本费用时强制发送作为矿工费用(谨慎!)
//                   if (err4) return console.log('ERROR[sendrawtransaction]:',err4);
//                   console.log('Sended TX:', sended);
//
//                   client.listaccounts(function(err, account_list) {
//                       if (err) return console.log(err);
//                       console.log("Accounts list:\n", account_list); //发送新交易成功后，可以核对下账户余额变动情况
//                     });
//               });
//           });
//       });
//
//
//     });
// }
