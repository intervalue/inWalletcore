"use strict";

// const RPC_USERNAME = 'admin1';
// const RPC_PASSWORD = '123';
// const RPC_HOST = "127.0.0.1";
// const RPC_PORT = 19001;

// const RPC_USERNAME = 'test';
// const RPC_PASSWORD = 'test';
// const RPC_HOST = "127.0.0.1";
// const RPC_PORT = 18332;
//
// const client = require('kapitalize')();
//
//
// client
//     .auth(RPC_USERNAME, RPC_PASSWORD)
//     .set('host', RPC_HOST)
//     .set({
//         port:RPC_PORT
//     });
//
// // console.log(client);
//
//
// client.listunspent(6, 9999999,['2N62puRPV5tqo1wPhvDcXfEU6cGfJW2RYBc'],function(err, array_unspent) {
//     console.log(err)
//     if (err  && err.toString().indexOf('"error":null') < 0) {
//         console.log('ERROR[listunspent]:',err);
//         return;
//     }
//     console.log(array_unspent)
// });


// client.getbalance('2N62puRPV5tqo1wPhvDcXfEU6cGfJW2RYBc', 3, function(err, result){
//     console.log(err);
//     console.log(result);
// })

// client.listunspent(1, 999999, function(err, result){
//     console.log(err);
//     console.log(JSON.stringify(result));
// })

// client.importaddress('2N62puRPV5tqo1wPhvDcXfEU6cGfJW2RYBc', function(err, result){
//     console.log(err);
//     console.log(result);
// })

// client.estimateFee(function(err, result){
//     console.log(err);
//     console.log(result);
// })
//
// console.log(client.help(function(err, result){
//     console.log(err);
//     console.log(result);
// }))

// client.importmulti('2N62puRPV5tqo1wPhvDcXfEU6cGfJW2RYBc', 'myWallet', true, function(err, result){
//     console.log(result);
//     console.log(err);
// })


const rpc = require('../HDWallet/btc_rpcHelper');

// rpc.getBalance('2NFSMkLsw1CG8jcWn1dafUhQz7qMv1SPkcx', 'myWallet', function(err, res){
//
// })

// const btcHelper = require('../HDWallet/btc_helper');
// const btcrpcHelper = require('../HDWallet/btc_rpcHelper');
// btcrpcHelper.getUnSpent('mho6gLYHXQdJF1Feh8zhZ6fjJt5u2LSGBk', 'myWallet', function(err, res){
//     if (err){
//         console.log(err);
//         return;
//     }
//     btcHelper.signTransaction('cT6MaMDfF5XyAfK3Rczx9yYatR5zoNdqHZf8XjwLV5XJWYGEjMBZ', false, 'mho6gLYHXQdJF1Feh8zhZ6fjJt5u2LSGBk', '2NFSMkLsw1CG8jcWn1dafUhQz7qMv1SPkcx', '0.1177', res, '0.0000803');
// });

const bean = require('../HDWallet/wallet_bean');

//maximum buyer joke bread chief never deliver east police fault cabin deposit
//stool hawk toilet weird problem pull style they rose apology stone churn
// bright interest session traffic giraffe drive truth hub retire army gift tortoise
let wallet = new bean("stool hawk toilet weird problem pull style they rose apology stone churn", "BTC", "myWallet", '', 'pmj', true, 0);
// console.log(wallet.getAddress());
console.log(wallet.getAddress(1));
// console.log(wallet.getAddress(2));
// console.log(wallet.getAddress(3));
// console.log(wallet.getAddress(4));
// console.log(wallet.getAddress(5));
// console.log(wallet.getAddress(6));
// console.log(wallet.getAddress(7));
// console.log(wallet.getAddress(8));
// console.log(wallet.getAddress(9));
// console.log(wallet.getAddress(10));
// console.log(wallet.getAddress(11));
// console.log(wallet.getAddress(12));
// console.log(wallet.getAddress(13));
// console.log(wallet.getAddress(14));
// console.log(wallet.getAddress(15));
// console.log(wallet.getAddress(16));
// console.log(wallet.getAddress(17));
// console.log(wallet.getAddress(18));
// console.log(wallet.getAddress(19));
// console.log(wallet.getAddress(20, ''));

const schedule = require('node-schedule');
// let count = 1;
// const test = schedule.scheduleJob('*/3 * * * * *', function(){
//     console.log('定时器触发次数：' + new Date());
//     if (count > 10)
//         test.cancel();
//     count++;
// });


//
// wallet.getBalance('mwXokii2kguTKVN3z7MRGmKoyFcZoHmTX8', function(err, res){
//     console.log(err);
//     console.log(res);
// });



// console.log(wallet.decrypt(''));
// const btcHelper = require('../HDWallet/btc_helper');
const rpcHelper = require('../HDWallet/btc_rpcHelper');


rpcHelper.getUnSpent('2NEvnrGdKcfYwfVxPm26CUdRy8D2zxCnVod', 'other', function(err, res){
    console.log(err);
    console.log(res);
}, false);

rpcHelper.getTransactions('2NEvnrGdKcfYwfVxPm26CUdRy8D2zxCnVod', function(err, res){
    console.log(err);
    console.log(res);
})

