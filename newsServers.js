/*jslint node: true */
"use strict";

let webHelper = require("./webhelper");

//行情接口coindog
let coindog = "api.coindog.com";
//所有行情
let currencysUrl1 = "/api/v1/currency/ranks";
//单个行情
let tickUrl = "/api/v1/tick/";

//huobi接口
let huobi = "api.huobipro.com";
//所有行情
let currencysUrl2 = "/market/tickers";

//Fcoin 接口
let fcoin = 'api.fcoin.com';

//schail接口
let schail = 'api.schail.com'
//行情
let inveCurrencyUrl = "/v2/market/ticker/";
let schailinveCurrencyUrl = "/v1/ticker/summary/detail/?id=intervalue";

//coinex接口
let coinex = "api.coinex.com";
//所有行情
let currencysUrl3 = "/v1/market/ticker/all";

//*************************************************************************
//linker接口
let link = 'openapi.chainfin.online';
// let link            = 'test.inve.zhang123.vip';

//流通量
let Liquidity = "/openapi/v2/content/intervaluetotal/list/331"
//最新新闻
let newsDataUrl = "/openapi/v2/content/article/list";
//新闻详情
let newsInfoUrl = "/openapi/v2/content/article/info/";
//快讯
let quickdataUrl = "/openapi/v2/content/dataquick/list";
//所有行情
let currencysLink = "/openapi/v2/dcmarket/hq/list";
//inve行情
let currencyInve = "/linker/content/api/inve";

let https = null;

/**----------------------------------------------------------------------*/

/**美元汇率*/
let rate = 6.9645;
/**美元显示规则*/
let k = 1000; //千
let m = 1000000; //百万
let b = 1000000000; //十亿
let t = 1000000000000; //万亿
/**软妹币显示规则*/
let wan = 10000;
let yi = 100000000;

// setTimeout(function () {
//     getRateUSD();
// });

/**
 * 增加：实时获取USD汇率
 */
// function getRateUSD() {
//     let url = 'www.zhaotool.com';
//     let link = '/v1/api/huobi/e10adc3949ba59abbe56e057f20f883e/CNY/USD';
//     webHelper.httpGet(getUrl(url, link), null, function (err, res) {
//         if (err) {
//             console.log("error:" + err);
//             cb(null);
//             return;
//         }
//         res = JSON.parse(res);
//         rate = res.data.rate;
//     });
// }

/**
 *  获取 指定交易所 指定交易对儿 行情信息
 *  FCOIN:ETHUSDT?unit=cny
 * @param exchange 交易所
 * @param symbol 交易对儿 例如：BITFINEX:BTCUSD HUOBIPRO:BTCUSDT
 * @param unit : 转换价格，默认 CNY (人民币)，可选：base（原价格） usd (美元)
 * @param cb
 */
function getSymbolData(exchange, symbol, unit, cb) {
    let ticker = exchange.toUpperCase() + ":" + symbol.toUpperCase();
    let subrul = tickUrl + ticker + (unit == null ? "" : "?unit=" + unit);
    webHelper.httpGet(getUrl(coindog, subrul), null, cb);
}

/**
 * 获取行情信息
 * @param cb
 */
function getCurrencyData(limit, page, fields, cb) {

    let subrul = currencysLink;
    webHelper.httpGet(getUrl(link, subrul, https), null, function (err, res) {
        if (err) {
            console.log("error:" + err);
            cb(null);
            return;
        }
        res = JSON.parse(res);
        if (!!res && res.code == 0) {
            // console.log(res);
            let list = res.list;

            for (let i in list) {
                list[i].values = list[i].value;
                //处理value
                let value = list[i].value;
                let x = value / b;
                let unit = "b";
                if (x < 1) {
                    x = value / m;
                    unit = "m";
                }
                list[i].value = x.toFixed(2);
                list[i].unit = unit;

                //处理cnyValue
                let cnyValue = value * rate;
                let cnyUnit = "亿";
                let y = cnyValue / yi;
                if (y < 0) {
                    y = cnyValue / wan;
                    cnyUnit = "万";
                }
                list[i].cnyValue = y.toFixed(2);
                list[i].cnyUnit = cnyUnit;

                //处理cnyPrice
                let price = list[i].price;
                list[i].cnyPrice = price * rate;

                //处理涨幅 qupteChange

            }

            //行情数据 价格(默认美刀) 涨幅 人民币 市值
            let data = {
                totalPages: list.length,
                page: {
                    list
                }
            };

            cb(data);
        } else {
            cb(false);
        }
    });
}

/*function getInveData(cb) {
    //计算人民币
    getSymbolData("fcoin", 'ethusdt', "cny", function (err, res) {
        res = JSON.parse(res);
        if (res != null) {
            getSymbolData("fcoin", 'ethusdt', "usdt", function (err2, res2) {
                res2 = JSON.parse(res2);
                //汇率
                var rate = res.close / res2.close;
                alert(rate);
                let suburul = inveCurrencyUrl + "inveusdt";
                webHelper.httpGet(getUrl(fcoin, suburul), null, function (err3, res3) {
                    res3 = JSON.parse(res3);
                    if (res3.status == 0) {
                        //最新成交价 usdt
                        var newPrice = res3.data.ticker[0];
                        //最新成交价 cny
                        var cnyPrice = newPrice * rate;
                        var oldPrice = res3.data.ticker[6];

                        //涨幅
                        var market = (newPrice - oldPrice) / oldPrice;

                        var data = { newPrice, cnyPrice, oldPrice, market };
                        cb(data);
                    }
                });
            });
        } else {
            console.log("connection error ~!");
        }
    });
}*/

