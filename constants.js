/*jslint node: true */
"use strict";

exports.COUNT_WITNESSES = 3;
exports.MAX_WITNESS_LIST_MUTATIONS = 1;
exports.TOTAL_WHITEBYTES = 77e14;
exports.MAJORITY_OF_WITNESSES = (exports.COUNT_WITNESSES%2===0) ? (exports.COUNT_WITNESSES/2+1) : Math.ceil(exports.COUNT_WITNESSES/2);
exports.COUNT_MC_BALLS_FOR_PAID_WITNESSING = 100;
exports.version = '1.0';
exports.alt = '2';
exports.GENESIS_UNIT = '+FCgcJOI0EfjOltXHi5WGD5NHesL8odNLqM/BD7uraE=';
exports.BLACKBYTES_ASSET = 'I3dylsRqSdOUp2IbmQILW+G9i5xhg6voI7yKTW3IPgc=';

exports.HASH_LENGTH = 44;
exports.PUBKEY_LENGTH = 44;
exports.SIG_LENGTH = 90;

// anti-spam limits
exports.MAX_AUTHORS_PER_UNIT = 16;
exports.MAX_PARENTS_PER_UNIT = 16;
exports.MAX_MESSAGES_PER_UNIT = 128;
exports.MAX_SPEND_PROOFS_PER_MESSAGE = 128;
exports.MAX_INPUTS_PER_PAYMENT_MESSAGE = 128;
exports.MAX_OUTPUTS_PER_PAYMENT_MESSAGE = 128;
exports.MAX_CHOICES_PER_POLL = 128;
exports.MAX_DENOMINATIONS_PER_ASSET_DEFINITION = 64;
exports.MAX_ATTESTORS_PER_ASSET = 64;
exports.MAX_DATA_FEED_NAME_LENGTH = 64;
exports.MAX_DATA_FEED_VALUE_LENGTH = 64;
exports.MAX_AUTHENTIFIER_LENGTH = 4096;
exports.MAX_CAP = 9e15;
exports.MAX_COMPLEXITY = 100;

//交易数据结构版本
exports.transationVersion = '2.0';

//基础手续费
exports.NRG_PEER_KBYTE = 100000000;
exports.BASE_NRG = 500000;
exports.INVE_VALUE = 1000000000000000000;
