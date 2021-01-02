// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "@openzeppelin/contracts/GSN/Context.sol";
import "./IPISBaseToken.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "./IFeeCalculator.sol";
import "./IPISVault.sol";
import "@nomiclabs/buidler/console.sol";

import "@openzeppelin/contracts/token/ERC20/IERC20.sol"; // for WETH

import "@openzeppelin/contracts/access/Ownable.sol";

contract PIS is Context, IPISBaseTokenEx, Ownable {
    using SafeMath for uint256;
    using Address for address;

    struct LockedToken {
        bool isUnlocked;
        uint256 unlockedTime;
        uint256 amount;
    }

    mapping(address => uint256) private _balances;

    mapping(address => mapping(address => uint256)) private _allowances;

    uint256 private _totalSupply;

    string private _name;
    string private _symbol;
    uint8 private _decimals;
    uint256 public constant MAX_SUPPLY = 100000e18;

    uint256 public PRIVATE_SALE_PERCENT = 10; //10%
    uint256 public PUBLIC_SALE_PERCENT = 30;
    uint256 public LIQUIDITY_PERCENT = 30;
    uint256 public TEAM_RESERVED_PERCENT = 10;
    uint256 public SHIELD_MINING_PERCENT = 20;

    address public privateSaleAddress;
    address public publicSaleAddress;
    address public liquidityAddress;

    address public shieldMiningAddress;

    uint256 public contractStartTimestamp;

    address public override devFundAddress;
    uint256 public devFundTotal;

    LockedToken public privateSaleLockedTokens;
    LockedToken public publicSaleLockedTokens;
    LockedToken public liquidityLockedTokens;

    LockedToken[] public devFunds;

    function name() public view returns (string memory) {
        return _name;
    }

    constructor(
        address _privateSaleAddress,
        address _publicSaleAddress,
        address _liquidityAddress,
        address _devFundAddress
    ) public {
        initialSetup(
            _privateSaleAddress,
            _publicSaleAddress,
            _liquidityAddress,
            _devFundAddress
        );
    }

    function initialSetup(
        address _privateSaleAddress,
        address _publicSaleAddress,
        address _liquidityAddress,
        address _devFundAddress
    ) internal {
        _name = "POLKAINSURE.FINANCE";
        _symbol = "PIS";
        _decimals = 18;
        uint256 initialMint = MAX_SUPPLY.mul(100 - SHIELD_MINING_PERCENT).div(
            100
        );

        devFundAddress = _devFundAddress;
        privateSaleAddress = _privateSaleAddress;
        publicSaleAddress = _publicSaleAddress;
        liquidityAddress = _liquidityAddress;

        {
            uint256 privateSaleAmount = MAX_SUPPLY
                .mul(PRIVATE_SALE_PERCENT)
                .div(100);
            privateSaleLockedTokens = LockedToken({
                unlockedTime: block.timestamp.add(4 weeks),
                amount: privateSaleAmount,
                isUnlocked: false
            });
        }

        {
            uint256 publicSaleAmount = MAX_SUPPLY.mul(PUBLIC_SALE_PERCENT).div(
                100
            );
            publicSaleLockedTokens = LockedToken({
                unlockedTime: block.timestamp,
                amount: publicSaleAmount,
                isUnlocked: false
            });
        }

        {
            uint256 liquiditySaleAmount = MAX_SUPPLY.mul(LIQUIDITY_PERCENT).div(
                100
            );
            liquidityLockedTokens = LockedToken({
                unlockedTime: block.timestamp,
                amount: liquiditySaleAmount,
                isUnlocked: false
            });
        }

        _mint(address(this), initialMint);
        contractStartTimestamp = block.timestamp;
        devFundTotal = MAX_SUPPLY.mul(TEAM_RESERVED_PERCENT).div(100);
        {
            //dev fund in 3 months, release every 2 weeks
            uint256 devFundPerRelease = devFundTotal.div(6);
            for (uint256 i = 0; i < 5; i++) {
                devFunds.push(
                    LockedToken({
                        unlockedTime: block.timestamp + i.mul(2 weeks),
                        amount: devFundPerRelease,
                        isUnlocked: false
                    })
                );
            }
            devFunds.push(
                LockedToken({
                    unlockedTime: block.timestamp + uint256(5).mul(2 weeks),
                    amount: devFundTotal.sub(devFundPerRelease.mul(5)),
                    isUnlocked: false
                })
            );
        }
    }

    function pendingReleasableDevFund() public view returns (uint256) {
        if (contractStartTimestamp == 0) return 0;
        uint256 ret = 0;
        for (uint256 i = 0; i < devFunds.length; i++) {
            if (devFunds[i].unlockedTime > block.timestamp) break;
            if (!devFunds[i].isUnlocked) {
                ret = ret.add(devFunds[i].amount);
            }
        }
        return ret;
    }

    function unlockDevFund() public {
        for (uint256 i = 0; i < devFunds.length; i++) {
            if (devFunds[i].unlockedTime >= block.timestamp) break;
            if (!devFunds[i].isUnlocked) {
                devFunds[i].isUnlocked = true;
                _transfer(address(this), devFundAddress, devFunds[i].amount);
            }
        }
    }

    function unlockPrivateSaleFund() public {
        require(
            privateSaleLockedTokens.unlockedTime <= block.timestamp &&
                privateSaleLockedTokens.amount > 0,
            "!unlock timing"
        );

        require(!privateSaleLockedTokens.isUnlocked, "already unlock");
        privateSaleLockedTokens.isUnlocked = true;
        _transfer(
            address(this),
            privateSaleAddress,
            privateSaleLockedTokens.amount
        );
    }

    function unlockPublicSaleFund() public {
        require(
            publicSaleLockedTokens.unlockedTime <= block.timestamp &&
                publicSaleLockedTokens.amount > 0,
            "!unlock timing"
        );

        require(!publicSaleLockedTokens.isUnlocked, "already unlock");
        publicSaleLockedTokens.isUnlocked = true;
        _transfer(
            address(this),
            publicSaleAddress,
            publicSaleLockedTokens.amount
        );
    }

    function unlockLiquidityFund() public {
        require(
            liquidityLockedTokens.unlockedTime <= block.timestamp &&
                liquidityLockedTokens.amount > 0,
            "!unlock timing"
        );

        require(!liquidityLockedTokens.isUnlocked, "already unlock");
        liquidityLockedTokens.isUnlocked = true;
        _transfer(
            address(this),
            liquidityAddress,
            liquidityLockedTokens.amount
        );
    }

    function symbol() public view returns (string memory) {
        return _symbol;
    }

    function decimals() public view returns (uint8) {
        return _decimals;
    }

    function totalSupply() public override view returns (uint256) {
        return _totalSupply;
    }

    function balanceOf(address _owner) public override view returns (uint256) {
        return _balances[_owner];
    }

    function setDevFundReciever(address _devaddr) public {
        require(devFundAddress == msg.sender, "only dev can change");
        devFundAddress = _devaddr;
    }

    function transfer(address recipient, uint256 amount)
        public
        virtual
        override
        returns (bool)
    {
        _transfer(_msgSender(), recipient, amount);
        return true;
    }

    function allowance(address owner, address spender)
        public
        virtual
        override
        view
        returns (uint256)
    {
        return _allowances[owner][spender];
    }

    function approve(address spender, uint256 amount)
        public
        virtual
        override
        returns (bool)
    {
        _approve(_msgSender(), spender, amount);
        return true;
    }

    function transferFrom(
        address sender,
        address recipient,
        uint256 amount
    ) public virtual override returns (bool) {
        _transfer(sender, recipient, amount);
        _approve(
            sender,
            _msgSender(),
            _allowances[sender][_msgSender()].sub(
                amount,
                "ERC20: transfer amount exceeds allowance"
            )
        );
        return true;
    }

    function increaseAllowance(address spender, uint256 addedValue)
        public
        virtual
        returns (bool)
    {
        _approve(
            _msgSender(),
            spender,
            _allowances[_msgSender()][spender].add(addedValue)
        );
        return true;
    }

    function decreaseAllowance(address spender, uint256 subtractedValue)
        public
        virtual
        returns (bool)
    {
        _approve(
            _msgSender(),
            spender,
            _allowances[_msgSender()][spender].sub(
                subtractedValue,
                "ERC20: decreased allowance below zero"
            )
        );
        return true;
    }

    function setTransferChecker(address _transferCheckerAddress)
        public
        onlyOwner
    {
        transferCheckerAddress = _transferCheckerAddress;
    }

    address public override transferCheckerAddress;

    function setFeeDistributor(address _feeDistributor) public onlyOwner {
        feeDistributor = _feeDistributor;
        _approve(
            address(this),
            _feeDistributor,
            0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF
        );
    }

    address public override feeDistributor;

    function _transfer(
        address sender,
        address recipient,
        uint256 amount
    ) internal virtual {
        require(sender != address(0), "ERC20: transfer from the zero address");
        require(recipient != address(0), "ERC20: transfer to the zero address");

        _beforeTokenTransfer(sender, recipient, amount);

        _balances[sender] = _balances[sender].sub(
            amount,
            "ERC20: transfer amount exceeds balance"
        );

        (
            uint256 transferToAmount,
            uint256 transferToFeeDistributorAmount
        ) = IFeeCalculator(transferCheckerAddress).calculateAmountsAfterFee(
            sender,
            recipient,
            amount
        );

        require(
            transferToAmount.add(transferToFeeDistributorAmount) == amount,
            "Math broke!"
        );

        _balances[recipient] = _balances[recipient].add(transferToAmount);
        emit Transfer(sender, recipient, transferToAmount);

        if (
            transferToFeeDistributorAmount > 0 && feeDistributor != address(0)
        ) {
            _balances[feeDistributor] = _balances[feeDistributor].add(
                transferToFeeDistributorAmount
            );
            emit Transfer(
                sender,
                feeDistributor,
                transferToFeeDistributorAmount
            );
            IPISVault(feeDistributor).updatePendingRewards();
        }
    }

    function _mint(address account, uint256 amount) internal virtual {
        require(account != address(0), "ERC20: mint to the zero address");

        _beforeTokenTransfer(address(0), account, amount);

        _totalSupply = _totalSupply.add(amount);
        _balances[account] = _balances[account].add(amount);
        emit Transfer(address(0), account, amount);
    }

    function _burn(address account, uint256 amount) internal virtual {
        require(account != address(0), "ERC20: burn from the zero address");

        _beforeTokenTransfer(account, address(0), amount);

        _balances[account] = _balances[account].sub(
            amount,
            "ERC20: burn amount exceeds balance"
        );
        _totalSupply = _totalSupply.sub(amount);
        emit Transfer(account, address(0), amount);
    }

    function _approve(
        address owner,
        address spender,
        uint256 amount
    ) internal virtual {
        require(owner != address(0), "ERC20: approve from the zero address");
        require(spender != address(0), "ERC20: approve to the zero address");

        _allowances[owner][spender] = amount;
        emit Approval(owner, spender, amount);
    }

    function _setupDecimals(uint8 decimals_) internal {
        _decimals = decimals_;
    }

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal virtual {}
}