function getInveData2(cb) {

    let suburul = inveCurrencyUrl + "inveusdt";
    // let suburul = currencyInve;
    //美刀汇率

    //webHelper.httpGet(getUrl(fcoin, suburul, "https"), null, function (err, res) {
    // webHelper.httpGet(getUrl(schail, schailinveCurrencyUrl, "https"), null, function (err, res) {
    //     if (err) {
    //         console.log("error:" + err);
    //         cb(null);
    //         return;
    //     }
    webHelper.httpGet(getUrl(link, Liquidity, null), null, function (err1, res) {
        if (err1) {
            console.log("error:" + err1);
            cb(null);
            return;
        }
        res = JSON.parse(res);
        //if (!!res && res.status == 0) {
        if (!!res && res.code == 0) {
            //最新成交价 usdt
            var newPrice = res.data.detail.price;
            //最新成交价 cny
            var cnyPrice = newPrice * res.data.rate;

            //实时获取US汇率
            rate = res.data.rate;
            //流通值量
            let marketValues = res.data.inveTotal;
            var value = marketValues * newPrice;

            //处理value
            let x = value / b;
            let unit = "b";
            if (x < 1) {
                x = value / m;
                unit = "m";
            }
            value = x.toFixed(2);

            //处理cnyValue
            var cnyValue = marketValues * cnyPrice;
            let cnyUnit = "亿";
            let y = cnyValue / yi;
            if (y < 0) {
                y = cnyValue / wan;
                cnyUnit = "万";
            }
            cnyValue = y.toFixed(2);

            //涨幅
            //var market = (newPrice - oldPrice) / oldPrice * 100;
            var market = res.data.detail.change24h;

            var list = { INVE: { unit: unit, cnyUnit: cnyUnit, name: "INVE", price: newPrice, quoteChange: market, cnyPrice: cnyPrice, volume: "-", value: value, cnyValue: cnyValue, quantity: "-", cName: 'INVE币', time_stamp: "-", source: "www.fcoin.com" } };
            let data = {
                totalPages: 1,
                page: { //name:名称 price:价格 quote_change:涨跌幅 volume:交易量 quantity:流通数量 value:流通市值 time_stamp:时间戳(10位int保存) source:来源网站
                    list
                }
            };

            cb(data);
        } else {
            cb(false);
        }
    })

    //---------

    //-----------
    // });
}

/**
 * 获取新闻信息
 * @param limit 每页条数
 * @param page 页码
 * @param status 状态   状态:0置顶 1待审核 2审核通过 3审核未通过 4草稿
 * @param cb
 */
function getNewsData(limit, page, status, cb) {
    limit = limit == null ? 20 : limit;
    page = page == null ? 1 : page;
    status = status == null ? 2 : status;
    let subrul = newsDataUrl + "?" + "limit=" + limit + "&page=" + page + "&status=" + status;
    webHelper.httpGet(getUrl(link, subrul, https), null, function (err, res) {
        if (err) {
            console.log("error:" + err);
            cb(null);
            return;
        }
        res = JSON.parse(res);
        if (!!res && res.code == 0) {
            cb(res);
        } else {
            cb(false);
        }
    });
}

/**
 * 文章的id
 * @param id
 * @param cb
 */
function getNewsInfo(id, cb) {
    let suburl = newsInfoUrl + id;
    webHelper.httpGet(getUrl(link, suburl, https), null, function (err, res) {
        if (err) {
            console.log("error:" + err);
            cb(null);
            return;
        }
        res = JSON.parse(res);
        if (!!res && res.code == 0) {
            // var content = res.article.content;
            // var reg     = /style=\".*?\"/;
            // content     = content.replace(reg,"");
            cb(res);
        } else {
            cb(false);
        }
    });
}

/**
 * 快讯接口
 * @param limit 内容数
 * @param sidx 排序字段
 * @param order 排序顺序
 * @param cb
 */
function getQuickData(limit, page, sidx, order, cb) {
    limit = limit == null ? 20 : limit;
    sidx = sidx == null ? "createTime" : sidx;
    order = order == null ? "desc" : order;
    page = page == null ? 1 : page;
    let suburl = quickdataUrl + "?" + "limit=" + limit + "&sidx=" + sidx + "&order=" + order + "&page=" + page;
    webHelper.httpGet(getUrl(link, suburl, https), null, function (err, res) {
        if (err) {
            console.log("error:" + err);
            cb(null);
            return;
        }
        res = JSON.parse(res);
        if (!!res && res.code == 0) {
            cb(res);
        } else {
            cb(false);
        }
    });
}

//组装url
function getUrl(url, suburl, https) {
    return (!https ? 'http://' : "https://") + url + suburl;
}

exports.getCurrencyData = getCurrencyData;
exports.getNewsData = getNewsData;
exports.getNewsInfo = getNewsInfo;
exports.getQuickData = getQuickData;
exports.getSymbolData = getSymbolData;
//exports.getInveData = getInveData;
exports.getInveData2 = getInveData2;
exports.getRate = function () {
    return rate;
};