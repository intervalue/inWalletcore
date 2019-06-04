const WebSocket = process.browser ? global.WebSocket : require('ws');
const constants = require('./constants');
const objectHash = require('./object_hash.js');
const eventBus = require('./event_bus.js');
const wsServer = require('./constants').wsUrl;
var ws;
var isconnect = false;
var address;
if (process.browser) {
    // browser
    console.log("defining .on() on ws");
    WebSocket.prototype.on = function (event, callback) {
        var self = this;
        if (event === 'message') {
            this['on' + event] = function (event) {
                callback.call(self, event.data);
            };
            return;
        }
        if (event !== 'open') {
            this['on' + event] = callback;
            return;
        }
        // allow several handlers for 'open' event
        if (!this['open_handlers']) this['open_handlers'] = [];
        this['open_handlers'].push(callback);
        this['on' + event] = function () {
            self['open_handlers'].forEach(function (cb) {
                cb();
            });
        };
    };
    WebSocket.prototype.once = WebSocket.prototype.on;
    WebSocket.prototype.setMaxListeners = function () {};
}
function startWebSocket(url) {
    //var  wsServer = url;  //连接地址
    ws = new WebSocket(wsServer);   //建立连接
    ws.onopen = function (evt) { onOpen(evt) };  //4个事件
    ws.onclose = function (evt) { onClose(evt) };
    ws.onmessage = function (evt) { onMessage(evt) };
    ws.onerror = function (evt) { onError(evt) };
    function onOpen(evt) {
        isconnect = true;
        console.log("Connected to WebSocket server.");
    }
    function onClose(evt) {
        isconnect = false;
        console.log("Disconnected");
        //heartCheck(wsServer);
    }
    function onMessage(evt) {
        //console.log(evt)
        // console.log('Retrieved data from server: ' + evt.data);
    }
    function onError(evt) {
        console.log('Error occured: ' + evt.data);
    }
    ws.on('message', onWebsocketMessage);

}

startWebSocket(constants.wsUrl);

/**
 * 发送消息
 * @param data
 */
function sendMessage(data){
    let jsonObj = JSON.stringify(data);
    //console.log(`sendMessage: ${jsonObj}`);
    if(isconnect) {
        ws.send(jsonObj);
    }
    else {
        console.log('startWebSocket');
        startWebSocket();
    }
}

/**
 * 接收回来的信息
 *
 * @param message
 */
var count = 0
function onWebsocketMessage(message) {
    //console.log(ws.onopen)
    message = JSON.parse(message);
    switch (message.comm) {
        case "pong":
            if(message.loginstat =="false"){
                console.log(`register again,timeStamp: ${Date.now()}`);
                register(address);
            }else {
                console.log(` coming connections, timeStamp: ${Date.now()} `);
            }
            break;
        case "pay":
            console.log(`pay  ${JSON.stringify(message)}`);
            eventBus.emit('payMessage',message);
            break;
        case "login":
            console.log(`login success`);
            break;
        default:
            console.log(`unknown type: ${message.comm}`);

    }
}

/**
 * websocket首次连接注册
 */
function register(addr) {
    address = addr
    // let wallet = require('./wallet');
    // let pubkey =  wallet.findFirstAddress(function (res) {
    //     return res.definition[1].pubkey;
    // });
    let obj = {
        comm:"login",
        walletaddress:address,
        ctime: Math.round(Date.now()).toString()
    }
    sendMessage(obj);

}

/**
 * 心跳
 *
 */
function heartCheck() {
    if(address){
        let obj = {
            comm:"ping",
            walletaddress:address,
            ctime: Math.round(Date.now()).toString()
        }
        sendMessage(obj);
    }
}

setInterval(heartCheck,10 * 1000);


module.exports ={
    startWebSocket: startWebSocket,
    sendMessage: sendMessage,
    register: register
}











