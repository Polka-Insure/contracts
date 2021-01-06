const BN = require('bignumber.js');
BN.config({ DECIMAL_PLACES: 0 })
BN.config({ ROUNDING_MODE: BN.ROUND_DOWN })
const PISToken = artifacts.require('PIS');
const { expectRevert, time } = require('@openzeppelin/test-helpers');
const { inTransaction } = require('@openzeppelin/test-helpers/src/expectEvent');
const PISVault = artifacts.require('PISVault');
const IERC20 = artifacts.require('IERC20');
const UniswapV2Pair = artifacts.require('UniswapV2Pair');
const UniswapV2Factory = artifacts.require('UniswapV2Factory');
const FeeCalculator = artifacts.require('FeeCalculator');
const UniswapV2Router02 = artifacts.require('UniswapV2Router02');
//const FarmETHRouter = artifacts.require('FarmETHRouter');
const e18 = new BN('1000000000000000000');
const testconfig = require('./testconfig');

function toWei(n) {
    return new BN(n).multipliedBy(e18).toFixed();
}

function bn(x) {
    return new BN(x);
}

const totalSupply = toWei('100000');
const initialETHLiquidity = toWei(80);
const initialMinted = new BN(totalSupply).multipliedBy(80).dividedBy(100).toFixed(0);
const DEV_FEE = 724;

