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

contract('PIS Vault Test', ([alice, privateSale, publicSale, liquidity, dev, superAdmin, clean1, clean2, clean3, clean4, clean5, clean6]) => {
    beforeEach(async () => {
        await testconfig.readUniswap(this);

        await this.weth.deposit({ from: alice, value: toWei('1000') })
        this.pis = await PISToken.new(privateSale, publicSale, liquidity, dev, { from: alice });

        assert.equal(initialMinted, (await this.pis.balanceOf(this.pis.address)).valueOf().toString());
        let liquidityAmount = (await this.pis.lockedTokens(liquidity)).valueOf().amount.toString();

        this.feeCalculator = await FeeCalculator.new({ from: alice });
        await this.feeCalculator.initialize(this.pis.address, { from: alice });
        await this.feeCalculator.editNoFeeList(liquidity, true, { from: alice });

        await this.pis.setTransferChecker(this.feeCalculator.address, { from: alice });
        await this.feeCalculator.setPaused(false, { from: alice });
        await this.feeCalculator.setFeeMultiplier(0, { from: alice });

        await this.pis.unlockLockedFund(liquidity, { from: liquidity });
        await expectRevert(this.pis.unlockLockedFund(liquidity, { from: liquidity }), "already unlock");
        let expectedLiquidityAmount = bn(totalSupply).multipliedBy(30).dividedBy(100).toFixed(0);
        assert.equal(expectedLiquidityAmount, (await this.pis.balanceOf(liquidity)).valueOf().toString());

        await this.pis.unlockLockedFund(publicSale, { from: publicSale });
        await expectRevert(this.pis.unlockLockedFund(publicSale, { from: publicSale }), "already unlock");
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

    it('PISVault should have pending fees set correctly and correct balance', async () => {
        //deploy vault
        this.pisvault = await PISVault.new({ from: alice });
        await this.pisvault.initialize(this.pis.address, superAdmin, { from: alice });
        await this.pis.setFeeDistributor(this.pisvault.address, { from: alice });
        await this.feeCalculator.setPISVaultAddress(this.pisvault.address, { from: alice });
        await this.feeCalculator.setFeeMultiplier(20, { from: alice });

        await this.pis.transfer(clean1, '1000', { from: publicSale });
        let expectedFee = new BN(20 * 1000 / 1000).toFixed();    //2% fee
        assert.equal((await this.pisvault.pendingRewards()).valueOf().toString(), expectedFee);
        assert.equal((await this.pis.balanceOf(this.pisvault.address)), expectedFee);
    });

    it('Allows you to get fee multiplier and doesn`t allow non owner to call', async () => {
        assert.equal((await this.feeCalculator.feePercentX100()).valueOf().toString(), '0',);
        await expectRevert(this.feeCalculator.setFeeMultiplier('20', { from: clean4 }), 'Ownable: caller is not the owner');
        await this.feeCalculator.setFeeMultiplier('20', { from: alice });
        assert.equal((await this.feeCalculator.feePercentX100()).valueOf().toString(), '20');
    });

    it('allows to transfer to contracts and people', async () => {
        await this.pis.transfer(this.pis.address, '100', { from: publicSale }); //contract
        await this.pis.transfer(clean4, '100', { from: publicSale });
        assert.equal((await this.pis.balanceOf(clean4)), '100');
    });

    it('Buy and sell token', async () => {
        this.pisvault = await PISVault.new({ from: alice });
        await this.pisvault.initialize(this.pis.address, superAdmin, { from: alice });
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
});