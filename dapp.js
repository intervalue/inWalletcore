const webHelper = require("./webhelper.js");
const constants = require('./constants');

class Dapp {
    static getDappList(cb) {
        let dappUrl = constants.dappUrl;
        try{
            webHelper.httpPost(dappUrl, null, null, function (err, res) {
                if(err) {
                    return cb(err,null);
                }
                res = JSON.parse(res);
                if(res.code == 0){
                    cb(null,JSON.parse(res.result))
                }else {
                    cb(res.msg, null);
                }
            });
        }catch (e) {
            cb(e.toString(), null);
        }
    }
}

module.exports = Dapp;