contract('PIS Vault Test', (accounts) => {
    let [alice, privateSale, publicSale, liquidity, dev, superAdmin, clean1, clean2, clean3, clean4, clean5, clean6] = accounts.slice(0, 12);
    let dummyAccounts = accounts.slice(12);
    async function setPisVault(t) {
        t.pisvault = await PISVault.new({ from: alice });
        await t.pisvault.initialize(t.pis.address, { from: alice });
        await t.pis.setFeeDistributor(t.pisvault.address, { from: alice });
        await t.feeCalculator.setPISVaultAddress(t.pisvault.address, { from: alice });
        await t.feeCalculator.setFeeMultiplier(20, { from: alice });
        await t.feeCalculator.editNoFeeList(t.pisvault.address, true, { from: alice });

        await t.pis.transfer(clean1, '1000', { from: publicSale });
        let expectedFee = new BN(20 * 1000 / 1000).toFixed();    //2% fee
        assert.equal((await t.pisvault.pendingRewards()).valueOf().toString(), expectedFee);
        assert.equal((await t.pis.balanceOf(t.pisvault.address)), expectedFee);
    };

    beforeEach(async () => {
        await testconfig.readUniswap(this);

        await this.weth.deposit({ from: alice, value: toWei('1000') })
        this.pis = await PISToken.new(privateSale, publicSale, liquidity, dev, { from: alice });

        assert.equal(initialMinted, (await this.pis.balanceOf(this.pis.address)).valueOf().toString());

        this.feeCalculator = await FeeCalculator.new({ from: alice });
        await this.feeCalculator.initialize(this.pis.address, { from: alice });
        await this.feeCalculator.editNoFeeList(liquidity, true, { from: alice });

        await this.pis.setTransferChecker(this.feeCalculator.address, { from: alice });
        await this.feeCalculator.setPaused(false, { from: alice });
        await this.feeCalculator.setFeeMultiplier(0, { from: alice });

        await this.pis.unlockLiquidityFund({ from: liquidity });
        await expectRevert(this.pis.unlockLiquidityFund({ from: liquidity }), "already unlock");
        let expectedLiquidityAmount = bn(totalSupply).multipliedBy(30).dividedBy(100).toFixed(0);
        assert.equal(expectedLiquidityAmount, (await this.pis.balanceOf(liquidity)).valueOf().toString());

        await this.pis.unlockPublicSaleFund({ from: publicSale });
        await expectRevert(this.pis.unlockPublicSaleFund({ from: publicSale }), "already unlock");
        let expectedPublicSaleAmount = bn(totalSupply).multipliedBy(30).dividedBy(100).toFixed(0);
        assert.equal(expectedPublicSaleAmount, (await this.pis.balanceOf(publicSale)).valueOf().toString());

        await this.pis.approve(this.router.address, expectedLiquidityAmount, { from: liquidity });
        let currentTime = await time.latest();
        await this.router.addLiquidityETH(this.pis.address, expectedLiquidityAmount, expectedLiquidityAmount, 0, liquidity, bn(currentTime).plus(100).toFixed(0), { from: liquidity, value: initialETHLiquidity });
        this.pisWETHPair = await UniswapV2Pair.at(await this.factory.getPair(this.weth.address, this.pis.address));

        //unlock dev fund
        let devFundTotal = bn(totalSupply).multipliedBy(10).dividedBy(100).toFixed(0);
        let devFundPer2Weeks = bn(devFundTotal).dividedBy(6).toFixed(0);
        await this.pis.unlockDevFund({ from: dev });
        assert.equal(devFundPer2Weeks, (await this.pis.balanceOf(dev)).valueOf().toString());

        await time.increase(86400 * 7 * 2 + 1);
        await this.pis.unlockDevFund({ from: dev });
        assert.equal(new BN(devFundPer2Weeks).multipliedBy(2).toFixed(0), (await this.pis.balanceOf(dev)).valueOf().toString());

        await time.increase(86400 * 7 * 2 + 1);
        await this.pis.unlockDevFund({ from: dev });
        assert.equal(new BN(devFundPer2Weeks).multipliedBy(3).toFixed(0), (await this.pis.balanceOf(dev)).valueOf().toString());

        await time.increase(86400 * 7 * 2 + 1);
        await this.pis.unlockDevFund({ from: dev });
        assert.equal(new BN(devFundPer2Weeks).multipliedBy(4).toFixed(0), (await this.pis.balanceOf(dev)).valueOf().toString());

        await time.increase(86400 * 7 * 2 + 1);
        await this.pis.unlockDevFund({ from: dev });
        assert.equal(new BN(devFundPer2Weeks).multipliedBy(5).toFixed(0), (await this.pis.balanceOf(dev)).valueOf().toString());

        await time.increase(86400 * 7 * 2 + 1);
        await this.pis.unlockDevFund({ from: dev });
        assert.equal(devFundTotal, (await this.pis.balanceOf(dev)).valueOf().toString());

        await this.pis.transfer(clean1, '1000000000', { from: publicSale });
    });

    it('Unlock private sale', async () => {
        await time.increase(86400 * 7 * 4 + 1);
        await this.pis.unlockPrivateSaleFund({ from: privateSale });
        let privateSaleExpectedAmount = new BN(totalSupply).multipliedBy(10).dividedBy(100).toFixed(0);
        assert.equal(privateSaleExpectedAmount, (await this.pis.balanceOf(privateSale)).valueOf().toString());
    });

    it('PISVault should have pending fees set correctly and correct balance', async () => {
        //deploy vault
        await setPisVault(this);
    });

    it('Buy and sell token', async () => {
        this.pisvault = await PISVault.new({ from: alice });
        await this.pisvault.initialize(this.pis.address, { from: alice });
        await this.pis.setFeeDistributor(this.pisvault.address, { from: alice });
        await this.feeCalculator.setPISVaultAddress(this.pisvault.address, { from: alice });
        await this.feeCalculator.setFeeMultiplier(20, { from: alice });

        let balBefore = (await this.pis.balanceOf(clean2)).valueOf().toString();
        await this.router.swapExactETHForTokensSupportingFeeOnTransferTokens('1', [await this.router.WETH(), this.pis.address], clean2, 25999743005, { from: clean2, value: toWei('5') });
        let balAfter = (await this.pis.balanceOf(clean2)).valueOf().toString();
        let boughtAmount = new BN(balAfter).minus(new BN(balBefore)).toFixed(0);
        assert.notEqual('0', (await this.pisvault.pendingRewards()).valueOf().toString());
        let pendingRewards = (await this.pisvault.pendingRewards()).valueOf().toString();
        //approve
        let soldAmount = new BN(boughtAmount).dividedBy(2).toFixed();
        await this.pis.approve(this.router.address, boughtAmount, { from: clean2 });
        await this.router.swapExactTokensForETHSupportingFeeOnTransferTokens(soldAmount, 0, [this.pis.address, await this.router.WETH()], clean2, 25999743005, { from: clean2 });
        assert.equal(new BN(soldAmount).multipliedBy(2).dividedBy(100).plus(pendingRewards).toFixed(0), (await this.pisvault.pendingRewards()).valueOf().toString());
    });

    it('Releasable tokens with time lock and penalty is correctly computed', async () => {
        await setPisVault(this);

        assert.equal('0', (await this.pisvault.poolLength()).valueOf().toString())

        await this.pisvault.add(1000, this.pisWETHPair.address, true, { from: alice });
        assert.equal('1', (await this.pisvault.poolLength()).valueOf().toString())

        await this.router.swapExactETHForTokensSupportingFeeOnTransferTokens('1', [await this.router.WETH(), this.pis.address], clean2, 25999743005, { from: clean2, value: toWei('1') });
        await this.pis.approve(this.router.address, new BN('1e36').toFixed(0), { from: clean2 });
        let clean2PisBalance = (await this.pis.balanceOf(clean2)).valueOf().toString();
        await this.router.addLiquidityETH(this.pis.address, clean2PisBalance, 0, 0, clean2, 25999743005, { from: clean2, value: toWei(1) });
        let clean2LpBalance = (await this.pisWETHPair.balanceOf(clean2)).valueOf().toString();
        await this.pisWETHPair.approve(this.pisvault.address, clean2LpBalance, { from: clean2 });
        await this.pisvault.deposit(0, clean2LpBalance, { from: clean2 });
        assert.equal(clean2LpBalance, (await this.pisvault.userInfo(0, clean2)).valueOf().amount.toString());
        assert.equal(clean2LpBalance, (await this.pisvault.userInfo(0, clean2)).valueOf().referenceAmount.toString());
        let currentTime = await time.latest();
        assert.equal(new BN(currentTime).toFixed(0), (await this.pisvault.userInfo(0, clean2)).valueOf().depositTime.toString());

        assert.notEqual('0', (await this.pisvault.pendingRewards()).valueOf().toString());
        assert.equal((await this.pis.balanceOf(this.pisvault.address)).valueOf().toString(), (await this.pisvault.pendingRewards()).valueOf().toString());
        let devBalance = (await this.pis.balanceOf(dev)).valueOf().toString();
        await this.pisvault.massUpdatePools({ from: clean2 });
        clean2PisBalance = (await this.pis.balanceOf(clean2)).valueOf().toString();
        let pendingNerdClean2 = (await this.pisvault.pendingPIS(0, clean2)).valueOf().toString();
        await this.pisvault.withdraw(0, 0, { from: clean2 });

        assert.equal('0', (await this.pisvault.pendingRewards()).valueOf().toString());
        let lockedRewardClean2 = (await this.pisvault.userInfo(0, clean2)).valueOf().rewardLocked.toString();
        assert.notEqual('0', lockedRewardClean2);
        let clean2PisBalanceAfter = (await this.pis.balanceOf(clean2)).valueOf().toString();

        assert.notEqual(devBalance, (await this.pis.balanceOf(dev)).valueOf().toString());
        assert.equal(new BN(clean2PisBalanceAfter).minus(new BN(clean2PisBalance)).plus(lockedRewardClean2).toFixed(0), pendingNerdClean2);

        //add another pool PIS-DAI
        //buy some dai
        await this.router.swapExactETHForTokens('1', [testconfig.wethAddress, testconfig.daiAddress], clean3, 25999743005, { from: clean3, value: toWei('2') });
        //buy some pis
        await this.router.swapExactETHForTokensSupportingFeeOnTransferTokens('1', [await this.router.WETH(), this.pis.address], clean3, 25999743005, { from: clean3, value: toWei('2') });
        await this.pis.approve(this.router.address, new BN('1e36').toFixed(0), { from: clean3 });
        await this.dai.approve(this.router.address, new BN('1e36').toFixed(0), { from: clean3 });
        let clean3PisBalance = (await this.pis.balanceOf(clean3)).valueOf().toString();
        let clean3DaiBalance = (await this.dai.balanceOf(clean3)).valueOf().toString();
        await this.router.addLiquidity(this.pis.address, testconfig.daiAddress, clean3PisBalance, clean3DaiBalance, 0, 0, clean3, 25999743005, { from: clean3 });
        this.pisDAIPair = await UniswapV2Pair.at(await this.factory.getPair(testconfig.daiAddress, this.pis.address));
        let clean3LpBalance = (await this.pisDAIPair.balanceOf(clean3)).valueOf().toString();
        await this.pisDAIPair.approve(this.pisvault.address, clean3LpBalance, { from: clean3 });
        await this.pisvault.add(1000, this.pisDAIPair.address, true, { from: alice });
        assert.equal('2', (await this.pisvault.poolLength()).valueOf().toString())
        await this.pisvault.deposit(1, clean3LpBalance, { from: clean3 });

        await this.router.swapExactETHForTokensSupportingFeeOnTransferTokens('1', [await this.router.WETH(), this.pis.address], clean2, 25999743005, { from: clean2, value: toWei('1') });

        assert.notEqual('0', (await this.pisvault.pendingRewards()).valueOf().toString());

        pendingNerdClean2 = (await this.pisvault.pendingPIS(0, clean2)).valueOf().toString();
        let pendingNerdClean3 = (await this.pisvault.pendingPIS(1, clean3)).valueOf().toString();
        await this.pisvault.deposit(1, 0, { from: clean3 });
        assert.equal('0', (await this.pisvault.pendingPIS(1, clean3)).valueOf().toString());
        let lockedRewardClean3 = (await this.pisvault.userInfo(1, clean3)).valueOf().rewardLocked.toString();
        let expectedLocked = new BN(pendingNerdClean3).minus(new BN(pendingNerdClean3).multipliedBy(40).dividedBy(100)).toFixed(0);
        assert.equal(lockedRewardClean3, expectedLocked);

        let initialLP = '1000000000';
        for (var i = 0; i < 10; i++) {
            let lpAmount = new BN(initialLP).multipliedBy(i + 1).toFixed(0);
            let dummyAccount = dummyAccounts[i];
            await this.router.swapExactETHForTokensSupportingFeeOnTransferTokens('1', [await this.router.WETH(), this.pis.address], dummyAccount, 25999743005, { from: dummyAccount, value: toWei('0.01') });
            await this.pis.approve(this.router.address, new BN('1e36').toFixed(0), { from: dummyAccount });
            let dummyAccountPisBalance = (await this.pis.balanceOf(dummyAccount)).valueOf().toString();
            await this.router.addLiquidityETH(this.pis.address, dummyAccountPisBalance, 0, 0, dummyAccount, 25999743005, { from: dummyAccount, value: toWei(0.01) });
            //let dummyAccountLpBalance = (await this.pisWETHPair.balanceOf(dummyAccount)).valueOf().toString();
            await this.pisWETHPair.approve(this.pisvault.address, lpAmount, { from: dummyAccount });
            await this.pisvault.deposit(0, lpAmount, { from: dummyAccount });

            //add another pool PIS-DAI
            //buy some dai
            await this.router.swapExactETHForTokens('1', [testconfig.wethAddress, testconfig.daiAddress], dummyAccount, 25999743005, { from: dummyAccount, value: toWei('0.01') });
            //buy some pis
            await this.router.swapExactETHForTokensSupportingFeeOnTransferTokens('1', [await this.router.WETH(), this.pis.address], dummyAccount, 25999743005, { from: dummyAccount, value: toWei('0.01') });
            await this.pis.approve(this.router.address, new BN('1e36').toFixed(0), { from: dummyAccount });
            await this.dai.approve(this.router.address, new BN('1e36').toFixed(0), { from: dummyAccount });
            dummyAccountPisBalance = (await this.pis.balanceOf(dummyAccount)).valueOf().toString();
            let dummyAccountDaiBalance = (await this.dai.balanceOf(dummyAccount)).valueOf().toString();
            await this.router.addLiquidity(this.pis.address, testconfig.daiAddress, dummyAccountPisBalance, dummyAccountDaiBalance, 0, 0, dummyAccount, 25999743005, { from: dummyAccount });
            //dummpAccountLpBalance = (await this.pisDAIPair.balanceOf(dummyAccount)).valueOf().toString();
            await this.pisDAIPair.approve(this.pisvault.address, lpAmount, { from: dummyAccount });
            await this.pisvault.deposit(1, lpAmount, { from: dummyAccount });
        }

        for (var i = 0; i < 10; i++) {
            let dummyAccount = dummyAccounts[i];
            await this.pisvault.deposit(0, 0, { from: dummyAccount });
            await this.pisvault.deposit(1, 0, { from: dummyAccount });
            assert.equal('0', (await this.pisvault.pendingPIS(0, dummyAccount)).valueOf().toString());
            assert.equal('0', (await this.pisvault.pendingPIS(1, dummyAccount)).valueOf().toString());
        }
        await this.router.swapExactETHForTokensSupportingFeeOnTransferTokens('1', [await this.router.WETH(), this.pis.address], dummyAccounts[0], 25999743005, { from: dummyAccounts[0], value: toWei('0.01') });
        let dummy00 = (await this.pisvault.pendingPIS(0, dummyAccounts[0])).valueOf().toString();
        let dummy01 = (await this.pisvault.pendingPIS(1, dummyAccounts[0])).valueOf().toString();
        for (var i = 0; i < 10; i++) {
            let dummyAccount0 = (await this.pisvault.pendingPIS(0, dummyAccounts[i])).valueOf().toString();
            let dummyAccount1 = (await this.pisvault.pendingPIS(1, dummyAccounts[i])).valueOf().toString();
            //assert.equal(true, new BN(dummy00).multipliedBy(i + 1).toFixed(0) == dummyAccount0 || new BN(dummy00).multipliedBy(i + 1).toFixed(0) == new BN(dummyAccount0).plus(1).toFixed(0));
            //assert.equal(true, new BN(dummy01).multipliedBy(i + 1).toFixed(0) == dummyAccount1 || new BN(dummy01).multipliedBy(i + 1).toFixed(0) == new BN(dummyAccount1).plus(1).toFixed(0));
        }
        for (var i = 0; i < 10; i++) {
            let dummyAccount = dummyAccounts[i];
            await this.pisvault.deposit(0, 0, { from: dummyAccount });
            await this.pisvault.deposit(1, 0, { from: dummyAccount });
            assert.equal('0', (await this.pisvault.pendingPIS(0, dummyAccount)).valueOf().toString());
            assert.equal('0', (await this.pisvault.pendingPIS(1, dummyAccount)).valueOf().toString());
        }

        await this.pisvault.deposit(0, 0, { from: clean2 });
        await this.pisvault.deposit(1, 0, { from: clean2 });
        await this.pisvault.deposit(0, 0, { from: clean3 });
        await this.pisvault.deposit(1, 0, { from: clean3 });

        for (var i = 0; i < 10; i++) {
            let dummyAccount = dummyAccounts[i];
            await expectRevert(this.pisvault.withdraw(0, 1, { from: dummyAccount }), "withdraw: not good");
            await expectRevert(this.pisvault.withdraw(1, 1, { from: dummyAccount }), "withdraw: not good");
        }

        for (var i = 0; i < 10; i++) {
            let dummyAccount = dummyAccounts[i];
            await expectRevert(this.pisvault.quitPool(0, { from: dummyAccount }), "cannot withdraw all lp tokens before");
            await expectRevert(this.pisvault.quitPool(1, { from: dummyAccount }), "cannot withdraw all lp tokens before");
        }

        await time.increase(86400 * 14);
        let weeks = (await this.pisvault.weeksSinceLPReleaseTilNow(0, dummyAccounts[0])).valueOf().toString();

        for (var i = 0; i < 10; i++) {
            let dummyAccount = dummyAccounts[i];
            let w0 = (await this.pisvault.computeReleasableLP(0, dummyAccount)).valueOf().toString();
            let w1 = (await this.pisvault.computeReleasableLP(1, dummyAccount)).valueOf().toString();
            assert.notEqual('0', w0);
            assert.notEqual('0', w1);
            await this.pisvault.withdraw(0, w0, { from: dummyAccount });
            await this.pisvault.withdraw(1, w0, { from: dummyAccount });
        }

        await time.increase(86400 * 7);

        for (var i = 0; i < 10; i++) {
            let dummyAccount = dummyAccounts[i];
            let w0 = (await this.pisvault.computeReleasableLP(0, dummyAccount)).valueOf().toString();
            let w1 = (await this.pisvault.computeReleasableLP(1, dummyAccount)).valueOf().toString();
            assert.notEqual('0', w0);
            assert.notEqual('0', w1);
            await this.pisvault.withdraw(0, w0, { from: dummyAccount });
            await this.pisvault.withdraw(1, w0, { from: dummyAccount });
        }

        await time.increase(86400 * 7);

        for (var i = 0; i < 10; i++) {
            let dummyAccount = dummyAccounts[i];
            let w0 = (await this.pisvault.computeReleasableLP(0, dummyAccount)).valueOf().toString();
            let w1 = (await this.pisvault.computeReleasableLP(1, dummyAccount)).valueOf().toString();
            assert.notEqual('0', w0);
            assert.notEqual('0', w1);
            await this.pisvault.withdraw(0, w0, { from: dummyAccount });
            await this.pisvault.withdraw(1, w0, { from: dummyAccount });
        }

        await time.increase(86400 * 7);

        for (var i = 0; i < 10; i++) {
            let dummyAccount = dummyAccounts[i];
            let w0 = (await this.pisvault.computeReleasableLP(0, dummyAccount)).valueOf().toString();
            let w1 = (await this.pisvault.computeReleasableLP(1, dummyAccount)).valueOf().toString();
            assert.notEqual('0', w0);
            assert.notEqual('0', w1);
            await this.pisvault.withdraw(0, w0, { from: dummyAccount });
            await this.pisvault.withdraw(1, w0, { from: dummyAccount });
        }

        for (var i = 0; i < 10; i++) {
            let dummyAccount = dummyAccounts[i];
            await this.pisvault.quitPool(0, { from: dummyAccount });
            await this.pisvault.quitPool(1, { from: dummyAccount });
        }

        await this.pisvault.quitPool(0, { from: clean2 });
        await this.pisvault.quitPool(1, { from: clean2 });

        await this.pisvault.quitPool(0, { from: clean3 });
        await this.pisvault.quitPool(1, { from: clean3 });
    });
});