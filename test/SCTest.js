let Web3 = require('web3');
let solc = require("solc");
let fs   = require('fs');
// var path = require('path')


if (typeof web3 !== 'undefined') {
    web3 = new Web3(web3.currentProvider);
} else {
    // set the provider you want from Web3.providers
    // web3 = new Web3(new Web3.providers.HttpProvider("http://13.125.253.106:8080"));
    web3 = new Web3(new Web3.providers.HttpProvider("http://localhost:8545"));
}




// var address = "0x7d82De1C69106ae58ABc60332c328d8D66745Bd4";
console.log('Reading Contract...');
const input = fs.readFileSync('HelloWorldContract.sol');
console.log('Compiling Contract...');

//编译合约
const output = solc.compile(input.toString(),1);
const bytecode = output.contracts[':HelloWorldContract'].bytecode;
const abi = output.contracts[':HelloWorldContract'].interface;

//Contract Object
const helloWorldContract = web3.eth.contract(JSON.parse(abi));
var account = web3.eth.accounts[0];

//部署合约
console.log("Deploying the contract");
var scaddress;
deploy(helloWorldContract,bytecode,account,function (err,res) {
    if(err){
        console.log(err);
    }else {
        scaddress=res;

        //调用合约
        call(scaddress);
    }
});

// console.log( "scaddress: "+scaddress);
//
// call(scaddress);

function deploy(helloWorldContract,bytecode,account,callbackFun) {
    var helloWorldContractInstance = helloWorldContract.new({
        data: '0x' + bytecode,
        from: account,
        gas: 1000000
    }, (err, res) => {
        if (err) {
            console.log(err);
            return callbackFun(err,null);
        }else{
            console.log(res.transactionHash);
            // If we have an address property, the contract was deployed
            if (res.address) {
                console.log('Contract address: ' + res.address);
                return callbackFun(null,res.address);
            }
        }
    });
}


function call(scaddress) {
    var helloWorldContractInstance = helloWorldContract.at(scaddress); //此处 为部署合约的输出Contract address
    console.log ('calling the contract locally');
    console.log(helloWorldContractInstance.sayHi.call(3,2).toString());
}















//  尝试失败的方法


// function compiler(file,contractName){
//     // 读取智能合约文件
//     input = fs.readFileSync(file,'utf8').toString();
//     var fileName = path.parse(file)['name'].toString();
//     console.log(fileName)
//     // 编译合约
//     var contract = solc.compile(input,1);
//     // 输出结果
//     console.log(contract);
//     console.log(contract.contracts[contractName].bytecode)
//     console.log(contract.contracts[contractName].interface)
//     // 将编译后生成的bytecode保存到本地
//     fs.writeFile(fileName+'.abi','0x'+contract.contracts[contractName].bytecode,{},function (err,result) {
//         if (err){
//             console.log(err)
//         }
//     })
//     // 将编译后生成的interface保存到本地
//     fs.writeFile(fileName+'.json',(contract.contracts[contractName].interface),{},function (err,result) {
//         if (err){
//             console.log(err)
//         }
//     })
// }

// // 调用函数,第一个参数是你的合约文件地址，第二个参数是你的合约名，注意冒号不要省略
// compiler('adoption.sol',':Adoption');
//

// deploy('adoption','0x7d82De1C69106ae58ABc60332c328d8D66745Bd4','123456');
// deploy('0x7d82De1C69106ae58ABc60332c328d8D66745Bd4','benzhu');
// var v=Web3.version;
// console.log(v);
// web3.eth.getBalance("0x7d82De1C69106ae58ABc60332c328d8D66745Bd4")
//     .then(console.log);
// var account =web3.eth.accounts.create();
// var account = web3.eth.accounts[0];
// console.log(account);
// web3.eth.personal.newAccount('!@superpassword');
// var address = "0x7d82De1C69106ae58ABc60332c328d8D66745Bd4";
// deploy(address);

/*
@param file 文件名，会自动查找文件名路径下的被编译过的文件
@param from 合约账户，合约部署到私链上将从这个账户上扣除gas
@param password 该账户的密码，如果你账户是锁定状态
*/
// function deploy1(from,password) {
//     const input = fs.readFileSync('HelloWorldContract.sol');
//     const output = solc.compile(input.toString(), 1);
//     const bytecode = '0x'+output.contracts[':HelloWorldContract'].bytecode.toString();
//     const interface = output.contracts[':HelloWorldContract'].interface.toString();
//     // for (var contractName in output.contracts){
//     //     console.log(contractName + ': ' + output.contracts[contractName].bytecode)
//     // }
//
//     var filename = "HelloWorld";
//     // var interface = fs.readFileSync(file+'.json').toString();
//     // var bytecode = fs.readFileSync(file+'.abi').toString();
//
//     var MyContract =new web3.eth.contract(JSON.parse(interface));
//     console.log(MyContract.options);
//     MyContract.options.address='0x7d82De1C69106ae58ABc60332c328d8D66745Bd4';
//     // console.log(MyContract.options.jsonInterface);
//
//     // 如果你的账户是未锁定状态，可以将这里去掉
//     web3.eth.personal.unlockAccount(from,password,function (err,result) {
//         if (err){
//             console.log(err)
//         }
//         if (result){
//             // 只保留这些
//
//             MyContract.deploy({
//                 data:bytecode,
//             })
//                 .send({
//                     from: from,
//                     gas: 3000000,
//                     gasPrice: '1597262155',
//                     value:0
//                 },function (error,transactionHash) {
//                     if (error)
//                         console.log(error)
//                     console.log(transactionHash)
//                 })
//                 .on('error', function (error) {
//                     console.log(error)
//                 })
//                 .on('transactionHash',function (transactionHash) {
//                     console.log(transactionHash)
//                 })
//                 .on('receipt',function (receipt) {
//                     console.log(receipt)
//                 })
//                 .on("confirmation", function (confirmationNumber,receipt) {
//                     console.log(confirmationNumber)
//                     console.log(receipt)
//                 })
//                 .then(function(newContractInstance){
//                     console.log(newContractInstance.options.address) // instance with the new contract address
//                     // 将合约部署的地址保存到本地
//                     fs.writeFile(filename+'address.txt',newContractInstance.options.address,{},function (err,result) {
//                         if (err){
//                             console.log(err)
//                         }
//                         console.log('contract address write into contractAddress.txt');
//                     })
//                 });
//
//
//     MyContract.deploy({
//         data: bytecode
//     }).send({
//             from: from,
//             gas: 1500000,
//             gasPrice: '30000000000000'
//         },function (error,transactionHash) {
//             if (error)
//                 console.log(error)
//             console.log(transactionHash)
//         })
//         .on('error', function (error) {
//             console.log(error)
//         })
//         .on('transactionHash',function (transactionHash) {
//             console.log(transactionHash)
//         })
//         .on('receipt',function (receipt) {
//             console.log(receipt)
//         })
//         .on("confirmation", function (confirmationNumber,receipt) {
//             console.log(confirmationNumber)
//             console.log(receipt)
//         });
//
//
//         }
//     })
//
// }