// rpcHelper.getUnSpent('2NGZrVvZG92qGYqzTLjCAewvPZ7JE8S8VxE', 'other', function(err, res){
//     console.log(err);
//     console.log(res);
// }, false);
// //passphrase, address, sendAddress, sendNum, fee, callbackFun
// wallet.sendTransaction('', wallet.getAddress(1), '2NFSMkLsw1CG8jcWn1dafUhQz7qMv1SPkcx', 0.0099, 0.00001, function(err, res){
//     if (err !== null){
//         console.log(err);
//     } else {
//         let count = 1;
//         const test = schedule.scheduleJob('*/3 * * * *', function(){
//             console.log('定时器触发次数：' + new Date());
//             if (count > 21){
//                 console.log('超过次数');
//                 test.cancel();
//             } else{
//                 rpcHelper.searchHash(res.result, function(err2, res2){
//                     console.log(res2);
//                     if (res2.confirmations >= 6){
//                         console.log('over');
//                         test.cancel();
//                     }
//                 }, true);
//             }
//             count++;
//         });
//     }
// }, false, 1)
//
// let count = 1;
// const test = schedule.scheduleJob('*/3 * * * *', function() {
//     console.log (count + new Date());
//     if (count > 21){
//         console.log('超过次数');
//         test.cancel();
//     } else{
//         rpcHelper.searchHash('e95db4710f2317c822941c7dcf9417fed72604ac410caa802d79624e98ec175a', function(err2, res2){
//             console.log(JSON.stringify(res2));
//             if (res2.confirmations >= 6){
//                 console.log('over');
//                 test.cancel();
//             }
//         }, true);
//     }
//     count++;
// });


// let wallet2 = new bean('cTAUfueRoL1HUXasWdnETANA7uRq33BUp3Sw88vKZpo9Hs8xWP82', 'BTC', 'myWallet', '', 'pmjtest', false, 1);
// console.log(wallet2.getAddress());
//
// wallet2.getBalance('2NFSMkLsw1CG8jcWn1dafUhQz7qMv1SPkcx', function(err, res){
//     console.log(err);
//     console.log(res);
// });
//
// console.log(wallet2.decrypt('') + '6666666666');
// const schedule = require('node-schedule');
// const rpcHelper = require('../HDWallet/btc_rpcHelper');
//
// wallet2.sendTransaction('', wallet2.getAddress(), 'mkiytxYA6kxUC8iTnzLPgMfCphnz91zRfZ', 0.01000862, 0.00000001, function(err, res){
//     if (err !== null){
//         console.log(err);
//         console.log(res);
//         let count = 1;
//         const test = schedule.scheduleJob('* */6 * * * *', function(){
//             console.log('定时器触发次数：' + new Date());
//             if (count > 12){
//                 test.cancel();
//             } else{
//                 rpcHelper.searchHash(res.hash, function(err2, res2){
//                     console.log(res2);
//                     console.log(err2);
//                 }, true);
//             }
//             count++;
//         });
//     } else {
//         console.log(res);
//     }
// });

// wallet2.getHistory('2NFSMkLsw1CG8jcWn1dafUhQz7qMv1SPkcx', function(err, res){
//     console.log(err);
//     console.log(res);
// })
//
// const rpcHelper = require('../HDWallet/btc_rpcHelper');
// rpcHelper.searchHash('5d262f816a5a77bc22d6077d726e23e69cf36316475c8c031e2c7902b1e6b5f5', function(err, res){
//     console.log(res);
// }, true);


// const schedule = require('node-schedule');
// let count = 1;
// const test = schedule.scheduleJob('*/3 * * * * *', function(){
//     console.log('定时器触发次数：' + new Date());
//     if (count > 10)
//         test.cancel();
//     count++;
// });


//
// rpcHelper.searchHash('9328102aea31da0dbf9c1a9a4e22fd3111271bd7af6631d08bb626c3bdc46ecc', function(err, res){
//     console.log(JSON.stringify(res.result.vout) + '}}}}}}}}}}}}}}}}}}}}}}}}}}}');
// }, true);
//
// rpcHelper.searchHash('c52a2ac398de816eed46f29cd26b31c4a49c82e05aa2240ee40caea51cb6d8d2', function(err, res){
//     console.log(JSON.stringify(res.result.vout) + '?????????????????????????????');
// }, true);

// rpcHelper.searchHash('728c5062453c7931bf9632754991ad308947d4affe08239a1b45b372cae25dbb', function(err, res){
//     console.log(JSON.stringify(res.result.vout));
//     console.log(res.result.vin);
// }, true);

//728c5062453c7931bf9632754991ad308947d4affe08239a1b45b372cae25dbb
//57e45cb67084f407b9b5db0018d80430f0209ebc0dfce119aa0aec5673ebac83


//
// rpcHelper.searchHash('728c5062453c7931bf9632754991ad308947d4affe08239a1b45b372cae25dbb', function(err, res){
//     console.log(err);
//     console.log(res);
// }, true);

// rpcHelper.searchHash('ba0712e1d02fb5e1af765de181275037b8ce1a2dae61d7376c33eada406e2a2c', function(err, res){
//     console.log(err);
//     console.log(res.result);//vout[0].scriptPubKey.addresses);
// }, true);
//
// rpcHelper.searchHash('413169d5c16134c17d6e25b30e9e2c3912abb1f649c165a9483c001c2b848b05', function(err, res){
//     console.log(err);
//     console.log(res.result);//vout[0].scriptPubKey.addresses);
// }, true);



//wallet.sendTransaction()

// rpc.getTransactions('mkiytxYA6kxUC8iTnzLPgMfCphnz91zRfZ', function(err, result){
//     console.log(err);
//     console.log(result);
// });