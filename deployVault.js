require('dotenv').config();
const PIS = require("./build/contracts/PIS.json");
const PISVault = require("./build/contracts/PISVault.json");
const FeeCalculator = require("./build/contracts/FeeCalculator.json");
const getConfig = require("./getConfig");
const Web3 = require("web3");
const UniswapFactory = require("./build/contracts/UniswapV2Factory.json");

let nerdAddress = process.argv[2];
console.log('nerd:', nerdAddress)

const provider = getConfig.getProvider();

const web3 = new Web3(provider);

const gasPrice = '45000000000';

const deploy = async () => {
    console.log()
    const accounts = await web3.eth.getAccounts();
    const mainAccount = accounts[0];

    console.log("Attempting to deploy from account: ", accounts[0]);
    let pisContract = await new web3.eth.Contract(PIS.abi, "0x834ce7ad163ab3be0c5fd4e0a81e67ac8f51e00c");
    let feeCalculatorContract = await new web3.eth.Contract(FeeCalculator.abi, "0x9d5B8cadA11111EDC57c7455D8027d18c0cbCc58");

    await feeCalculatorContract.methods.setPaused(true).send({ gas: "1000000", from: mainAccount, gasPrice: gasPrice });

    const pisVaultContract = await new web3.eth.Contract(PISVault.abi)
        .deploy({ data: PISVault.bytecode })
        .send({ gas: "3000000", from: mainAccount, gasPrice: gasPrice });
    console.log("Contract PISVault deployed to: ", pisVaultContract.options.address);
    await pisVaultContract.methods.initialize(pisContract.options.address).send({ gas: "1000000", from: mainAccount, gasPrice: gasPrice });
    console.log("initialize pis vault");
    await feeCalculatorContract.methods.setPISVaultAddress(pisVaultContract.options.address).send({ gas: "1000000", from: mainAccount, gasPrice: gasPrice });
    console.log("set pis vault address");

    await pisContract.methods.setFeeDistributor(pisVaultContract.options.address).send({ gas: "1000000", from: mainAccount, gasPrice: gasPrice });

    await feeCalculatorContract.methods.setFeeMultiplier(20).send({ gas: "1000000", from: mainAccount, gasPrice: gasPrice });
    await feeCalculatorContract.methods.editNoFeeList(pisVaultContract.options.address, true).send({ gas: "1000000", from: mainAccount, gasPrice: gasPrice });

    //add PIS-ETH pool


    let factoryContract = await new web3.eth.Contract(UniswapFactory.abi, "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f");
    let pairAddress = await factoryContract.methods.getPair(pisContract.options.address, "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2").call();

    await pisVaultContract.methods.add('1000', pairAddress, true).send({ gas: "1000000", from: mainAccount, gasPrice: gasPrice });
    console.log('added pool');
    await feeCalculatorContract.methods.setPaused(false).send({ from: mainAccount, gasPrice: gasPrice });
    //This will display the address to which your contract was deployed
    console.log("Finish");
};
deploy();