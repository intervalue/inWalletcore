多链整合使用说明
===
1.BTC
----

    先启动btc rpc服务
        $ sudo docker pull freewil/bitcoin-testnet-box`
        $ sudo docker run -t -i -p 19001:19001 -p 19011:19011 freewil/bitcoin-testnet-box`
        $ make start
        
        
    然后通过调用
        make generate BLOCKS=200  -- 生成块以给系统的账号产生挖矿收益
        make sendfrom1 ADDRESS=mkiytxYA6kxUC8iTnzLPgMfCphnz91zRfZ AMOUNT=10 --给你的账号转10BTC测试
        make generate BLOCKs = 10 -- 产生块来确认交易
        
        -- 进入测试模块 调用测试查看刚刚的交易和发起交易 ../test/test.js
        cd test
        mocha 
        
        -- 注意事项
        交易需要六个块确认才能使用
        docker容器会保存文件，会导致获取余额和未消费的utxo的不一致重启docker即可
        所有的查询都是必须在importPrivateKey之后调用才有数据
        
        调用通过wallet_bean对象生成的实例去调用
        
    V2.0 修改rpc的调用方式 
    
    下载一个bitcore客户端 相当于创建一个全节点 https://bitcoin.org/zh_CN/download
    修改配置文件  ~/.bitcoin/bitcoin.conf 把配置改成自己的就可以
    
     listen=1
     testnet=1
     txindex=1
     daemon=1
     rpcuser=test
     rpcpassword=test
     rpcclienttimeout=60
     server=1
     rpcport=18332
     
    然后启动节点
       测试环境的节点 ./bitcoin-qt -testnet -server
    
    
        
2.ETH
-----