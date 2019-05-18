"use strict"

class Wallet{
    constructor(type, network, segwit, name){
        this.type = type;
        this.network = network;
        this.segwit = segwit;
        this.name = name;

        return this;
    }

    toString(){
        return this.name + this.type;
    }
}

module.exports = Wallet;
